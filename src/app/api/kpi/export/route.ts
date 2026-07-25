import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { getKpiReport } from "@/lib/kpi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 6266 — mirror api/timekeeping/export/route.ts */
function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Xuất bảng phân bổ lương 75/25 theo kỳ — sheet tổng hợp + 1 sheet/pool. Kỳ CLOSED xuất từ snapshot. */
export async function GET(req: NextRequest) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new NextResponse("Unauthorized", { status: 401 });
  // Route handler = API công khai, phải tự kiểm quyền như server action (không dựa vào trang gọi nó).
  if (!(await hasPermission("kpi.view"))) return new NextResponse("Forbidden", { status: 403 });

  const period = req.nextUrl.searchParams.get("period") ?? "";
  const data = await getKpiReport(period);
  if (!data) return new NextResponse("Bad period", { status: 400 });
  const { report, statusMap } = data;

  const workbook = new ExcelJS.Workbook();
  const bold = { bold: true } as const;

  // ── Sheet tổng hợp ──
  const summary = workbook.addWorksheet(`Tong hop ${period}`);
  summary.addRow(["Pool", "Trạng thái", "Quỹ base (VND)", "Margin bình quân (%)", "Hệ số", "Quỹ chia (VND)", "Số NV"]);
  summary.getRow(1).font = bold;
  for (const pool of report.pools) {
    summary.addRow([
      pool.label,
      statusMap[pool.poolKey]?.status === "CLOSED" ? "Đã chốt" : "Đang mở",
      pool.base,
      pool.marginWeighted != null ? Math.round(pool.marginWeighted * 10) / 10 : "—",
      pool.teamFactor,
      pool.poolAmount,
      pool.rows.length,
    ]);
  }
  summary.columns = [{ width: 24 }, { width: 12 }, { width: 16 }, { width: 20 }, { width: 8 }, { width: 16 }, { width: 8 }];
  summary.views = [{ state: "frozen", ySplit: 1 }];

  // ── 1 sheet / pool ──
  for (const pool of report.pools) {
    const name = pool.poolKey.replace(/[:*?/\\[\]]/g, "-").slice(0, 28);
    const sheet = workbook.addWorksheet(name);
    sheet.addRow([`${pool.label} — kỳ ${period}`, "", "", "", "", "", "", "", ""]);
    sheet.getRow(1).font = bold;
    sheet.addRow([
      "Nhân sự", "Vị trí", "Lương full (VND)", "Phần cứng (VND)", "Phần performance (VND)",
      "Điểm tổng", "Chuyên cần", "Tỷ trọng (%)", "Nhận performance (VND)", "Tổng nhận (VND)", "Ghi chú",
    ]);
    sheet.getRow(2).font = bold;
    for (const r of pool.rows) {
      sheet.addRow([
        r.fullName,
        r.title ?? "—",
        r.salary,
        r.fixedPart,
        r.perfBase,
        Math.round(r.weightedScore * 100) / 100,
        Math.round(r.attendance * 1000) / 1000,
        Math.round(r.share * 1000) / 10,
        r.payout,
        r.fixedPart + r.payout,
        r.excluded === "NO_SALARY" ? "Thiếu lương vị trí" : r.excluded === "MISSING_SCORES" ? "Chưa chấm điểm" : "",
      ]);
    }
    const totalRow = sheet.addRow([
      "TỔNG", "", "",
      pool.rows.reduce((s, r) => s + r.fixedPart, 0),
      pool.base,
      "", "", "",
      pool.rows.reduce((s, r) => s + r.payout, 0),
      pool.rows.reduce((s, r) => s + r.fixedPart + r.payout, 0),
      "",
    ]);
    totalRow.font = bold;
    sheet.columns = [
      { width: 22 }, { width: 18 }, { width: 15 }, { width: 15 }, { width: 18 },
      { width: 10 }, { width: 10 }, { width: 12 }, { width: 18 }, { width: 15 }, { width: 18 },
    ];
    sheet.views = [{ state: "frozen", ySplit: 2 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(`KPI_${period}.xlsx`),
      "Cache-Control": "private, no-store",
    },
  });
}
