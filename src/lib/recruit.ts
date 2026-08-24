// Tuyển dụng — phần THUẦN: không gọi Prisma, không import `fs`.
//
// ⚠ Hằng MIME/dung lượng CV phải nằm ở ĐÂY chứ không ở `recruit-storage.ts`: ô chọn tệp là client
// component, mà storage import `fs/promises` — kéo storage vào bundle trình duyệt là build hỏng
// ngay (`Module not found: Can't resolve 'fs/promises'`), và cả tsc lẫn eslint đều KHÔNG bắt được,
// chỉ `next build` bắt. Bài học đã ghi ở `client-kb.ts` và `mkt.ts`.

import { formatDateTime } from "./utils";

// ─────────────────────────────────────────────────────────
// Vị trí tuyển dụng
// ─────────────────────────────────────────────────────────

export const POSITION_STATUSES = ["OPEN", "PAUSED", "CLOSED"] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];

export function isPositionStatus(v: string): v is PositionStatus {
  return (POSITION_STATUSES as readonly string[]).includes(v);
}

/** Bốn ô JD — dùng chung cho vị trí và cho mẫu JD, nên khai một chỗ. */
export const JD_FIELDS = ["jdSummary", "jdResponsibilities", "jdRequirements", "jdBenefits"] as const;
export type JdField = (typeof JD_FIELDS)[number];

/** Trần ký tự mỗi ô JD — đủ dài cho một JD thật, đủ ngắn để không ai dán cả cuốn sổ tay vào. */
export const MAX_JD_FIELD_CHARS = 8000;

// ─────────────────────────────────────────────────────────
// Ứng viên
// ─────────────────────────────────────────────────────────

export const CANDIDATE_STATUSES = ["NEW", "INTERVIEWING", "HIRED", "REJECTED"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export function isCandidateStatus(v: string): v is CandidateStatus {
  return (CANDIDATE_STATUSES as readonly string[]).includes(v);
}

/**
 * File CV — các định dạng văn bản thông dụng (mở rộng 24/08/2026 theo yêu cầu chủ dự án).
 *
 * ĐỌC ĐƯỢC text (nhờ `ai/extract-text.ts`): `.pdf` (pdf-parse) · `.docx` (mammoth) · `.odt` (pizzip)
 * · `.rtf` · `.txt` / `.md` / `.html`.
 *
 * ⚠ KHÔNG đọc được nội dung (vẫn CHO tải lên để hồ sơ lưu được, chỉ là AI phải nhập tay):
 *   · `.doc` đời cũ — mammoth chỉ hiểu OpenXML.
 *   · **PDF không có lớp chữ** — CV xuất từ Canva/Figma hoặc ảnh scan. Đây là ca hay gặp nhất và
 *     nhìn từ ngoài y hệt "app không đọc được PDF"; repo KHÔNG có OCR. Lối ra: dùng ô LINK WEB
 *     (portfolio) hoặc nhập tay.
 *   · ảnh (`.jpg`/`.png`) — không nhận, vì không có gì đọc được và cũng không phải hồ sơ văn bản.
 */
export const CV_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "text/rtf",
  "text/plain",
  "text/markdown",
  "text/html",
] as const;

export const MAX_CV_BYTES = 15 * 1024 * 1024;

/**
 * Số CV tải lên một lượt. ⚠ Trần TỔNG dung lượng phải nhỏ hơn `serverActions.bodySizeLimit` (30MB,
 * xem next.config.ts): vượt trần đó là Next ném 413 TRƯỚC KHI action chạy ⇒ người dùng thấy TRANG
 * VỠ chứ không thấy thông báo lỗi (HANDOVER 10.13).
 */
export const MAX_CV_UPLOAD = 10;
export const MAX_CV_TOTAL_BYTES = 25 * 1024 * 1024;

/** Trần ký tự text CV gửi sang DeepSeek — cùng dải với tài liệu KB (24.000). */
export const MAX_CV_TEXT_CHARS = 24000;

// ─────────────────────────────────────────────────────────
// Phỏng vấn
// ─────────────────────────────────────────────────────────

export const INTERVIEW_ROUNDS = [1, 2, 3] as const;
export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number];

export function isInterviewRound(v: number): v is InterviewRound {
  return (INTERVIEW_ROUNDS as readonly number[]).includes(v);
}

