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
  computeCeAggregates,
  computeLineAmount,
  computeMarginPct,
  ceRowsOf,
  flattenSectionTree,
  sheetHasLineCe,
  type CeSectionInput,
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
      /**
       * CE-3 — khoá khớp khi khách trả file về (CE-4 đọc lại). Đi vào một CỘT ẨN của bản Excel gửi
       * khách; hàng gộp mang khoá của dòng ĐẠI DIỆN. Không hiện trên trang in, không vào tổng nào.
       */
      stableKey?: string | null;
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
  /**
   * CE-3 — mỗi mục LAYER 1 dịch vụ một khối, để xuất Excel bố cục NHIỀU SHEET (mỗi mục một sheet +
   * sheet TỔNG HỢP). Bố cục một sheet vẫn dùng `rows`; hai đường đọc cùng một nguồn số.
   */
  l1Blocks: { label: string; rows: QuotationRow[]; subtotal: number }[];
  /** Mục L1 dịch vụ chưa áp phí quản lý — route xuất chặn và kể tên (chỉ có ở chế độ CE theo dòng). */
  missingFeeSections: string[];
  /** Bảng đang ở chế độ CE THEO DÒNG (giá khách lấy thẳng từ dòng, không phân bổ). */
  lineCeMode: boolean;
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
  /** K3 — khoá GỘP cặp dòng (kho + mua bù) khi in báo giá khách. */
  stockResvLineId?: string | null;
  /** K3 — đơn giá tham chiếu hàng lấy từ kho; > 0 = dòng kho, dùng làm TRỌNG SỐ chia tiền khách. */
  stockRefUnitPrice?: number | null;
  /** CO/CE v3 — giá CE theo dòng; khác null trên MỌI hàng dịch vụ = bảng ở chế độ CE theo dòng. */
  ceQuantity?: number | null;
  ceUnitPrice?: number | null;
  ceGroupKey?: string | null;
  ceName?: string | null;
  /** Khoá bền của dòng — vào cột ẩn bản Excel gửi khách để CE-4 khớp lại khi khách trả file. */
  stableKey?: string | null;
};

