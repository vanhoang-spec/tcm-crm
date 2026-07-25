import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Băm & kiểm tra mật khẩu + chính sách mật khẩu mạnh.
 *
 * Dùng `scrypt` của Node (module `crypto` có sẵn) — KHÔNG thêm dependency mới (bcrypt/argon2 đều
 * cần native build, phiền khi deploy lên máy văn phòng Windows). scrypt là hàm băm mật khẩu chuẩn
 * (RFC 7914), chống brute-force bằng cả CPU lẫn bộ nhớ; tham số dưới đây theo khuyến nghị OWASP.
 *
 * Định dạng lưu trong DB: `scrypt$<N>$<r>$<p>$<salt hex>$<hash hex>` — nhúng cả tham số để sau này
 * nâng chi phí băm mà mật khẩu cũ vẫn kiểm tra được (xem `needsRehash`).
 */

// OWASP 2024 cho scrypt: N >= 2^17 khi r=8,p=1. 2^16 chọn cân bằng cho máy văn phòng (~100ms/lần).
const N = 65536;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;
// scrypt cần bộ nhớ ~ 128*N*r = 64MB; mặc định Node giới hạn 32MB nên phải nới.
const MAXMEM = 128 * N * R * 2;

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = scryptSync(plain.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM }).toString("hex");
  return `scrypt$${N}$${R}$${P}$${salt}$${hash}`;
}

/** So khớp mật khẩu — luôn dùng timingSafeEqual để không lộ thông tin qua thời gian phản hồi. */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expected = parts[5];
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || !salt || !expected) return false;
  let actual: Buffer;
  try {
    actual = scryptSync(plain.normalize("NFKC"), salt, expected.length / 2, { N: n, r, p, maxmem: 128 * n * r * 2 });
  } catch {
    return false; // tham số hỏng trong DB — coi như sai mật khẩu, không crash trang đăng nhập
  }
  const expectedBuf = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuf.length) return false;
  return timingSafeEqual(actual, expectedBuf);
}

/** true nếu hash cũ dùng tham số yếu hơn hiện tại → nên băm lại khi user đăng nhập thành công. */
export function needsRehash(stored: string | null | undefined): boolean {
  if (!stored) return true;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < N;
}

// ───────────────────────────── Chính sách mật khẩu ─────────────────────────────

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
/** Số ngày mật khẩu còn hiệu lực — yêu cầu đổi lại sau mỗi 12 tháng. */
export const PASSWORD_MAX_AGE_DAYS = 365;
/** Cảnh báo trước khi hết hạn (hiện banner nhắc, chưa ép đổi). */
export const PASSWORD_EXPIRY_WARN_DAYS = 14;

/**
 * Mã lỗi chính sách — UI dịch sang vi/en qua namespace `auth.pw.*`, KHÔNG hardcode chuỗi ở đây
 * (lib này chạy cả trong server action lẫn script seed, không có context i18n).
 */
export type PasswordIssue =
  | "TOO_SHORT"
  | "TOO_LONG"
  | "NEEDS_VARIETY"
  | "HAS_WHITESPACE_EDGE"
  | "CONTAINS_IDENTITY"
  | "TOO_COMMON"
  | "SEQUENTIAL"
  | "REPEATED";

/** Mật khẩu bị cấm — bản rút gọn của danh sách rò rỉ phổ biến + các biến thể đặc thù TCM. */
const BANNED = new Set([
  "password", "password1", "passw0rd", "123456", "12345678", "123456789", "1234567890",
  "qwerty", "qwertyuiop", "abc123", "111111", "000000", "iloveyou", "admin", "admin123",
  "welcome", "welcome1", "letmein", "monkey", "dragon", "sunshine", "princess", "football",
  "tcm", "tcm123", "tcm1234", "tcm12345", "tcm123456", "tcmbtl", "tcmbtl123", "matkhau",
  "vietnam", "hanoi", "saigon", "123123", "112233", "asdfgh", "zxcvbn",
]);

