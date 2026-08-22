/**
 * THƯ MỜI NHẬN VIỆC (Job Offer) — hàm THUẦN, không chạm Prisma (TD-2d).
 *
 * ⚠ Mẫu theo PHÒNG BAN vì điều khoản khác nhau thật (Account có hoa hồng, Creative có điều khoản
 * sở hữu file thiết kế…). Khoá là `Department.code`; `"DEFAULT"` là bản dùng chung khi phòng chưa
 * khai riêng — không có bản dùng chung thì phòng mới lập tức không lập offer được.
 *
 * ⚠ Dùng LẠI bộ thay biến của mẫu thư (`renderTemplate` trong `recruit-email.ts`): một cách viết
 * biến duy nhất cho cả thư lẫn văn bản, không đẻ ra hai cú pháp cho người dùng phải nhớ.
 */

import type { DocBlock } from "@/lib/doc-blocks";

export const OFFER_DEFAULT_KEY = "DEFAULT";

/** Biến dùng được trong mẫu thư mời nhận việc. */
export const OFFER_VARS = [
  "candidateName",
  "positionTitle",
  "departmentName",
  "companyName",
  "hrName",
  "salaryText",
  "allowanceText",
  "probationText",
  "startDate",
  "extraTerms",
] as const;

export const DEFAULT_OFFER_BODY = `Kính gửi anh/chị {{candidateName}},

Sau quá trình phỏng vấn, {{companyName}} trân trọng mời anh/chị nhận vị trí {{positionTitle}} tại bộ phận {{departmentName}} với các điều khoản như sau:

1. VỊ TRÍ VÀ BỘ PHẬN
Vị trí: {{positionTitle}}
Bộ phận: {{departmentName}}

2. THU NHẬP
Mức lương: {{salaryText}}
Phụ cấp: {{allowanceText}}

3. THỬ VIỆC
{{probationText}}

4. NGÀY DỰ KIẾN NHẬN VIỆC
{{startDate}}

5. ĐIỀU KHOẢN KHÁC
{{extraTerms}}

Anh/chị vui lòng phản hồi xác nhận để chúng tôi chuẩn bị thủ tục tiếp nhận. Thư mời này có giá trị trong 07 ngày kể từ ngày gửi.

Trân trọng,
{{hrName}}
Phòng Nhân sự — {{companyName}}`;

export const OFFER_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];
export function isOfferStatus(v: string): v is OfferStatus {
  return (OFFER_STATUSES as readonly string[]).includes(v);
}

/**
 * Câu mô tả thử việc, dựng từ hai con số.
 * ⚠ Luật lao động VN: lương thử việc tối thiểu 85% lương chính thức. Hàm KHÔNG tự ép con số — HR
 * nhập bao nhiêu thì ghi bấy nhiêu — nhưng `probationWarning` báo cho người lập biết đang dưới mức.
 */
export function probationText(months: number | null, pct: number | null): string {
  if (!months || months <= 0) return "Không áp dụng thử việc.";
  const p = pct && pct > 0 ? `${pct}% lương chính thức` : "theo thoả thuận";
  return `Thời gian thử việc: ${months} tháng, hưởng ${p}.`;
}

/** Cảnh báo mềm — KHÔNG chặn lưu, chỉ để người lập nhìn thấy. */
export function probationWarning(pct: number | null): boolean {
  return pct != null && pct > 0 && pct < 85;
}

/**
 * Đổi văn bản thuần (đã thay biến) thành khối tài liệu để dựng .docx.
 *
 * ⚠ Dòng bắt đầu bằng SỐ + dấu chấm và VIẾT HOA được coi là tiêu đề mục — đây là quy ước của bản
 * mẫu mặc định. Mẫu do HR viết lại theo kiểu khác thì mọi thứ thành đoạn văn thường; văn bản vẫn
 * đúng chữ, chỉ không có cấp tiêu đề. Cố ý KHÔNG đoán thông minh hơn: đoán sai làm hỏng bố cục một
 * văn bản pháp lý còn tệ hơn là in phẳng.
 */
export function offerBodyToBlocks(title: string, body: string): { title: string; blocks: DocBlock[] } {
  const blocks: DocBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (/^\d+\.\s+\p{Lu}/u.test(trimmed)) {
      flush();
      blocks.push({ type: "heading", level: 2, text: trimmed });
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return { title, blocks };
}
