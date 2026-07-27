import "server-only";
import fs from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { getStringSetting } from "./settings";
import { toNum } from "./utils";
import { buildQuotationModel, type QuotationModel, type QuotationRow, type QuotationSource } from "./costsheet-quotation";

export { buildQuotationModel };
export type { QuotationModel, QuotationSource };

/**
 * Xuất báo giá theo form BM02/QT.TCM.15 (C6a) — phần IO: nạp dữ liệu + dựng file Excel.
 * Toàn bộ SỐ dựng ở lib/costsheet-quotation.ts (thuần, một nguồn cho cả Excel lẫn trang in).
 * Nhãn trong file hardcode tiếng Việt — chứng từ gửi khách VN, cùng lớp ngoại lệ i18n với
 * tiêu đề Notification (HANDOVER §4.2).
 */

/** Nạp dữ liệu cho export — bảng CO/CE CTRACT MỚI NHẤT (bảng sống). */
export async function loadQuotationSource(projectId: string): Promise<QuotationSource | null> {
  const [project, sheet, legalNameVi, signerName, signerTitle] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { client: true, owner: true } }),
    prisma.costSheet.findFirst({
      where: { projectId, version: "CTRACT" },
      orderBy: { createdAt: "desc" },
      include: { sections: { orderBy: { sort: "asc" }, include: { lines: { orderBy: { sort: "asc" } } } } },
    }),
    // Tên pháp lý + người ký trên báo giá — mặc định theo quyết định chủ dự án 27/07/2026 (báo giá
    // tiếng Việt → tên tiếng Việt; letterhead PNG đã mang bản tiếng Anh + MST + địa chỉ).
    getStringSetting("company", "legal_name_vi", "Công ty Cổ phần Tiếp thị Tân Cường Minh"),
    getStringSetting("company", "signer_name", "NGUYỄN VĂN HOÀNG"),
    getStringSetting("company", "signer_title", "CEO"),
  ]);
  if (!project || !sheet) return null;
  return {
    projectCode: project.code,
    projectName: project.name,
    clientName: project.client.name,
    picName: project.owner?.fullName ?? null,
    venue: project.venue ?? null,
    eventStart: project.eventStartDate ?? null,
    eventEnd: project.eventEndDate ?? null,
    ceTotal: toNum(sheet.ceTotal),
    vatPct: sheet.vatPct ?? 0,
    agencyFeePct: sheet.agencyFeePct ?? 0,
    mgmtFeePct: sheet.mgmtFeePct ?? 0,
    contingencyPct: sheet.contingencyPct ?? 0,
    minMarginPct: sheet.minMarginPct ?? 0,
    marginOverrideNote: sheet.marginOverrideNote ?? null,
    sections: sheet.sections.map((s) => ({
      id: s.id,
      parentSectionId: s.parentSectionId,
      nameVi: s.nameVi,
      sort: s.sort,
      isProxy: s.isProxy,
      proxyFeeType: s.proxyFeeType,
      proxyFeeVal: s.proxyFeeVal,
      lines: s.lines.map((l) => ({
        lineType: l.lineType,
        quantity: l.quantity,
        unitPrice: toNum(l.unitPrice),
        fixedAmount: l.fixedAmount == null ? null : toNum(l.fixedAmount),
        percentVal: l.percentVal,
        taxType: l.taxType,
        customTaxAmount: l.customTaxAmount == null ? null : toNum(l.customTaxAmount),
        itemCode: l.itemCode,
        itemName: l.itemName,
        specs: l.specs,
        unit: l.unit,
        note: l.note ?? null,
        isSponsored: l.isSponsored,
        stockResvLineId: l.stockResvLineId,
        stockRefUnitPrice: l.stockRefUnitPrice == null ? null : toNum(l.stockRefUnitPrice),
      })),
    })),
    company: { legalNameVi, signerName, signerTitle },
    now: new Date(),
  };
}

// ── Excel (form BM02) ────────────────────────────────────

