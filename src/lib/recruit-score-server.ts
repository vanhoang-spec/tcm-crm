import "server-only";
import { prisma } from "@/lib/prisma";
import { aiChatJson } from "@/lib/ai/deepseek";
import { cvScoreMessages, cvScoreSchema } from "@/lib/ai/recruit-score-prompts";
import { readCvFile } from "@/lib/recruit-storage";
import { extractTextFromFile } from "@/lib/ai/extract-text";
import { MAX_CV_TEXT_CHARS } from "@/lib/recruit";
import { getNumberSetting } from "@/lib/settings";
import {
  DEFAULT_CRITERIA,
  computeTotal,
  recommendationFor,
  scopeForPosition,
  type RecruitScope,
  type RecruitStage,
  type ScoredCriterion,
} from "@/lib/recruit-scoring";

/**
 * LÕI AI CHẤM CV (TD-2a) — dùng chung cho nút chấm MỘT hồ sơ lẫn nút chấm HÀNG LOẠT.
 *
 * ⚠ Hàm KHÔNG gác quyền — người gọi gác (`recruit.manage` + đặc quyền `recruit.ai_parse`).
 * ⚠ KHÔNG bọc `$transaction` quanh lời gọi AI: SQLite single-writer, một lượt tới 75s (HANDOVER
 * 10.14). Thứ tự đúng: đọc DB → gọi AI (ngoài transaction) → Zod → ghi.
 * ⚠ Dùng DeepSeek theo đúng yêu cầu chủ dự án 22/08/2026 (Claude chỉ dành cho module MKT).
 */

/** Trần số hồ sơ chấm trong MỘT lần bấm — chặn cả chi phí AI lẫn việc treo tiến trình quá lâu. */
export const MAX_BATCH_SCORE = 20;

export type CriterionRow = { code: string; label: string; labelEn: string; weight: number; hint: string | null };

/**
 * Bộ tiêu chí đang có hiệu lực cho (stage, scope).
 * ⚠ Bảng RỖNG (chưa seed / HR tắt hết) thì rơi về bộ mặc định trong code thay vì chấm bằng 0 tiêu
 * chí — chấm với danh sách rỗng cho ra tổng 0 cho MỌI ứng viên, im lặng và vô nghĩa.
 */
export async function loadCriteria(stage: RecruitStage, scope: RecruitScope): Promise<CriterionRow[]> {
  const rows = await prisma.recruitCriterion.findMany({
    where: { stage, scope, isActive: true },
    orderBy: [{ sort: "asc" }, { code: "asc" }],
    select: { code: true, labelVi: true, labelEn: true, weight: true, hint: true },
  });
  if (rows.length > 0) return rows.map((r) => ({ code: r.code, label: r.labelVi, labelEn: r.labelEn, weight: r.weight, hint: r.hint }));
  return DEFAULT_CRITERIA.filter((c) => c.stage === stage && c.scope === scope).map((c) => ({
    code: c.code,
    label: c.labelVi,
    labelEn: c.labelEn,
    weight: c.weight,
    hint: c.hint,
  }));
}

/** Hai ngưỡng đề xuất, chỉnh trong /settings/recruit. */
export async function loadThresholds(): Promise<{ interviewPct: number; considerPct: number }> {
  const [i, c] = await Promise.all([
    getNumberSetting("recruit", "ai_interview_pct", 70),
    getNumberSetting("recruit", "ai_consider_pct", 50),
  ]);
  // Ngưỡng "cân nhắc" cao hơn ngưỡng "phỏng vấn" là vô nghĩa — kẹp lại thay vì đẻ ra dải rỗng.
  const interviewPct = Math.min(100, Math.max(1, i));
  return { interviewPct, considerPct: Math.min(interviewPct, Math.max(0, c)) };
}

export type ScoreOutcome =
  | { ok: true; total: number; max: number; recommendation: string }
  | { ok: false; code: "NOT_FOUND" | "NO_TEXT" | "AI_SHAPE" | "AI_ERROR"; detail?: string };

/**
 * Chấm MỘT hồ sơ: đọc CV → AI chấm từng tiêu chí → CODE cộng tổng → ghi một dòng CandidateAiReview.
 * Mỗi lần chấm là một DÒNG MỚI (không ghi đè) nên lịch sử chấm giữ nguyên.
 */