/** Có ≥5 ký tự liên tiếp tăng/giảm dần trong bảng mã (12345, edcba, abcde…). */
function hasSequentialRun(s: string): boolean {
  let up = 1;
  let down = 1;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    up = d === 1 ? up + 1 : 1;
    down = d === -1 ? down + 1 : 1;
    if (up >= 5 || down >= 5) return true;
  }
  return false;
}

/** Có ≥4 ký tự giống nhau liên tiếp (aaaa, 1111…). */
function hasRepeatedRun(s: string): boolean {
  let run = 1;
  for (let i = 1; i < s.length; i++) {
    run = s[i] === s[i - 1] ? run + 1 : 1;
    if (run >= 4) return true;
  }
  return false;
}

/**
 * Kiểm tra mật khẩu có đủ "khó đoán" không. Trả mảng rỗng = hợp lệ.
 * `identity` gồm email + họ tên để chặn kiểu đặt mật khẩu bằng chính tên mình.
 */
export function validatePasswordStrength(
  plain: string,
  identity?: { email?: string | null; fullName?: string | null },
): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  const pw = plain.normalize("NFKC");

  if (pw.length < PASSWORD_MIN_LENGTH) issues.push("TOO_SHORT");
  if (pw.length > PASSWORD_MAX_LENGTH) issues.push("TOO_LONG");
  if (pw !== pw.trim()) issues.push("HAS_WHITESPACE_EDGE");

  // Đủ 3/4 nhóm ký tự: thường, hoa, số, đặc biệt.
  const groups = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  if (groups < 3) issues.push("NEEDS_VARIETY");

  const lower = pw.toLowerCase();
  // Bỏ ký tự không phải chữ/số để bắt cả biến thể kiểu "P@ssw0rd!" → "pssw0rd"
  const alnum = lower.replace(/[^a-z0-9]/g, "");
  if (BANNED.has(lower) || BANNED.has(alnum) || [...BANNED].some((b) => b.length >= 6 && alnum.includes(b))) {
    issues.push("TOO_COMMON");
  }

  if (hasSequentialRun(lower)) issues.push("SEQUENTIAL");
  if (hasRepeatedRun(lower)) issues.push("REPEATED");

  // Không được chứa phần trước @ của email, hay bất kỳ từ ≥4 ký tự trong họ tên (bỏ dấu tiếng Việt).
  const needles: string[] = [];
  const localPart = identity?.email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4) needles.push(localPart);
  if (identity?.fullName) {
    for (const w of stripDiacritics(identity.fullName).toLowerCase().split(/\s+/)) {
      if (w.length >= 4) needles.push(w);
    }
  }
  if (needles.some((n) => lower.includes(n))) issues.push("CONTAINS_IDENTITY");

  return [...new Set(issues)];
}

/** Bỏ dấu tiếng Việt để so khớp tên trong mật khẩu ("Hoàng" khớp "hoang"). */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

// ───────────────────────────── Hết hạn 12 tháng ─────────────────────────────

export type PasswordAge = {
  /** Số ngày còn lại trước khi buộc đổi; âm nghĩa là đã quá hạn. */
  daysLeft: number;
  expired: boolean;
  /** Sắp hết hạn — hiện banner nhắc nhưng chưa chặn. */
  expiringSoon: boolean;
};

/** Tính tuổi mật khẩu. `changedAt` null (chưa từng đổi) → coi như đã hết hạn, buộc đổi ngay. */
export function checkPasswordAge(changedAt: Date | null | undefined, now: Date = new Date()): PasswordAge {
  if (!changedAt) return { daysLeft: 0, expired: true, expiringSoon: true };
  const ageDays = (now.getTime() - changedAt.getTime()) / 86_400_000;
  const daysLeft = Math.ceil(PASSWORD_MAX_AGE_DAYS - ageDays);
  return {
    daysLeft,
    expired: daysLeft <= 0,
    expiringSoon: daysLeft > 0 && daysLeft <= PASSWORD_EXPIRY_WARN_DAYS,
  };
}
