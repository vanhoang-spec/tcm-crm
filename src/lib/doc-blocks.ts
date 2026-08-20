/**
 * KHUÔN TÀI LIỆU CÓ CẤU TRÚC — một nguồn dữ liệu, ba đích: màn hình · trang in (PDF) · file Word.
 *
 * Vì sao có file này: 6 công cụ ở `/ai` đang trả về TEXT THUẦN và màn hình render bằng
 * `whitespace-pre-wrap` (xem chú thích `ai-shared.tsx`) — không có cấu trúc thì không có gì để
 * format, nên không xuất được Word/PDF ra hồn. Bắt AI trả JSON có cấu trúc rồi mới dựng ra ba đích
 * là cách đã chạy thật trong repo: module Kho kiến thức H3 (`LessonBlock`) làm đúng như vậy.
 *
 * Khác `LessonBlock` ở chỗ nào và vì sao không dùng lại: bài học KB chỉ cần 4 loại khối; báo cáo
 * BGĐ / rà soát CO/CE / văn bản hành chính cần thêm **bảng** và **danh sách đánh số** (một báo cáo
 * tiền mà không có bảng thì phải viết số vào câu văn), và cần `heading` có CẤP để đánh mục lục.
 * Ngược lại KB không cần hai thứ đó. Hai khuôn tách nhau, không bên nào phải gánh nhu cầu bên kia.
 *
 * File THUẦN: không prisma, không server-only, không fs — client component import được.
 */

import { z } from "zod";

export type DocBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "terms"; items: { term: string; definition: string }[] };

export type DocBlockType = DocBlock["type"];

/** Trần chống AI trả về tài liệu dài vô hạn (và chống dán nhầm cả cuốn sách vào ô nhập). */
export const MAX_DOC_BLOCKS = 120;
export const MAX_ITEMS_PER_BLOCK = 40;
export const MAX_TABLE_COLS = 8;
export const MAX_TABLE_ROWS = 60;

