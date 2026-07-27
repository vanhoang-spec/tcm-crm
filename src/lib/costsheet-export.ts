import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { getStringSetting } from "./settings";
import {
  clientBillableTotal,
  computeCostSheetTotals,
  computeLineAmount,
  computeMarginPct,
  flattenSectionTree,
  type CostLineCalcInput,
  type SectionTreeNode,
} from "./bidding";
import { toNum } from "./utils";

/**
 * Xuất báo giá / bảng CO-CE ra file (C6a) — hạng mục chặn việc "gõ tay lại sang Excel" làm số
 * gửi khách lệch số đã duyệt.
 *
 * MỘT nguồn dựng số duy nhất: `buildQuotationModel()` (thuần) — cả file Excel lẫn trang in/PDF đều
 * render từ model này, không bên nào tự cộng.
 *
 * BẤT BIẾN #3 (không tạo hệ tổng tiền song song): mọi con số tổng trên file lấy từ
 * `computeCostSheetTotals` / `clientBillableTotal` hoặc đọc thẳng cột đã lưu (ceTotal). Riêng bản
 * KHÁCH cần "Thành tiền" theo từng dòng trong khi hệ thống CHỈ có CE tổng (CE theo dòng = Phase 2,
 * HANDOVER §10.7) → PHÂN BỔ ceTotal theo tỉ trọng CO từng dòng, phần dư làm tròn dồn vào dòng lớn
 * nhất để Σ dòng = ceTotal TUYỆT ĐỐI. Đây là suy diễn lúc render, không lưu, không ghi ngược.
 *
 * Nhãn trong file hardcode tiếng Việt — file là chứng từ gửi khách VN, cùng lớp ngoại lệ i18n với
 * tiêu đề Notification (HANDOVER §4.2).
 */

export type QuotationMode = "client" | "internal";

export type QuotationRow =
  | { kind: "section"; depth: number; label: string; subtotal: number | null }
  | {
      kind: "line";
      depth: number;
      stt: number;
      itemCode: string | null;
      name: string;
      specs: string | null;
      unit: string | null;
      qty: number | null;
      unitPrice: number | null;
      total: number;
      taxLabel: string | null;
      note: string | null;
    };

export type QuotationFooterRow = { label: string; amount: number | null; strong?: boolean };

export type QuotationModel = {
  mode: QuotationMode;
  company: { name: string; address: string; taxCode: string; phone: string; email: string };
  title: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  clientAddress: string | null;
  clientTaxCode: string | null;
  dateLabel: string;
  columns: string[];
  rows: QuotationRow[];
  /** Khối Chi hộ tách RIÊNG dưới bảng chính (bất biến #2 — không trộn vào giá vốn/CE). */
  proxyRows: QuotationRow[];
  footer: QuotationFooterRow[];
  notes: string[];
  /** Chỉ bản nội bộ: lý do ghi đè margin dưới sàn (người duyệt phải thấy ngay trên giấy). */
  marginOverrideNote: string | null;
  signatures: [string, string];
};

const TAX_LABELS: Record<string, string> = { VAT: "VAT", TNCN: "TNCN", TNDN: "TNDN", OTHER: "Khác" };

type LoadedLine = CostLineCalcInput & {
  itemCode: string | null;
  itemName: string;
  specs: string | null;
  unit: string | null;
  note: string | null;
};

type LoadedSection = {
  id: string;
  parentSectionId: string | null;
  nameVi: string;
  sort: number;
  isProxy: boolean;
  proxyFeeType: string | null;
  proxyFeeVal: number | null;
  lines: LoadedLine[];
};

export type QuotationSource = {
  projectCode: string;
  projectName: string;
  clientName: string;
  clientAddress: string | null;
  clientTaxCode: string | null;
  ceTotal: number;
  vatPct: number;
  mgmtFeePct: number;
  contingencyPct: number;
  minMarginPct: number;
  marginOverrideNote: string | null;
  sections: LoadedSection[];
  company: QuotationModel["company"];
  /** Ngày in — truyền từ ngoài để hàm thuần không tự lấy giờ. */
  now: Date;
};

