import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { readChatAttachment } from "@/lib/chat-storage";
import { zipCtvDocs } from "@/lib/ctv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Header HTTP chỉ nhận ByteString (0-255) — filename tiếng Việt có dấu (VD "Trần Văn A") sẽ ném
 * TypeError nếu nhét thẳng vào `Content-Disposition`. Theo RFC 6266: `filename` = bản ASCII-safe
 * (fallback cho client cũ), `filename*` = UTF-8 percent-encode (client hiện đại dùng cái này, giữ
 * đúng dấu tiếng Việt khi tải về).
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Tải file liên quan tới Operations/CTV. `id` mang ý nghĩa khác nhau tuỳ query:
 * - (mặc định) id = CtvContract.id → tải biên bản .docx đã điền của người đó.
 * - ?type=source, id = CtvBatch.id → tải lại file Excel gốc đã import.
 * - ?zip=1, id = CtvBatch.id → gói toàn bộ biên bản đã tạo trong batch thành 1 file .zip.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });
  if (!(await hasPermission("projects.ctv.manage"))) return new NextResponse(null, { status: 403 });

  const isSource = req.nextUrl.searchParams.get("type") === "source";
  const isZip = req.nextUrl.searchParams.get("zip") === "1";

  if (isSource) {
    const batch = await prisma.ctvBatch.findUnique({ where: { id }, select: { sourceFileKey: true, name: true } });
    if (!batch?.sourceFileKey) return new NextResponse(null, { status: 404 });
    let buffer: Buffer;
    try {
      buffer = await readChatAttachment(batch.sourceFileKey);
    } catch {
      return new NextResponse(null, { status: 404 });
    }
    const filename = `${(batch.name ?? "ctv-batch").replace(/["\\]/g, "_")}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(filename),
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (isZip) {
    const batch = await prisma.ctvBatch.findUnique({
      where: { id },
      select: { name: true, rows: { select: { fullName: true, generatedFileKey: true } } },
    });
    if (!batch) return new NextResponse(null, { status: 404 });
    const generated = batch.rows.filter((r) => r.generatedFileKey);
    if (generated.length === 0) return new NextResponse(null, { status: 404 });

    const files = await Promise.all(
      generated.map(async (r, i) => {
        const buffer = await readChatAttachment(r.generatedFileKey as string);
        const safeName = (r.fullName || `ctv-${i + 1}`).replace(/["\\/:*?<>|]/g, "_");
        return { name: `${safeName}.docx`, buffer };
      }),
    );
    const zip = zipCtvDocs(files);
    const filename = `${(batch.name ?? "ctv-batch").replace(/["\\]/g, "_")}.zip`;
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition(filename),
        "Cache-Control": "private, no-store",
      },
    });
  }

  const row = await prisma.ctvContract.findUnique({
    where: { id },
    select: { fullName: true, generatedFileKey: true },
  });
  if (!row?.generatedFileKey) return new NextResponse(null, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readChatAttachment(row.generatedFileKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const filename = `BBTT_${row.fullName.replace(/["\\/:*?<>|]/g, "_")}.docx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "private, no-store",
    },
  });
}
