import { NextResponse } from "next/server";
import { buildDocx } from "@/lib/docx-builder";
import { docFileName } from "@/lib/doc-blocks";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { buildOfferDoc } from "@/lib/recruit-offer-server";

/**
 * Tải THƯ MỜI NHẬN VIỆC dạng .docx (TD-2d).
 *
 * ⚠ Gác bằng `recruit.decide` — văn bản này chứa LƯƠNG. Route API dùng `hasPermission()` rồi trả
 * 403 (không `requirePermission`, vì route không redirect được) — đúng khuôn 9 route API sẵn có.
 * ⚠ KHÔNG nhận nội dung từ client: dựng lại từ mẫu + số liệu trong DB.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await hasPermission("recruit.decide"))) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;
  const doc = await buildOfferDoc(id, staffId);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const buffer = buildDocx({ title: doc.title, blocks: doc.blocks });
  const name = docFileName(doc.title, "docx");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
