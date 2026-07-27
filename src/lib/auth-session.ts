import { cookies } from "next/headers";
import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Phiên đăng nhập THẬT của nhân sự nội bộ TCM.
 *
 * Thay thế cơ chế "act as" (trước đây không cookie = tự động thành CEO). Cookie chỉ chứa
 * `staffId.issuedAtMs` ký HMAC-SHA256 — không nhét quyền/role vào cookie, mọi thứ tra lại DB mỗi
 * request (cùng pattern guest-session.ts) để khoá/đổi role/nghỉ việc có hiệu lực ngay.
 *
 * Act-as vẫn còn nhưng đổi vai: chỉ ADMIN mới mạo danh được, dùng để hỗ trợ/kiểm thử —
 * xem `getCurrentStaffId()` trong current-staff.ts.
 */

const SESSION_COOKIE = "tcm_session";
const SECRET = process.env.AUTH_SESSION_SECRET ?? process.env.ACT_AS_SECRET ?? "tcm-dev-session-secret-change-in-prod";

/** Phiên sống 7 ngày; mỗi lần điều hướng KHÔNG gia hạn (đơn giản, đủ an toàn cho app nội bộ). */
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

/** Link đặt lại mật khẩu sống 60 phút. */
export const RESET_TOKEN_TTL_MIN = 60;

/** Sai mật khẩu quá số lần này thì khoá tạm — chống dò mật khẩu tự động. */
export const MAX_FAILED_LOGINS = 8;
export const LOCKOUT_MINUTES = 15;

/** Email công ty — tài khoản có hộp thư thật, dùng được "Quên mật khẩu". */
export const ALLOWED_EMAIL_DOMAIN = "tcmbtl.com";

/**
 * Tên miền NỘI BỘ cho tài khoản vận hành KHÔNG có hộp thư (thủ kho, bảo vệ — quyết định chủ dự án
 * 28/07/2026). `Staff.email` ở hệ này vốn là TÊN ĐĂNG NHẬP chứ không phải hộp thư, nên không cần
 * cột mới: người dùng gõ tên tài khoản ngắn ("thukho"), hệ thống tự ghép đuôi này phía sau.
 * `tcm.internal` giữ lại vì seed cũ đã sinh placeholder dạng đó cho nhân sự không có email.
 */
export const INTERNAL_LOGIN_DOMAINS = ["tcm.local", "tcm.internal"] as const;

/** Đuôi mặc định khi người dùng chỉ gõ tên tài khoản, không gõ "@…". */
export const DEFAULT_INTERNAL_DOMAIN = INTERNAL_LOGIN_DOMAINS[0];

/**
 * Chuẩn hoá thứ người dùng gõ ở ô đăng nhập thành `Staff.email`:
 * "thukho" → "thukho@tcm.local"; có sẵn "@" thì giữ nguyên (chỉ hạ chữ thường + bỏ khoảng trắng).
 * Nhờ vậy lookup vẫn là findUnique theo cột email — không đẻ đường tra cứu thứ hai.
 */
export function normalizeLoginId(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw || raw.includes("@")) return raw;
  return `${raw}@${DEFAULT_INTERNAL_DOMAIN}`;
}

/** Tài khoản được phép ĐĂNG NHẬP: email công ty hoặc tài khoản nội bộ. */
export function isAllowedLoginDomain(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`) || INTERNAL_LOGIN_DOMAINS.some((d) => e.endsWith(`@${d}`));
}

/**
 * Tài khoản có HỘP THƯ thật — chỉ nhóm này dùng được "Quên mật khẩu".
 * Tài khoản nội bộ không có hộp thư: admin cấp lại mật khẩu ở /settings/staff (xem HANDOVER).
 */
export function isMailableDomain(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SEC,
  // Bật `secure` khi chạy sau HTTPS. Mạng LAN nội bộ dùng http:// nên để tuỳ biến môi trường,
  // nếu bật cứng thì cookie sẽ bị trình duyệt bỏ qua và không ai đăng nhập được.
  secure: process.env.AUTH_COOKIE_SECURE === "true",
};

function sign(payload: string): string {
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("hex")}`;
}

function verify(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return payload;
}

export async function setAuthSession(staffId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sign(`${staffId}|${Date.now()}`), COOKIE_OPTS);
}

export async function clearAuthSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * staffId của người ĐANG ĐĂNG NHẬP thật (không phải người đang bị mạo danh).
 * Null = chưa đăng nhập / phiên hết hạn / tài khoản đã bị vô hiệu hoá.
 */
export async function getAuthenticatedStaffId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const payload = verify(raw);
  if (!payload) return null;

  const sep = payload.lastIndexOf("|");
  if (sep <= 0) return null;
  const staffId = payload.slice(0, sep);
  const issuedAt = Number(payload.slice(sep + 1));
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_SEC * 1000) return null; // hết hạn ở phía server, không tin maxAge của trình duyệt

  // Tra DB mỗi request: nhân sự bị vô hiệu hoá/xoá là mất quyền ngay lập tức.
  const staff = await prisma.staff.findFirst({ where: { id: staffId, isActive: true }, select: { id: true } });
  return staff?.id ?? null;
}

// ───────────────────────────── Token đặt lại mật khẩu ─────────────────────────────

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Sinh token đặt lại mật khẩu. Trả token THÔ (chỉ xuất hiện đúng một lần, để đưa vào link);
 * trong DB chỉ lưu hash — lộ DB cũng không dựng lại được link.
 * Vô hiệu hoá mọi token cũ chưa dùng của người này để tránh nhiều link cùng sống.
 */
export async function createPasswordResetToken(staffId: string, createdBy?: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { staffId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    }),
    prisma.passwordResetToken.create({
      data: {
        staffId,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MIN * 60_000),
        createdBy: createdBy ?? null,
      },
    }),
  ]);
  return token;
}

/** Đổi token thô thành bản ghi còn hiệu lực. Null nếu sai/hết hạn/đã dùng. */
export async function consumeResetTokenLookup(token: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    include: { staff: { select: { id: true, email: true, fullName: true, isActive: true } } },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;
  if (!record.staff.isActive) return null;
  return record;
}

/** Địa chỉ gốc dùng dựng link trong email. Đặt APP_BASE_URL trong .env khi chạy trên máy chủ. */
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
