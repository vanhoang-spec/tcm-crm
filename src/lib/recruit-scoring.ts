/**
 * CHẤM ĐIỂM TUYỂN DỤNG — hàm THUẦN, không chạm Prisma, không chạm AI (TD-2a).
 *
 * Hai chặng chấm (`stage`) và hai bộ tiêu chí (`scope`):
 *   CV        — AI đọc hồ sơ chấm
 *   INTERVIEW — người phỏng vấn chấm
 *   STANDARD  — vị trí thường
 *   MANAGER   — vị trí có JobPosition.isManagerial
 *
 * ⚠ MỖI BỘ TỔNG TRỌNG SỐ = 100, và bộ MANAGER là bộ RIÊNG chứ không phải "bộ thường cộng thêm".
 * Cộng thêm leadership vào bộ 100 điểm là ra 130 — bộ quản lý phải HẠ trọng số chuyên môn để
 * nhường chỗ. Hai bộ liệt kê tách bạch để HR nhìn phát biết vị trí này chấm bằng gì.
 *
 * ⚠ TỔNG ĐIỂM DO HÀM NÀY CỘNG, KHÔNG lấy con số AI tự khai — cùng nguyên tắc đã áp cho bảng so
 * sánh báo giá NCC (10.36) và đối chiếu chi ngân hàng (10.51): số tính bằng code, AI chỉ nhận xét.
 */

export const RECRUIT_STAGES = ["CV", "INTERVIEW"] as const;
export type RecruitStage = (typeof RECRUIT_STAGES)[number];

export const RECRUIT_SCOPES = ["STANDARD", "MANAGER"] as const;
export type RecruitScope = (typeof RECRUIT_SCOPES)[number];

/** Tổng trọng số mà mỗi bộ phải đạt. Settings cảnh báo khi lệch. */
export const RECRUIT_TOTAL_WEIGHT = 100;

export type CriterionDef = {
  stage: RecruitStage;
  scope: RecruitScope;
  code: string;
  labelVi: string;
  labelEn: string;
  hint: string;
  weight: number;
  sort: number;
};

/**
 * Bộ tiêu chí mặc định do trợ lý đề xuất, chủ dự án duyệt 22/08/2026.
 * Seed chỉ tạo khi CHƯA có dòng nào của (stage, scope) đó — HR sửa tên/trọng số trong Settings thì
 * lần seed sau không đè.
 *
 * ⚠ Bộ INTERVIEW/STANDARD cố ý dùng LẠI ĐÚNG 6 mã của TD-1 (ATTITUDE · CASE · COMMUNICATION ·
 * CULTURE · EXPERTISE · PRESSURE) — nhờ vậy phiếu phỏng vấn đã chấm trước TD-2a vẫn đọc lại được
 * nguyên vẹn, chỉ đổi thang từ 1–5 sang trọng số.
 */
