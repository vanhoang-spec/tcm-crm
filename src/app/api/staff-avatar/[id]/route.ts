import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { readStaffAvatar } from "@/lib/staff-avatar-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phục vụ ảnh đại diện nhân sự — id = Staff.id. Guard: chỉ cần đang "act as" hợp lệ (không có khái
 * niệm membership cho avatar cá nhân — ai cũng cần thấy ảnh người khác để "biết được ai" trong app).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: staffId } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });

  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { avatarKey: true } });
  if (!staff?.avatarKey) return new NextResponse(null, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readStaffAvatar(staff.avatarKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const ext = staff.avatarKey.split(".").pop() ?? "";
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=300",
    },
  });
}
