import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * MKT-2b — MÃ HOÁ ACCESS TOKEN của kênh mạng xã hội (aes-256-gcm).
 *
 * Token Facebook Page / LinkedIn organization cho phép ĐĂNG CÔNG KHAI dưới danh nghĩa công ty. Lộ
 * token là người ngoài đăng được lên trang chính thức, nên không lưu thẳng vào DB.
 *
 * ⚠ KHÔNG CÓ KHOÁ MẶC ĐỊNH. Khác `AUTH_SESSION_SECRET` (có fallback dev vì chỉ ký cookie phiên nội
 * bộ), khoá này thiếu là toàn bộ tính năng đăng qua API TỰ TẮT và app quay về luồng copy đăng tay —
 * cùng khuôn `isAiConfigured` / `isPushConfigured`. Đặt khoá mặc định nghĩa là token trong DB coi
 * như không mã hoá, vì khoá đó nằm ngay trong mã nguồn công khai.
 *
 * ⚠ ĐỔI `MKT_TOKEN_SECRET` = mọi token đã lưu thành RÁC (giải mã hỏng). Phải nối lại kênh; app báo
 * lỗi giải mã chứ không đăng bậy.
 */

const RAW = process.env.MKT_TOKEN_SECRET ?? "";

/** Khoá 32 byte suy từ secret — secret dài ngắn thế nào cũng ra khoá đúng cỡ cho aes-256. */
function key(): Buffer {
  return createHash("sha256").update(RAW, "utf8").digest();
}

/** Có khai khoá chưa. Secret quá ngắn coi như CHƯA khai — 8 ký tự không bảo vệ được gì. */
export function isChannelCryptoConfigured(): boolean {
  return RAW.trim().length >= 16;
}

/** Mã hoá token → chuỗi "iv.tag.cipher" (base64url). Ném lỗi nếu chưa khai khoá. */
export function encryptToken(plain: string): string {
  if (!isChannelCryptoConfigured()) throw new Error("MKT_TOKEN_SECRET chưa khai");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

/**
 * Giải mã. Trả null khi chưa khai khoá / chuỗi hỏng / khoá đã đổi — người gọi PHẢI xử lý null bằng
 * cách báo "cần nối lại kênh", TUYỆT ĐỐI không đăng với token rỗng.
 */
export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored || !isChannelCryptoConfigured()) return null;
  const parts = stored.split(".");
  if (parts.length !== 3) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(parts[0], "base64url"));
    d.setAuthTag(Buffer.from(parts[1], "base64url"));
    return Buffer.concat([d.update(Buffer.from(parts[2], "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** 4 ký tự cuối để người dùng đối chiếu đã dán đúng token chưa — KHÔNG bao giờ hiện cả token. */
export function tokenHint(plain: string): string {
  return plain.length <= 4 ? "••••" : "••••" + plain.slice(-4);
}

/**
 * Bỏ token khỏi câu lỗi trước khi lưu/ghi log. Nền tảng hay dội lại nguyên URL có access_token=...
 * trong message — lưu thẳng là token nằm trong DB dưới dạng chữ thường, ngay cột `lastError`.
 */
export function scrubSecrets(message: string): string {
  return message
    .replace(/access_token=[^&\s"']+/gi, "access_token=***")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***")
    .slice(0, 500);
}
