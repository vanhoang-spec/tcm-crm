/**
 * Prompt + khuôn dữ liệu cho việc AI ĐỌC CV ứng viên.
 *
 * ⚠ `aiChatJson` chỉ ép kiểu `as T`, KHÔNG validate (xem HANDOVER 10.14) — nên MỌI trường dưới đây
 * phải đi qua Zod trước khi chạm DB. Model rất hay trả ngày sinh sai khuôn, số điện thoại kèm chữ,
 * hoặc lương dạng "15 triệu"; để lọt là ghi rác vào hồ sơ ứng viên.
 *
 * ⚠ DỮ LIỆU GỬI RA NGOÀI: nội dung CV đi NGUYÊN VĂN sang DeepSeek, và CV là dữ liệu cá nhân của
 * người NGOÀI công ty (họ tên, ngày sinh, điện thoại, email, nơi từng làm việc). Hộp xác nhận
 * trước nút bấm phải nói rõ điều này — cùng chuẩn đã áp cho kho kiến thức khách hàng.
 *
 * File này KHÔNG import prisma/server-only — chỉ dựng chuỗi và khai schema.
 */

import { z } from "zod";
import type { AiMessage } from "./deepseek";

/** Cắt chuỗi AI trả về để một lần model "nói nhiều" không thổi cột DB. */
const capped = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => {
      const s = (v ?? "").trim();
      return s ? s.slice(0, max) : null;
    });

/**
 * Ngày sinh: chỉ nhận đúng khuôn YYYY-MM-DD, sai khuôn thì về null thay vì đoán.
 * Chuỗi này sau đó được dựng thành ngày theo quy ước UTC-midnight của app (HANDOVER 4.3).
 */
const dobSchema = z
  .string()
  .nullish()
  .transform((v) => {
    const s = (v ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    // Chặn ngày vô lý: CV của người sinh năm 1900 hay 2030 là model đọc nhầm mã số/năm tốt nghiệp.
    const year = new Date().getFullYear();
    if (y < 1940 || y > year - 14) return null;
    return s;
  });

/**
 * Lương mong muốn (VND). Model hay trả "15 triệu" / "15.000.000" / 15000000.
 * Chỉ nhận được con số hợp lý mới lấy; ngoài dải thì bỏ, để HR tự nhập.
 */
const salarySchema = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v == null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
    const digits = v.replace(/[^\d]/g, "");
    if (!digits) return null;
    return Number(digits);
  })
  .transform((n) => (n != null && n >= 1_000_000 && n <= 1_000_000_000 ? n : null));

export const cvParseSchema = z.object({
  fullName: capped(120),
  dob: dobSchema,
  phone: capped(40),
  email: capped(160),
  summaryWork: capped(4000),
  summarySkills: capped(4000),
  summaryOther: capped(4000),
  expectedSalary: salarySchema,
});

export type CvParseResult = z.infer<typeof cvParseSchema>;

const RULES = `QUY TẮC BẮT BUỘC:
- CHỈ dùng thông tin CÓ THẬT trong CV. Không suy đoán, không bịa, không "điền cho đủ".
- Không tìm thấy trường nào thì trả null cho trường đó. null là câu trả lời ĐÚNG khi CV không nói.
- Ngày sinh: đúng khuôn "YYYY-MM-DD". CV chỉ ghi năm sinh hoặc không ghi → trả null (KHÔNG tự bịa
  ngày và tháng).
- Điện thoại và email: chép NGUYÊN VĂN, không định dạng lại, không sửa lỗi chính tả.
- Ba ô tóm tắt viết bằng TIẾNG VIỆT, văn xuôi gọn, không markdown, không gạch đầu dòng bằng "*".
- Chỉ trả về JSON đúng khuôn đã cho — không lời dẫn, không giải thích, không bọc markdown.`;

const SYSTEM = `Bạn là trợ lý tuyển dụng của TCM — agency Below The Line tại Việt Nam (event,
activation, roadshow, booth/POSM, nhân sự hiện trường).

Nhiệm vụ: đọc phần văn bản trích từ CV của một ứng viên và rút ra các thông tin hồ sơ.

Trả về JSON đúng khuôn:
{
  "fullName": "họ tên đầy đủ của ứng viên",
  "dob": "YYYY-MM-DD hoặc null",
  "phone": "số điện thoại liên hệ hoặc null",
  "email": "email liên hệ hoặc null",
  "summaryWork": "tóm tắt quá trình làm việc: các nơi đã làm, chức danh, khoảng thời gian, theo thứ tự gần nhất trước",
  "summarySkills": "tóm tắt kinh nghiệm chuyên môn và kỹ năng nổi bật, gồm cả công cụ/phần mềm và ngoại ngữ nếu có",
  "summaryOther": "tóm tắt phần còn lại: học vấn, chứng chỉ, giải thưởng, hoạt động, và ý chính từ thư xin việc nếu có",
  "expectedSalary": số nguyên VND nếu CV có nêu mức lương mong muốn, ngược lại null
}

${RULES}`;

/** Dựng cặp tin nhắn cho một lần đọc CV. `positionTitle` chỉ để AI biết ngữ cảnh vị trí ứng tuyển. */
export function cvParseMessages(opts: { positionTitle: string; cvText: string }): AiMessage[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Vị trí ứng tuyển: ${opts.positionTitle}

--- NỘI DUNG CV ---
${opts.cvText}
--- HẾT CV ---`,
    },
  ];
}
