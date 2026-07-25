import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { readKbFile } from "@/lib/kb-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Header HTTP chỉ nhận ByteString (0-255) — tên file tiếng Việt có dấu sẽ ném TypeError nếu nhét
 * thẳng vào Content-Disposition. RFC 6266: `filename` = bản ASCII-safe (fallback), `filename*` =
 * UTF-8 percent-encode (client hiện đại dùng, giữ đúng dấu khi tải về).
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Tải file đính kèm của 1 tài liệu Cơ sở tri thức. Chỉ áp dụng cho tài liệu dạng file (không phải link). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });
  if (!(await hasPermission("kb.view"))) return new NextResponse(null, { status: 403 });

  const doc = await prisma.kbDocument.findUnique({
    where: { id },
    select: { fileKey: true, fileMime: true, fileName: true, title: true },
  });
  if (!doc?.fileKey) return new NextResponse(null, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readKbFile(doc.fileKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const filename = (doc.fileName ?? `${doc.title}`).replace(/["\\]/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.fileMime ?? "application/octet-stream",
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "private, no-store",
    },
  });
}
