"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { AiError, aiChatJson, isAiConfigured } from "@/lib/ai/deepseek";
import { kbLessonPrompt, kbOutlinePrompt, kbQuizPrompt } from "@/lib/ai/client-kb-prompts";
import {
  MAX_KB_NAME,
  QUIZ_AI_QUESTION_COUNT,
  kbLessonContentSchema,
  kbOutlineSchema,
  parseLessonBlocks,
  quizQuestionsSchema,
} from "@/lib/client-kb";
import { getOrCreateKbSpace, loadKbAiContext, loadKbClient, loadKbLesson, lessonBelongsToAnchor } from "@/lib/client-kb-data";
import type { KbFormState } from "./actions";

/**
 * Ba đường SINH NỘI DUNG BẰNG AI cho Kho kiến thức theo khách (H3).
 *
 * Tách khỏi `actions.ts` vì khác hẳn về rủi ro và về quyền: gọi AI tốn tiền theo lượt nên có mã
 * quyền RIÊNG (`clients.kb.generate`), tách khỏi quyền soạn tay để BGĐ cắt được chi phí mà không
 * cắt luôn khả năng nhập liệu.
 *
 * ⚠ BẤT BIẾN: KHÔNG BAO GIỜ bọc `$transaction` quanh một call AI. DB là SQLite single-writer, còn
 * một lượt gọi có thể mất tới 90s — giữ writer suốt thời gian đó là treo cả app. Thứ tự đúng ở cả
 * ba action: đọc dữ liệu → gọi AI (ngoài transaction) → Zod → transaction NGẮN để ghi.
 *
 * ⚠ Mọi thứ sinh ra đều là BẢN NHÁP (`status: "DRAFT"`). Người học không thấy cho tới khi PIC đọc
 * lại và bấm Đăng — AI không được tự xuất bản kiến thức về khách hàng.
 */

/** Dịch AiError sang câu đã i18n; chi tiết kỹ thuật chỉ ghi log server (giống ai/actions.ts). */
async function toMessage(e: unknown): Promise<string> {
  const t = await getTranslations("ai.errors");
  if (e instanceof AiError) {
    if (e.detail) console.error(`[KB-AI] ${e.code}:`, e.detail);
    return t(e.code);
  }
  console.error("[KB-AI] lỗi không xác định:", e);
  return t("UNKNOWN");
}

async function guard(): Promise<string | null> {
  const t = await getTranslations("ai.errors");
  const staffId = await getCurrentStaffId();
  if (!staffId) return t("NOT_LOGGED_IN");
  if (!isAiConfigured()) return t("NOT_CONFIGURED");
  return null;
}

async function audit(entityType: string, entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType, entityId, field: "*", action, changedBy: staffId, reason } });
}

/** Chủ đề/bài phải thuộc đúng đối tượng đang mở — copy đúng phép so neo của actions.ts. */
async function assertTopicInAnchor(topicId: string, clientId: string) {
  const loaded = await loadKbClient(clientId);
  if (!loaded) return null;
  const topic = await prisma.clientKbTopic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, spaceId: true, space: { select: { clientId: true, groupId: true } } },
  });
  if (!topic) return null;
  const s = topic.space;
  const ok = loaded.anchor.kind === "GROUP" ? s.groupId === loaded.anchor.id : s.clientId === loaded.anchor.id;
  return ok ? { topic, loaded } : null;
}

// ───────────────────────── 1. Dựng dàn bài ─────────────────────────

/**
 * Chỉ chạy khi kho CHƯA có chủ đề nào. Cố ý: đây là bước dựng khung ban đầu, chạy lại trên kho đã
 * có nội dung sẽ đẻ ra chủ đề trùng lặp mà không ai dọn.
 *
 * Sinh ra topic + bài học RỖNG (chỉ có tên). Nội dung từng bài sinh riêng ở bước 2 — gộp một lượt
 * là vỡ trần token và hỏng một chỗ thì mất cả loạt.
 */