export const INTERVIEW_STATUSES = ["PENDING", "CONFIRMED", "DECLINED", "DONE", "CANCELLED"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const RECOMMENDATIONS = ["PASS", "CONSIDER", "FAIL"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export function isRecommendation(v: string): v is Recommendation {
  return (RECOMMENDATIONS as readonly string[]).includes(v);
}

export const MIN_DURATION_MIN = 15;
export const MAX_DURATION_MIN = 480;

// ─────────────────────────────────────────────────────────
// Tiêu chí đánh giá — danh mục MỀM
// ─────────────────────────────────────────────────────────

/**
 * ⚠ TỪ TD-2c (22/08/2026) VIỆC CHẤM PHỎNG VẤN KHÔNG CÒN ĐỌC OptionSet NÀY NỮA — nó dùng bảng
 * `RecruitCriterion` (có TRỌNG SỐ, thang 100, tách bộ thường / bộ quản lý). Danh sách dưới đây chỉ
 * còn để seed OptionSet `recruit_criteria` cho phiếu đã chấm TRƯỚC TD-2c đọc lại được nhãn tiêu chí.
 * Sáu mã ở đây CỐ Ý trùng đúng sáu mã của bộ INTERVIEW/STANDARD trong `recruit-scoring.ts`.
 *
 * ⚠ `InterviewScore.criterionCode` lưu CHUỖI, không phải khoá ngoại: tắt một tiêu chí về sau thì
 * phiếu đã chấm vẫn đọc được nguyên vẹn.
 */

export const DEFAULT_RECRUIT_CRITERIA = [
  { code: "EXPERTISE", labelVi: "Chuyên môn & kinh nghiệm phù hợp JD", labelEn: "Expertise & experience vs JD" },
  { code: "CASE", labelVi: "Kỹ năng xử lý tình huống thực tế", labelEn: "Real-world problem solving" },
  { code: "COMMUNICATION", labelVi: "Giao tiếp & trình bày", labelEn: "Communication & presentation" },
  { code: "ATTITUDE", labelVi: "Thái độ, động cơ & mức độ gắn bó", labelEn: "Attitude, motivation & commitment" },
  { code: "PRESSURE", labelVi: "Khả năng chịu áp lực / làm hiện trường", labelEn: "Working under pressure / on site" },
  { code: "CULTURE", labelVi: "Phù hợp văn hoá & phối hợp đội nhóm", labelEn: "Culture fit & teamwork" },
] as const;

// ─────────────────────────────────────────────────────────
// Phép tính thuần
// ─────────────────────────────────────────────────────────

/**
 * AI ĐƯỢC XEM LƯƠNG MONG MUỐN? Không — hàm này trả lời "NGƯỜI ĐANG XEM có được nhìn ô lương không".
 *
 * Quy tắc chốt với chủ dự án: HR (theo mã quyền) **hoặc** trưởng bộ phận của vị trí **hoặc** người
 * quản lý trực tiếp của vị trí. Hai vế sau là phép kiểm THEO BẢN GHI, không phải theo mã quyền —
 * ma trận quyền của app là phẳng toàn cục nên không diễn đạt được "trưởng phòng của CHÍNH phòng
 * đang tuyển" (mirror cách duyệt đề xuất kho theo PIC dự án, HANDOVER 10.11).
 *
 * ⚠ Kết quả hàm này phải được dùng ở TẦNG TRUY VẤN (không select `expectedSalary`), không phải để
 * ẩn bằng CSS/JSX — số bị ẩn ở giao diện vẫn nằm nguyên trong HTML thô (bài học KB-H2).
 */
export function canSeeExpectedSalary(opts: {
  hasSalaryPermission: boolean;
  viewerStaffId: string | null;
  departmentLeadStaffId: string | null;
  hiringManagerStaffId: string | null;
}): boolean {
  if (opts.hasSalaryPermission) return true;
  if (!opts.viewerStaffId) return false;
  return opts.viewerStaffId === opts.departmentLeadStaffId || opts.viewerStaffId === opts.hiringManagerStaffId;
}

/**
 * Người phỏng vấn được mở hồ sơ ứng viên mà mình được phân công, dù không có quyền tuyển dụng.
 * Đây chính là yêu cầu "khi phỏng vấn thì người phỏng vấn nhìn thấy thông tin căn bản và CV".
 */
export function canOpenCandidate(opts: { hasRecruitView: boolean; isAssignedInterviewer: boolean }): boolean {
  return opts.hasRecruitView || opts.isAssignedInterviewer;
}

/**
 * Nội dung thông báo gửi người phỏng vấn: đủ để họ quyết được lịch mà KHÔNG phải mở hồ sơ —
 * đúng yêu cầu "kèm thông tin sơ lược ứng viên để confirm lịch".
 *
 * ⚠ CỐ Ý không đưa điện thoại / email / ngày sinh của ứng viên vào đây: thông báo hiện cho người
 * chưa chắc đã có quyền xem hồ sơ, và nội dung thông báo không đi qua lớp gác nào.
 * Tiêu đề & nội dung để tiếng Việt cứng — cùng ngoại lệ đã thống nhất cho Notification (HANDOVER 4.2).
 */
export function formatSummaryForNotification(opts: {
  positionTitle: string;
  scheduledAt: Date;
  durationMin: number;
  location: string | null;
  summarySkills: string | null;
}): string {
  const parts = [
    `Vị trí: ${opts.positionTitle}`,
    `Thời gian đề nghị: ${formatDateTime(opts.scheduledAt)} (${opts.durationMin} phút)`,
  ];
  if (opts.location) parts.push(`Địa điểm: ${opts.location}`);
  if (opts.summarySkills) parts.push(`Sơ lược: ${opts.summarySkills.slice(0, 400)}`);
  parts.push("Mở mục Tuyển dụng để xác nhận hoặc báo bận.");
  return parts.join("\n");
}

/** Vòng kế tiếp nên đặt lịch — vòng lớn nhất đã có + 1, trần ở 3. Null = đã đủ 3 vòng. */
export function nextRound(existingRounds: number[]): InterviewRound | null {
  const max = existingRounds.length ? Math.max(...existingRounds) : 0;
  const next = max + 1;
  return isInterviewRound(next) ? next : null;
}
