import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/**
 * Lưu trữ file đính kèm chat (hình/video/voice) trên LOCAL DISK, NGOÀI `public/` — không
 * bao giờ vào DB, không bao giờ serve tĩnh. Chỉ đọc lại qua route có auth
 * (`/api/chat/attachments/[id]`, kiểm tra membership trước khi trả byte).
 * DB chỉ lưu `storageKey` (không phải path tuyệt đối) — đổi sang S3/MinIO sau này chỉ cần
 * đổi 2 hàm này, không đụng call-site.
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage", "chat-uploads");
// key dạng "YYYY/MM/<32 hex>.<ext>" — validate chặt để chống path traversal.
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const VOICE_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a"];
// Tài liệu văn phòng thông dụng — gửi file chung qua nút "+" (không phải hình/video/voice riêng).
export const FILE_MIME_TYPES = [
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
  "application/json",
];

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10MB — hình/video/file (đúng yêu cầu ban đầu)
export const MAX_VOICE_BYTES = 20 * 1024 * 1024; // dư dả cho 5 phút thoại nén
export const MAX_VOICE_SECONDS = 300; // 5 phút

/**
 * Số file tối đa đính kèm trong MỘT lần gửi (yêu cầu chủ dự án 24/08/2026).
 * Mỗi file vẫn là MỘT tin nhắn riêng — mô hình dữ liệu là 1 tin = 1 file, không đổi.
 */
export const MAX_CHAT_FILES = 10;

/**
 * ⚠ TRẦN TỔNG DUNG LƯỢNG cho một lần gửi nhiều file — KHÔNG phải phòng xa.
 *
 * `next.config.ts` khai `serverActions.bodySizeLimit: "30mb"`. 10 file × 10MB = 100MB thì Next ném
 * **413 TRƯỚC KHI code của mình chạy**, nên người dùng thấy TRANG VỠ chứ không thấy thông báo lỗi
 * tử tế (đúng bẫy đã ghi ở HANDOVER 10.13). Vì vậy phải chặn TỔNG, không chỉ từng file.
 *
 * Để 25MB chứ không phải đúng 30MB vì trần của Next tính trên RAW body (gồm đệm multipart) — chừa
 * dư để guard trong code là chỗ báo lỗi, không phải Next.
 * ⚠ Nâng số này thì phải nâng `bodySizeLimit` TRƯỚC.
 */
export const MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
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
  "application/json": "json",
  "image/svg+xml": "svg", // hệ thống tự sinh (ảnh chào mừng thành viên mới) — không nằm trong allowlist upload người dùng
};

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

/** Lưu buffer vào storage/chat-uploads/YYYY/MM/<random>.<ext>, trả về storageKey tương đối. */
export async function saveChatAttachment(buffer: Buffer, mime: string): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(STORAGE_ROOT, yyyy, mm);
  await mkdir(dir, { recursive: true });
  const ext = extForMime(mime);
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return `${yyyy}/${mm}/${filename}`;
}

/** Đọc lại buffer theo storageKey. Throw nếu key không đúng định dạng mong đợi (chống traversal). */
export async function readChatAttachment(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("INVALID_ATTACHMENT_KEY");
  return readFile(path.join(STORAGE_ROOT, key));
}

/** Xóa file khi "Delete for everyone" 1 tin có đính kèm — best-effort, không throw nếu đã mất/không hợp lệ. */
export async function deleteChatAttachment(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  try {
    await unlink(path.join(STORAGE_ROOT, key));
  } catch {
    /* file có thể đã không còn — bỏ qua */
  }
}
