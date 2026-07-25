import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/**
 * Lưu trữ file đính kèm dự án dùng cho trợ lý AI (mời thầu / tài liệu khách gửi) trên LOCAL DISK,
 * NGOÀI `public/` — không vào DB, không serve tĩnh. DB (`ProjectFile.fileKey`) chỉ lưu storageKey
 * tương đối — cùng pattern src/lib/kb-storage.ts / src/lib/chat-storage.ts (đổi sang S3/MinIO sau
 * chỉ cần sửa 2 hàm này, không đụng call-site).
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage", "ai-uploads");
// key dạng "YYYY/MM/<32 hex>.<ext>" — validate chặt để chống path traversal.
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

// Tài liệu văn phòng + hình ảnh (bài khách gửi có thể là scan/ảnh chụp) — không cho zip (không đọc
// được nội dung để AI phân tích, dễ chứa mã độc, không phù hợp mục đích "đọc file" của tính năng này).
export const AI_FILE_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const MAX_AI_FILE_BYTES = 15 * 1024 * 1024; // 15MB — đủ cho file mời thầu/proposal PDF nặng

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extForAiFileMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

/** Lưu buffer vào storage/ai-uploads/YYYY/MM/<random>.<ext>, trả về storageKey tương đối. */
export async function saveAiFile(buffer: Buffer, mime: string): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(STORAGE_ROOT, yyyy, mm);
  await mkdir(dir, { recursive: true });
  const ext = extForAiFileMime(mime);
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return `${yyyy}/${mm}/${filename}`;
}

/** Đọc lại buffer theo storageKey. Throw nếu key không đúng định dạng mong đợi (chống traversal). */
export async function readAiFile(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("INVALID_AI_FILE_KEY");
  return readFile(path.join(STORAGE_ROOT, key));
}

/** Xóa file — best-effort, không throw nếu đã mất/không hợp lệ. */
export async function deleteAiFile(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  try {
    await unlink(path.join(STORAGE_ROOT, key));
  } catch {
    /* file có thể đã không còn — bỏ qua */
  }
}
