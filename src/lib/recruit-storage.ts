import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
// Trần cỡ + allowlist MIME ở file thuần (recruit.ts) để ô chọn tệp phía client dùng chung được mà
// không kéo fs/promises vào bundle trình duyệt. Re-export để chỗ import cũ không phải đổi.
import { CV_MIME_TYPES, MAX_CV_BYTES } from "@/lib/recruit";

export { CV_MIME_TYPES, MAX_CV_BYTES };

/**
 * Lưu FILE CV của ứng viên trên LOCAL DISK, NGOÀI `public/`.
 *
 * CV là dữ liệu cá nhân của người ngoài công ty — để trong `public/` là ai có link cũng tải được,
 * không cần đăng nhập. Đường đọc DUY NHẤT là route có auth `/api/recruit-cv/[id]`, và route đó
 * kiểm cả "file này thuộc ứng viên nào" (mirror `/api/project-file/[id]`).
 *
 * Cùng khuôn mkt-storage.ts / client-kb-storage.ts; đổi sang S3 sau chỉ cần sửa 3 hàm dưới.
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage", "recruit-cv");
// key dạng "YYYY/MM/<32 hex>.<ext>" — validate chặt để chống path traversal.
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/plain": "txt",
};

export function extForCvMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

/** Lưu buffer vào storage/recruit-cv/YYYY/MM/<random>.<ext>, trả storageKey tương đối. */
export async function saveCvFile(buffer: Buffer, mime: string): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(STORAGE_ROOT, yyyy, mm);
  await mkdir(dir, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.${extForCvMime(mime)}`;
  await writeFile(path.join(dir, filename), buffer);
  return `${yyyy}/${mm}/${filename}`;
}

/** Đọc lại buffer theo storageKey. Throw nếu key sai định dạng (chống traversal). */
export async function readCvFile(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("INVALID_CV_FILE_KEY");
  return readFile(path.join(STORAGE_ROOT, key));
}

/** Xoá file CV — best-effort, không throw nếu file đã mất. */
export async function deleteCvFile(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  try {
    await unlink(path.join(STORAGE_ROOT, key));
  } catch {
    /* file có thể đã không còn — bỏ qua */
  }
}
