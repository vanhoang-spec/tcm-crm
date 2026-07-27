// Model BÁO GIÁ theo form BM02/QT.TCM.15 — hàm thuần, KHÔNG import gì, KHÔNG gọi Prisma.
//
// Tách khỏi costsheet-export.ts ("server-only" + ExcelJS) để (1) trang in và file Excel render từ
// MỘT model duy nhất, (2) chuỗi tính kiểm được bằng script thuần với số của form DHG thật.
//
// CHUỖI TÍNH BM02 (đối chiếu file thật 260716_DHG: 193.500.000 → +10% → 212.850.000 → +8% VAT
// → 229.878.000): Σ dòng dịch vụ là giá TRƯỚC phí agency TRƯỚC VAT. CRM chỉ lưu ceTotal = tổng
// CUỐI đã gồm VAT (số đã duyệt, trần hóa đơn) → bản xuất SUY NGƯỢC:
//   serviceSubtotal = round(ceTotal ÷ (1+VAT%) ÷ (1+phí%))
//   feeAmt          = round(serviceSubtotal × phí%)
//   vatAmt          = ceTotal − serviceSubtotal − feeAmt   ← hấp thụ làm tròn
// nên TỔNG CUỐI in ra = ceTotal TUYỆT ĐỐI (bất biến #3: không sinh hệ tổng thứ hai).
//
// DÒNG "TCM HỖ TRỢ" (isSponsored — quyết định CEO 27/07): hiện đơn giá would-be nhưng Thành tiền
// ĐỂ TRỐNG, không vào Σ nào; serviceSubtotal phân bổ hết cho các dòng còn lại. CO không đổi.

import {
  clientBillableTotal,
  computeCostSheetTotals,
  computeLineAmount,
  computeMarginPct,
  flattenSectionTree,
  type CostLineCalcInput,
  type SectionTreeNode,
} from "./bidding";

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
      /** null = dòng TCM hỗ trợ — ô Thành tiền ĐỂ TRỐNG (khác 0: 0 vẫn in số 0). */
      total: number | null;
      taxLabel: string | null;
      note: string | null;
    };

export type QuotationFooterRow = { label: string; amount: number | null; strong?: boolean };

export type QuotationModel = {
  mode: QuotationMode;
  /** Khối kiểm soát biểu mẫu ISO góc phải — chỉ bản khách (BM02 là số hiệu form gửi khách). */
  iso: { formNo: string; issuedDate: string; revision: string; pages: string } | null;
  /** Bản khách nhúng letterhead (logo chứa đủ tên/địa chỉ/MST) — bản nội bộ chữ trơn. */
  useLetterhead: boolean;
  companyFallbackName: string;
  title: string;
  projectCode: string;
  projectName: string;
  /** [nhãn, giá trị] — trái: Dự án/Khách hàng/Phụ trách/Ngày báo giá · phải: Địa điểm… */
  infoLeft: [string, string][];
  infoRight: [string, string][];
  columns: string[];
  rows: QuotationRow[];
  /** Khối Chi hộ tách RIÊNG dưới bảng chính (bất biến #2). */
  proxyRows: QuotationRow[];
  footer: QuotationFooterRow[];
  terms: string[];
  /** Chỉ bản nội bộ: lý do ghi đè margin dưới sàn. */
  marginOverrideNote: string | null;
  /** Bản khách: MỘT bên (form BM02) — company + name + title. Bản nội bộ: 2 chức danh. */
  signature: { company: string | null; name: string; title: string }[];
};

const TAX_LABELS: Record<string, string> = { VAT: "VAT", TNCN: "TNCN", TNDN: "TNDN", OTHER: "Khác" };
export const SPONSORED_NOTE = "TCM hỗ trợ dự án này";

export type QuotationLine = CostLineCalcInput & {
  itemCode: string | null;
  itemName: string;
  specs: string | null;
  unit: string | null;
  note: string | null;
  isSponsored: boolean;
};

export type QuotationSection = {
  id: string;
  parentSectionId: string | null;
  nameVi: string;
  sort: number;
  isProxy: boolean;
  proxyFeeType: string | null;
  proxyFeeVal: number | null;
  lines: QuotationLine[];
};

export type QuotationSource = {
  projectCode: string;
  projectName: string;
  clientName: string;
  picName: string | null;
  venue: string | null;
  /** Ngày sự kiện (UTC-midnight) — 1 ngày chỉ có eventStart; nhiều ngày có cả hai. */
  eventStart: Date | null;
  eventEnd: Date | null;
  ceTotal: number;
  vatPct: number;
  agencyFeePct: number;
  mgmtFeePct: number;
  contingencyPct: number;
  minMarginPct: number;
  marginOverrideNote: string | null;
  sections: QuotationSection[];
  company: { legalNameVi: string; signerName: string; signerTitle: string };
  /** Ngày in — truyền từ ngoài để hàm thuần không tự lấy giờ. */
  now: Date;
};

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

type TreeNode = QuotationSection & { children: TreeNode[]; effectiveProxy: boolean };

