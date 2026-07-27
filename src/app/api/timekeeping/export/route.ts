import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { getMonthlyTimesheet, monthRange, dateKey, addDays } from "@/lib/timekeeping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 6266 — mirror api/ctv/[id]/route.ts */
function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Mã nghỉ hiển thị trong ô ngày: P=phép, Ô=ốm, KL=không lương, V=vắng, K=khác. */
const LEAVE_CELL: Record<string, string> = { ANNUAL: "P", SICK: "Ô", UNPAID: "KL", ABSENT: "V" };

/** HR xuất chấm công tháng — form đầy đủ all staff, ô/ngày, tổng giờ + tách loại nghỉ. */
export async function GET(req: NextRequest) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await hasPermission("staff.view"))) return new NextResponse("Forbidden", { status: 403 });

  const ym = req.nextUrl.searchParams.get("month") ?? "";
  const range = monthRange(ym);
  const rows = await getMonthlyTimesheet(ym);
  if (!range || !rows) return new NextResponse("Bad month", { status: 400 });

  const daysInMonth: Date[] = [];
  for (let d = range.start; d.getTime() < range.end.getTime(); d = addDays(d, 1)) daysInMonth.push(d);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Cham cong ${ym}`);

  const fixedHead = ["Mã NV", "Họ tên", "Bộ phận", "Team"];
  const dayHead = daysInMonth.map((d) => String(d.getDate()));
  // Cột "Ghi chú" cuối bảng nay mang nhãn cho người TCM không trả lương — kế toán nhìn file Excel
  // là biết dòng nào chỉ để tham chiếu, không đưa vào bảng lương.
  const totalHead = ["Tổng giờ KH", "Tổng giờ thực", "Phép (ngày)", "Ốm (ngày)", "Không lương (ngày)", "Vắng (ngày)", "Khác (ngày)", "Ghi chú"];
  const header = [...fixedHead, ...dayHead, ...totalHead];
  sheet.addRow(header);

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  sheet.views = [{ state: "frozen", xSplit: fixedHead.length, ySplit: 1 }];
  sheet.getColumn(1).width = 10;
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 8;
  daysInMonth.forEach((_, i) => (sheet.getColumn(fixedHead.length + 1 + i).width = 5));
  totalHead.forEach((_, i) => (sheet.getColumn(fixedHead.length + daysInMonth.length + 1 + i).width = 14));

  // Chú thích quy ước: số = giờ công; P/Ô/KL/V/K = ca nghỉ theo loại
  for (const r of rows) {
    const dayCells = daysInMonth.map((d) => {
      const entries = r.days.get(dateKey(d)) ?? [];
      if (entries.length === 0) return "";
      const worked = entries.filter((e) => e.leaveCode === null).reduce((s, e) => s + e.hours, 0);
      const leaves = entries
        .filter((e) => e.leaveCode !== null)
        .map((e) => LEAVE_CELL[e.leaveCode!] ?? "K");
      const parts: string[] = [];
      if (worked > 0) parts.push(String(worked));
      parts.push(...leaves);
      return parts.join("+");
    });
    const otherDays = Object.entries(r.leaveDays)
      .filter(([code]) => !["ANNUAL", "SICK", "UNPAID", "ABSENT"].includes(code))
      .reduce((s, [, v]) => s + v, 0);
    sheet.addRow([
      r.code ?? "",
      r.fullName,
      r.departmentName ?? "",
      r.teamCode ?? "",
      ...dayCells,
      r.plannedHours,
      r.workedHours,
      r.leaveDays["ANNUAL"] ?? 0,
      r.leaveDays["SICK"] ?? 0,
      r.leaveDays["UNPAID"] ?? 0,
      r.leaveDays["ABSENT"] ?? 0,
      otherDays,
      r.payrollExempt ? "TCM không trả lương — ca chỉ để tham chiếu" : "",
    ]);
  }

  // Tô nền nhạt cột T7/CN cho dễ soát
  daysInMonth.forEach((d, i) => {
    if (d.getDay() === 0 || d.getDay() === 6) {
      const col = sheet.getColumn(fixedHead.length + 1 + i);
      col.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      });
    }
  });
  sheet.addRow([]);
  sheet.addRow(["Quy ước: số = giờ công thực; P = nghỉ phép năm; Ô = nghỉ ốm; KL = nghỉ không lương; V = vắng không phép; K = nghỉ khác. 1 ca = 0.5 ngày."]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(`Cham-cong-${ym}.xlsx`),
      "Cache-Control": "private, no-store",
    },
  });
}
