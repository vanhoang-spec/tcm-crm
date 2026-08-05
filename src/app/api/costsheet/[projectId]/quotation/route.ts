import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { loadQuotationSource, buildQuotationModel, buildQuotationWorkbook } from "@/lib/costsheet-export";
import { resolveQuoteLayout, resolveQuoteTemplate } from "@/lib/quote-templates";

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
  const params = req.nextUrl.searchParams;
  const mode = params.get("mode") === "internal" ? "internal" : "client";
  const layout = resolveQuoteLayout(params.get("layout"));

  const src = await loadQuotationSource(projectId);
  // Ba thân lỗi của route này ("Unauthorized" / "Forbidden" / dòng dưới) là văn bản KỸ THUẬT theo
  // kiểu HTTP status, cố ý không đi qua next-intl. Chỗ này trước đây lạc lõng vì viết tiếng Việt.
  if (!src) return new NextResponse("No cost sheet", { status: 409 });

  // Mẫu: ?template= để xem thử; mặc định lấy mẫu đã gán cho KHÁCH của dự án này.
  const clientTemplate = await prisma.project.findUnique({
    where: { id: projectId },
    select: { client: { select: { quoteTemplateCode: true } } },
  });
  const template = resolveQuoteTemplate(params.get("template") ?? clientTemplate?.client.quoteTemplateCode ?? null);

  const model = buildQuotationModel(src, mode);
  // Chặn xuất khi bảng ở chế độ CE theo dòng mà còn mục LỚN chưa áp phí quản lý: bản xuất khi đó
  // thiếu đúng phần phí của mục đó và khách nhận báo giá THIẾU TIỀN mà không ai thấy.
  if (model.missingFeeSections.length > 0) {
    return new NextResponse(`Chưa áp phí quản lý cho: ${model.missingFeeSections.join(" · ")}`, { status: 409 });
  }

  const buffer = await buildQuotationWorkbook(model, { layout, template });
  const filename = `${src.projectCode}_${mode === "client" ? "BaoGia" : "COCE-NoiBo"}${layout === "multi" ? "_NhieuSheet" : ""}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(filename),
    },
  });
}
