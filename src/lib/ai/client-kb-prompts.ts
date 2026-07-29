/**
 * Prompt cho phần SINH NỘI DUNG HỌC TẬP của Kho kiến thức theo khách hàng (đợt H3).
 *
 * Tách khỏi `prompts.ts` vì khác hẳn về bản chất: các prompt bên đó trả MARKDOWN cho người đọc,
 * còn ba prompt ở đây trả JSON đúng khuôn để ghi thẳng vào DB sau khi Zod duyệt.
 *
 * Ba quy tắc riêng của bộ này, ngoài quy tắc chung "không bịa" của repo:
 *  1. Nguyên liệu là hồ sơ khách trong CRM + tài liệu khách gửi (brand guideline, brief). Không có
 *     trong nguyên liệu thì KHÔNG được viết ra — bài học sai còn tệ hơn không có bài học, vì
 *     nhân viên sẽ mang thông tin bịa đó đi làm việc với chính khách hàng.
 *  2. Mọi thứ sinh ra đều là BẢN NHÁP. PIC đọc, sửa, rồi mới đăng. Prompt không được viết như
 *     thể đang xuất bản.
 *  3. File này KHÔNG import prisma/server-only — chỉ dựng chuỗi.
 */

import type { AiMessage } from "./deepseek";
import { QUIZ_AI_QUESTION_COUNT, QUIZ_OPTION_COUNT, type LessonBlock } from "@/lib/client-kb";

const ROLE = `Bạn đang soạn tài liệu ĐÀO TẠO NỘI BỘ cho TCM — agency Below The Line tại Việt Nam
(event, activation, roadshow, booth/POSM, nhân sự hiện trường). Người đọc là nhân viên TCM, đặc biệt
là người mới, phải nắm về KHÁCH HÀNG này trước khi bắt tay vào dự án cho họ.`;

const GROUNDING = `QUY TẮC BẮT BUỘC:
- CHỈ dùng thông tin có trong phần NGUYÊN LIỆU bên dưới. Không có thì bỏ qua, KHÔNG suy đoán.
- TUYỆT ĐỐI không bịa: số liệu, mốc thời gian, tên người, tên chiến dịch, quy định của khách.
- Không viết những câu chung chung đúng với mọi khách hàng ("cần chuyên nghiệp", "giữ đúng deadline").
  Chỉ viết thứ ĐẶC THÙ của khách này. Thà ít mà đúng còn hơn nhiều mà rỗng.
- Viết bằng tiếng Việt, giọng đồng nghiệp hướng dẫn người mới, câu ngắn, không khách sáo.
- Chỉ trả về JSON đúng khuôn được yêu cầu. Không thêm lời dẫn, không bọc trong markdown.`;

/** Nguyên liệu chung cho cả ba prompt. */
export type KbAiContext = {
  /** Tên đối tượng KB neo vào — nhóm khách hoặc chính khách. */
  anchorName: string;
  /** Khách đang thuộc nhóm nào (để model biết đây là kiến thức dùng chung nhiều pháp nhân). */
  isGroup: boolean;
  /** Các pháp nhân trong nhóm (rỗng nếu khách lẻ). */
  memberNames: string[];
  industry: string | null;
  /** "Thông tin chung" PIC đã viết tay — nguyên liệu đáng tin nhất. */
  generalNote: string | null;
  /** Text trích từ tài liệu nguồn, đã cắt theo ngân sách ký tự. */
  sourcesText: string;
  /** Tên tài liệu không trích được text (scan ảnh, quá dài) — nêu để người đọc biết còn thiếu gì. */
  skippedSources: string[];
};

function contextBlock(c: KbAiContext): string {
  const parts: string[] = [];
  parts.push(`ĐỐI TƯỢNG: ${c.anchorName}${c.isGroup ? " (nhóm khách hàng — kiến thức dùng chung cho mọi pháp nhân)" : ""}`);
  if (c.memberNames.length) parts.push(`PHÁP NHÂN TRONG NHÓM: ${c.memberNames.join(" · ")}`);
  if (c.industry) parts.push(`NGÀNH HÀNG: ${c.industry}`);
  if (c.generalNote) parts.push(`GHI CHÚ NỘI BỘ DO PIC VIẾT:\n${c.generalNote}`);
  if (c.sourcesText.trim()) parts.push(`TRÍCH TÀI LIỆU KHÁCH GỬI:\n${c.sourcesText}`);
  else parts.push(`TRÍCH TÀI LIỆU KHÁCH GỬI: (chưa có tài liệu nào đọc được)`);
  if (c.skippedSources.length) parts.push(`TÀI LIỆU KHÔNG ĐỌC ĐƯỢC (đừng nhắc nội dung): ${c.skippedSources.join(" · ")}`);
  return parts.join("\n\n");
}

// ───────────────────────── 1. Dàn bài ─────────────────────────

/**
 * Chỉ chạy khi kho CHƯA có chủ đề nào — đây là bước "dựng khung", không phải bước bổ sung.
 * Chốt chủ đề đầu tiên luôn là tổng quan & thuật ngữ: người mới cần biết khách là ai và các từ
 * riêng của khách trước khi đọc bất cứ quy định nào.
 */
