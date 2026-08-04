"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { AiError, aiChat, aiChatJson, isAiConfigured } from "@/lib/ai/deepseek";
import { extractTextFromFile } from "@/lib/ai/extract-text";
import { mktInsightsPrompt, mktVariantPrompt } from "@/lib/ai/mkt-prompts";
import { readMktFile } from "@/lib/mkt-storage";
import { buildQuarterStats, isMktChannel, mktAiContentSchema, quarterRange, type MktChannel } from "@/lib/mkt";
import type { MktState } from "./actions";

/**
 * Hai đường GỌI AI của module MKT post: viết bài từng kênh, và phân tích insights quý.
 *
 * Tách khỏi `actions.ts` vì khác về rủi ro và về quyền — mỗi lượt bấm là một lượt tính tiền
 * DeepSeek, nên có mã riêng `mkt.generate` (quyết định chủ dự án 04/08/2026: chỉ HR + BGĐ).
 *
 * ⚠ BẤT BIẾN: KHÔNG BAO GIỜ bọc `$transaction` quanh call AI. DB là SQLite single-writer còn một
 * lượt gọi có thể mất tới 75s — giữ writer suốt thời gian đó là treo cả app. Thứ tự đúng ở cả hai
 * action: đọc dữ liệu → gọi AI (ngoài transaction) → Zod → ghi NGẮN.
 */

/** Dịch AiError sang câu đã i18n; chi tiết kỹ thuật chỉ ghi log server. */
async function toMessage(e: unknown): Promise<string> {
  const t = await getTranslations("ai.errors");
  if (e instanceof AiError) {
    if (e.detail) console.error(`[MKT-AI] ${e.code}:`, e.detail);
    return t(e.code);
  }
  console.error("[MKT-AI] lỗi không xác định:", e);
  return t("UNKNOWN");
}

async function guard(): Promise<string | null> {
  const t = await getTranslations("ai.errors");
  const staffId = await getCurrentStaffId();
  if (!staffId) return t("NOT_LOGGED_IN");
  if (!isAiConfigured()) return t("NOT_CONFIGURED");
  return null;
}

async function audit(entityId: string, reason: string) {
  await prisma.auditLog.create({
    data: { entityType: "mkt", entityId, field: "*", action: "UPDATE", changedBy: await getCurrentStaffId(), reason },
  });
}

/**
 * AI viết bản nháp cho MỘT kênh.
 *
 * Gác hai lớp theo đúng mẫu `clients.kb.generate` / `finance.vendor_payment.over_cap`: cửa vào là
 * `mkt.view` (ai đọc được module), rồi `mkt.generate` kiểm BÊN TRONG như một ĐẶC QUYỀN THÊM. Không
 * dùng `mkt.review` làm cửa vào vì hai mã này có thể được BGĐ tách ra cho hai nhóm khác nhau về sau.
 */
