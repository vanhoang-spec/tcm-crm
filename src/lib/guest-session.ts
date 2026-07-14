import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

/**
 * Phiên đăng nhập GUEST (PIC phía khách hàng) — hệ thống session THẬT duy nhất của app hiện nay.
 * Nội bộ TCM vẫn dùng stub getCurrentStaffId (chưa có auth). Guest vào bằng magic-link:
 *   Account tạo GuestInvite → sinh token thô, lưu HASH (sha256) trong DB → gửi link kèm token thô.
 *   Guest bấm link → verify token → set cookie phiên ký HMAC chứa inviteId.
 * Bảo mật: chỉ lưu hash token (không lưu token thô); cookie ký HMAC chống giả mạo inviteId;
 * mọi lần đọc phiên đều tra lại DB để chặn invite đã thu hồi/hết hạn.
 */

const GUEST_COOKIE = "tcm_guest";
// Dev fallback — production nên đặt GUEST_SESSION_SECRET trong biến môi trường.
const SECRET = process.env.GUEST_SESSION_SECRET ?? "tcm-dev-guest-secret-change-in-prod";

/** Hash token magic-link để lưu/tra DB (khớp sha256 trong prisma/seed.ts). */
export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sign(inviteId: string): string {
  const sig = createHmac("sha256", SECRET).update(inviteId).digest("hex");
  return `${inviteId}.${sig}`;
}

function verify(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const inviteId = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(inviteId).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return inviteId;
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 ngày
};

/** Dựng cookie phiên guest để set trực tiếp trên NextResponse (dùng trong Route Handler). */
export function buildGuestCookie(inviteId: string) {
  return { name: GUEST_COOKIE, value: sign(inviteId), options: COOKIE_OPTS };
}

export async function setGuestSession(inviteId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(GUEST_COOKIE, sign(inviteId), COOKIE_OPTS);
}

export async function clearGuestSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_COOKIE);
}

export type GuestSession = {
  inviteId: string;
  projectId: string;
  guestName: string;
};

/**
 * Đọc + xác thực phiên guest hiện tại. Tra lại DB mỗi lần: invite phải còn hiệu lực
 * (chưa revoke, chưa hết hạn). Trả null nếu không có phiên hợp lệ.
 */
export async function getGuestSession(): Promise<GuestSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(GUEST_COOKIE)?.value;
  if (!raw) return null;
  const inviteId = verify(raw);
  if (!inviteId) return null;

  const invite = await prisma.guestInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.revokedAt) return null;
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return null;

  return { inviteId: invite.id, projectId: invite.projectId, guestName: invite.name };
}
