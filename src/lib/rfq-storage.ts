import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
// Hằng MIME/size ở file THUẦN lib/rfq.ts để ô chọn tệp phía client dùng chung mà không kéo
// fs/promises vào bundle trình duyệt. Re-export cho chỗ import cũ không phải đổi.
import { RFQ_FILE_MIME_TYPES, MAX_RFQ_FILE_BYTES } from "@/lib/rfq";

export { RFQ_FILE_MIME_TYPES, MAX_RFQ_FILE_BYTES };

/**
 * Lưu FILE báo giá / hợp đồng NCC trên LOCAL DISK, NGOÀI `public/` (bucket storage/rfq-uploads).
 * Đây là dữ liệu thương mại của bên thứ ba — đường đọc DUY NHẤT là route có auth
 * `/api/vendor-doc/[id]` và `/api/rfq-file/[id]`, cả hai KIỂM belongs-to (mirror /api/project-file/[id]).
 * Cùng khuôn recruit-storage.ts; đổi sang S3 sau chỉ cần sửa 3 hàm dưới.
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage", "rfq-uploads");
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function extForRfqMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

export async function saveRfqFile(buffer: Buffer, mime: string): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(STORAGE_ROOT, yyyy, mm);
  await mkdir(dir, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.${extForRfqMime(mime)}`;
  await writeFile(path.join(dir, filename), buffer);
  return `${yyyy}/${mm}/${filename}`;
}

export async function readRfqFile(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("INVALID_RFQ_FILE_KEY");
  return readFile(path.join(STORAGE_ROOT, key));
}

export async function deleteRfqFile(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  try {
    await unlink(path.join(STORAGE_ROOT, key));
  } catch {
    /* file có thể đã không còn — bỏ qua */
  }
}