export async function generateVariant(
  postId: string,
  channel: MktChannel,
  _prev: MktState,
  _formData: FormData,
): Promise<MktState> {
  await requirePermission("mkt.view");
  if (!(await hasPermission("mkt.generate"))) return { error: "NO_GENERATE_PERM" };
  if (!isMktChannel(channel)) return { error: "NOT_FOUND" };
  const blocked = await guard();
  if (blocked) return { aiError: blocked };

  const post = await prisma.mktPost.findUnique({
    where: { id: postId },
    select: {
      title: true,
      keyPoints: true,
      contentType: { select: { labelVi: true } },
      project: { select: { code: true, name: true, client: { select: { name: true } } } },
      _count: { select: { images: true } },
      variants: { where: { channel }, select: { id: true, status: true } },
    },
  });
  const variant = post?.variants[0];
  if (!post || !variant) return { error: "NOT_FOUND" };
  if (variant.status === "POSTED") return { error: "LOCKED" };

  let content: string;
  try {
    const raw = await aiChatJson<unknown>(
      mktVariantPrompt(channel, {
        title: post.title,
        keyPoints: post.keyPoints,
        contentTypeLabel: post.contentType?.labelVi ?? null,
        projectCode: post.project?.code ?? null,
        projectName: post.project?.name ?? null,
        clientName: post.project?.client?.name ?? null,
        imageCount: post._count.images,
      }),
      // Fanpage nóng hơn để có giọng trẻ; LinkedIn giữ thấp cho ổn định văn phong công ty.
      { temperature: channel === "FANPAGE" ? 0.7 : 0.5, maxTokens: 1600 },
    );
    const parsed = mktAiContentSchema.safeParse(raw);
    if (!parsed.success) return { error: "AI_SHAPE" };
    content = parsed.data.content;
  } catch (e) {
    return { aiError: await toMessage(e) };
  }

  // Guard trạng thái: giữa lúc gọi AI (tới 75s) có thể đã có người đánh dấu ĐÃ ĐĂNG — ghi đè lúc
  // đó là sửa nội dung của bài đang nằm ngoài kia.
  const res = await prisma.mktPostVariant.updateMany({
    where: { id: variant.id, status: { in: ["DRAFT", "AI_DRAFTED"] } },
    data: { aiDraft: content, finalContent: content, status: "AI_DRAFTED", aiDraftedAt: new Date() },
  });
  if (res.count === 0) return { error: "WRONG_STATE" };

  await audit(postId, `AI draft ${channel}`);
  revalidatePath(`/mkt/${postId}`);
  return { success: true };
}

/**
 * AI phân tích insights một quý.
 *
 * Nhịp đăng lấy từ CHÍNH DB của app (`buildQuarterStats`) chứ không đọc từ file export — file của
 * Meta/LinkedIn không biết TCM cam kết mấy bài một tuần. File chỉ đóng góp phần số liệu hiệu quả.
 */
export async function generateInsights(reportId: string, _prev: MktState, _formData: FormData): Promise<MktState> {
  await requirePermission("mkt.review");
  if (!(await hasPermission("mkt.generate"))) return { error: "NO_GENERATE_PERM" };
  const blocked = await guard();
  if (blocked) return { aiError: blocked };

  const report = await prisma.mktInsightReport.findUnique({
    where: { id: reportId },
    select: { id: true, year: true, quarter: true, note: true, files: { select: { fileKey: true, fileMime: true, fileName: true, channel: true } } },
  });
  if (!report) return { error: "NOT_FOUND" };

  const { start, end } = quarterRange(report.year, report.quarter);
  const posted = await prisma.mktPostVariant.findMany({
    where: { status: "POSTED", postedAt: { gte: start, lt: end } },
    select: { channel: true, postedAt: true },
  });
  const stats = buildQuarterStats(
    posted.flatMap((p) => (p.postedAt ? [{ channel: p.channel, postedAt: p.postedAt }] : [])),
    report.year,
    report.quarter,
  );

  // File không đọc được VẪN in header tên file: model cần biết có tài liệu mà không đọc được, thay
  // vì tưởng HR chưa nộp gì (khuôn buildProjectFilesText).
  const fileBlocks: string[] = [];
  for (const f of report.files) {
    let body = "(không đọc được nội dung định dạng này — chỉ có tên file)";
    try {
      const buffer = await readMktFile(f.fileKey);
      const extracted = await extractTextFromFile(buffer, f.fileMime);
      if (extracted) body = extracted.text + (extracted.truncated ? "\n…(đã cắt bớt, file dài hơn)" : "");
    } catch {
      body = "(lỗi khi đọc file)";
    }
    fileBlocks.push(`--- ${f.fileName} (${f.channel}) ---\n${body}`);
  }

  let text: string;
  try {
    const result = await aiChat(
      mktInsightsPrompt({ year: report.year, quarter: report.quarter, stats, note: report.note, fileBlocks }),
      { temperature: 0.2, maxTokens: 2400 },
    );
    text = result.text;
  } catch (e) {
    return { aiError: await toMessage(e) };
  }

  await prisma.mktInsightReport.update({ where: { id: reportId }, data: { aiResult: text, aiRanAt: new Date() } });
  await audit(reportId, `AI insights Q${report.quarter}/${report.year}`);
  revalidatePath("/mkt/insights");
  return { success: true };
}
