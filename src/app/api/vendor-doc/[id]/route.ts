import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getMyPermissions } from "@/lib/permissions";
import { readRfqFile, extForRfqMime } from "@/lib/rfq-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Tải tài liệu NCC (báo giá / PO / hợp đồng) — PUR-1. Mirror /api/project-file/[id]: route handler
 * TỰ kiểm quyền (401 chưa đăng nhập, 403 thiếu purchasing.view/vendor.manage) và KIỂM belongs-to
 * (tài liệu phải thuộc một NCC có thật) — KHÔNG copy lỗ của /api/client-kb/[id] (HANDOVER 10.13).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });
  const perms = await getMyPermissions();
  if (!perms.has("purchasing.view") && !perms.has("purchasing.vendor.manage") && !perms.has("settings.vendors.manage")) {
    return new NextResponse(null, { status: 403 });
  }

  const doc = await prisma.vendorDocument.findUnique({
    where: { id },
    select: { fileKey: true, mime: true, title: true, vendor: { select: { id: true } } },
  });
  if (!doc || !doc.vendor) return new NextResponse(null, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readRfqFile(doc.fileKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const safeTitle = doc.title.replace(/["\\]/g, "_");
  const filename = /\.[a-z0-9]{2,5}$/i.test(safeTitle) ? safeTitle : `${safeTitle}.${extForRfqMime(doc.mime)}`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
