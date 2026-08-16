import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { readRfqFile } from "@/lib/rfq-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  jpg: "image/jpeg",
  png: "image/png",
};

/** Tải file báo giá NCC đã upload trên một RfqVendor — id là rfqVendorId. Kiểm quyền + belongs-to (mirror /api/project-file/[id]). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });
  if (!(await hasPermission("purchasing.view"))) return new NextResponse(null, { status: 403 });
  const rv = await prisma.rfqVendor.findUnique({ where: { id }, select: { fileKey: true, fileName: true, rfq: { select: { id: true } } } });
  if (!rv || !rv.fileKey || !rv.rfq) return new NextResponse(null, { status: 404 });
  let buffer: Buffer;
  try {
    buffer = await readRfqFile(rv.fileKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const ext = rv.fileKey.split(".").pop() ?? "bin";
  const safeName = (rv.fileName ?? `quote.${ext}`).replace(/["\\]/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Content-Disposition": contentDisposition(safeName),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
