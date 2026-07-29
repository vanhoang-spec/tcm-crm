"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { getNumberSetting } from "@/lib/settings";
import { DEFAULT_KB_PASS_PCT, gradeQuiz } from "@/lib/client-kb";
import { loadKbClient, loadQuizAnswerKey } from "@/lib/client-kb-data";

/**
 * Nộp và CHẤM bài kiểm tra của một chủ đề.
 *
 * ⚠ Chấm hoàn toàn phía server. Đáp án (`correctIndex`) chỉ được đọc TẠI ĐÂY qua
 * `loadQuizAnswerKey`; đường render dùng `loadQuizQuestions` vốn không select cột đó. Cùng nguyên
 * tắc "không tin số từ client" của CO/CE — client chỉ gửi lên chỉ số phương án đã chọn.
 *
 * ⚠ Ngưỡng đạt đọc tại THỜI ĐIỂM CHẤM rồi LƯU KÈM lượt làm (`passPct`). BGĐ hạ ngưỡng về sau
 * không được biến một lượt trượt cũ thành đạt, và ngược lại.
 */

export type QuizState = {
  error?: string;
  result?: {
    score: number;
    total: number;
    pct: number;
    passed: boolean;
    passPct: number;
    /** Chỉ trả về SAU khi đã chấm — trước đó đáp án không rời khỏi server. */
    detail: { questionId: string; prompt: string; chosen: number | null; correctIndex: number; ok: boolean; explanation: string | null }[];
  };
};

export async function submitQuiz(
  clientId: string,
  topicId: string,
  _prev: QuizState,
  formData: FormData,
): Promise<QuizState> {
  await requirePermission("clients.kb.quiz");
  const t = await getTranslations("clients.kb");

  const staffId = await getCurrentStaffId();
  if (!staffId) return { error: t("errorNotFound") };

  // Chủ đề phải thuộc đúng đối tượng đang mở — chống nộp bài chéo bằng cách đoán topicId.
  const loaded = await loadKbClient(clientId);
  if (!loaded) return { error: t("errorNotFound") };
  const topic = await prisma.clientKbTopic.findUnique({
    where: { id: topicId },
    select: { space: { select: { clientId: true, groupId: true } } },
  });
  if (!topic) return { error: t("errorNotFound") };
  const inAnchor =
    loaded.anchor.kind === "GROUP" ? topic.space.groupId === loaded.anchor.id : topic.space.clientId === loaded.anchor.id;
  if (!inAnchor) return { error: t("errorNotFound") };

  const key = await loadQuizAnswerKey(topicId);
  if (key.length === 0) return { error: t("errorQuizNoQuestion") };

  // Câu nào không trả lời thì để null — gradeQuiz tính là SAI, không cho lách bằng bỏ trống.
  const answers: Record<string, number | null> = {};
  for (const q of key) {
    const raw = formData.get(`q_${q.id}`);
    const n = raw === null ? NaN : Number(raw);
    answers[q.id] = Number.isInteger(n) ? n : null;
  }

  /*
    Bài nộp lên có thể thuộc BỘ ĐỀ CŨ: PIC bấm "AI ra đề" trong lúc người này đang làm dở thì toàn
    bộ câu cũ bị tắt và thay bằng câu mới có id khác. Không chặn thì mọi câu đều không khớp, người
    đó bị chấm 0/5 và lưu thành một lượt TRƯỢT dù trả lời đúng hết. Bảo họ làm lại còn hơn.
    Người thật sự bỏ trắng cả bài vẫn bị chấm bình thường — phân biệt bằng CÓ GỬI ô nào hay không,
    chứ không phải bằng có khớp id hay không.
  */
  const sentAny = [...formData.keys()].some((k) => k.startsWith("q_"));
  const matchedAny = Object.values(answers).some((v) => v !== null);
  if (sentAny && !matchedAny) return { error: t("errorQuizStale") };

  const passPct = Math.round(await getNumberSetting("clients", "kb_pass_pct", DEFAULT_KB_PASS_PCT));
  const graded = gradeQuiz(key, answers, passPct);

  await prisma.clientKbAttempt.create({
    data: {
      topicId,
      staffId,
      score: graded.score,
      total: graded.total,
      passPct,
      passed: graded.passed,
      answersJson: JSON.stringify(answers),
    },
  });

  revalidatePath(`/clients/${clientId}/kb`);
  revalidatePath(`/clients/${clientId}/kb/compliance`);

  const byId = new Map(key.map((q) => [q.id, q]));
  return {
    result: {
      score: graded.score,
      total: graded.total,
      pct: graded.pct,
      passed: graded.passed,
      passPct,
      detail: graded.detail.map((d) => ({
        questionId: d.questionId,
        prompt: byId.get(d.questionId)?.prompt ?? "",
        chosen: d.chosen,
        correctIndex: d.correctIndex,
        ok: d.ok,
        explanation: byId.get(d.questionId)?.explanation ?? null,
      })),
    },
  };
}