const headingBlock = z.object({
  type: z.literal("heading"),
  // ⚠ AI hay trả level 0 hoặc 4+ theo thói quen markdown. KẸP về [1,3] bằng transform chứ KHÔNG
  // dùng .min(1).max(3): min/max làm cả KHỐI hỏng validate rồi rơi về mặc định, tức một tiêu đề
  // cấp 4 giết luôn nội dung của nó. Kẹp thì giữ được chữ, chỉ hạ cấp tiêu đề (bài học `correctIndex`
  // bị ép vào [0,3] ở KB-H3). Transform cũng trả đúng kiểu 1|2|3 cho renderer và bộ dựng Word.
  level: z
    .coerce.number()
    .int()
    .catch(2)
    .transform((n) => (n < 1 ? 1 : n > 3 ? 3 : n) as 1 | 2 | 3),
  text: z.string().trim().min(1).max(300),
});
const paragraphBlock = z.object({ type: z.literal("paragraph"), text: z.string().trim().min(1).max(6000) });
const bulletsBlock = z.object({
  type: z.literal("bullets"),
  items: z.array(z.string().trim().min(1).max(1000)).min(1).max(MAX_ITEMS_PER_BLOCK),
});
const numberedBlock = z.object({
  type: z.literal("numbered"),
  items: z.array(z.string().trim().min(1).max(1000)).min(1).max(MAX_ITEMS_PER_BLOCK),
});
const tableBlock = z.object({
  type: z.literal("table"),
  headers: z.array(z.string().trim().max(120)).min(1).max(MAX_TABLE_COLS),
  rows: z.array(z.array(z.string().trim().max(500)).min(1).max(MAX_TABLE_COLS)).min(1).max(MAX_TABLE_ROWS),
});
const termsBlock = z.object({
  type: z.literal("terms"),
  items: z
    .array(z.object({ term: z.string().trim().min(1).max(200), definition: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(MAX_ITEMS_PER_BLOCK),
});

export const docBlockSchema = z.discriminatedUnion("type", [headingBlock, paragraphBlock, bulletsBlock, numberedBlock, tableBlock, termsBlock]);

/** Khuôn AI phải trả về. `title` để đặt tên file khi xuất Word/PDF. */
export const docSchema = z.object({
  title: z.string().trim().min(1).max(300),
  blocks: z.array(docBlockSchema).min(1).max(MAX_DOC_BLOCKS),
});

export type AiDoc = z.infer<typeof docSchema>;

/**
 * Dọn trước khi validate: AI hay trả về khối rỗng (mảng items rỗng, bảng 0 dòng, chuỗi toàn khoảng
 * trắng). Zod `min(1)` sẽ đánh hỏng CẢ tài liệu chỉ vì một khối thừa ở cuối — đúng bẫy đã trả giá ở
 * trình soạn bài KB (`pruneBlocks`). Ở đây cắt khối rỗng TRƯỚC, để một khối hỏng không giết cả bài.
 */
export function pruneDocBlocks(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as { title?: unknown; blocks?: unknown };
  if (!Array.isArray(obj.blocks)) return raw;

  const clean = (obj.blocks as unknown[]).filter((b) => {
    if (!b || typeof b !== "object") return false;
    const x = b as Record<string, unknown>;
    const nonEmpty = (v: unknown) => typeof v === "string" && v.trim() !== "";
    switch (x.type) {
      case "heading":
      case "paragraph":
        return nonEmpty(x.text);
      case "bullets":
      case "numbered":
        return Array.isArray(x.items) && (x.items as unknown[]).some(nonEmpty);
      case "table":
        return Array.isArray(x.headers) && (x.headers as unknown[]).length > 0 && Array.isArray(x.rows) && (x.rows as unknown[]).length > 0;
      case "terms":
        return (
          Array.isArray(x.items) &&
          (x.items as unknown[]).some((it) => it && typeof it === "object" && nonEmpty((it as Record<string, unknown>).term))
        );
      default:
        return false;
    }
  });

  // bỏ nốt phần tử rỗng BÊN TRONG khối còn lại
  const blocks = clean.map((b) => {
    const x = { ...(b as Record<string, unknown>) };
    if (x.type === "bullets" || x.type === "numbered") {
      x.items = (x.items as unknown[]).filter((v) => typeof v === "string" && v.trim() !== "");
    }
    if (x.type === "terms") {
      x.items = (x.items as unknown[]).filter(
        (it) => it && typeof it === "object" && typeof (it as Record<string, unknown>).term === "string" && String((it as Record<string, unknown>).term).trim() !== "",
      );
    }
    if (x.type === "table") {
      // ⚠ Ép MỌI dòng về đúng số cột của header: AI hay trả dòng thiếu/thừa ô, mà Word dựng bảng
      // lệch số ô là file mở ra hỏng bảng (không phải chỉ xấu).
      const cols = (x.headers as unknown[]).length;
      x.rows = (x.rows as unknown[])
        .filter((r) => Array.isArray(r))
        .map((r) => {
          const row = (r as unknown[]).map((c) => (c == null ? "" : String(c)));
          return row.length >= cols ? row.slice(0, cols) : [...row, ...Array<string>(cols - row.length).fill("")];
        });
    }
    return x;
  });

  return { ...obj, blocks };
}

/** Đọc output AI: dọn khối rỗng → Zod. Trả null nếu vẫn không hợp lệ (caller quyết cách báo lỗi). */
export function parseAiDoc(raw: unknown): AiDoc | null {
  const r = docSchema.safeParse(pruneDocBlocks(raw));
  return r.success ? r.data : null;
}

/**
 * Đổ blocks ra text thuần — dùng cho nút "Sao chép" và cho chỗ nào chỉ cần chuỗi (vd dán sang
 * Canva/Zalo). Giữ thứ tự và thụt lề đơn giản, KHÔNG dùng cú pháp markdown vì repo không có bộ
 * render markdown nào để đọc ngược lại (chú thích ở `ai-shared.tsx`).
 */
export function docToPlainText(doc: AiDoc): string {
  const out: string[] = [doc.title, ""];
  for (const b of doc.blocks) {
    switch (b.type) {
      case "heading":
        out.push("", b.text.toUpperCase(), "");
        break;
      case "paragraph":
        out.push(b.text, "");
        break;
      case "bullets":
        out.push(...b.items.map((i) => `• ${i}`), "");
        break;
      case "numbered":
        out.push(...b.items.map((i, n) => `${n + 1}. ${i}`), "");
        break;
      case "terms":
        out.push(...b.items.map((i) => `${i.term}: ${i.definition}`), "");
        break;
      case "table": {
        out.push(b.headers.join("\t"));
        out.push(...b.rows.map((r) => r.join("\t")));
        out.push("");
        break;
      }
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Tên file an toàn cho Word/PDF: bỏ dấu, bỏ ký tự Windows cấm, cắt ngắn. */
export function docFileName(title: string, ext: string): string {
  const base =
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "tai-lieu";
  return `${base}.${ext}`;
}