export type QuotationSection = {
  id: string;
  parentSectionId: string | null;
  nameVi: string;
  sort: number;
  isProxy: boolean;
  proxyFeeType: string | null;
  proxyFeeVal: number | null;
  /** CO/CE v3 — phí quản lý BÁO KHÁCH của mục L1 (null = chưa áp → chặn xuất ở chế độ CE theo dòng). */
  clientFeePct?: number | null;
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

  /**
   * TRỌNG SỐ chia tiền khách (K3) = CO thật + giá tham chiếu của hàng LẤY TỪ KHO.
   *
   * Hàng lấy từ kho có CO = 0 (đã trả tiền ở hợp đồng trước) nhưng khách VẪN mua hạng mục đó, nên
   * nếu chia theo CO thuần thì cặp dòng chỉ được trả tiền cho phần mua bù → đơn giá in ra thấp giả
   * tạo. Trọng số này CHỈ chia phần của `serviceSubtotal` đã chốt; KHÔNG vào coTotal/ceTotal/margin.
   * Dòng cũ có `stockRefUnitPrice` null → trọng số ≡ lineCo, bản xuất không đổi một đồng nào.
   */
  const lineWeight = (l: QuotationLine): number =>
    lineCo(l) + (l.stockRefUnitPrice ? Math.round(l.quantity * l.stockRefUnitPrice) : 0);

  const chain = quotationChain(src.ceTotal, src.vatPct, src.agencyFeePct);

  // ── CO/CE v3 — NHÁNH KÉP ────────────────────────────────────────────────────────────────────
  // Bảng chế độ CE THEO DÒNG: giá khách lấy THẲNG từ dòng (ceQuantity × ceUnitPrice), KHÔNG suy
  // ngược từ ceTotal rồi phân bổ. Bảng cũ giữ nguyên 100% đường phân bổ BM02 ở dưới.
  const serviceLinesFlat: QuotationLine[] = [];
  const collectService = (n: TreeNode) => {
    if (!n.effectiveProxy) serviceLinesFlat.push(...n.lines);
    n.children.forEach(collectService);
  };
  tree.forEach(collectService);
  const lineCeMode = mode === "client" && sheetHasLineCe(serviceLinesFlat);
  const ceSections: CeSectionInput[] = src.sections.map((s) => ({
    key: s.id,
    parentKey: s.parentSectionId,
    isProxy: s.isProxy,
    clientFeePct: s.clientFeePct,
    lines: s.lines,
  }));
  const ceAgg = lineCeMode ? computeCeAggregates(ceSections, src.vatPct, totals.coTotal) : null;
  const sectionNameById = new Map(src.sections.map((s) => [s.id, s.nameVi]));

  // Phân bổ serviceSubtotal theo tỉ trọng CO của các dòng non-proxy KHÔNG-tài-trợ; dư làm tròn dồn
  // vào dòng lớn nhất → Σ dòng = serviceSubtotal TUYỆT ĐỐI. Dòng tài trợ nhận đơn giá would-be
  // (cùng hệ số) nhưng Thành tiền trống.
  const nonProxy: { line: QuotationLine; co: number }[] = [];
  const collect = (n: TreeNode) => {
    if (!n.effectiveProxy) for (const l of n.lines) nonProxy.push({ line: l, co: lineWeight(l) });
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
  /** Tiền của một mục (không tính mục con) — chế độ CE theo dòng đọc thẳng CE, còn lại theo lineTotal. */
  const ownTotal = (n: TreeNode): number =>
    lineCeMode && !n.effectiveProxy
      ? ceRowsOf(n.lines, totals.directCo).reduce((s, r) => s + r.ceAmount, 0)
      : n.lines.reduce((s, l) => s + (lineTotal(l, n.effectiveProxy) ?? 0), 0);
  const subtreeTotal = (n: TreeNode): number => {
    let sum = ownTotal(n);
    for (const c of n.children) sum += subtreeTotal(c);
    return sum;
  };
  /**
   * Gộp CẶP "hàng lấy từ kho + hàng mua bù" thành MỘT dòng khách nhìn (K3) — khách chỉ thấy tổng
   * số lượng và đơn giá đã make-up, không thấy dòng 0 đồng. Chỉ gộp ở bản KHÁCH, trong CÙNG một
   * hạng mục, và chỉ dòng QTY_PRICE không tài trợ. Bản nội bộ giữ nguyên 2 dòng để kế toán đối chiếu.
   */
  const groupLines = (lines: QuotationLine[]): QuotationLine[][] => {
    if (mode !== "client") return lines.map((l) => [l]);
    const out: QuotationLine[][] = [];
    const at = new Map<string, number>();
    for (const l of lines) {
      const k = l.stockResvLineId;
      if (!k || l.lineType !== "QTY_PRICE" || l.isSponsored) {
        out.push([l]);
        continue;
      }
      const i = at.get(k);
      if (i == null) {
        at.set(k, out.length);
        out.push([l]);
      } else {
        out[i].push(l);
      }
    }
    return out;
  };

  const walk = (n: TreeNode, depth: number, label: string, into: QuotationRow[]) => {
    into.push({ kind: "section", depth, label: `${label}. ${n.nameVi}`, subtotal: depth === 1 ? subtreeTotal(n) : null });
    // Chế độ CE THEO DÒNG: mỗi hàng CE (đã gộp theo ceGroupKey / cặp kho) = MỘT dòng khách nhìn,
    // số lấy thẳng từ dòng. Không đụng nhánh phân bổ bên dưới.
    if (lineCeMode && !n.effectiveProxy) {
      for (const r of ceRowsOf(n.lines, totals.directCo)) {
        stt++;
        const l = r.leader;
        into.push({
          kind: "line",
          depth,
          stt,
          itemCode: l.itemCode,
          name: r.ceName,
          specs: l.specs,
          unit: l.unit,
          qty: r.ceQuantity || null,
          unitPrice: r.ceUnitPrice,
          total: l.isSponsored ? null : r.ceAmount,
          taxLabel: null,
          note: l.isSponsored && !l.note ? SPONSORED_NOTE : l.note,
          stableKey: l.stableKey ?? null,
        });
      }
      n.children.forEach((c, i) => walk(c, depth + 1, `${label}.${i + 1}`, into));
      return;
    }
    for (const g of groupLines(n.lines)) {
      const l = g[0];
      stt++;
      const total = lineTotal(l, n.effectiveProxy);
      const sponsoredNote = mode === "client" && l.isSponsored && !l.note ? SPONSORED_NOTE : null;
      if (g.length > 1) {
        // CỘNG các số ĐÃ phân bổ của từng dòng — tuyệt đối không gộp CO rồi chia lại (sẽ lệch
        // residual). Tổng in ra vì thế vẫn đúng bằng serviceSubtotal.
        const qty = g.reduce((s, m) => s + m.quantity, 0);
        const merged = g.reduce((s, m) => s + (lineTotal(m, n.effectiveProxy) ?? 0), 0);
        into.push({
          kind: "line",
          depth,
          stt,
          itemCode: l.itemCode,
          name: l.itemName,
          specs: l.specs,
          unit: l.unit,
          qty,
          unitPrice: qty > 0 ? Math.round(merged / qty) : null,
          total: merged,
          taxLabel: null,
          note: l.note,
          stableKey: l.stableKey ?? null,
        });
        continue;
      }
      into.push({
        kind: "line",
        depth,
        stt,
        itemCode: l.itemCode,
        name:
          l.itemName +
          (l.lineType === "PERCENT_OF_TOTAL" ? ` (${l.percentVal ?? 0}%)` : "") +
          (mode === "internal" && l.isSponsored ? " (TCM hỗ trợ)" : "") +
          (mode === "internal" && l.stockRefUnitPrice != null ? " (lấy từ kho)" : ""),
        specs: l.specs,
        unit: l.unit,
        qty: l.lineType === "QTY_PRICE" ? l.quantity : null,
        unitPrice: lineUnitPrice(l, total),
        total,
        taxLabel: mode === "internal" ? TAX_LABELS[l.taxType ?? ""] ?? null : null,
        note: sponsoredNote ?? l.note,
        stableKey: l.stableKey ?? null,
      });
    }
    n.children.forEach((c, i) => walk(c, depth + 1, `${label}.${i + 1}`, into));
  };
  let topIdx = 0;
  let proxyTopIdx = 0;
  const l1Blocks: QuotationModel["l1Blocks"] = [];
  for (const root of tree) {
    if (root.effectiveProxy) {
      proxyTopIdx++;
      walk(root, 1, roman(proxyTopIdx), proxyRows);
    } else {
      topIdx++;
      // Mỗi mục L1 dựng thêm vào khối riêng (bố cục nhiều sheet) — CÙNG một lượt walk để hai bố
      // cục không bao giờ lệch số; `rows` vẫn là bản phẳng cho bố cục một sheet.
      const before = rows.length;
      walk(root, 1, roman(topIdx), rows);
      l1Blocks.push({ label: `${roman(topIdx)}. ${root.nameVi}`, rows: rows.slice(before), subtotal: subtreeTotal(root) });
    }
  }

  const margin = computeMarginPct(src.ceTotal, totals.coTotal);
  // Footer bản khách = đúng chuỗi BM02; dòng cuối = ceTotal (số đã duyệt) TUYỆT ĐỐI.
  // Chế độ CE THEO DÒNG: chuỗi footer dựng từ CHÍNH các dòng (Σ CE → các dòng phí gộp theo mức →
  // trước VAT → VAT → tổng), KHÔNG suy ngược từ ceTotal. Phí tách theo mức % để khách đọc được
  // mục nào chịu mức nào — đúng yêu cầu vòng 5.
  const feeRowsByRate: QuotationFooterRow[] = [];
  if (ceAgg) {
    const byRate = new Map<number, { amount: number; labels: string[] }>();
    src.sections.forEach((s) => {
      if (s.parentSectionId || s.isProxy || s.clientFeePct == null) return;
      const amt = ceAgg.feeBySection.get(s.id) ?? 0;
      const cur = byRate.get(s.clientFeePct) ?? { amount: 0, labels: [] };
      cur.amount += amt;
      cur.labels.push(sectionNameById.get(s.id) ?? "");
      byRate.set(s.clientFeePct, cur);
    });
    for (const [rate, v] of [...byRate.entries()].sort((a, b) => b[0] - a[0])) {
      feeRowsByRate.push({ label: `PHÍ QUẢN LÝ DỰ ÁN (${rate}%)`, amount: v.amount, strong: true });
    }
  }
  const footer: QuotationFooterRow[] =
    ceAgg
      ? [
          { label: "TỔNG GIÁ TRỊ DỊCH VỤ/TOTAL SERVICE VALUE", amount: ceAgg.ceService, strong: true },
          ...feeRowsByRate,
          { label: "TỔNG GIÁ TRỊ DỊCH VỤ", amount: ceAgg.cePreVat, strong: true },
          { label: `Thuế GTGT (${src.vatPct}%)`, amount: ceAgg.ceTotalDerived - ceAgg.cePreVat, strong: true },
          { label: "TỔNG GIÁ TRỊ DỊCH VỤ (đã bao gồm thuế GTGT)", amount: ceAgg.ceTotalDerived, strong: true },
          ...(totals.chiHo > 0
            ? [
                { label: "Chi phí chi hộ (theo thực tế)", amount: totals.proxySubtotal },
                { label: "Phí dịch vụ chi hộ", amount: totals.proxyFeeAmt },
                { label: "TỔNG THANH TOÁN", amount: clientBillableTotal(ceAgg.ceTotalDerived, totals.chiHo), strong: true },
              ]
            : []),
        ]
      : mode === "client"
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
    l1Blocks,
    missingFeeSections: (ceAgg?.missingFeeSectionKeys ?? []).map((k) => sectionNameById.get(k) ?? k),
    lineCeMode,
    signature:
      mode === "client"
        ? [{ company: src.company.legalNameVi, name: src.company.signerName, title: src.company.signerTitle }]
        : [
            { company: null, name: "", title: "NGƯỜI LẬP" },
            { company: null, name: "", title: "NGƯỜI DUYỆT" },
          ],
  };
}
