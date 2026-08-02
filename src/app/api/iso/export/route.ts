import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { loadIsoRows } from "@/lib/iso-data";
import { ISO_DOCS } from "@/lib/iso-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 6266 — mirror api/kpi/export/route.ts. Bắt buộc cho tên file tiếng Việt. */
function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Xuất sổ đăng ký hồ sơ ISO ra .xlsx — 33 cột KHỚP THỨ TỰ sheet "HS ISO" của file kiểm ISO:
 * 6 cột metadata + 25 cột hồ sơ + 2 cột ghi chú.
 *
 * Ô hồ sơ ghi "v" (đã có) / "X" (thiếu) / "N/A" — đúng quy ước người dùng đang dùng tay ở sheet
 * "master project management", để kiểm toán đọc được ngay mà không phải học ký hiệu mới.
 *
 * Nhãn cột hardcode tiếng Việt: đây là CHỨNG TỪ theo biểu mẫu ISO thật, không phải chrome của UI
 * (ngoại lệ i18n đã thống nhất — HANDOVER §4.2).
 */
export async function GET(req: NextRequest) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new NextResponse("Unauthorized", { status: 401 });
  // Route handler = API công khai, phải tự kiểm quyền như server action.
  if (!(await hasPermission("iso.export"))) return new NextResponse("Forbidden", { status: 403 });

  const team = req.nextUrl.searchParams.get("team");
  const rows = await loadIsoRows(team ? { teamId: team } : {});

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("HS ISO");

  sheet.addRow([
    "STT",
    "Mã dự án",
    "Team",
    "Project Owner",
    "Link Hồ sơ",
    "Status",
    ...ISO_DOCS.map((d) => d.labelVi),
    "Ghi chú về dự án (Vì sao không có các hồ sơ, …)",
    "NOTE",
  ]);

  rows.forEach((r, i) => {
    const byCode = new Map(r.states.map((s) => [s.code, s]));
    // Gom mọi lý do "không áp dụng" vào đúng cột giải trình mà ISO đòi.
    const naNotes = r.states
      .filter((s) => s.status === "NA" && s.naReason)
      .map((s) => `${s.code}: ${s.naReason}`)
      .join(" · ");
    const extraNotes = r.states
      .filter((s) => s.note)
      .map((s) => `${s.code}: ${s.note}`)
      .join(" · ");

    sheet.addRow([
      i + 1,
      r.code,
      r.teamCode ?? "",
      r.ownerName ?? "",
      r.isoFolderUrl ?? "",
      r.statusLabelVi,
      ...ISO_DOCS.map((d) => {
        const s = byCode.get(d.code);
        if (!s) return "";
        return s.status === "PRESENT" ? "v" : s.status === "NA" ? "N/A" : "X";
      }),
      naNotes,
      extraNotes,
    ]);
  });

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  sheet.columns = [
    { width: 5 },
    { width: 16 },
    { width: 7 },
    { width: 22 },
    { width: 30 },
    { width: 16 },
    ...ISO_DOCS.map(() => ({ width: 14 })),
    { width: 40 },
    { width: 30 },
  ];

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(`HoSoISO_${new Date().getFullYear()}.xlsx`),
      "Cache-Control": "private, no-store",
    },
  });
}