export function kbOutlinePrompt(c: KbAiContext): AiMessage[] {
  return [
    {
      role: "system",
      content: `${ROLE}

Nhiệm vụ: đề xuất DÀN BÀI cho kho kiến thức về khách hàng này — chia thành chủ đề, mỗi chủ đề gồm
vài bài học. Chỉ đặt TÊN, chưa viết nội dung.

${GROUNDING}

Ràng buộc:
- 3 đến 6 chủ đề. Chủ đề ĐẦU TIÊN bắt buộc là tổng quan về khách + thuật ngữ riêng của họ.
- Mỗi chủ đề 2 đến 5 bài. Tên bài phải cụ thể, đọc tên là biết bài nói gì.
- Không đặt chủ đề mà nguyên liệu không hề đề cập tới.

Trả về JSON đúng khuôn:
{"topics":[{"name":"...","lessons":[{"title":"..."}]}]}`,
    },
    { role: "user", content: `NGUYÊN LIỆU:\n\n${contextBlock(c)}` },
  ];
}

// ───────────────────────── 2. Nội dung một bài ─────────────────────────

/**
 * Sinh TỪNG BÀI một, không sinh cả chủ đề trong một lượt: gộp lại là vỡ trần token và một lỗi
 * nhỏ làm hỏng cả loạt. Truyền kèm tên các bài khác trong chủ đề để model không viết trùng ý.
 */
export function kbLessonPrompt(
  c: KbAiContext,
  lesson: { topicName: string; title: string; siblingTitles: string[] },
): AiMessage[] {
  return [
    {
      role: "system",
      content: `${ROLE}

Nhiệm vụ: viết NỘI DUNG cho đúng một bài học.

${GROUNDING}

Khuôn nội dung — mảng "blocks", mỗi phần tử là MỘT trong bốn loại:
  {"type":"heading","text":"..."}                         tiêu đề mục
  {"type":"paragraph","text":"..."}                       đoạn văn
  {"type":"bullets","items":["...","..."]}                gạch đầu dòng
  {"type":"terms","items":[{"term":"...","definition":"..."}]}   thuật ngữ và giải nghĩa

Ràng buộc:
- Tối đa 12 khối. Ưu tiên gạch đầu dòng và thuật ngữ hơn đoạn văn dài.
- Chỉ viết phần thuộc về bài NÀY, không lấn sang các bài khác cùng chủ đề.
- Nếu nguyên liệu không đủ để viết bài này, trả về ít khối thôi — không độn chữ cho dài.

Trả về JSON đúng khuôn: {"blocks":[...]}`,
    },
    {
      role: "user",
      content: `CHỦ ĐỀ: ${lesson.topicName}
BÀI CẦN VIẾT: ${lesson.title}
CÁC BÀI KHÁC CÙNG CHỦ ĐỀ (đừng viết trùng): ${lesson.siblingTitles.length ? lesson.siblingTitles.join(" · ") : "(không có)"}

NGUYÊN LIỆU:

${contextBlock(c)}`,
    },
  ];
}

// ───────────────────────── 3. Câu hỏi kiểm tra ─────────────────────────

/**
 * Nguyên liệu là NỘI DUNG CÁC BÀI ĐÃ ĐĂNG của chủ đề, không phải tài liệu gốc: người học chỉ
 * được đọc bài đã đăng, nên hỏi ngoài phạm vi đó là đánh đố.
 */
export function kbQuizPrompt(topicName: string, lessons: { title: string; blocks: LessonBlock[] }[]): AiMessage[] {
  const body = lessons
    .map((l) => {
      const lines = l.blocks.map((b) => {
        switch (b.type) {
          case "heading":
            return `## ${b.text}`;
          case "paragraph":
            return b.text;
          case "bullets":
            return b.items.map((x) => `- ${x}`).join("\n");
          case "terms":
            return b.items.map((x) => `- ${x.term}: ${x.definition}`).join("\n");
        }
      });
      return `### BÀI: ${l.title}\n${lines.join("\n")}`;
    })
    .join("\n\n");

  return [
    {
      role: "system",
      content: `${ROLE}

Nhiệm vụ: ra ${QUIZ_AI_QUESTION_COUNT} câu hỏi trắc nghiệm kiểm tra xem người đọc đã nắm nội dung
chủ đề hay chưa.

QUY TẮC BẮT BUỘC:
- CHỈ hỏi những gì có trong NỘI DUNG BÀI HỌC bên dưới. Không hỏi kiến thức ngoài.
- Mỗi câu đúng ${QUIZ_OPTION_COUNT} phương án, chỉ MỘT phương án đúng.
- "correctIndex" là CHỈ SỐ BẮT ĐẦU TỪ 0 (0, 1, 2 hoặc 3) — không phải số thứ tự 1..4.
- Các phương án sai phải hợp lý, không được sai lộ liễu kiểu đùa.
- Hỏi vào thứ ĐÁNG NHỚ khi đi làm việc thật (quy định, con số, thuật ngữ riêng), không hỏi mẹo chữ.
- "explanation" nói ngắn gọn vì sao đáp án đó đúng, dẫn lại ý trong bài.
- Viết bằng tiếng Việt. Chỉ trả JSON, không bọc markdown.

Trả về JSON đúng khuôn:
{"questions":[{"prompt":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}`,
    },
    { role: "user", content: `CHỦ ĐỀ: ${topicName}\n\nNỘI DUNG BÀI HỌC:\n\n${body}` },
  ];
}
