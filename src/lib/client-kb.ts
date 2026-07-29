// Knowledge Base theo khách hàng — phần THUẦN, KHÔNG gọi Prisma.
//
// Nội dung bài học lưu dạng BLOCK có cấu trúc chứ không phải markdown/HTML. Lý do: repo cố ý
// không có markdown renderer (chống XSS — xem chú thích ở ai-shared.tsx), và block có cấu trúc
// cho phép AI ở đợt H3 sinh thẳng JSON đúng khuôn thay vì sinh văn bản rồi phải parse.
// Render bằng JSX text node nên React tự escape; không nơi nào dùng dangerouslySetInnerHTML.

import { z } from "zod";

export type LessonBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "terms"; items: { term: string; definition: string }[] };

export const LESSON_BLOCK_TYPES = ["heading", "paragraph", "bullets", "terms"] as const;
export type LessonBlockType = (typeof LESSON_BLOCK_TYPES)[number];

/** Trần chống bài học phình vô hạn (và chống prompt AI ở H3 trả về hàng trăm block). */
export const MAX_BLOCKS_PER_LESSON = 40;
/** Trần con của khối gạch đầu dòng / thuật ngữ — trình soạn thảo chặn thêm ở đúng số này. */
export const MAX_ITEMS_PER_BLOCK = 30;

/**
 * Trần cho các ô văn bản tự do NGOÀI blocks. Blocks đã bị Zod chặn từng trường rất chặt; sáu ô còn
 * lại chỉ kiểm `length < 2` nên cận trên thực tế là trần body của Server Action (30MB — xem
 * next.config.ts). Dán nhầm cả một brief đã convert vào "thông tin chung" là mọi lượt mở trang KB
 * của khách đó (và cả 4 pháp nhân nếu neo theo nhóm) phải tải vài MB HTML.
 */
export const MAX_GENERAL_NOTE = 20_000;
export const MAX_KB_NAME = 200;
export const MAX_KB_NOTE = 500;
export const MAX_KB_FILE_NAME = 200;

const headingBlock = z.object({ type: z.literal("heading"), text: z.string().trim().min(1).max(200) });
const paragraphBlock = z.object({ type: z.literal("paragraph"), text: z.string().trim().min(1).max(4000) });
const bulletsBlock = z.object({
  type: z.literal("bullets"),
  items: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
});
const termsBlock = z.object({
  type: z.literal("terms"),
  items: z
    .array(z.object({ term: z.string().trim().min(1).max(120), definition: z.string().trim().min(1).max(1000) }))
    .min(1)
    .max(30),
});

/** Dùng ở MỌI đường ghi blocks: PIC sửa tay (H2) và AI sinh (H3). */
export const lessonBlocksSchema = z
  .array(z.discriminatedUnion("type", [headingBlock, paragraphBlock, bulletsBlock, termsBlock]))
  .max(MAX_BLOCKS_PER_LESSON);

/**
 * Đọc blocks từ cột `blocksJson`. Dữ liệu hỏng/không đúng khuôn thì trả mảng rỗng thay vì ném —
 * một bài học lỗi không được làm sập cả trang KB.
 *
 * ⚠ `corrupt` PHẢI được dùng ở trang SỬA. Không có cờ này thì bài hỏng hiện ra y hệt bài rỗng,
 * PIC mở trình soạn thảo thấy trắng rồi bấm Lưu là GHI ĐÈ nội dung cũ bằng `[]` — mất trắng, im
 * lặng, không có bản sao nào. Ca có thật khi schema bị siết ở đợt sau hoặc AI (H3) ghi khuôn lạ.
 */
export function readLessonBlocks(json: string): { blocks: LessonBlock[]; corrupt: boolean } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { blocks: [], corrupt: true };
  }
  const parsed = lessonBlocksSchema.safeParse(raw);
  if (parsed.success) return { blocks: parsed.data, corrupt: false };
  // Mảng rỗng đúng khuôn đã lọt nhánh trên, nên tới đây mà không phải mảng rỗng nghĩa là hỏng thật.
  return { blocks: [], corrupt: true };
}

/** Đường ĐỌC (trang xem bài) — chỉ cần nội dung, bài hỏng hiện như bài chưa có nội dung. */
export function parseLessonBlocks(json: string): LessonBlock[] {
  return readLessonBlocks(json).blocks;
}

/** Đối tượng mà KB neo vào: nhóm nếu khách có nhóm, ngược lại là chính khách. */
export type KbAnchor = { kind: "GROUP"; id: string } | { kind: "CLIENT"; id: string };

/**
 * ⚠ Gọi ở MỌI request đọc/ghi KB, không cache vào cột nào. Khách được gán vào nhóm là lập tức
 * nhìn thấy kho của nhóm; gỡ khỏi nhóm là quay về kho riêng cũ (vẫn còn nguyên trong DB).
 */
export function resolveKbAnchor(client: { id: string; groupId: string | null }): KbAnchor {
  return client.groupId ? { kind: "GROUP", id: client.groupId } : { kind: "CLIENT", id: client.id };
}

/**
 * Trần cỡ tệp + allowlist MIME nằm ở file THUẦN này chứ không ở `client-kb-storage.ts`: ô chọn
 * tệp là client component, mà storage import `fs/promises` — kéo nó vào bundle trình duyệt là
 * build hỏng ngay ("Module not found: Can't resolve 'fs/promises'"). Storage import ngược lại.
 */
export const MAX_CLIENT_KB_FILE_BYTES = 25 * 1024 * 1024; // 25MB — brand guideline dạng scan khá nặng

export const CLIENT_KB_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const KB_SOURCE_KINDS = ["BRAND_GUIDELINE", "BRIEF", "OTHER"] as const;
export type KbSourceKind = (typeof KB_SOURCE_KINDS)[number];

export function isKbSourceKind(v: string): v is KbSourceKind {
  return (KB_SOURCE_KINDS as readonly string[]).includes(v);
}

/** Đếm nhanh để hiện trên danh sách topic — bài đã đăng / tổng số bài. */
export function countPublished(lessons: { status: string }[]): { published: number; total: number } {
  return { published: lessons.filter((l) => l.status === "PUBLISHED").length, total: lessons.length };
}
