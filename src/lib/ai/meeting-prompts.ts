/**
 * MEET-2 — Prompt + khuôn dữ liệu cho AI ĐỌC BIÊN BẢN HỌP tuần (dán tay hoặc file Claude Project xuất ra)
 * rồi điền vào form biên bản trong app.
 *
 * ⚠ `aiChatJson` chỉ ép kiểu `as T`, KHÔNG validate (HANDOVER 10.14) — mọi trường đi qua Zod ở đây.
 * ⚠ AI CHỈ TRẢ VỀ CHO FORM, KHÔNG ghi thẳng DB (mirror `parseCvWithAi`): người chủ trì nhìn, sửa, rồi bấm Lưu.
 * ⚠ Khớp dự án/khách/người phụ trách làm BẰNG CODE ở `lib/meetings.ts` (matchParsedRows / matchAssignee) —
 *    AI chỉ trả về tên/mã như biên bản viết; không bao giờ tạo dự án hay khách mới.
 * ⚠ DỮ LIỆU GỬI RA NGOÀI: nội dung biên bản đi NGUYÊN VĂN sang DeepSeek (tên khách, tình hình dự án, tên
 *    nhân sự). Hộp xác nhận trước nút bấm nói rõ điều này — chuẩn đã áp cho CV, kho kiến thức, báo giá NCC.
 *
 * File này KHÔNG import prisma/server-only — chỉ dựng chuỗi và khai schema.
 */

import { z } from "zod";
import type { AiMessage } from "./deepseek";

const text = (max: number) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v == null ? "" : String(v).trim().slice(0, max)));

/** RAG: chỉ nhận đúng 3 mã; model hay trả "AMBER"/"ORANGE"/"đang ổn" → null để người dùng tự chọn. */
const ragSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    const s = (v ?? "").toString().trim().toUpperCase();
    return s === "GREEN" || s === "YELLOW" || s === "RED" ? s : null;
  });

/** Hạn: chỉ nhận "YYYY-MM-DD"; mọi dạng khác ("tuần sau", "20/8") → null, người dùng nhập tay. */
const dueSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    const s = (v ?? "").toString().trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  });

export const meetingParseSchema = z.object({
  rows: z
    .array(
      z.object({
        projectCode: text(40),
        projectName: text(200),
        clientName: text(200),
        rag: ragSchema,
        // ⚠ Ba trần này PHẢI khớp con số ghi trong quy tắc 8 của prompt. Dashboard tuần thật có 13 khách
        // × 38 việc: để trần rộng (1500/800/800) là model viết dài, output vượt 8k token, JSON bị cắt
        // giữa chừng và `aiChatJson` ném EMPTY — đã tái hiện bằng file thật 18/08/2026.
        update: text(600),
        risks: text(400),
        nextSteps: text(400),
      }),
    )
    .max(80)
    .default([]),
  actions: z
    .array(
      z.object({
        title: text(300),
        assigneeName: text(120),
        dueDate: dueSchema,
        projectCode: text(40),
      }),
    )
    .max(80)
    .default([]),
  generalNote: text(2000),
  confidence: z.union([z.number(), z.null()]).optional().transform((v) => (typeof v === "number" && v >= 0 && v <= 1 ? v : null)),
});

export type MeetingParsed = z.infer<typeof meetingParseSchema>;

export function meetingParseMessages(input: {
  teamCode: string;
  weekLabel: string;
  projects: { code: string; name: string; clientName: string }[];
  clients: { code: string; name: string }[];
  staff: string[];
  minutesText: string;
}): AiMessage[] {
  const projectList = input.projects.map((p) => `- ${p.code} | ${p.name} | khách: ${p.clientName}`).join("\n") || "(không có)";
  const clientList = input.clients.map((c) => `- ${c.code} | ${c.name}`).join("\n") || "(không có)";
  const staffList = input.staff.join(", ") || "(không có)";
  return [
    {
      role: "system",
      content: `Bạn là trợ lý ghi biên bản họp của một agency event. Nhiệm vụ: đọc biên bản họp tuần của team Account rồi trả về JSON có cấu trúc.

QUY TẮC BẮT BUỘC
1. CHỈ dùng thông tin CÓ TRONG biên bản. Không suy đoán, không bịa số liệu, không thêm dự án/khách/việc không được nhắc tới.
2. Mỗi dự án tối đa MỘT dòng trong "rows". Gộp mọi ý về cùng một dự án vào một dòng. CHỈ tạo dòng cho dự án/khách được biên bản NHẮC TỚI — danh sách dự án bên dưới chỉ để bạn điền đúng mã, dự án nào biên bản không nói gì thì KHÔNG đưa vào "rows" (đừng điền cho đủ danh sách).
3. "rag" chỉ nhận GREEN (đúng tiến độ) / YELLOW (cần theo dõi) / RED (có vấn đề). Biên bản không nói rõ tình trạng thì để null — KHÔNG đoán.
4. "projectCode" điền đúng mã dự án nếu biên bản có nhắc (dạng T001ABC26A1). Không có mã thì để rỗng và điền "projectName" theo đúng chữ trong biên bản.
5. Việc chỉ đưa vào "actions" khi biên bản nói rõ ai đó phải LÀM gì. "assigneeName" ghi đúng tên người như biên bản viết; không rõ ai thì để rỗng.
6. "dueDate" chỉ điền khi biên bản có ngày cụ thể, định dạng YYYY-MM-DD. Cách nói mơ hồ ("tuần sau", "đầu tháng") để null.
7. Viết lại gọn, giữ nguyên con số và tên riêng trong biên bản. Không thêm lời khuyên của bạn.
8. VIẾT NGẮN — cả bản trả về phải vừa một lượt: "update" tối đa 600 ký tự, "risks" và "nextSteps" tối đa 400 ký tự, "title" của việc tối đa 300 ký tự. Giữ con số và tên riêng, cắt phần diễn giải.
9. Trả về JSON THUẦN đúng khuôn, không giải thích gì thêm.

KHUÔN JSON
{
  "rows": [{"projectCode": "", "projectName": "", "clientName": "", "rag": "GREEN|YELLOW|RED|null", "update": "", "risks": "", "nextSteps": ""}],
  "actions": [{"title": "", "assigneeName": "", "dueDate": "YYYY-MM-DD|null", "projectCode": ""}],
  "generalNote": "",
  "confidence": 0.0
}`,
    },
    {
      role: "user",
      content: `Team: ${input.teamCode}. Tuần họp: ${input.weekLabel}.

DỰ ÁN ĐANG CHẠY CỦA TEAM (dùng để điền đúng mã; đừng thêm dự án ngoài danh sách này trừ khi biên bản nhắc tên khác):
${projectList}

KHÁCH HÀNG CỦA TEAM:
${clientList}

NHÂN SỰ (để ghi đúng tên người phụ trách): ${staffList}

BIÊN BẢN HỌP:
"""
${input.minutesText}
"""`,
    },
  ];
}