const THIN = { style: "thin" as const, color: { argb: "FF9CA3AF" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
/** Màu đúng theo file BM02 thật: mục cấp 1 vàng nhạt FFF2CC, footer xanh 0D81FF chữ trắng. */
const SECTION_FILL = "FFFFF2CC";
const FOOTER_FILL = "FF0D81FF";

export async function buildQuotationWorkbook(model: QuotationModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const client = model.mode === "client";
  const ws = wb.addWorksheet(client ? "BÁO GIÁ" : "CO-CE", {
    // Form thật: A4 DỌC, fit ngang trang.
    pageSetup: { paperSize: 9, orientation: client ? "portrait" : "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const colCount = model.columns.length;
  const widths = client ? [6, 30, 48, 14, 8, 14, 16, 26] : [6, 10, 32, 36, 8, 8, 14, 16, 8, 18];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const totalCol = client ? 7 : 8; // cột Thành tiền
  const priceCol = client ? 6 : 7; // cột Đơn giá
  const lastCol = colCount;

  const addMerged = (text: string, opts?: Partial<ExcelJS.Style["font"]> & { align?: "left" | "center" | "right" }) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, lastCol);
    row.getCell(1).font = { name: "Calibri", size: 11, ...opts };
    row.getCell(1).alignment = { horizontal: opts?.align ?? "left", vertical: "middle", wrapText: true };
    return row;
  };

  // Letterhead PNG (logo chứa đủ tên EN + 2 địa chỉ + MST + web — đúng đầu trang form thật);
  // đọc lỗi (thiếu file) thì rơi về tên chữ trơn, không chặn xuất.
  let hasLogo = false;
  if (model.useLetterhead) {
    try {
      const buffer = await fs.readFile(path.join(process.cwd(), "public", "tcm-letterhead.png"));
      const imageId = wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: "png" });
      // Ảnh gốc 1221×166 px — đặt ~620×84 để vừa nửa trái trang dọc.
      ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 620, height: 84 } });
      hasLogo = true;
    } catch {
      hasLogo = false;
    }
  }
  if (model.iso) {
    // Khối kiểm soát biểu mẫu ISO — góc PHẢI, 4 dòng, đè cạnh vùng logo.
    const isoLines = [
      `Số hiệu: ${model.iso.formNo}`,
      `Ngày BH: ${model.iso.issuedDate}`,
      `Lần BH/SĐ: ${model.iso.revision}`,
      `Số trang: ${model.iso.pages}`,
    ];
    isoLines.forEach((text, i) => {
      const row = ws.getRow(i + 1);
      const cell = row.getCell(lastCol);
      cell.value = text;
      cell.font = { size: 9 };
      cell.alignment = { horizontal: "right" };
    });
  }
  if (!hasLogo && !model.useLetterhead) {
    addMerged(model.companyFallbackName, { bold: true, size: 13 });
  } else {
    // Chừa chỗ cho ảnh letterhead (4 dòng đầu).
    while (ws.rowCount < 5) ws.addRow([]);
  }
  if (model.useLetterhead && !hasLogo) addMerged(model.companyFallbackName, { bold: true, size: 13 });

  ws.addRow([]);
  addMerged(model.title, { bold: true, size: 16, align: "center" });
  ws.addRow([]);

  // Khối thông tin 2 cột — trái từ cột A, phải từ cột Đơn giá trở đi.
  const infoRows = Math.max(model.infoLeft.length, model.infoRight.length);
  for (let i = 0; i < infoRows; i++) {
    const row = ws.addRow([]);
    const left = model.infoLeft[i];
    const right = model.infoRight[i];
    if (left) {
      ws.mergeCells(row.number, 2, row.number, priceCol - 1);
      row.getCell(2).value = `${left[0]}: ${left[1]}`;
      row.getCell(2).font = { size: 10, bold: i === 0 };
    }
    if (right) {
      ws.mergeCells(row.number, priceCol, row.number, lastCol);
      row.getCell(priceCol).value = `${right[0]}: ${right[1]}`;
      row.getCell(priceCol).font = { size: 10 };
    }
  }
  ws.addRow([]);

  const writeHeaderRow = () => {
    const head = ws.addRow(model.columns);
    head.eachCell((c) => {
      c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = BORDER;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF555555" } };
    });
    return head.number;
  };

  // Số dòng đầu/cuối của từng khối line để viết công thức SUBTOTAL cho mục cấp 1 và footer.
  // Line-level là GIÁ TRỊ (đơn giá làm tròn, thành tiền phân bổ chính xác) — công thức nhân
  // SL×ĐG sẽ làm lệch tổng đã duyệt; subtotal/footer là CÔNG THỨC cộng trên các giá trị đó.
  const writeRows = (rowsData: QuotationRow[]): { first: number; last: number } => {
    let first = 0;
    let last = 0;
    const sectionCells: { rowNo: number; from: number }[] = [];
    for (const r of rowsData) {
      if (r.kind === "section") {
        const row = ws.addRow([]);
        const mergeTo = r.subtotal != null ? totalCol - 1 : lastCol;
        ws.mergeCells(row.number, 1, row.number, mergeTo);
        row.getCell(1).value = r.label;
        row.getCell(1).font = { bold: true, size: 10 };
        row.getCell(1).alignment = { horizontal: "left", indent: r.depth - 1 };
        if (r.subtotal != null) sectionCells.push({ rowNo: row.number, from: row.number + 1 });
        row.eachCell({ includeEmpty: true }, (c, col) => {
          if (col <= lastCol) {
            c.border = BORDER;
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: r.depth === 1 ? SECTION_FILL : "FFFAFAFA" } };
          }
        });
        if (first === 0) first = row.number;
        last = row.number;
        continue;
      }
      const vals = client
        ? [r.stt, r.name, r.specs ?? "", r.unit ?? "", r.qty ?? "", r.unitPrice ?? "", r.total ?? "", r.note ?? ""]
        : [r.stt, r.itemCode ?? "", r.name, r.specs ?? "", r.unit ?? "", r.qty ?? "", r.unitPrice ?? "", r.total ?? "", r.taxLabel ?? "", r.note ?? ""];
      const row = ws.addRow(vals);
      row.eachCell({ includeEmpty: true }, (c, col) => {
        if (col > lastCol) return;
        c.border = BORDER;
        c.font = { size: 10 };
        const isMoney = col === priceCol || col === totalCol;
        const isQty = col === priceCol - 1;
        c.alignment = { horizontal: col === 1 ? "center" : isMoney || isQty ? "right" : "left", vertical: "top", wrapText: true };
        if (isMoney) c.numFmt = "#,##0";
      });
      if (first === 0) first = row.number;
      last = row.number;
    }
    // Subtotal mục cấp 1 = công thức SUBTOTAL(9,…) như form thật — cộng trên vùng của mục đó
    // (tới ngay trước mục cấp 1 kế tiếp hoặc hết bảng).
    const colLetter = ws.getColumn(totalCol).letter;
    sectionCells.forEach((s, i) => {
      const to = i + 1 < sectionCells.length ? sectionCells[i + 1].rowNo - 1 : last;
      const cell = ws.getRow(s.rowNo).getCell(totalCol);
      cell.value = { formula: `SUBTOTAL(9,${colLetter}${s.from}:${colLetter}${to})` };
      cell.numFmt = "#,##0";
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: "right" };
      cell.border = BORDER;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };
    });
    return { first, last };
  };

  writeHeaderRow();
  const main = writeRows(model.rows);

  let proxyRange: { first: number; last: number } | null = null;
  if (model.proxyRows.length > 0) {
    ws.addRow([]);
    addMerged("KHOẢN CHI HỘ (ngoài giá trị báo giá — thanh toán theo thực tế)", { bold: true, size: 11 });
    writeHeaderRow();
    proxyRange = writeRows(model.proxyRows);
  }

  ws.addRow([]);
  // Footer: dòng Σ dùng CÔNG THỨC (SUBTOTAL vùng bảng / cộng 2 dòng trên) — mở lại bằng Excel
  // bấm F9 vẫn ra đúng; dòng phí/VAT là giá trị đã hấp thụ làm tròn để tổng cuối = số đã duyệt.
  const colLetter = ws.getColumn(totalCol).letter;
  const footerRowNos: number[] = [];
  model.footer.forEach((f, idx) => {
    const row = ws.addRow([]);
    ws.mergeCells(row.number, 1, row.number, totalCol - 1);
    row.getCell(1).value = f.label;
    const cell = row.getCell(totalCol);
    if (f.amount != null) {
      if (client && idx === 0) {
        cell.value = { formula: `SUBTOTAL(9,${colLetter}${main.first}:${colLetter}${main.last})`, result: f.amount };
      } else if (client && idx === 2) {
        cell.value = { formula: `${colLetter}${footerRowNos[0]}+${colLetter}${footerRowNos[1]}`, result: f.amount };
      } else if (client && idx === 4) {
        cell.value = { formula: `${colLetter}${footerRowNos[2]}+${colLetter}${footerRowNos[3]}`, result: f.amount };
      } else if (client && f.label === "Chi phí chi hộ (theo thực tế)" && proxyRange) {
        cell.value = { formula: `SUBTOTAL(9,${colLetter}${proxyRange.first}:${colLetter}${proxyRange.last})`, result: f.amount };
      } else {
        cell.value = f.amount;
      }
      cell.numFmt = "#,##0";
    }
    footerRowNos.push(row.number);
    const isStrong = !!f.strong;
    for (const c of [row.getCell(1), cell]) {
      c.font = { bold: isStrong, size: isStrong ? 11 : 10, color: client && isStrong ? { argb: "FFFFFFFF" } : undefined };
      c.alignment = { horizontal: c === cell ? "right" : "left", vertical: "middle", wrapText: true };
    }
    if (client && isStrong) {
      row.eachCell({ includeEmpty: true }, (c, col) => {
        if (col <= lastCol) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOOTER_FILL } };
      });
    }
  });

  if (model.marginOverrideNote) {
    ws.addRow([]);
    addMerged(`Lý do duyệt margin dưới sàn: ${model.marginOverrideNote}`, { italic: true, size: 10 });
  }

  ws.addRow([]);
  for (const term of model.terms) addMerged(term, { italic: true, size: 10 });

  // Chữ ký: bản khách MỘT bên (phải) theo form BM02; bản nội bộ 2 bên.
  ws.addRow([]);
  if (model.signature.length === 1) {
    const sig = model.signature[0];
    const half = Math.ceil(lastCol / 2);
    const r1 = ws.addRow([]);
    ws.mergeCells(r1.number, half, r1.number, lastCol);
    r1.getCell(half).value = sig.company ?? "";
    r1.getCell(half).font = { bold: true, size: 11 };
    r1.getCell(half).alignment = { horizontal: "center" };
    for (let i = 0; i < 4; i++) ws.addRow([]); // chỗ ký
    const r2 = ws.addRow([]);
    ws.mergeCells(r2.number, half, r2.number, lastCol);
    r2.getCell(half).value = sig.name;
    r2.getCell(half).font = { bold: true, size: 11 };
    r2.getCell(half).alignment = { horizontal: "center" };
    const r3 = ws.addRow([]);
    ws.mergeCells(r3.number, half, r3.number, lastCol);
    r3.getCell(half).value = sig.title;
    r3.getCell(half).font = { size: 10 };
    r3.getCell(half).alignment = { horizontal: "center" };
  } else {
    const half = Math.floor(lastCol / 2);
    const sig = ws.addRow([]);
    ws.mergeCells(sig.number, 1, sig.number, half);
    ws.mergeCells(sig.number, half + 1, sig.number, lastCol);
    sig.getCell(1).value = model.signature[0]?.title ?? "";
    sig.getCell(half + 1).value = model.signature[1]?.title ?? "";
    [sig.getCell(1), sig.getCell(half + 1)].forEach((c) => {
      c.font = { bold: true, size: 11 };
      c.alignment = { horizontal: "center" };
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