function buildTree(sections: QuotationSection[]): TreeNode[] {
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

/** Chuỗi footer bản khách — tách hàm để test bằng đúng số của form DHG thật. */
export function quotationChain(ceTotal: number, vatPct: number, agencyFeePct: number): {
  serviceSubtotal: number;
  feeAmt: number;
  vatAmt: number;
} {
  const serviceSubtotal = Math.round(ceTotal / (1 + vatPct / 100) / (1 + agencyFeePct / 100));
  const feeAmt = Math.round((serviceSubtotal * agencyFeePct) / 100);
  return { serviceSubtotal, feeAmt, vatAmt: ceTotal - serviceSubtotal - feeAmt };
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

  // CO từng dòng (đã gross-up) — trọng số phân bổ ở bản khách, Thành tiền ở bản nội bộ.
  // Đi qua ĐÚNG computeLineAmount của builder (bất biến #3 — không chép lại công thức gross-up).
  const lineCo = (l: QuotationLine): number => computeLineAmount(l, totals.directCo);

  const chain = quotationChain(src.ceTotal, src.vatPct, src.agencyFeePct);

  // Phân bổ serviceSubtotal theo tỉ trọng CO của các dòng non-proxy KHÔNG-tài-trợ; dư làm tròn dồn
  // vào dòng lớn nhất → Σ dòng = serviceSubtotal TUYỆT ĐỐI. Dòng tài trợ nhận đơn giá would-be
  // (cùng hệ số) nhưng Thành tiền trống.
  const nonProxy: { line: QuotationLine; co: number }[] = [];
  const collect = (n: TreeNode) => {
    if (!n.effectiveProxy) for (const l of n.lines) nonProxy.push({ line: l, co: lineCo(l) });
    n.children.forEach(collect);
  };
  tree.forEach(collect);
  const chargeable = nonProxy.filter((x) => !x.line.isSponsored);
  const chargeableCo = chargeable.reduce((s, x) => s + x.co, 0);
  const factor = chargeableCo > 0 ? chain.serviceSubtotal / chargeableCo : 0;

  const clientTotals = new Map<QuotationLine, number>();
  if (mode === "client" && chargeable.length > 0) {
    let allocated = 0;
    for (const item of chargeable) {
      const tt = Math.round(item.co * factor);
      clientTotals.set(item.line, tt);
      allocated += tt;
    }
    const residual = chain.serviceSubtotal - allocated;
    if (residual !== 0) {
      const largest = chargeable.reduce((a, b) => ((clientTotals.get(a.line) ?? 0) >= (clientTotals.get(b.line) ?? 0) ? a : b));
      clientTotals.set(largest.line, (clientTotals.get(largest.line) ?? 0) + residual);
    }
  }

  const lineTotal = (l: QuotationLine, isProxy: boolean): number | null => {
    if (isProxy) return lineCo(l); // Chi hộ: khách trả đúng chi phí thực (+ phí dịch vụ ở dòng riêng)
    if (mode === "internal") return lineCo(l);
    if (l.isSponsored) return null; // TCM hỗ trợ — Thành tiền ĐỂ TRỐNG, không vào tổng
    return clientTotals.get(l) ?? 0;
  };
  // Đơn giá bản khách: dòng thường = TT/SL làm tròn; dòng tài trợ = giá would-be theo cùng hệ số.
  const lineUnitPrice = (l: QuotationLine, total: number | null): number | null => {
    if (l.lineType !== "QTY_PRICE" || l.quantity <= 0) return null;
    if (mode === "internal") return l.unitPrice;
    if (l.isSponsored) return Math.round((lineCo(l) * factor) / l.quantity);
    return total == null ? null : Math.round(total / l.quantity);
  };

  const rows: QuotationRow[] = [];
  const proxyRows: QuotationRow[] = [];
  let stt = 0;
  const subtreeTotal = (n: TreeNode): number => {
    let sum = n.lines.reduce((s, l) => s + (lineTotal(l, n.effectiveProxy) ?? 0), 0);
    for (const c of n.children) sum += subtreeTotal(c);
    return sum;
  };
  const walk = (n: TreeNode, depth: number, label: string, into: QuotationRow[]) => {
    into.push({ kind: "section", depth, label: `${label}. ${n.nameVi}`, subtotal: depth === 1 ? subtreeTotal(n) : null });
    for (const l of n.lines) {
      stt++;
      const total = lineTotal(l, n.effectiveProxy);
      const sponsoredNote = mode === "client" && l.isSponsored && !l.note ? SPONSORED_NOTE : null;
      into.push({
        kind: "line",
        depth,
        stt,
        itemCode: l.itemCode,
        name:
          l.itemName +
          (l.lineType === "PERCENT_OF_TOTAL" ? ` (${l.percentVal ?? 0}%)` : "") +
          (mode === "internal" && l.isSponsored ? " (TCM hỗ trợ)" : ""),
        specs: l.specs,
        unit: l.unit,
        qty: l.lineType === "QTY_PRICE" ? l.quantity : null,
        unitPrice: lineUnitPrice(l, total),
        total,
        taxLabel: mode === "internal" ? TAX_LABELS[l.taxType ?? ""] ?? null : null,
        note: sponsoredNote ?? l.note,
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
  // Footer bản khách = đúng chuỗi BM02; dòng cuối = ceTotal (số đã duyệt) TUYỆT ĐỐI.
  const footer: QuotationFooterRow[] =
    mode === "client"
      ? [
          { label: "TỔNG GIÁ TRỊ DỊCH VỤ/TOTAL SERVICE VALUE", amount: chain.serviceSubtotal, strong: true },
          { label: `PHÍ AGENCY/AGENCY FEES (${src.agencyFeePct}%)`, amount: chain.feeAmt, strong: true },
          { label: "TỔNG GIÁ TRỊ DỊCH VỤ", amount: chain.serviceSubtotal + chain.feeAmt, strong: true },
          { label: `Thuế GTGT (${src.vatPct}%)`, amount: chain.vatAmt, strong: true },
          { label: "TỔNG GIÁ TRỊ DỊCH VỤ (đã bao gồm thuế GTGT)", amount: src.ceTotal, strong: true },
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
          { label: `Trong đó phí agency ${src.agencyFeePct}% (trình bày báo giá)`, amount: chain.feeAmt },
          { label: `Margin ${margin.toFixed(2)}% (sàn ${src.minMarginPct}%)`, amount: null },
          ...(totals.chiHo > 0
            ? [
                { label: "Chi hộ (thực tế + phí dịch vụ)", amount: totals.chiHo },
                { label: "TỔNG THANH TOÁN KHÁCH", amount: clientBillableTotal(src.ceTotal, totals.chiHo), strong: true },
              ]
            : []),
        ];

  const d = src.now;
  const dateLabel = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  // Ngày sự kiện lưu UTC-midnight (HANDOVER §4.3) → format theo phần UTC để không lệch ngày.
  const fmtUtc = (x: Date) => `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`;
  const infoLeft: [string, string][] = [
    ["Dự án", src.projectName],
    ["Khách hàng", src.clientName],
    ...(src.picName ? ([["Nhân viên phụ trách", src.picName]] as [string, string][]) : []),
    ["Ngày báo giá", dateLabel],
  ];
  // Nhiều ngày → "Ngày bắt đầu/Ngày kết thúc" như form DHG; 1 ngày → một dòng "Ngày sự kiện".
  const start = src.eventStart;
  const end = src.eventEnd;
  const eventRows: [string, string][] =
    start && end && fmtUtc(start) !== fmtUtc(end)
      ? [
          ["Ngày bắt đầu", fmtUtc(start)],
          ["Ngày kết thúc", fmtUtc(end)],
        ]
      : start || end
        ? [["Ngày sự kiện", fmtUtc((start ?? end)!)]]
        : [];
  const infoRight: [string, string][] = [
    ["Mã dự án", src.projectCode],
    ...eventRows,
    ...(src.venue ? ([["Địa điểm", src.venue]] as [string, string][]) : []),
  ];

  return {
    mode,
    iso: mode === "client" ? { formNo: "BM02/QT.TCM.15", issuedDate: "01/06/2024", revision: "01/00", pages: "1" } : null,
    useLetterhead: mode === "client",
    companyFallbackName: src.company.legalNameVi,
    title: mode === "client" ? "BÁO GIÁ" : "BẢNG CHI PHÍ CO/CE (NỘI BỘ)",
    projectCode: src.projectCode,
    projectName: src.projectName,
    infoLeft,
    infoRight,
    columns:
      mode === "client"
        ? ["STT", "Hạng mục", "Mô tả", "Khối lượng", "Đơn vị", "Đơn giá", "Thành tiền", "Ghi chú"]
        : ["STT", "Mã", "Hạng mục", "Quy cách", "ĐVT", "SL", "Đơn giá (CO)", "Thành tiền (CO)", "Thuế", "Ghi chú"],
    rows,
    proxyRows,
    footer,
    terms:
      mode === "client"
        ? [
            `Báo giá trên đã bao gồm ${src.vatPct}% thuế GTGT.`,
            "Mọi chi phí ngoài báo giá trên sẽ được tính là chi phí phát sinh.",
            "Thanh toán theo hợp đồng kinh tế bởi 2 bên.",
            "Trân trọng cảm ơn!",
          ]
        : ["Bản nội bộ — KHÔNG gửi khách hàng. Thành tiền là CO đã gross-up thuế (TNCN ÷0,9 · TNDN ÷0,8)."],
    marginOverrideNote: mode === "internal" ? src.marginOverrideNote : null,
    signature:
      mode === "client"
        ? [{ company: src.company.legalNameVi, name: src.company.signerName, title: src.company.signerTitle }]
        : [
            { company: null, name: "", title: "NGƯỜI LẬP" },
            { company: null, name: "", title: "NGƯỜI DUYỆT" },
          ],
  };
}
