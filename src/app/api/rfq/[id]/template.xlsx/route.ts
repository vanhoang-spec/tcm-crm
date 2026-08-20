import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission } from "@/lib/permissions";
import { resolveRfqTemplate } from "@/lib/rfq-templates";
import { formatDate } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Xuất FILE EXCEL MẪU RFQ để PUR gửi NCC điền tay (Zalo/email) — cho NCC không dùng cổng link.
 * Khung giữ đúng thói quen file RFQ TCM đang gửi (xem `1- BG POSM thuê`): header dự án, bảng
 * STT/Hạng mục/Mô tả/ĐVT/SL + cột mở rộng theo mẫu + Đơn giá (trống) + Thành tiền + Ghi chú, khối
 * điều khoản chung dưới cùng. Cột ẩn `__line` mang id dòng RFQ để AI/parser đọc ngược chính xác
 * (tiền lệ cột `__key` của bộ xuất báo giá khách CE-3). Nhãn hardcode tiếng Việt: chứng từ gửi
 * NCC Việt Nam (ngoại lệ i18n §4.2).
 * KHÔNG ghi giá CO tham chiếu vào file — đây là file gửi ra ngoài.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await hasPermission("purchasing.view"))) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const rfq = await prisma.rfq.findUnique({
    where: { id },
    include: { project: { select: { code: true, name: true, client: { select: { name: true } } } }, lines: { orderBy: { sort: "asc" } } },
  });
  if (!rfq) return new NextResponse("Not found", { status: 404 });
  const template = resolveRfqTemplate(rfq.groupCode);
  if (!template) return new NextResponse("Not found", { status: 404 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("RFQ");
  ws.addRow([`YÊU CẦU BÁO GIÁ — ${rfq.title}`]).font = { bold: true, size: 14 };
  ws.addRow([`Dự án: ${rfq.project.code} — ${rfq.project.name}`]);
  ws.addRow([`Khách hàng: ${rfq.project.client.name}`]);
  ws.addRow([`Mẫu: ${template.labelVi}${rfq.deadline ? ` · Hạn gửi báo giá: ${formatDate(rfq.deadline)}` : ""}`]);
  if (rfq.note) ws.addRow([`Ghi chú: ${rfq.note}`]);
  ws.addRow([]);

  const extraCols = template.lineColumns.map((c) => c.labelVi);
  const header = ["STT", "Hạng mục", "Mô tả", "ĐVT", "SL", ...extraCols, template.unitPriceLabelVi, "Thành tiền", "Tiền thuế", "Ghi chú", "__line"];
  const hRow = ws.addRow(header);
  hRow.font = { bold: true };
  hRow.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  const amountColIdx = 6 + template.lineColumns.length + 1;
  const taxColIdx = amountColIdx + 1;
  const amountLetter = ws.getColumn(amountColIdx).letter;
  const taxLetter = ws.getColumn(taxColIdx).letter;
  const taxPctLetter = ws.getColumn(6 + template.lineColumns.findIndex((c) => c.key === "taxPct")).letter;
  const firstDataRow = hRow.number + 1;
  // Vị trí ô "Thuế suất mặc định (%)" trong khối điều khoản, tính TRƯỚC vì công thức từng dòng trỏ
  // tới nó: sau bảng là 4 dòng tổng + 1 dòng trống + 1 dòng tiêu đề, rồi tới danh sách điều khoản.
  const vatTermIdx = template.terms.findIndex((t) => t.key === "vatPct");
  const defaultPctRow = hRow.number + rfq.lines.length + 6 + vatTermIdx + 1;
  const defaultPctRef = `$B$${defaultPctRow}`; // khoá CẢ cột lẫn dòng — NCC chèn thêm dòng thì tham chiếu không trôi

  rfq.lines.forEach((l, i) => {
    const row = ws.addRow([i + 1, l.itemName, l.specs ?? "", l.unit ?? "", l.quantity, ...template.lineColumns.map((c) => (c.defaultValue ?? "")), "", "", "", "", l.id]);
    row.eachCell({ includeEmpty: true }, (c, col) => {
      if (col <= header.length - 1) c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });
    // Thành tiền: SL × Π(cột hệ số) × Đơn giá — công thức Excel để NCC thấy số ngay khi gõ.
    const rowNo = row.number;
    const qtyCol = "E";
    const factorCols = template.amountFactors
      .map((fk) => {
        const idx = template.lineColumns.findIndex((c) => c.key === fk);
        return idx >= 0 ? ws.getColumn(6 + idx).letter : null;
      })
      .filter((x): x is string => !!x);
    const priceCol = ws.getColumn(6 + template.lineColumns.length).letter;
    const amountCell = row.getCell(6 + template.lineColumns.length + 1);
    amountCell.value = { formula: `${qtyCol}${rowNo}*${factorCols.map((c) => `IF(${c}${rowNo}="",1,${c}${rowNo})`).map((x) => x + "*").join("")}${priceCol}${rowNo}` };
    // Tiền thuế = Thành tiền × (% của dòng, để trống thì lấy mức mặc định ở khối điều khoản).
    // Cùng phép tính với `computeQuoteTotals` phía app — NCC mở file ra thấy đúng số app sẽ tính.
    row.getCell(taxColIdx).value = { formula: `${amountLetter}${rowNo}*IF(${taxPctLetter}${rowNo}="",${defaultPctRef},${taxPctLetter}${rowNo})/100` };
  });

  // Chuỗi tổng theo đúng cách 23 file báo giá thật trình bày: Cộng → tiền thuế → tổng thanh toán → bằng chữ.
  const lastDataRow = hRow.number + rfq.lines.length;
  const sumRow = ws.addRow(["", "CỘNG (chưa thuế)"]);
  sumRow.font = { bold: true };
  sumRow.getCell(amountColIdx).value = { formula: `SUM(${amountLetter}${firstDataRow}:${amountLetter}${lastDataRow})` };
  const taxRow = ws.addRow(["", "TIỀN THUẾ"]);
  taxRow.getCell(amountColIdx).value = { formula: `SUM(${taxLetter}${firstDataRow}:${taxLetter}${lastDataRow})` };
  const grandRow = ws.addRow(["", "TỔNG THANH TOÁN"]);
  grandRow.font = { bold: true };
  grandRow.getCell(amountColIdx).value = { formula: `${amountLetter}${sumRow.number}+${amountLetter}${taxRow.number}` };
  ws.addRow(["", "Bằng chữ:"]).getCell(2).font = { italic: true };

  ws.addRow([]);
  ws.addRow(["ĐIỀU KHOẢN CHUNG (NCC điền)"]).font = { bold: true };
  const termRows = template.terms.map((tf) => ws.addRow([tf.labelVi, ""]).number);
  // Ô mức thuế mặc định phải nằm ĐÚNG chỗ công thức từng dòng đang trỏ tới — nếu lệch thì cả cột
  // Tiền thuế trong file gửi NCC sẽ nhân với ô trống và ra 0, im lặng.
  if (termRows[vatTermIdx] !== defaultPctRow) throw new Error(`RFQ template: ô thuế mặc định lệch (${termRows[vatTermIdx]} ≠ ${defaultPctRow})`);

  // Độ rộng + ẩn cột khoá
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 34;
  ws.getColumn(3).width = 40;
  ws.getColumn(4).width = 8;
  ws.getColumn(5).width = 8;
  for (let i = 0; i < template.lineColumns.length; i++) ws.getColumn(6 + i).width = 14;
  ws.getColumn(amountColIdx - 1).width = 16;
  ws.getColumn(amountColIdx).width = 16;
  ws.getColumn(taxColIdx).width = 14;
  ws.getColumn(taxColIdx + 1).width = 24;
  ws.getColumn(header.length).hidden = true;
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(`${rfq.code} - RFQ - ${template.labelVi}.xlsx`),
      "Cache-Control": "private, no-store",
    },
  });
}
