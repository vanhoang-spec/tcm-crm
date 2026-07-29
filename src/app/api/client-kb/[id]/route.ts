import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { readClientKbFile } from "@/lib/client-kb-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Header HTTP chỉ nhận ByteString — tên file tiếng Việt có dấu sẽ ném TypeError nếu nhét thẳng
 * vào Content-Disposition. RFC 6266: `filename` bản ASCII-safe (fallback) + `filename*` UTF-8
 * percent-encode (client hiện đại dùng, giữ đúng dấu khi tải về). Copy nguyên từ /api/kb/[id].
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Tải tài liệu nguồn của kho kiến thức khách hàng (brand guideline, brief). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });
  if (!(await hasPermission("clients.kb.view"))) return new NextResponse(null, { status: 403 });

  const doc = await prisma.clientKbSource.findUnique({
    where: { id },
    select: { fileKey: true, fileMime: true, fileName: true },
  });
  if (!doc) return new NextResponse(null, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readClientKbFile(doc.fileKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.fileMime,
      "Content-Disposition": contentDisposition(doc.fileName.replace(/["\\]/g, "_")),
      "Cache-Control": "private, no-store",
      // `fileMime` là chuỗi do TRÌNH DUYỆT khai lúc upload, không phải kết quả đọc magic byte.
      // nosniff cấm trình duyệt tự đoán lại kiểu — không có nó, ngày nào đó allowlist nhận thêm
      // svg/html (logo brand guideline hay là SVG) là file trong storage chạy được trên origin app.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