/** Nạp dữ liệu cho export — bảng CO/CE CTRACT MỚI NHẤT (bảng sống; bản nào in ra ghi rõ ở chân trang). */
export async function loadQuotationSource(projectId: string): Promise<QuotationSource | null> {
  const [project, sheet, name, address, taxCode, phone, email] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { client: true } }),
    prisma.costSheet.findFirst({
      where: { projectId, version: "CTRACT" },
      orderBy: { createdAt: "desc" },
      include: { sections: { orderBy: { sort: "asc" }, include: { lines: { orderBy: { sort: "asc" } } } } },
    }),
    // Thông tin công ty trên đầu trang — admin đổi bằng bảng setting (module "company"), chưa có UI
    // riêng vì chỉ nhập một lần.
    getStringSetting("company", "name", "TCM"),
    getStringSetting("company", "address", ""),
    getStringSetting("company", "tax_code", ""),
    getStringSetting("company", "phone", ""),
    getStringSetting("company", "email", ""),
  ]);
  if (!project || !sheet) return null;
  return {
    projectCode: project.code,
    projectName: project.name,
    clientName: project.client.name,
    clientAddress: project.client.address ?? null,
    clientTaxCode: project.client.taxCode ?? null,
    ceTotal: toNum(sheet.ceTotal),
    vatPct: sheet.vatPct ?? 0,
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
      })),
    })),
    company: { name, address, taxCode, phone, email },
    now: new Date(),
  };
}

/** Số La Mã cho mục cấp 1 — đúng thói quen form BM02 (I/II/III/IV…). */
function roman(n: number): string {
  const map: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  let v = n;
  for (const [val, sym] of map) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out;
}

type TreeNode = LoadedSection & { children: TreeNode[]; effectiveProxy: boolean };

