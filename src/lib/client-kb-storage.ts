import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
// Trần cỡ + allowlist MIME ở file thuần (client-kb.ts) để ô chọn tệp phía client dùng chung được
// mà không kéo fs/promises vào bundle trình duyệt. Re-export để các chỗ import cũ không phải đổi.
import { CLIENT_KB_MIME_TYPES, MAX_CLIENT_KB_FILE_BYTES } from "@/lib/client-kb";

export { CLIENT_KB_MIME_TYPES, MAX_CLIENT_KB_FILE_BYTES };

/**
 * Lưu trữ TÀI LIỆU NGUỒN của Knowledge Base theo khách (brand guideline, brief khách gửi) trên
 * LOCAL DISK, NGOÀI `public/` — chỉ đọc lại qua route có auth `/api/client-kb/[id]`.
 *
 * Cùng khuôn với src/lib/kb-storage.ts (KB chung) và chat-storage.ts; tách root riêng để tài liệu
 * của khách không lẫn với thư viện chung. Đổi sang S3/MinIO sau chỉ cần sửa 3 hàm trong file này.
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage", "client-kb-uploads");
// key dạng "YYYY/MM/<32 hex>.<ext>" — validate chặt để chống path traversal.
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;


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

export function extForClientKbMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

/** Lưu buffer vào storage/client-kb-uploads/YYYY/MM/<random>.<ext>, trả storageKey tương đối. */
export async function saveClientKbFile(buffer: Buffer, mime: string): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(STORAGE_ROOT, yyyy, mm);
  await mkdir(dir, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.${extForClientKbMime(mime)}`;
  await writeFile(path.join(dir, filename), buffer);
  return `${yyyy}/${mm}/${filename}`;
}

/** Đọc lại buffer theo storageKey. Throw nếu key sai định dạng (chống traversal). */
export async function readClientKbFile(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("INVALID_CLIENT_KB_FILE_KEY");
  return readFile(path.join(STORAGE_ROOT, key));
}

/** Xoá file khi xoá tài liệu — best-effort, không throw nếu file đã mất. */
export async function deleteClientKbFile(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  try {
    await unlink(path.join(STORAGE_ROOT, key));
  } catch {
    /* file có thể đã không còn — bỏ qua */
  }
}
