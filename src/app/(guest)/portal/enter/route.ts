import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashGuestToken, buildGuestCookie } from "@/lib/guest-session";

/**
 * Magic-link entry: verify token thô → set cookie phiên guest → redirect /portal.
 * Cookie được gắn TRỰC TIẾP lên response redirect (cách chắc chắn trong Route Handler).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const invite = token
    ? await prisma.guestInvite.findUnique({ where: { tokenHash: hashGuestToken(token) } })
    : null;
  const valid = invite && !invite.revokedAt && (!invite.expiresAt || invite.expiresAt.getTime() >= Date.now());

  if (!valid || !invite) {
    return NextResponse.redirect(new URL("/portal?invalid=1", req.url));
  }

  await prisma.guestInvite.update({ where: { id: invite.id }, data: { lastAccessAt: new Date() } });
  const res = NextResponse.redirect(new URL("/portal", req.url));
  const c = buildGuestCookie(invite.id);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