export const DEFAULT_CRITERIA: CriterionDef[] = [
  // ── CV · vị trí thường (100) ────────────────────────────────────────────
  { stage: "CV", scope: "STANDARD", code: "JD_MATCH", weight: 30, sort: 1, labelVi: "Mức khớp với JD", labelEn: "Fit to the JD", hint: "Kinh nghiệm và phạm vi công việc đã làm có đúng thứ vị trí này cần không." },
  { stage: "CV", scope: "STANDARD", code: "EXPERTISE", weight: 25, sort: 2, labelVi: "Chuyên môn & kỹ năng nghề", labelEn: "Professional skills", hint: "Kỹ năng cụ thể, công cụ sử dụng, độ sâu của việc đã làm." },
  { stage: "CV", scope: "STANDARD", code: "INDUSTRY", weight: 15, sort: 3, labelVi: "Kinh nghiệm ngành event/agency", labelEn: "Event/agency industry experience", hint: "Đã làm event, activation, agency hay ngành gần chưa. Chưa có thì chấm thấp, không phải 0." },
  { stage: "CV", scope: "STANDARD", code: "STABILITY", weight: 10, sort: 4, labelVi: "Ổn định nghề nghiệp", labelEn: "Career stability", hint: "Thời gian gắn bó mỗi nơi, có nhảy việc liên tục không, có khoảng trống dài không giải thích không." },
  { stage: "CV", scope: "STANDARD", code: "EDUCATION", weight: 10, sort: 5, labelVi: "Học vấn & chứng chỉ", labelEn: "Education & certificates", hint: "Bằng cấp, chứng chỉ, khoá học liên quan tới vị trí." },
  { stage: "CV", scope: "STANDARD", code: "CV_QUALITY", weight: 10, sort: 6, labelVi: "Chất lượng trình bày CV", labelEn: "CV quality", hint: "Rõ ràng, có số liệu kết quả, không lỗi chính tả, đúng trọng tâm." },

  // ── CV · vị trí quản lý (100) ───────────────────────────────────────────
  { stage: "CV", scope: "MANAGER", code: "JD_MATCH", weight: 20, sort: 1, labelVi: "Mức khớp với JD", labelEn: "Fit to the JD", hint: "Kinh nghiệm và phạm vi công việc đã làm có đúng thứ vị trí này cần không." },
  { stage: "CV", scope: "MANAGER", code: "EXPERTISE", weight: 15, sort: 2, labelVi: "Chuyên môn nghề", labelEn: "Professional expertise", hint: "Độ sâu chuyên môn — quản lý vẫn phải đủ nghề để dẫn được người làm nghề." },
  { stage: "CV", scope: "MANAGER", code: "INDUSTRY", weight: 10, sort: 3, labelVi: "Kinh nghiệm ngành event/agency", labelEn: "Event/agency industry experience", hint: "Đã làm event, activation, agency hay ngành gần chưa." },
  { stage: "CV", scope: "MANAGER", code: "LEADERSHIP", weight: 20, sort: 4, labelVi: "Năng lực dẫn dắt", labelEn: "Leadership", hint: "Đã quản lý bao nhiêu người, cấp nào, quy mô dự án/ngân sách phụ trách. CV không nêu thì chấm thấp, KHÔNG suy đoán." },
  { stage: "CV", scope: "MANAGER", code: "TEAM_MGMT", weight: 15, sort: 5, labelVi: "Quản lý nhóm & phát triển nhân sự", labelEn: "Team management", hint: "Tuyển, phân việc, kèm cặp, giữ người. Có bằng chứng cụ thể hay chỉ nêu chức danh." },
  { stage: "CV", scope: "MANAGER", code: "OWNERSHIP", weight: 10, sort: 6, labelVi: "Chịu trách nhiệm kết quả", labelEn: "Responsibility ownership", hint: "Chịu trách nhiệm P&L, KPI, cam kết đầu ra — có số liệu kết quả kèm theo không." },
  { stage: "CV", scope: "MANAGER", code: "STABILITY", weight: 10, sort: 7, labelVi: "Ổn định nghề nghiệp", labelEn: "Career stability", hint: "Thời gian gắn bó mỗi nơi, lộ trình thăng tiến có hợp lý không." },

  // ── PHỎNG VẤN · vị trí thường (100) ─────────────────────────────────────
  { stage: "INTERVIEW", scope: "STANDARD", code: "EXPERTISE", weight: 25, sort: 1, labelVi: "Chuyên môn & nghiệp vụ", labelEn: "Expertise", hint: "Trả lời câu hỏi nghề có chắc không, hiểu bản chất hay chỉ thuộc quy trình." },
  { stage: "INTERVIEW", scope: "STANDARD", code: "CASE", weight: 20, sort: 2, labelVi: "Xử lý tình huống thực tế", labelEn: "Case handling", hint: "Đưa một tình huống hiện trường và nghe cách xử lý." },
  { stage: "INTERVIEW", scope: "STANDARD", code: "COMMUNICATION", weight: 15, sort: 3, labelVi: "Giao tiếp & trình bày", labelEn: "Communication", hint: "Diễn đạt rõ, nghe hiểu ý người hỏi, thái độ khi bị hỏi vặn." },
  { stage: "INTERVIEW", scope: "STANDARD", code: "PRESSURE", weight: 15, sort: 4, labelVi: "Chịu áp lực / làm hiện trường", labelEn: "Working under pressure", hint: "Đặc thù nghề event: tăng ca, đi tỉnh, đổi kế hoạch phút chót." },
  { stage: "INTERVIEW", scope: "STANDARD", code: "ATTITUDE", weight: 15, sort: 5, labelVi: "Thái độ & mong muốn gắn bó", labelEn: "Attitude & commitment", hint: "Lý do ứng tuyển, kỳ vọng, mức độ nghiêm túc." },
  { stage: "INTERVIEW", scope: "STANDARD", code: "CULTURE", weight: 10, sort: 6, labelVi: "Phù hợp văn hoá & đội nhóm", labelEn: "Culture & teamwork", hint: "Cách làm việc nhóm, hợp với cách vận hành của TCM không." },

  // ── PHỎNG VẤN · vị trí quản lý (100) ────────────────────────────────────
  { stage: "INTERVIEW", scope: "MANAGER", code: "EXPERTISE", weight: 15, sort: 1, labelVi: "Chuyên môn & nghiệp vụ", labelEn: "Expertise", hint: "Đủ nghề để dẫn được người làm nghề." },
  { stage: "INTERVIEW", scope: "MANAGER", code: "CASE", weight: 15, sort: 2, labelVi: "Xử lý tình huống thực tế", labelEn: "Case handling", hint: "Tình huống có xung đột nguồn lực / khách đổi ý / sự cố hiện trường." },
  { stage: "INTERVIEW", scope: "MANAGER", code: "LEADERSHIP", weight: 20, sort: 3, labelVi: "Dẫn dắt & ra quyết định", labelEn: "Leadership & decision-making", hint: "Ra quyết định khi thiếu thông tin, bảo vệ quyết định, dẫn nhóm qua giai đoạn khó." },
  { stage: "INTERVIEW", scope: "MANAGER", code: "TEAM_MGMT", weight: 15, sort: 4, labelVi: "Quản lý nhóm & phát triển người", labelEn: "Team management", hint: "Phân việc, xử lý người làm không đạt, kèm cặp, giữ người giỏi." },
  { stage: "INTERVIEW", scope: "MANAGER", code: "OWNERSHIP", weight: 15, sort: 5, labelVi: "Chịu trách nhiệm kết quả", labelEn: "Responsibility ownership", hint: "Nhận trách nhiệm khi hỏng việc hay đổ cho hoàn cảnh/cấp dưới." },
  { stage: "INTERVIEW", scope: "MANAGER", code: "COMMUNICATION", weight: 10, sort: 6, labelVi: "Giao tiếp & trình bày", labelEn: "Communication", hint: "Trình bày trước khách và trước đội — vai quản lý phải làm được cả hai." },
  { stage: "INTERVIEW", scope: "MANAGER", code: "CULTURE", weight: 10, sort: 7, labelVi: "Phù hợp văn hoá", labelEn: "Culture fit", hint: "Cách vận hành có hợp với TCM không." },
];