export async function scoreCandidateCv(candidateId: string, byStaffId: string | null): Promise<ScoreOutcome> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      cvFileKey: true,
      cvFileMime: true,
      position: {
        select: { title: true, isManagerial: true, jdSummary: true, jdResponsibilities: true, jdRequirements: true, jdBenefits: true },
      },
    },
  });
  if (!candidate) return { ok: false, code: "NOT_FOUND" };

  let cvText = "";
  try {
    const buffer = await readCvFile(candidate.cvFileKey);
    const extracted = await extractTextFromFile(buffer, candidate.cvFileMime, { maxChars: MAX_CV_TEXT_CHARS });
    cvText = (extracted?.text ?? "").trim();
  } catch {
    cvText = "";
  }
  // CV là ảnh scan / .doc cũ ⇒ không có chữ nào để chấm. Báo rõ thay vì gửi chuỗi rỗng sang AI rồi
  // nhận về một bảng điểm bịa hoàn toàn.
  if (cvText.length < 50) return { ok: false, code: "NO_TEXT" };

  const scope = scopeForPosition(candidate.position.isManagerial);
  const [criteria, thresholds] = await Promise.all([loadCriteria("CV", scope), loadThresholds()]);

  const jdText = [
    candidate.position.jdSummary,
    candidate.position.jdResponsibilities,
    candidate.position.jdRequirements,
    candidate.position.jdBenefits,
  ]
    .filter((x) => x && x.trim())
    .join("\n\n");

  let parsed;
  try {
    const raw = await aiChatJson<unknown>(
      cvScoreMessages({
        positionTitle: candidate.position.title,
        jdText,
        isManagerial: candidate.position.isManagerial,
        criteria: criteria.map((c) => ({ code: c.code, label: c.label, weight: c.weight, hint: c.hint })),
        cvText,
      }),
      // Chấm điểm phải ỔN ĐỊNH: cùng một CV chấm hai lần không được lệch nhau nhiều. Nhiệt độ thấp.
      { temperature: 0.2, maxTokens: 2500 },
    );
    parsed = cvScoreSchema.safeParse(raw);
  } catch (e) {
    return { ok: false, code: "AI_ERROR", detail: e instanceof Error ? e.message : String(e) };
  }
  if (!parsed.success) return { ok: false, code: "AI_SHAPE" };

  // ⚠ Ghép theo BỘ TIÊU CHÍ của app, KHÔNG theo danh sách model trả về: mã lạ bị bỏ, mã thiếu tính
  // 0 điểm. Không làm vậy thì model bịa thêm tiêu chí là tổng vọt lên, hoặc bỏ sót tiêu chí là tổng
  // tụt xuống — cả hai đều im lặng.
  const byCode = new Map(parsed.data.criteria.map((c) => [c.code, c]));
  const items: ScoredCriterion[] = criteria.map((c) => {
    const got = byCode.get(c.code);
    return { code: c.code, label: c.label, weight: c.weight, score: got?.score ?? 0, note: got?.note ?? null };
  });
  const { total, max } = computeTotal(items);
  const recommendation = recommendationFor(total, max, thresholds.interviewPct, thresholds.considerPct);

  await prisma.candidateAiReview.create({
    data: {
      candidateId,
      scope,
      totalScore: total,
      maxScore: max,
      recommendation,
      summary: parsed.data.summary,
      strengths: parsed.data.strengths,
      concerns: parsed.data.concerns,
      criteriaJson: JSON.stringify(items),
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      createdById: byStaffId,
    },
  });

  return { ok: true, total, max, recommendation };
}

/**
 * Chấm HÀNG LOẠT — chạy TUẦN TỰ để không bắn N request song song vào DeepSeek (rate limit) và
 * không mở N transaction cùng lúc trên SQLite.
 *
 * ⚠ Hàm này được gọi FIRE-AND-FORGET từ server action: một lượt AI tới 75s, 20 hồ sơ là ~10 phút —
 * await trong action là trang treo và Cloudflare cắt ở ~100s. Trạng thái đi qua cột
 * `Candidate.aiReviewStatus` để màn hình biết đang chạy tới đâu; không có cột đó thì người dùng
 * bấm xong nhìn vào màn hình trắng không biết có chạy hay không.
 */
export async function runBatchCvScoring(ids: string[], byStaffId: string | null): Promise<void> {
  for (const id of ids) {
    // Claim từng hồ sơ: chỉ hồ sơ đang QUEUED mới được chạy — hai người cùng bấm thì lượt sau
    // không chấm lại (và không tính tiền hai lần) cho hồ sơ đã có người nhận.
    const claimed = await prisma.candidate.updateMany({
      where: { id, aiReviewStatus: "QUEUED" },
      data: { aiReviewStatus: "RUNNING", aiReviewError: null },
    });
    if (claimed.count === 0) continue;

    let res: ScoreOutcome;
    try {
      res = await scoreCandidateCv(id, byStaffId);
    } catch (e) {
      res = { ok: false, code: "AI_ERROR", detail: e instanceof Error ? e.message : String(e) };
    }

    if (res.ok) {
      await prisma.candidate.update({ where: { id }, data: { aiReviewStatus: null, aiReviewError: null } });
    } else {
      if (res.detail) console.error(`[RECRUIT-AI] ${id} ${res.code}:`, res.detail);
      // ⚠ Giữ lại MÃ LỖI trên hồ sơ thay vì chỉ ghi log: hồ sơ CV là ảnh scan sẽ hỏng mãi mãi, HR
      // phải thấy lý do ngay trên danh sách để đi nhập tay chứ không bấm lại vô ích.
      await prisma.candidate.update({ where: { id }, data: { aiReviewStatus: "ERROR", aiReviewError: res.code } });
    }
  }
}