export async function generateOutline(clientId: string, _prev: KbFormState, _formData: FormData): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  // Sinh bằng AI là ĐẶC QUYỀN THÊM chồng lên quyền soạn nội dung, không phải đường vòng thay thế
  // nó — mirror mẫu finance.vendor_payment.over_cap (HANDOVER 10.1). Chỉ tick clients.kb.generate
  // mà quên clients.kb.manage thì không được ghi vào kho kiến thức.
  if (!(await hasPermission("clients.kb.generate"))) return { error: t("errorNotFound") };
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const loaded = await loadKbClient(clientId);
  if (!loaded) return { error: t("errorNotFound") };

  const spaceId = await getOrCreateKbSpace(loaded.anchor);
  const existing = await prisma.clientKbTopic.count({ where: { spaceId } });
  if (existing > 0) return { error: t("errorOutlineNotEmpty") };

  try {
    const ctx = await loadKbAiContext(loaded.anchor);
    if (!ctx) return { error: t("errorNotFound") };

    const raw = await aiChatJson<unknown>(kbOutlinePrompt(ctx), { temperature: 0.4, maxTokens: 1600 });
    const parsed = kbOutlineSchema.safeParse(raw);
    if (!parsed.success) return { error: t("errorAiShape") };

    // Transaction NGẮN, chạy SAU khi AI đã trả — không giữ writer SQLite qua call mạng.
    let raced = false;
    await prisma.$transaction(async (tx) => {
      // Kiểm LẠI trong transaction: cửa sổ giữa lần đếm ở trên và lúc ghi dài bằng cả lượt gọi AI
      // (tới 90s). Hai Account cùng nhóm AEON bấm cách nhau 20s là cả hai cùng qua cửa và kho có
      // hai dàn bài chồng nhau — dọn tay rất đắt vì đã lẫn bài do người viết.
      if ((await tx.clientKbTopic.count({ where: { spaceId } })) > 0) {
        raced = true;
        return;
      }
      let sort = 0;
      for (const topic of parsed.data.topics) {
        const created = await tx.clientKbTopic.create({
          data: { spaceId, name: topic.name.slice(0, MAX_KB_NAME), sort: sort++ },
        });
        let lessonSort = 0;
        for (const lesson of topic.lessons) {
          await tx.clientKbLesson.create({
            data: {
              topicId: created.id,
              title: lesson.title.slice(0, MAX_KB_NAME),
              source: "AI",
              sort: lessonSort++,
            },
          });
        }
      }
    });

    if (raced) return { error: t("errorOutlineNotEmpty") };

    await audit("client_kb_space", spaceId, "CREATE", "AI outline");
    revalidatePath(`/clients/${clientId}/kb`);
    return { success: true };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 2. Sinh nội dung một bài ─────────────────────────

/**
 * Ghi đè `blocksJson` của ĐÚNG bài được chọn và ép về DRAFT: nội dung vừa đổi thì bản đã đăng
 * không còn đúng nữa, để nguyên PUBLISHED là người học đọc phải bài AI chưa ai duyệt.
 */
export async function generateLessonContent(
  clientId: string,
  lessonId: string,
  _prev: KbFormState,
  _formData: FormData,
): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  // Sinh bằng AI là ĐẶC QUYỀN THÊM chồng lên quyền soạn nội dung, không phải đường vòng thay thế
  // nó — mirror mẫu finance.vendor_payment.over_cap (HANDOVER 10.1). Chỉ tick clients.kb.generate
  // mà quên clients.kb.manage thì không được ghi vào kho kiến thức.
  if (!(await hasPermission("clients.kb.generate"))) return { error: t("errorNotFound") };
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const loaded = await loadKbClient(clientId);
  const lesson = await loadKbLesson(lessonId);
  if (!loaded || !lesson || !lessonBelongsToAnchor(lesson, loaded.anchor)) return { error: t("errorNotFound") };

  try {
    const [ctx, siblings] = await Promise.all([
      loadKbAiContext(loaded.anchor),
      prisma.clientKbLesson.findMany({
        where: { topicId: lesson.topic.id, id: { not: lessonId } },
        select: { title: true },
      }),
    ]);
    if (!ctx) return { error: t("errorNotFound") };

    const raw = await aiChatJson<unknown>(
      kbLessonPrompt(ctx, {
        topicName: lesson.topic.name,
        title: lesson.title,
        siblingTitles: siblings.map((s) => s.title),
      }),
      { temperature: 0.4, maxTokens: 2400 },
    );
    const parsed = kbLessonContentSchema.safeParse(raw);
    if (!parsed.success) return { error: t("errorAiShape") };
    if (parsed.data.blocks.length === 0) return { error: t("errorAiEmpty") };

    const staffId = await getCurrentStaffId();
    await prisma.clientKbLesson.update({
      where: { id: lessonId },
      data: {
        blocksJson: JSON.stringify(parsed.data.blocks),
        source: "AI",
        status: "DRAFT",
        updatedById: staffId,
      },
    });

    await audit("client_kb_lesson", lessonId, "UPDATE", "AI content");
    revalidatePath(`/clients/${clientId}/kb`);
    revalidatePath(`/clients/${clientId}/kb/lesson/${lessonId}`);
    revalidatePath(`/clients/${clientId}/kb/lesson/${lessonId}/edit`);
    return { success: true };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}

// ───────────────────────── 3. Sinh câu hỏi kiểm tra ─────────────────────────

/**
 * Nguyên liệu là các bài ĐÃ ĐĂNG của chủ đề — hỏi ngoài phạm vi người học được đọc là đánh đố.
 *
 * Sinh lại thì câu AI cũ bị TẮT (`isActive=false`) chứ không xoá: `answersJson` của các lượt làm
 * bài cũ trỏ theo id câu hỏi, xoá đi là hỏng lịch sử. Câu do người nhập tay (`source="MANUAL"`)
 * không bị đụng tới.
 */
export async function generateQuiz(
  clientId: string,
  topicId: string,
  _prev: KbFormState,
  _formData: FormData,
): Promise<KbFormState> {
  await requirePermission("clients.kb.manage");
  const t = await getTranslations("clients.kb");
  // Sinh bằng AI là ĐẶC QUYỀN THÊM chồng lên quyền soạn nội dung, không phải đường vòng thay thế
  // nó — mirror mẫu finance.vendor_payment.over_cap (HANDOVER 10.1). Chỉ tick clients.kb.generate
  // mà quên clients.kb.manage thì không được ghi vào kho kiến thức.
  if (!(await hasPermission("clients.kb.generate"))) return { error: t("errorNotFound") };
  const blocked = await guard();
  if (blocked) return { error: blocked };

  const found = await assertTopicInAnchor(topicId, clientId);
  if (!found) return { error: t("errorNotFound") };

  const lessons = await prisma.clientKbLesson.findMany({
    where: { topicId, status: "PUBLISHED" },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    select: { title: true, blocksJson: true },
  });
  const withContent = lessons
    .map((l) => ({ title: l.title, blocks: parseLessonBlocks(l.blocksJson) }))
    .filter((l) => l.blocks.length > 0);
  if (withContent.length === 0) return { error: t("errorQuizNoLesson") };

  try {
    const raw = await aiChatJson<unknown>(kbQuizPrompt(found.topic.name, withContent), {
      temperature: 0.5,
      maxTokens: 2400,
    });
    const parsed = quizQuestionsSchema.safeParse(raw);
    if (!parsed.success) return { error: t("errorAiShape") };

    const questions = parsed.data.questions.slice(0, QUIZ_AI_QUESTION_COUNT);
    if (questions.length === 0) return { error: t("errorAiEmpty") };

    await prisma.$transaction(async (tx) => {
      await tx.clientKbQuestion.updateMany({
        where: { topicId, source: "AI", isActive: true },
        data: { isActive: false },
      });
      for (const q of questions) {
        await tx.clientKbQuestion.create({
          data: {
            topicId,
            prompt: q.prompt,
            optionsJson: JSON.stringify(q.options),
            correctIndex: q.correctIndex,
            explanation: q.explanation ?? null,
            source: "AI",
          },
        });
      }
    });

    await audit("client_kb_topic", topicId, "UPDATE", `AI quiz ${questions.length} câu`);
    revalidatePath(`/clients/${clientId}/kb`);
    revalidatePath(`/clients/${clientId}/kb/quiz/${topicId}`);
    return { success: true };
  } catch (e) {
    return { error: await toMessage(e) };
  }
}
