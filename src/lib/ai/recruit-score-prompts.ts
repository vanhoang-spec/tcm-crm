/**
 * Prompt + khuôn dữ liệu cho việc AI CHẤM ĐIỂM CV theo bộ tiêu chí có trọng số (TD-2a).
 *
 * ⚠ Khác hẳn `recruit-prompts.ts` (đọc CV để ĐIỀN FORM). Ở đây AI chấm từng tiêu chí và viết nhận
 * xét; **TỔNG ĐIỂM và ĐỀ XUẤT phỏng vấn/không do CODE tính** (`lib/recruit-scoring.ts`) — cùng
 * nguyên tắc đã áp cho bảng so sánh báo giá NCC (HANDOVER 10.36) và đối chiếu chi ngân hàng
 * (10.51). Để model tự cộng thì cùng một bộ điểm ra hai tổng khác nhau ở hai lượt chạy.
 *
 * ⚠ `aiChatJson` chỉ ép kiểu `as T`, KHÔNG validate (HANDOVER 10.14) — mọi trường phải qua Zod.
 *
 * ⚠ DỮ LIỆU GỬI RA NGOÀI: nội dung CV đi NGUYÊN VĂN sang DeepSeek — dữ liệu cá nhân của người
 * NGOÀI công ty. Hộp xác nhận trước nút bấm phải nói rõ, cùng chuẩn đã áp cho việc đọc CV.
 *
 * File này KHÔNG import prisma/server-only — chỉ dựng chuỗi và khai schema.
 */

import { z } from "zod";
import type { AiMessage } from "./deepseek";

const capped = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => {
      const s = (v ?? "").trim();
      return s ? s.slice(0, max) : null;
    });

export const cvScoreSchema = z.object({
  criteria: z
    .array(
      z.object({
        code: z.string().min(1).max(40),
        // ⚠ KHÔNG kẹp theo weight ở đây (schema không biết weight của từng mã) — việc kẹp làm ở
        // `computeTotal`. Chỉ chặn số vô lý để không nuốt NaN/âm sâu vào DB.
        score: z.coerce.number().min(-1000).max(1000),
        note: capped(400),
      }),
    )
    .max(30),
  summary: capped(800),
  strengths: capped(800),
  concerns: capped(800),
});
export type CvScoreResult = z.infer<typeof cvScoreSchema>;

const RULES = `QUY TẮC BẮT BUỘC:
- CHỈ chấm dựa trên NHỮNG GÌ CÓ TRONG CV và JD được cung cấp. TUYỆT ĐỐI không suy đoán, không bịa
  kinh nghiệm, không cho điểm vì "có thể ứng viên đã làm".
- CV KHÔNG NÊU thì chấm THẤP kèm ghi chú "CV không nêu" — đó là thông tin thật (hồ sơ thiếu), không
  phải lý do cho điểm trung bình.
- Mỗi tiêu chí có ĐIỂM TỐI ĐA riêng ghi trong danh sách. Điểm phải nằm trong [0, tối đa] của ĐÚNG
  tiêu chí đó. KHÔNG chấm theo thang 10 hay thang 100 cho mọi tiêu chí.
- KHÔNG tự cộng tổng, KHÔNG tự kết luận nên phỏng vấn hay không — hệ thống tự tính.
- Ghi chú từng tiêu chí phải NÊU BẰNG CHỨNG từ CV (tên công ty, số năm, con số kết quả), không viết
  chung chung kiểu "khá tốt", "phù hợp".
- Chấm công tâm: không ưu ái/định kiến theo giới tính, tuổi, quê quán, trường học, tình trạng hôn
  nhân hay ngoại hình. Những thứ đó KHÔNG được ảnh hưởng tới điểm và không được nhắc trong nhận xét.
- "concerns" nêu điểm cần làm rõ khi phỏng vấn (khoảng trống thời gian, nhảy việc, thiếu bằng chứng
  cho phần tự nhận), không phải chỗ chê người.
- Chỉ trả về JSON đúng khuôn, không lời dẫn, không bọc markdown.`;

function systemPrompt(): string {
  return `Bạn là chuyên viên tuyển dụng của TCM — agency event & activation tại Việt Nam.
Nhiệm vụ: đọc CV của MỘT ứng viên và chấm điểm theo bộ tiêu chí được cung cấp.

Trả về JSON đúng khuôn:
{
  "criteria": [{"code":"MÃ_TIÊU_CHÍ","score": số nguyên trong [0, điểm tối đa của mã đó],"note":"bằng chứng cụ thể từ CV"}],
  "summary": "3-5 câu tóm tắt ứng viên này là ai và mức phù hợp với vị trí",
  "strengths": "các điểm mạnh, mỗi ý một dòng bắt đầu bằng '- '",
  "concerns": "các điểm cần làm rõ khi phỏng vấn, mỗi ý một dòng bắt đầu bằng '- '"
}

${RULES}`;
}

export type CvScoreInput = {
  positionTitle: string;
  /** Ghép từ 4 ô JD của vị trí. Rỗng thì AI chỉ còn tên vị trí để bám — nói rõ trong prompt. */
  jdText: string;
  isManagerial: boolean;
  criteria: { code: string; label: string; weight: number; hint?: string | null }[];
  cvText: string;
};

export function cvScoreMessages(input: CvScoreInput): AiMessage[] {
  const lines = [
    `VỊ TRÍ ỨNG TUYỂN: ${input.positionTitle}${input.isManagerial ? "  (VỊ TRÍ QUẢN LÝ)" : ""}`,
    "",
    "MÔ TẢ CÔNG VIỆC (JD):",
    input.jdText.trim() || "(vị trí này chưa nhập JD — chấm theo tên vị trí và chuẩn chung của ngành event/agency, và nói rõ hạn chế đó trong summary)",
    "",
    `BỘ TIÊU CHÍ — tổng điểm tối đa ${input.criteria.reduce((s, c) => s + c.weight, 0)}:`,
    ...input.criteria.map((c) => `- ${c.code} | ${c.label} | tối đa ${c.weight} điểm${c.hint ? ` | ${c.hint}` : ""}`),
    "",
    "Chấm ĐỦ và CHỈ các mã trên, mỗi mã đúng một lần.",
    "",
    "--- NỘI DUNG CV ---",
    input.cvText,
    "--- HẾT CV ---",
  ];
  return [
    { role: "system", content: systemPrompt() },
    { role: "user", content: lines.join("\n") },
  ];
}
