import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { buildAcceptanceModel } from "@/lib/costsheet-acceptance";
import { parseSnapshot } from "@/lib/costsheet-diff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 6266 — mirror api/kpi/export/route.ts */
function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Xuất BẢNG NGHIỆM THU GỬI KHÁCH: hợp đồng ↔ nghiệm thu ↔ chênh lệch, gom theo CHẶNG.
 *
 * Thay bảng 78 cột team Account đang ghép tay. Số lấy từ hai snapshot bất biến, không tính lại từ
 * bảng sống — bản gửi khách phải là bản đã chốt, không đổi theo lần sửa CO/CE sau đó.
 *
 * Nhãn cột hardcode tiếng Việt — ngoại lệ chứng từ đã thống nhất (HANDOVER 4.2).
 */
export async function GET(req: NextRequest) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new NextResponse("Unauthorized", { status: 401 });
  // Route handler = API công khai, phải tự kiểm quyền như server action.
  if (!(await hasPermission("projects.view"))) return new NextResponse("Forbidden", { status: 403 });

  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  if (!projectId) return new NextResponse("Missing projectId", { status: 400 });

  const sheet = await prisma.costSheet.findFirst({
    where: { projectId, version: "CTRACT" },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { code: true, name: true, client: { select: { name: true } } } },
      revisions: { orderBy: { revNo: "desc" } },
    },
  });
  if (!sheet) return new NextResponse("No cost sheet", { status: 404 });

  // Cho chọn tay 2 bản; mặc định lấy bản MỚI NHẤT của mỗi loại. Bản chọn tay vẫn phải thuộc đúng
  // bảng này — nhận id từ query mà không kiểm là đọc được snapshot của dự án khác.
  const pick = (param: string, kind: string) => {
    const id = req.nextUrl.searchParams.get(param);
    if (id) return sheet.revisions.find((r) => r.id === id) ?? null;
    return sheet.revisions.find((r) => r.kind === kind) ?? null;
  };
  const contractRev = pick("contractRev", "CONTRACT");
  const acceptanceRev = pick("acceptanceRev", "ACCEPTANCE");
  if (!contractRev || !acceptanceRev) {
    return new NextResponse("Chưa đánh dấu đủ bản HỢP ĐỒNG và bản NGHIỆM THU", { status: 409 });
  }

  const model = buildAcceptanceModel({
    projectCode: sheet.project.code,
    projectName: sheet.project.name,
    clientName: sheet.project.client.name,
    vatPct: sheet.vatPct,
    agencyFeePct: sheet.agencyFeePct,
    contract: parseSnapshot(contractRev.snapshotJson),
    acceptance: parseSnapshot(acceptanceRev.snapshotJson),
  });

  const wb = new ExcelJS.Workbook();
  const bold = { bold: true } as const;
  const money = "#,##0";

  // ── Sheet 1: tổng hợp theo chặng ──
  const s1 = wb.addWorksheet("Tong hop");
  s1.addRow(["BẢNG NGHIỆM THU"]).font = { bold: true, size: 14 };
  s1.addRow(["Dự án:", `${model.projectCode} — ${model.projectName}`]);
  s1.addRow(["Khách hàng:", model.clientName]);
  s1.addRow(["Bản hợp đồng:", `Phiên bản ${contractRev.revNo}`, "Bản nghiệm thu:", `Phiên bản ${acceptanceRev.revNo}`]);
  s1.addRow([]);
  s1.addRow(["Chặng", "Hợp đồng", "Nghiệm thu", "Chênh lệch"]).font = bold;
  for (const leg of model.legs) s1.addRow([leg.label, leg.contractTotal, leg.acceptanceTotal, leg.delta]);
  s1.addRow([]);

  const footerRows: [string, number, number, number][] = [
    ["TỔNG CỘNG", model.contract.serviceSubtotal, model.acceptance.serviceSubtotal, model.delta.serviceSubtotal],
    [`Phí dịch vụ Agency (${model.agencyFeePct}%)`, model.contract.feeAmt, model.acceptance.feeAmt, model.delta.feeAmt],
    ["TỔNG CỘNG (CHƯA VAT)", model.contract.grandTotal - model.contract.vatAmt, model.acceptance.grandTotal - model.acceptance.vatAmt, model.delta.grandTotal - model.delta.vatAmt],
    [`VAT (${model.vatPct}%)`, model.contract.vatAmt, model.acceptance.vatAmt, model.delta.vatAmt],
    ["TỔNG CỘNG", model.contract.grandTotal, model.acceptance.grandTotal, model.delta.grandTotal],
  ];
  if (model.contract.chiHo > 0 || model.acceptance.chiHo > 0) {
    footerRows.push(["Chi hộ", model.contract.chiHo, model.acceptance.chiHo, model.delta.chiHo]);
    footerRows.push(["TỔNG THANH TOÁN", model.contract.billable, model.acceptance.billable, model.delta.billable]);
  }
  for (const r of footerRows) s1.addRow(r).font = bold;
  s1.columns = [{ width: 34 }, { width: 20 }, { width: 20 }, { width: 18 }];
  for (const c of ["B", "C", "D"]) s1.getColumn(c).numFmt = money;

  // ── Sheet 2: chi tiết từng dòng ──
  const s2 = wb.addWorksheet("Chi tiet");
  s2.addRow([
    "Chặng", "Mã hạng mục", "Hạng mục", "Nội dung",
    "SL hợp đồng", "ĐVT", "Thành tiền hợp đồng",
    "SL nghiệm thu", "ĐVT", "Thành tiền nghiệm thu",
    "Chênh lệch", "Ghi chú",
  ]).font = bold;
  const noteOf = (st: string) =>
    st === "added" ? "Phát sinh thêm" : st === "removed" ? "Không thực hiện" : st === "changed" ? "Có điều chỉnh" : "";
  for (const leg of model.legs) {
    for (const l of leg.lines) {
      s2.addRow([
        leg.label,
        l.sectionCode,
        l.sectionName,
        l.itemName + (l.isProxy ? " (chi hộ)" : ""),
        l.contract?.quantity ?? "",
        l.contract?.unit ?? "",
        l.contract?.total ?? "",
        l.acceptance?.quantity ?? "",
        l.acceptance?.unit ?? "",
        l.acceptance?.total ?? "",
        l.delta,
        noteOf(l.status),
      ]);
    }
    const t = s2.addRow([`Cộng ${leg.label}`, "", "", "", "", "", leg.contractTotal, "", "", leg.acceptanceTotal, leg.delta, ""]);
    t.font = bold;
  }
  s2.columns = [
    { width: 22 }, { width: 14 }, { width: 26 }, { width: 46 },
    { width: 12 }, { width: 10 }, { width: 20 },
    { width: 12 }, { width: 10 }, { width: 20 },
    { width: 18 }, { width: 18 },
  ];
  for (const c of ["G", "J", "K"]) s2.getColumn(c).numFmt = money;
  s2.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(`Nghiem_thu_${model.projectCode}.xlsx`),
      "Cache-Control": "private, no-store",
    },
  });
}