/** Bộ tiêu chí áp cho một vị trí — quyết định bằng CỜ TICK, không đoán từ tên vị trí. */
export function scopeForPosition(isManagerial: boolean): RecruitScope {
  return isManagerial ? "MANAGER" : "STANDARD";
}

export type ScoredCriterion = { code: string; label: string; weight: number; score: number; note?: string | null };

/**
 * Tổng điểm = Σ điểm từng tiêu chí, mỗi tiêu chí bị KẸP vào [0, weight].
 *
 * ⚠ Kẹp là bắt buộc chứ không phải phòng xa: model hay trả điểm theo thang 10 hoặc thang 100 cho
 * MỌI tiêu chí bất kể trọng số — không kẹp thì một tiêu chí trọng số 10 trả về 85 là tổng vọt lên
 * mấy trăm và bảng so sánh thành vô nghĩa.
 */
export function computeTotal(items: ScoredCriterion[]): { total: number; max: number } {
  let total = 0;
  let max = 0;
  for (const it of items) {
    const w = Math.max(0, Math.round(it.weight));
    max += w;
    total += Math.min(w, Math.max(0, Math.round(it.score)));
  }
  return { total, max };
}

export type Recommendation = "INTERVIEW" | "CONSIDER" | "REJECT";

/**
 * Đề xuất phỏng vấn hay không — SUY TỪ TỔNG ĐIỂM theo hai ngưỡng chỉnh được trong Settings, KHÔNG
 * để AI tự phán.
 *
 * Lý do: ngưỡng là CHÍNH SÁCH tuyển dụng, HR/BGĐ phải chỉnh được mà không cần deploy, và phải giải
 * thích được với ứng viên/nội bộ vì sao hồ sơ này bị loại. AI tự phán thì cùng một điểm số có thể
 * ra hai kết luận khác nhau ở hai lượt chạy.
 *
 * ⚠ Quy về PHẦN TRĂM của maxScore chứ không so thẳng điểm thô: HR đổi trọng số làm tổng khác 100
 * thì ngưỡng vẫn đúng nghĩa.
 */
export function recommendationFor(total: number, max: number, interviewPct: number, considerPct: number): Recommendation {
  if (max <= 0) return "REJECT";
  const pct = (total / max) * 100;
  if (pct >= interviewPct) return "INTERVIEW";
  if (pct >= considerPct) return "CONSIDER";
  return "REJECT";
}

/** Đọc lại criteriaJson đã lưu. Hỏng khuôn thì trả mảng rỗng — bảng hiện "không đọc được", không vỡ trang. */
export function parseScoredCriteria(json: string): ScoredCriterion[] {
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((x) => {
      if (typeof x !== "object" || x === null) return [];
      const o = x as Record<string, unknown>;
      if (typeof o.code !== "string" || typeof o.weight !== "number" || typeof o.score !== "number") return [];
      return [{ code: o.code, label: typeof o.label === "string" ? o.label : o.code, weight: o.weight, score: o.score, note: typeof o.note === "string" ? o.note : null }];
    });
  } catch {
    return [];
  }
}

/** Tổng trọng số của một bộ — dùng để cảnh báo trong Settings khi khác 100. */
export function sumWeights(items: { weight: number; isActive?: boolean }[]): number {
  return items.filter((x) => x.isActive !== false).reduce((s, x) => s + x.weight, 0);
}
