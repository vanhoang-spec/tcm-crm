import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { getMembership, isSuperAdmin } from "@/lib/chat";
import { readChatAttachment } from "@/lib/chat-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phục vụ binary đính kèm chat (hình/video/voice) — id = Message.id (mỗi message tối đa 1 file).
 * Guard: phải là thành viên hội thoại chứa message đó, hoặc super-admin (xem read-only).
 * KHÔNG bao giờ lộ storageKey/path FS ra ngoài — chỉ id message trên URL.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: messageId } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });
  if (!(await hasPermission("chat.use"))) return new NextResponse(null, { status: 403 });

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, attachmentKey: true, attachmentMime: true, attachmentName: true },
  });
  if (!message?.attachmentKey) return new NextResponse(null, { status: 404 });

  const membership = await getMembership(message.conversationId, meId);
  if (!membership && !(await isSuperAdmin(meId))) return new NextResponse(null, { status: 403 });

  let buffer: Buffer;
  try {
    buffer = await readChatAttachment(message.attachmentKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": message.attachmentMime ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${(message.attachmentName ?? "file").replace(/["\\]/g, "_")}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