function buildTree(sections: LoadedSection[]): TreeNode[] {
  const nodes: TreeNode[] = sections.map((s) => ({ ...s, children: [], effectiveProxy: false }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots: TreeNode[] = [];
  for (const n of nodes) {
    const parent = n.parentSectionId ? byId.get(n.parentSectionId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  const sortRec = (list: TreeNode[]) => {
    list.sort((a, b) => a.sort - b.sort);
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  const markProxy = (n: TreeNode, inherited: boolean) => {
    n.effectiveProxy = inherited || n.isProxy;
    n.children.forEach((c) => markProxy(c, n.effectiveProxy));
  };
  roots.forEach((r) => markProxy(r, false));
  return roots;
}

export function buildQuotationModel(src: QuotationSource, mode: QuotationMode): QuotationModel {
  // Tổng CO/Chi hộ đi qua ĐÚNG hàm chuẩn — không tự cộng.
  const flatNodes: SectionTreeNode[] = src.sections.map((s) => ({
    key: s.id,
    parentKey: s.parentSectionId,
    isProxy: s.isProxy,
    proxyFeeType: s.proxyFeeType,
    proxyFeeVal: s.proxyFeeVal,
    lines: s.lines,
  }));
  const totals = computeCostSheetTotals(flattenSectionTree(flatNodes), src.mgmtFeePct, src.contingencyPct);
  const tree = buildTree(src.sections);

  // CO từng dòng (đã gross-up) — trọng số phân bổ CE ở bản khách, và là Thành tiền ở bản nội bộ.
  // Đi qua ĐÚNG computeLineAmount của builder (bất biến #3 — không chép lại công thức gross-up).
  const lineCo = (l: LoadedLine): number => computeLineAmount(l, totals.directCo);

  // Bản khách: TT_dòng = CO_dòng × ceTotal / adjustedCoSubtotal (làm tròn), dư dồn vào dòng lớn
  // nhất → Σ TT = ceTotal TUYỆT ĐỐI (số đã duyệt, không được lệch một đồng).
  const nonProxyLines: { node: TreeNode; line: LoadedLine; co: number }[] = [];
  const proxyLines: { node: TreeNode; line: LoadedLine; co: number }[] = [];
  const collect = (n: TreeNode) => {
    for (const l of n.lines) (n.effectiveProxy ? proxyLines : nonProxyLines).push({ node: n, line: l, co: lineCo(l) });
    n.children.forEach(collect);
  };
  tree.forEach(collect);

  const clientTotals = new Map<LoadedLine, number>();
  if (mode === "client" && totals.adjustedCoSubtotal > 0) {
    let allocated = 0;
    for (const item of nonProxyLines) {
      const tt = Math.round((item.co * src.ceTotal) / totals.adjustedCoSubtotal);
      clientTotals.set(item.line, tt);
      allocated += tt;
    }
    const residual = src.ceTotal - allocated;
    if (residual !== 0 && nonProxyLines.length > 0) {
      const largest = nonProxyLines.reduce((a, b) => ((clientTotals.get(a.line) ?? 0) >= (clientTotals.get(b.line) ?? 0) ? a : b));
      clientTotals.set(largest.line, (clientTotals.get(largest.line) ?? 0) + residual);
    }
  }

  const lineTotal = (l: LoadedLine, isProxy: boolean): number => {
    if (isProxy) return lineCo(l); // Chi hộ: khách trả đúng chi phí thực (+ phí dịch vụ ở dòng riêng)
    return mode === "client" ? (clientTotals.get(l) ?? 0) : lineCo(l);
  };
  // Bản khách: đơn giá = TT/SL làm tròn (chú thích ghi rõ); bản nội bộ: đơn giá CO gốc.
  const lineUnitPrice = (l: LoadedLine, total: number): number | null => {
    if (l.lineType !== "QTY_PRICE" || l.quantity <= 0) return null;
    return mode === "client" ? Math.round(total / l.quantity) : l.unitPrice;
  };

  const rows: QuotationRow[] = [];
  const proxyRows: QuotationRow[] = [];
  let stt = 0;
  const subtreeTotal = (n: TreeNode): number => {
    let sum = n.lines.reduce((s, l) => s + lineTotal(l, n.effectiveProxy), 0);
    for (const c of n.children) sum += subtreeTotal(c);
    return sum;
  };
  const walk = (n: TreeNode, depth: number, label: string, into: QuotationRow[]) => {
    into.push({ kind: "section", depth, label: `${label}. ${n.nameVi}`, subtotal: depth === 1 ? subtreeTotal(n) : null });
    for (const l of n.lines) {
      stt++;
      const total = lineTotal(l, n.effectiveProxy);
      into.push({
        kind: "line",
        depth,
        stt,
        itemCode: l.itemCode,
        name: l.itemName + (l.lineType === "PERCENT_OF_TOTAL" ? ` (${l.percentVal ?? 0}%)` : ""),
        specs: l.specs,
        unit: l.unit,
        qty: l.lineType === "QTY_PRICE" ? l.quantity : null,
        unitPrice: lineUnitPrice(l, total),
        total,
        taxLabel: mode === "internal" ? TAX_LABELS[l.taxType ?? ""] ?? null : null,
        note: l.note,
      });
    }
    n.children.forEach((c, i) => walk(c, depth + 1, `${label}.${i + 1}`, into));
  };
  let topIdx = 0;
  let proxyTopIdx = 0;
  for (const root of tree) {
    if (root.effectiveProxy) {
      proxyTopIdx++;
      walk(root, 1, roman(proxyTopIdx), proxyRows);
    } else {
      topIdx++;
      walk(root, 1, roman(topIdx), rows);
    }
  }

  const margin = computeMarginPct(src.ceTotal, totals.coTotal);
  const footer: QuotationFooterRow[] =
    mode === "client"
      ? [
          { label: `TỔNG BÁO GIÁ (đã gồm VAT ${src.vatPct}%)`, amount: src.ceTotal, strong: true },
          ...(totals.chiHo > 0
            ? [
                { label: "Chi phí chi hộ (theo thực tế)", amount: totals.proxySubtotal },
                { label: "Phí dịch vụ chi hộ", amount: totals.proxyFeeAmt },
                { label: "TỔNG THANH TOÁN", amount: clientBillableTotal(src.ceTotal, totals.chiHo), strong: true },
              ]
            : []),
        ]
      : [
          { label: "CO trực tiếp (đã gross-up thuế)", amount: totals.directCo },
          ...(totals.percentLinesTotal !== 0 ? [{ label: "Dòng % trên CO", amount: totals.percentLinesTotal }] : []),
          ...(totals.mgmtFeeAmt !== 0 ? [{ label: `Phí quản lý ${src.mgmtFeePct}%`, amount: totals.mgmtFeeAmt }] : []),
          ...(totals.contingencyAmt !== 0 ? [{ label: `Dự phòng ${src.contingencyPct}%`, amount: totals.contingencyAmt }] : []),
          { label: "CO TỔNG", amount: totals.coTotal, strong: true },
          { label: `CE (giá chào, gồm VAT ${src.vatPct}%)`, amount: src.ceTotal, strong: true },
          { label: `Margin ${margin.toFixed(2)}% (sàn ${src.minMarginPct}%)`, amount: null },
          ...(totals.chiHo > 0
            ? [
                { label: "Chi hộ (thực tế + phí dịch vụ)", amount: totals.chiHo },
                { label: "TỔNG THANH TOÁN KHÁCH", amount: clientBillableTotal(src.ceTotal, totals.chiHo), strong: true },
              ]
            : []),
        ];

  const d = src.now;
  const dateLabel = `Ngày ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  return {
    mode,
    company: src.company,
    title: mode === "client" ? "BẢNG BÁO GIÁ" : "BẢNG CHI PHÍ CO/CE (NỘI BỘ)",
    projectCode: src.projectCode,
    projectName: src.projectName,
    clientName: src.clientName,
    clientAddress: src.clientAddress,
    clientTaxCode: src.clientTaxCode,
    dateLabel,
    columns:
      mode === "client"
        ? ["STT", "Hạng mục", "Mô tả", "ĐVT", "SL", "Đơn giá", "Thành tiền", "Ghi chú"]
        : ["STT", "Mã", "Hạng mục", "Quy cách", "ĐVT", "SL", "Đơn giá (CO)", "Thành tiền (CO)", "Thuế", "Ghi chú"],
    rows,
    proxyRows,
    footer,
    notes:
      mode === "client"
        ? [
            "Đơn giá làm tròn tới đồng; cột Thành tiền là số chính xác.",
            "Báo giá xuất từ hệ thống TCM CRM — tổng khớp tuyệt đối với bản đã duyệt.",
          ]
        : ["Bản nội bộ — KHÔNG gửi khách hàng. Thành tiền là CO đã gross-up thuế (TNCN ÷0,9 · TNDN ÷0,8)."],
    marginOverrideNote: mode === "internal" ? src.marginOverrideNote : null,
    signatures: mode === "client" ? ["ĐẠI DIỆN TCM", "XÁC NHẬN CỦA KHÁCH HÀNG"] : ["NGƯỜI LẬP", "NGƯỜI DUYỆT"],
  };
}

// ── Excel ────────────────────────────────────────────────

const THIN = { style: "thin" as const, color: { argb: "FF9CA3AF" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

export async function buildQuotationWorkbook(model: QuotationModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(model.mode === "client" ? "Bao gia" : "CO-CE", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const colCount = model.columns.length;
  const widths =
    model.mode === "client" ? [6, 34, 44, 8, 8, 14, 16, 20] : [6, 10, 32, 36, 8, 8, 14, 16, 8, 18];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const moneyCols = model.mode === "client" ? [6, 7] : [7, 8];
  const lastCol = colCount;

  const addMerged = (text: string, opts?: Partial<ExcelJS.Style["font"]> & { align?: "left" | "center" | "right" }) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, lastCol);
    row.getCell(1).font = { name: "Calibri", size: 11, ...opts };
    row.getCell(1).alignment = { horizontal: opts?.align ?? "left", vertical: "middle", wrapText: true };
    return row;
  };

  // Đầu trang: công ty (trái) — chỉ in dòng có dữ liệu, thiếu thì bỏ, không in placeholder.
  addMerged(model.company.name, { bold: true, size: 13 });
  if (model.company.address) addMerged(model.company.address, { size: 10 });
  const contactBits = [
    model.company.taxCode ? `MST: ${model.company.taxCode}` : "",
    model.company.phone ? `ĐT: ${model.company.phone}` : "",
    model.company.email,
  ].filter(Boolean);
  if (contactBits.length > 0) addMerged(contactBits.join(" · "), { size: 10 });

  ws.addRow([]);
  addMerged(model.title, { bold: true, size: 16, align: "center" });
  addMerged(`${model.projectCode} — ${model.projectName}`, { size: 11, align: "center" });
  addMerged(model.dateLabel, { size: 10, align: "center" });
  ws.addRow([]);

  // Khối khách hàng
  addMerged(`Kính gửi: ${model.clientName}`, { bold: true, size: 11 });
  if (model.clientAddress) addMerged(`Địa chỉ: ${model.clientAddress}`, { size: 10 });
  if (model.clientTaxCode) addMerged(`MST: ${model.clientTaxCode}`, { size: 10 });
  ws.addRow([]);

  const writeHeaderRow = () => {
    const head = ws.addRow(model.columns);
    head.eachCell((c) => {
      c.font = { bold: true, size: 10 };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = BORDER;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    });
  };

  const writeRow = (r: QuotationRow) => {
    if (r.kind === "section") {
      const row = ws.addRow([]);
      ws.mergeCells(row.number, 1, row.number, r.subtotal != null ? lastCol - (model.mode === "client" ? 2 : 3) : lastCol);
      row.getCell(1).value = r.label;
      row.getCell(1).font = { bold: true, size: 10 + Math.max(0, 2 - r.depth) };
      row.getCell(1).alignment = { horizontal: "left", indent: r.depth - 1 };
      if (r.subtotal != null) {
        const cell = row.getCell(moneyCols[1]);
        cell.value = r.subtotal;
        cell.numFmt = "#,##0";
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: "right" };
      }
      row.eachCell({ includeEmpty: true }, (c, col) => {
        if (col <= lastCol) {
          c.border = BORDER;
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: r.depth === 1 ? "FFF3F4F6" : "FFFAFAFA" } };
        }
      });
      return;
    }
    const vals =
      model.mode === "client"
        ? [r.stt, r.name, r.specs ?? "", r.unit ?? "", r.qty ?? "", r.unitPrice ?? "", r.total, r.note ?? ""]
        : [r.stt, r.itemCode ?? "", r.name, r.specs ?? "", r.unit ?? "", r.qty ?? "", r.unitPrice ?? "", r.total, r.taxLabel ?? "", r.note ?? ""];
    const row = ws.addRow(vals);
    row.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > lastCol) return;
      c.border = BORDER;
      c.font = { size: 10 };
      const isMoney = moneyCols.includes(col) || (model.mode === "client" ? col === 5 : col === 6);
      c.alignment = { horizontal: col === 1 ? "center" : isMoney ? "right" : "left", vertical: "top", wrapText: true };
      if (moneyCols.includes(col)) c.numFmt = "#,##0";
    });
  };

  writeHeaderRow();
  model.rows.forEach(writeRow);

  if (model.proxyRows.length > 0) {
    ws.addRow([]);
    addMerged("KHOẢN CHI HỘ (ngoài giá trị báo giá — thanh toán theo thực tế)", { bold: true, size: 11 });
    writeHeaderRow();
    model.proxyRows.forEach(writeRow);
  }

  ws.addRow([]);
  for (const f of model.footer) {
    const row = ws.addRow([]);
    ws.mergeCells(row.number, 1, row.number, lastCol - 2);
    row.getCell(1).value = f.label;
    row.getCell(1).font = { bold: !!f.strong, size: f.strong ? 12 : 10 };
    row.getCell(1).alignment = { horizontal: "right" };
    if (f.amount != null) {
      const cell = row.getCell(lastCol - 1);
      cell.value = f.amount;
      cell.numFmt = "#,##0";
      cell.font = { bold: !!f.strong, size: f.strong ? 12 : 10 };
      cell.alignment = { horizontal: "right" };
    }
  }

  if (model.marginOverrideNote) {
    ws.addRow([]);
    addMerged(`Lý do duyệt margin dưới sàn: ${model.marginOverrideNote}`, { italic: true, size: 10 });
  }

  ws.addRow([]);
  for (const n of model.notes) addMerged(`• ${n}`, { italic: true, size: 9 });

  // Chữ ký 2 bên
  ws.addRow([]);
  const sig = ws.addRow([]);
  const half = Math.floor(lastCol / 2);
  ws.mergeCells(sig.number, 1, sig.number, half);
  ws.mergeCells(sig.number, half + 1, sig.number, lastCol);
  sig.getCell(1).value = model.signatures[0];
  sig.getCell(half + 1).value = model.signatures[1];
  [sig.getCell(1), sig.getCell(half + 1)].forEach((c) => {
    c.font = { bold: true, size: 11 };
    c.alignment = { horizontal: "center" };
  });
  const sigHint = ws.addRow([]);
  ws.mergeCells(sigHint.number, 1, sigHint.number, half);
  ws.mergeCells(sigHint.number, half + 1, sigHint.number, lastCol);
  sigHint.getCell(1).value = "(Ký, ghi rõ họ tên)";
  sigHint.getCell(half + 1).value = "(Ký, ghi rõ họ tên)";
  [sigHint.getCell(1), sigHint.getCell(half + 1)].forEach((c) => {
    c.font = { italic: true, size: 9 };
    c.alignment = { horizontal: "center" };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
