import type { AiMessage } from "./deepseek";
import type { DocumentType } from "./document-types";

/**
 * Prompt cho công cụ "Soạn thảo văn bản" (đợt 2) — văn bản kế toán / nhân sự / hành chính.
 *
 * File THUẦN: không prisma, không server-only — chỉ dựng chuỗi, test được độc lập.
 *
 * ⚠ Khuôn JSON tài liệu KHÔNG khai ở đây: caller bọc bằng `withDocFormat()` (lib/ai/prompts.ts) —
 * một chỗ định nghĩa khối cho mọi công cụ.
 */

export type DocumentDraftInput = {
  type: DocumentType;
  /** Trích yếu người dùng gõ (có thể để trống — AI tự đặt theo nội dung). */
  subject: string | null;
  /** Ý chính / dữ kiện người dùng cung cấp. Đây là NGUỒN DỮ KIỆN DUY NHẤT. */
  brief: string;
  /** Text bóc từ file mẫu tham chiếu (nếu có) — KHÔNG lưu file, chỉ dùng trong lượt gọi này. */
  referenceText: string | null;
  referenceName: string | null;
  /** Tên công ty đưa vào văn bản — lấy từ setting `company.legal_name_vi`. */
  companyName: string;
};

const RULES = `QUY TẮC BẮT BUỘC:
1. CHỈ dùng dữ kiện người dùng cung cấp ở phần NỘI DUNG (và FILE THAM CHIẾU nếu có). TUYỆT ĐỐI không
   bịa thêm tên người, chức danh, phòng ban, số tiền, ngày tháng, hay căn cứ pháp lý.
2. Thiếu thông tin bắt buộc của loại văn bản này thì ĐỂ CHỖ TRỐNG dạng […] để người soạn điền, KÈM
   một khối "bullets" ở CUỐI liệt kê đúng những chỗ còn trống. Không tự đoán cho đủ.
3. KHÔNG tự sinh SỐ HIỆU văn bản và KHÔNG tự điền ngày ban hành — để […] cho người soạn.
4. Viết tiếng Việt, văn phong hành chính: câu ngắn, không hoa mỹ, không cảm thán.
5. Không viện dẫn điều luật cụ thể (số hiệu nghị định, điều khoản Bộ luật Lao động) trừ khi người
   dùng đã nêu chính xác trong phần nội dung — viện dẫn sai luật nguy hiểm hơn là không viện dẫn.
6. FILE THAM CHIẾU dùng để học BỐ CỤC và CÁCH HÀNH VĂN, không phải để sao chép số liệu sang văn bản
   mới. Số liệu chỉ lấy từ phần NỘI DUNG.`;

export function documentDraftPrompt(input: DocumentDraftInput): AiMessage[] {
  const outline = input.type.outline.map((o, i) => `${i + 1}. ${o}`).join("\n");

  const system = `Bạn là chuyên viên hành chính - nhân sự của ${input.companyName}, soạn văn bản nội bộ theo chuẩn hành chính Việt Nam.

Loại văn bản cần soạn: ${input.type.labelVi}${input.type.hintVi ? ` (${input.type.hintVi})` : ""}

BỐ CỤC BẮT BUỘC theo đúng thứ tự:
${outline}

${RULES}`;

  const parts: string[] = [];
  if (input.subject) parts.push(`TRÍCH YẾU NGƯỜI DÙNG ĐẶT: ${input.subject}`);
  parts.push(`NỘI DUNG / DỮ KIỆN:\n${input.brief}`);
  if (input.referenceText) {
    parts.push(
      `FILE THAM CHIẾU (${input.referenceName ?? "mẫu"}) — học bố cục và cách hành văn, KHÔNG chép số liệu:\n${input.referenceText}`,
    );
  }

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: parts.join("\n\n") },
  ];
}
