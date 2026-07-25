import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getMembership, isSuperAdmin } from "@/lib/chat";
import { readChatAttachment } from "@/lib/chat-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phục vụ avatar nhóm chat do admin upload — id = Conversation.id. Guard: phải là thành viên hội
 * thoại đó, hoặc super-admin. Nếu avatarKey là path tĩnh (bắt đầu "/") thì KHÔNG dùng route này
 * (client load thẳng — xem lib/utils.ts groupAvatarUrl()).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });

  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { avatarKey: true } });
  if (!conv?.avatarKey || conv.avatarKey.startsWith("/")) return new NextResponse(null, { status: 404 });

  const membership = await getMembership(conversationId, meId);
  if (!membership && !(await isSuperAdmin(meId))) return new NextResponse(null, { status: 403 });

  let buffer: Buffer;
  try {
    buffer = await readChatAttachment(conv.avatarKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const ext = conv.avatarKey.split(".").pop() ?? "";
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=300",
    },
  });
}
