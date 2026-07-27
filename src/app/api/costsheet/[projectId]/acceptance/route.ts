import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { loadAcceptanceSource, fillAcceptanceDocx } from "@/lib/costsheet-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 6266 — mirror api/kpi/export/route.ts */
function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Biên bản nghiệm thu (.docx, C6b) — CHỈ xuất được khi dự án đã "Chuyển sang Nghiệm thu"
 * (số lấy từ đúng sentToLiquidationRevision, không phải bảng sống). Mẫu hiện là BẢN NHÁP
 * (templates/nghiem-thu.docx) — thay bằng mẫu thật theo templates/NGHIEMTHU-TEMPLATE-MAPPING.md.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new NextResponse("Unauthorized", { status: 401 });
  // Cùng quyền với trang Nghiệm thu — dữ liệu trên file là tập con của dữ liệu trang đó.
  if (!(await hasPermission("projects.view"))) return new NextResponse("Forbidden", { status: 403 });

  const { projectId } = await ctx.params;
  const src = await loadAcceptanceSource(projectId);
  if (!src) return new NextResponse("Chưa chuyển CO/CE sang Nghiệm thu", { status: 409 });

  const buffer = await fillAcceptanceDocx(src);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": contentDisposition(`${src.projectCode}_BienBanNghiemThu_v${src.revNo}.docx`),
    },
  });
}
