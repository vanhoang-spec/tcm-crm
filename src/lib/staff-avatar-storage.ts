import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { extForMime } from "./chat-storage";

/**
 * Lưu ảnh đại diện nhân sự trên LOCAL DISK, NGOÀI `public/` — mirror chat-storage.ts (storage
 * riêng theo domain, DB chỉ lưu storageKey). Chỉ đọc lại qua route có auth (`/api/staff-avatar/[id]`).
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage", "staff-avatars");
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3MB — đủ cho ảnh đại diện, không resize/decode thật

/** Lưu buffer vào storage/staff-avatars/YYYY/MM/<random>.<ext>, trả về storageKey tương đối. */
export async function saveStaffAvatar(buffer: Buffer, mime: string): Promise<string> {
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
export async function readStaffAvatar(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("INVALID_AVATAR_KEY");
  return readFile(path.join(STORAGE_ROOT, key));
}

/** Xóa avatar cũ khi user đổi ảnh mới — best-effort, không throw nếu đã mất/không hợp lệ. */
export async function deleteStaffAvatar(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  try {
    await unlink(path.join(STORAGE_ROOT, key));
  } catch {
    /* file có thể đã không còn — bỏ qua */
  }
}
