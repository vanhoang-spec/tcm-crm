import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { loadOverheadReport, loadSpends } from "@/lib/overhead-data";
import { MONTHS } from "@/lib/overhead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 6266 — mirror api/kpi/export/route.ts */
function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Xuất chi phí văn phòng: sheet ngân sách theo tháng (khuôn sheet `Total 2026` của file gốc) +
 * sheet từng khoản chi.
 *
 * Nhãn cột hardcode tiếng Việt — ngoại lệ chứng từ đã thống nhất (HANDOVER 4.2): file này là biểu
 * mẫu kế toán nộp ra ngoài, không phải màn hình app.
 */
export async function GET(req: NextRequest) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new NextResponse("Unauthorized", { status: 401 });
  // Route handler = API công khai, phải tự kiểm quyền như server action.
  if (!(await hasPermission("overhead.view"))) return new NextResponse("Forbidden", { status: 403 });

  const year = Number(req.nextUrl.searchParams.get("year") ?? "");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return new NextResponse("Bad year", { status: 400 });

  const data = await loadOverheadReport(year);
  if (!data) return new NextResponse("No budget", { status: 404 });
  const spends = await loadSpends(year);

  const workbook = new ExcelJS.Workbook();
  const bold = { bold: true } as const;

  // ── Sheet 1: ngân sách × tháng ──
  const s1 = workbook.addWorksheet(`Total ${year}`);
  s1.addRow([
    "PID CODE", "TÊN CHI PHÍ", "LOẠI CHÍNH", "Loại đề nghị",
    ...MONTHS.map((m) => `T${m}`),
    "TỔNG CHI TRƯỚC THUẾ", "TỔNG ĐÃ SỬ DỤNG", "ĐÃ LÊN PHIẾU", "CÒN LẠI",
  ]);
  s1.getRow(1).font = bold;
  for (const i of data.report.items) {
    s1.addRow([
      i.pidCode,
      i.name,
      i.categoryLabel,
      i.requestKind,
      ...MONTHS.map((m) => i.months[m - 1]?.plan ?? 0),
      i.planYear,
      i.paidYtd,
      i.scheduledYtd,
      i.remaining,
    ]);
  }
  const tRow = s1.addRow([
    "TỔNG", "", "", "",
    ...MONTHS.map((m) => data.report.items.reduce((a, i) => a + (i.months[m - 1]?.plan ?? 0), 0)),
    data.report.totals.planYear,
    data.report.totals.paidYtd,
    data.report.totals.scheduledYtd,
    data.report.totals.remaining,
  ]);
  tRow.font = bold;
  s1.columns = [{ width: 12 }, { width: 40 }, { width: 18 }, { width: 12 }, ...MONTHS.map(() => ({ width: 14 })), { width: 18 }, { width: 18 }, { width: 16 }, { width: 16 }];
  s1.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];

  // ── Sheet 2: từng khoản chi ──
  const s2 = workbook.addWorksheet("Chi tiet");
  s2.addRow([
    "Tháng", "PID CODE", "Khoản mục", "Nội dung chi", "Ngày dự kiến",
    "Trước thuế", "VAT", "TNCN", "TNDN", "Tổng tính vào ngân sách",
    "Trạng thái", "Ngày thanh toán", "Người xác nhận", "Lý do vượt", "Lý do đảo", "Lý do huỷ",
  ]);
  s2.getRow(1).font = bold;
  for (const r of spends) {
    s2.addRow([
      r.month,
      r.pidCode,
      r.itemName,
      r.name,
      r.expectedDate ?? "",
      r.amountNet,
      r.vat,
      r.tncn,
      r.tndn,
      r.amountTotal,
      r.status === "PAID" ? "Đã chi" : r.status === "CANCELED" ? "Đã huỷ" : "Đã lên phiếu",
      r.paidDate ?? "",
      r.paidByName ?? "",
      r.overBudgetNote ?? "",
      r.reverseNote ?? "",
      r.cancelNote ?? "",
    ]);
  }
  s2.columns = [
    { width: 8 }, { width: 12 }, { width: 30 }, { width: 34 }, { width: 14 },
    { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 20 },
    { width: 14 }, { width: 14 }, { width: 18 }, { width: 30 }, { width: 30 }, { width: 30 },
  ];
  s2.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(`Chi_phi_van_phong_${year}.xlsx`),
      "Cache-Control": "private, no-store",
    },
  });
}
