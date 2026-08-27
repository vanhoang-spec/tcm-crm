import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/**
 * Lưu trữ file đính kèm của module Tasks trên LOCAL DISK, NGOÀI `public/` — cùng khuôn 8 storage
 * helper hiện có (ai-file-storage / chat-storage / recruit-storage...). DB (`TaskFile.fileKey`)
 * chỉ giữ storageKey tương đối; đổi sang S3/MinIO sau chỉ sửa file này, không đụng call-site.
 *
 * ⚠ Hằng MIME/size cho Ô CHỌN TỆP nằm ở `lib/tasks.ts` (file THUẦN) — file này import
 * `fs/promises` nên kéo vào client component là build hỏng mà tsc/eslint không bắt (bài học
 * KB-H2 / MKT-1). Ở đây chỉ giữ danh sách MIME server-side.
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage", "task-files");
// key dạng "YYYY/MM/<32 hex>.<ext>" — validate chặt để chống path traversal.
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

// Tài liệu văn phòng + ảnh — đủ cho trao đổi công việc; không zip/exe.
export const TASK_FILE_MIME_TYPES = [
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

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Lưu buffer vào storage/task-files/YYYY/MM/<random>.<ext>, trả về storageKey tương đối. */
export async function saveTaskFile(buffer: Buffer, mime: string): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(STORAGE_ROOT, yyyy, mm);
  await mkdir(dir, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.${EXT_BY_MIME[mime] ?? "bin"}`;
  await writeFile(path.join(dir, filename), buffer);
  return `${yyyy}/${mm}/${filename}`;
}

/** Đọc lại buffer theo storageKey. Throw nếu key sai định dạng (chống traversal). */
export async function readTaskFile(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("INVALID_TASK_FILE_KEY");
  return readFile(path.join(STORAGE_ROOT, key));
}

/** Xóa file — best-effort, không throw nếu đã mất/không hợp lệ. */
export async function deleteTaskFile(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  try {
    await unlink(path.join(STORAGE_ROOT, key));
  } catch {
    /* file có thể đã không còn — bỏ qua */
  }
}
