import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/**
 * Lưu trữ file "Cơ sở tri thức" (KB) trên LOCAL DISK, NGOÀI `public/` — không vào DB, không
 * serve tĩnh. Chỉ đọc lại qua route có auth (`/api/kb/[id]`). DB chỉ lưu `storageKey` tương đối
 * — cùng pattern với src/lib/chat-storage.ts (đổi sang S3/MinIO sau chỉ cần sửa 2 hàm này).
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage", "kb-uploads");
// key dạng "YYYY/MM/<32 hex>.<ext>" — validate chặt để chống path traversal.
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

// Tài liệu văn phòng + hình ảnh thông dụng cho hồ sơ nội bộ (ISO, HS&E, credentials...).
export const KB_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const MAX_KB_FILE_BYTES = 25 * 1024 * 1024; // 25MB — hồ sơ ISO/HS&E dạng scan có thể nặng hơn ảnh chat

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "text/plain": "txt",
  "text/csv": "csv",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extForKbMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

/** Lưu buffer vào storage/kb-uploads/YYYY/MM/<random>.<ext>, trả về storageKey tương đối. */
export async function saveKbFile(buffer: Buffer, mime: string): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(STORAGE_ROOT, yyyy, mm);
  await mkdir(dir, { recursive: true });
  const ext = extForKbMime(mime);
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return `${yyyy}/${mm}/${filename}`;
}

/** Đọc lại buffer theo storageKey. Throw nếu key không đúng định dạng mong đợi (chống traversal). */
export async function readKbFile(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("INVALID_KB_FILE_KEY");
  return readFile(path.join(STORAGE_ROOT, key));
}

/** Xóa file khi xóa tài liệu KB — best-effort, không throw nếu đã mất/không hợp lệ. */
export async function deleteKbFile(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  try {
    await unlink(path.join(STORAGE_ROOT, key));
  } catch {
    /* file có thể đã không còn — bỏ qua */
  }
}
