import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
// Trần cỡ + allowlist MIME ở file thuần (mkt.ts) để ô chọn tệp phía client dùng chung được mà
// không kéo fs/promises vào bundle trình duyệt. Re-export để chỗ import cũ không phải đổi.
import {
  MKT_IMAGE_MIME_TYPES,
  MAX_MKT_IMAGE_BYTES,
  MKT_INSIGHT_MIME_TYPES,
  MAX_MKT_INSIGHT_BYTES,
} from "@/lib/mkt";

export { MKT_IMAGE_MIME_TYPES, MAX_MKT_IMAGE_BYTES, MKT_INSIGHT_MIME_TYPES, MAX_MKT_INSIGHT_BYTES };

/**
 * Lưu trữ ẢNH BÀI ĐĂNG và FILE EXPORT INSIGHTS của module MKT post trên LOCAL DISK, NGOÀI `public/`.
 *
 * Ảnh đọc lại qua route có auth `/api/mkt-image/[id]`; file insights KHÔNG có route tải về (chỉ AI
 * đọc server-side). Cùng khuôn client-kb-storage.ts / chat-storage.ts; đổi sang S3 sau chỉ cần sửa
 * 3 hàm dưới.
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage", "mkt-uploads");
// key dạng "YYYY/MM/<32 hex>.<ext>" — validate chặt để chống path traversal.
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
  "application/pdf": "pdf",
};

export function extForMktMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

/** Lưu buffer vào storage/mkt-uploads/YYYY/MM/<random>.<ext>, trả storageKey tương đối. */
export async function saveMktFile(buffer: Buffer, mime: string): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(STORAGE_ROOT, yyyy, mm);
  await mkdir(dir, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.${extForMktMime(mime)}`;
  await writeFile(path.join(dir, filename), buffer);
  return `${yyyy}/${mm}/${filename}`;
}

/** Đọc lại buffer theo storageKey. Throw nếu key sai định dạng (chống traversal). */
export async function readMktFile(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("INVALID_MKT_FILE_KEY");
  return readFile(path.join(STORAGE_ROOT, key));
}

/** Xoá file khi xoá ảnh/báo cáo — best-effort, không throw nếu file đã mất. */
export async function deleteMktFile(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  try {
    await unlink(path.join(STORAGE_ROOT, key));
  } catch {
    /* file có thể đã không còn — bỏ qua */
  }
}
