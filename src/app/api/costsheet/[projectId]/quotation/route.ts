import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { loadQuotationSource, buildQuotationModel, buildQuotationWorkbook } from "@/lib/costsheet-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 6266 — mirror api/kpi/export/route.ts */
function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Xuất báo giá CO/CE ra .xlsx — ?mode=client (gửi khách, ẩn toàn bộ CO) | internal (đủ CO + margin).
 * Số dựng từ MỘT nguồn buildQuotationModel; tổng phải khớp tuyệt đối bản trên màn hình.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new NextResponse("Unauthorized", { status: 401 });
  // Route handler = API công khai, phải tự kiểm quyền như server action. Ai xem được CO/CE trên
  // màn hình thì xuất file cùng nội dung không tăng rủi ro → dùng lại bidding.view.
  if (!(await hasPermission("bidding.view"))) return new NextResponse("Forbidden", { status: 403 });

  const { projectId } = await ctx.params;
  const mode = req.nextUrl.searchParams.get("mode") === "internal" ? "internal" : "client";

  const src = await loadQuotationSource(projectId);
  if (!src) return new NextResponse("Chưa có bảng CO/CE", { status: 409 });

  const buffer = await buildQuotationWorkbook(buildQuotationModel(src, mode));
  const filename = `${src.projectCode}_${mode === "client" ? "BaoGia" : "COCE-NoiBo"}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(filename),
    },
  });
}
