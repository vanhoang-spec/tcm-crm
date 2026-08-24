import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { getMembership, isSuperAdmin } from "@/lib/chat";
import { readChatAttachment } from "@/lib/chat-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dựng header Content-Disposition theo RFC 6266 — ĐÚNG khuôn 18 route xuất file khác của repo.
 *
 * ⚠ BẮT BUỘC, KHÔNG PHẢI CHO ĐẸP: header HTTP chỉ nhận Latin-1 (ByteString). Nhét thẳng tên file
 * tiếng Việt vào là Next ném `Cannot convert argument to a ByteString` và người dùng thấy **file
 * không mở được** — nhưng CHỈ với một số tên, nên trông như lỗi ngẫu nhiên: `À Â Ê Ô Ý` nằm trong
 * Latin-1 nên lọt, còn `Đ(U+0110) Ư(U+01AF) Ậ(U+1EAC) Ỗ(U+1ED6)` thì vỡ. Đúng triệu chứng đã gặp
 * trên production 24/08/2026: `CV-HÀ GIA HÂN.pdf` mở được, `CV - ĐỖ THANH HOÀNG.pdf` thì không.
 *
 * Cách chuẩn: phần `filename` chỉ ASCII (trình duyệt cũ đọc), phần `filename*` mang tên thật đã
 * percent-encode UTF-8 (trình duyệt hiện đại ưu tiên dùng, nên người dùng vẫn tải về đúng tên có dấu).
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Phục vụ binary đính kèm chat (hình/video/voice/file) — id = Message.id (mỗi message tối đa 1 file).
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
      // ⚠ `|| ` chứ không phải `??`: mime rỗng ("") là giá trị CÓ THẬT khi trình duyệt không nhận ra
      // loại file, mà `??` chỉ bắt null/undefined ⇒ Content-Type rỗng, trình duyệt đoán bừa.
      "Content-Type": message.attachmentMime || "application/octet-stream",
      "Content-Disposition": contentDisposition(message.attachmentName || "file"),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
