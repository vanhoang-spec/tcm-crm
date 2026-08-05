// Hàm thuần (pure) cho nghiệp vụ CO/CE — dùng chung cho UI (realtime) và server action.
// Tiền tính bằng Number (VND < 2^53 nên an toàn tuyệt đối); lưu DB dạng BigInt.

/** Code cố định của 8 trạng thái dự án — nhãn hiển thị lấy từ option_set "project_status" (Settings). */
export const PROJECT_STATUS_CODES = [
  "BIDDING",
  "PENDING",
  "PROCESSING",
  "LIQUIDATION",
  "FINISHED",
  "FAILED",
  "CANCELED",
  "HANDOVER",
] as const;
export type ProjectStatusCode = (typeof PROJECT_STATUS_CODES)[number];

export const LINE_TYPES = ["QTY_PRICE", "FIXED", "PERCENT_OF_TOTAL"] as const;
export type LineType = (typeof LINE_TYPES)[number];

/**
 * Loại thuế trên MỖI dòng chi phí — quyết định gross-up lên CO:
 *  - VAT   : VAT đầu vào được khấu trừ → KHÔNG cộng vào CO (giữ số trước thuế). Hệ số 1.
 *  - TNCN  : thuê CTV ngoài, thuế TNCN 10% trên số net → gross-up = số / (1 − 10%) = / 0,9.
 *  - TNDN  : item thiếu chứng từ, chịu TNDN 20% → gross-up = số / (1 − 20%) = / 0,8.
 *  - OTHER : loại thuế/phụ thu khác không khớp 2 công thức trên (vd phụ thu thẳng %, hoặc số đã
 *            chốt sẵn từ nguồn ngoài) — KHÔNG tự gross-up, cộng thẳng `customTaxAmount` (nhập tay)
 *            vào base của dòng. Xem computeAmount/computeLineAmount.
 * (Mức 10%/20% là mức luật, để hằng số; nếu luật đổi chuyển sang Settings sau — thay đúng chỗ này.)
 */
export const TAX_TYPES = ["VAT", "TNCN", "TNDN", "OTHER"] as const;
export type TaxType = (typeof TAX_TYPES)[number];
export const TAX_GROSSUP: Record<string, number> = { VAT: 1, TNCN: 1 / 0.9, TNDN: 1 / 0.8 };
/** Hệ số gross-up thuế của 1 dòng (mặc định VAT = 1 nếu thiếu/không hợp lệ; OTHER không dùng hệ số này). */
export function taxGrossUp(taxType: string | null | undefined): number {
  return TAX_GROSSUP[taxType ?? "VAT"] ?? 1;
}

/**
 * LOF-V1 — VAI TRÒ của một bản snapshot trong hồ sơ gửi khách.
 *
 * `CostSheetRevision.kind = null` (đa số) = bản làm việc nội bộ. Ba giá trị dưới đây đánh dấu ba
 * cột mốc mà khách nhìn thấy; bản xuất nghiệm thu cần biết "so CONTRACT với ACCEPTANCE" chứ không
 * đoán từ `note` tự do. Một bảng ĐƯỢC PHÉP có nhiều bản cùng kind (hợp đồng điều chỉnh, nghiệm thu
 * bổ sung) — nơi dùng tự chọn bản mới nhất.
 */
export const REVISION_KINDS = ["QUOTE", "CONTRACT", "ACCEPTANCE"] as const;
export type RevisionKind = (typeof REVISION_KINDS)[number];
export function isRevisionKind(v: string | null | undefined): v is RevisionKind {
  return REVISION_KINDS.includes(v as RevisionKind);
}

/** Phòng ban nhận Order (department code → tên hiển thị trong notification, luôn tiếng Việt).
 *  5 phòng ở Bidding + HR/IT bổ sung cho ORDER tự sinh từ Master Timeline (dự án lớn). */
export const ORDER_DEPARTMENT_LABELS: Record<string, string> = {
  PLANNING: "Planning",
  CREATIVE: "Creative",
  PCC: "Purchasing",
  OPE: "Operation",
  PRO: "Production",
  HR: "HR",
  IT: "IT",
};

export type CostLineInput = {
  quantity: number;
  unitPrice: number;
  isLocked: boolean;
  maxMarkupPct: number | null;
  taxType?: string;
  customTaxAmount?: number | null;
};

/**
 * Số tiền 1 dòng QTY_PRICE. taxType=OTHER: base + customTaxAmount (nhập tay, không gross-up %).
 * Còn lại: base × hệ số gross-up (VAT/TNCN/TNDN). Base có thể âm (dòng giảm tiền/khoản trừ).
 */
export function computeAmount(quantity: number, unitPrice: number, taxType?: string, customTaxAmount?: number | null): number {
  const base = quantity * unitPrice;
  if (taxType === "OTHER") return Math.round(base + (customTaxAmount ?? 0));
  return Math.round(base * taxGrossUp(taxType));
}

export function computeCoTotal(
  lines: { quantity: number; unitPrice: number; taxType?: string; customTaxAmount?: number | null }[],
): number {
  return lines.reduce((sum, l) => sum + computeAmount(l.quantity, l.unitPrice, l.taxType, l.customTaxAmount), 0);
}

/** margin = (CE − CO) / CE. Chi hộ tách riêng, KHÔNG tính vào đây. Trả về % (0-100). */
export function computeMarginPct(ceTotal: number, coTotal: number): number {
  if (ceTotal <= 0) return 0;
  return ((ceTotal - coTotal) / ceTotal) * 100;
}

/**
 * SỐ TIỀN XUẤT HÓA ĐƠN CHO KHÁCH của một bảng CO/CE = CE + Chi hộ.
 *
 * CE là giá chào đã gồm VAT; Chi hộ nằm NGOÀI margin nên không bao giờ được cộng vào
 * ceTotal/coTotal (bất biến #2, #3) — cộng riêng ở đây. Đây là định nghĩa DUY NHẤT của con số
 * "khách phải trả": builder CO/CE hiển thị nó, và tab Nghiệm thu dùng nó làm trần xuất hóa đơn.
 */
export function clientBillableTotal(ceTotal: number, chiHo: number): number {
  return ceTotal + chiHo;
}

/**
 * Make-up engine: từ các dòng CO markup-eligible (QTY_PRICE/FIXED, KHÔNG thuộc hạng mục Chi hộ,
 * caller phải lọc trước — dòng PERCENT_OF_TOTAL và toàn bộ hạng mục Chi hộ loại khỏi markup),
 * đề xuất tổng CE để đạt margin tối thiểu.
 * - Line `isLocked` → giữ nguyên CO (markup 0).
 * - Line có `maxMarkupPct` → markup không vượt trần đó.
 * - Phần còn lại markup đều để đạt CE mục tiêu = CO / (1 − minMargin).
 * Nếu trần khiến không đạt mục tiêu → `reachedTarget=false` (user chỉnh tay).
 */
export function computeMakeupCe(
  lines: CostLineInput[],
  minMarginPct: number,
): { suggestedCe: number; reachedTarget: boolean } {
  const coTotal = computeCoTotal(lines);
  if (coTotal <= 0) return { suggestedCe: 0, reachedTarget: true };

  const m = Math.min(Math.max(minMarginPct, 0), 99) / 100;
  const targetCe = Math.round(coTotal / (1 - m));

  const lockedCo = lines
    .filter((l) => l.isLocked)
    .reduce((s, l) => s + computeAmount(l.quantity, l.unitPrice, l.taxType, l.customTaxAmount), 0);
  const markupableCo = coTotal - lockedCo;
  if (markupableCo <= 0) return { suggestedCe: coTotal, reachedTarget: false };

  const uniformMarkup = (targetCe - coTotal) / markupableCo; // fraction

  let ce = lockedCo;
  for (const l of lines) {
    if (l.isLocked) continue;
    const co = computeAmount(l.quantity, l.unitPrice, l.taxType, l.customTaxAmount);
    const cap = l.maxMarkupPct != null ? l.maxMarkupPct / 100 : Infinity;
    const applied = Math.min(uniformMarkup, cap);
    ce += co * (1 + applied);
  }
  const suggestedCe = Math.round(ce);
  return { suggestedCe, reachedTarget: suggestedCe >= targetCe - 1 };
}

// ─────────────────────────────────────────────────────────
// CO/CE — công thức tổng theo section (xem BATCH plan: mgmt fee/contingency/proxy/percent lines)
// ─────────────────────────────────────────────────────────

export type CostLineCalcInput = {
  lineType: string;
  quantity: number;
  unitPrice: number;
  fixedAmount: number | null;
  percentVal: number | null;
  taxType?: string;
  customTaxAmount?: number | null;
};

/**
 * Số tiền 1 dòng (CO, đã gross-up thuế) — percentBase dùng cho dòng PERCENT_OF_TOTAL (= directCo).
 * QTY_PRICE/FIXED gross-up theo taxType (OTHER: cộng thẳng customTaxAmount, không gross-up %);
 * PERCENT_OF_TOTAL là dòng suy ra (dự phòng/…) → không gross-up, không nhận customTaxAmount.
 */
export function computeLineAmount(line: CostLineCalcInput, percentBase: number): number {
  if (line.lineType === "FIXED") {
    const base = line.fixedAmount ?? 0;
    if (line.taxType === "OTHER") return Math.round(base + (line.customTaxAmount ?? 0));
    return Math.round(base * taxGrossUp(line.taxType));
  }
  if (line.lineType === "PERCENT_OF_TOTAL") return Math.round(((line.percentVal ?? 0) / 100) * percentBase);
  return computeAmount(line.quantity, line.unitPrice, line.taxType, line.customTaxAmount); // QTY_PRICE (default)
}

export type SectionCalcInput = {
  isProxy: boolean;
  proxyFeeType?: string | null;
  proxyFeeVal?: number | null;
  lines: CostLineCalcInput[];
};

/** Nút cây hạng mục N-cấp (Mục → Nhóm → Sub-nhóm → ...) — dùng để làm phẳng trước khi tính tổng. */
export type SectionTreeNode = {
  key: string;
  parentKey: string | null;
  isProxy: boolean;
  proxyFeeType: string | null;
  proxyFeeVal: number | null;
  lines: CostLineCalcInput[];
};

export const MAX_SECTION_DEPTH = 4;

/** Cấp (1-based) của 1 node trong cây, tính từ số tổ tiên. Trả -1 nếu phát hiện vòng lặp (an toàn, không loop vô hạn). */
export function sectionDepth(key: string, byKey: Map<string, SectionTreeNode>): number {
  let depth = 1;
  let cur = byKey.get(key);
  const seen = new Set<string>([key]);
  while (cur?.parentKey) {
    if (seen.has(cur.parentKey)) return -1; // vòng lặp
    seen.add(cur.parentKey);
    cur = byKey.get(cur.parentKey);
    depth++;
    if (depth > 100) return -1; // chặn an toàn, không phải giới hạn nghiệp vụ
  }
  return depth;
}

/**
 * Làm phẳng cây section N-cấp thành danh sách "logical sections" cho computeCostSheetTotals —
 * mỗi node giữ nguyên dòng chi phí TRỰC TIẾP của nó (không gồm dòng của node con); isProxy được
 * SUY RA (kế thừa) từ tổ tiên gần nhất có isProxy=true, để cả nhánh con nằm dưới 1 mục Chi hộ đều
 * gộp đúng vào Chi hộ dù bản thân node đó không tự đánh dấu. Chỉ node TỰ đánh dấu isProxy mới mang
 * proxyFeeType/proxyFeeVal — các node con kế thừa chỉ để gộp subtotal, không nhân đôi phí dịch vụ.
 */
export function flattenSectionTree(nodes: SectionTreeNode[]): SectionCalcInput[] {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  function effectiveIsProxy(n: SectionTreeNode): boolean {
    let cur: SectionTreeNode | undefined = n;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.key)) {
      if (cur.isProxy) return true;
      seen.add(cur.key);
      cur = cur.parentKey ? byKey.get(cur.parentKey) : undefined;
    }
    return false;
  }
  return nodes.map((n) => ({
    isProxy: effectiveIsProxy(n),
    proxyFeeType: n.isProxy ? n.proxyFeeType : null,
    proxyFeeVal: n.isProxy ? n.proxyFeeVal : null,
    lines: n.lines,
  }));
}

export type CostSheetTotals = {
  directCo: number;
  percentLinesTotal: number;
  adjustedCoSubtotal: number;
  mgmtFeeAmt: number;
  contingencyAmt: number;
  coTotal: number;
  proxySubtotal: number;
  proxyFeeAmt: number;
  chiHo: number;
};

/**
 * Tính toàn bộ tổng CO/Chi hộ từ danh sách hạng mục (đã tách sẵn hạng mục Chi hộ qua `isProxy`).
 * 1. directCo = Σ dòng QTY_PRICE+FIXED (mọi hạng mục thường).
 * 2. percentLinesTotal = Σ dòng PERCENT_OF_TOTAL, tính trên directCo (không đệ quy).
 * 3. adjustedCoSubtotal = directCo + percentLinesTotal.
 * 4. mgmtFeeAmt/contingencyAmt = % trên adjustedCoSubtotal.
 * 5. coTotal = adjustedCoSubtotal + mgmtFeeAmt + contingencyAmt.
 * 6. Hạng mục Chi hộ: chỉ QTY_PRICE/FIXED (không cho PERCENT_OF_TOTAL) → proxySubtotal + phí dịch vụ = chiHo.
 */
export function computeCostSheetTotals(
  sections: SectionCalcInput[],
  mgmtFeePct: number,
  contingencyPct: number,
): CostSheetTotals {
  const normalSections = sections.filter((s) => !s.isProxy);
  const proxySections = sections.filter((s) => s.isProxy);

  const directCo = normalSections
    .flatMap((s) => s.lines)
    .filter((l) => l.lineType !== "PERCENT_OF_TOTAL")
    .reduce((sum, l) => sum + computeLineAmount(l, 0), 0);

  const percentLinesTotal = normalSections
    .flatMap((s) => s.lines)
    .filter((l) => l.lineType === "PERCENT_OF_TOTAL")
    .reduce((sum, l) => sum + computeLineAmount(l, directCo), 0);

  const adjustedCoSubtotal = directCo + percentLinesTotal;
  const mgmtFeeAmt = Math.round((adjustedCoSubtotal * mgmtFeePct) / 100);
  const contingencyAmt = Math.round((adjustedCoSubtotal * contingencyPct) / 100);
  const coTotal = adjustedCoSubtotal + mgmtFeeAmt + contingencyAmt;

  const proxySubtotal = proxySections
    .flatMap((s) => s.lines)
    .filter((l) => l.lineType !== "PERCENT_OF_TOTAL")
    .reduce((sum, l) => sum + computeLineAmount(l, 0), 0);
  // Ưu tiên node TỰ đánh dấu isProxy (mang phí dịch vụ thật) — quan trọng khi cây bị làm phẳng
  // (flattenSectionTree), lúc đó node con kế thừa isProxy nhưng proxyFeeType=null, không được chọn nhầm.
  const proxySection = proxySections.find((s) => s.proxyFeeType != null) ?? proxySections[0];
  const proxyFeeAmt = !proxySection
    ? 0
    : proxySection.proxyFeeType === "FIXED"
      ? Math.round(proxySection.proxyFeeVal ?? 0)
      : Math.round((proxySubtotal * (proxySection.proxyFeeVal ?? 0)) / 100);
  const chiHo = proxySubtotal + proxyFeeAmt;

  return { directCo, percentLinesTotal, adjustedCoSubtotal, mgmtFeeAmt, contingencyAmt, coTotal, proxySubtotal, proxyFeeAmt, chiHo };
}

/**
 * SỐ TIỀN THỰC TRẢ của 1 dòng — trần cho mọi khoản chi ra (thanh toán NCC + cả 2 loại tạm ứng).
 *
 * KHÁC `computeLineAmount`: hàm kia trả CO đã gross-up thuế, tức số ghi nhận GIÁ VỐN. Phần
 * gross-up (TNCN ÷0,9 · TNDN ÷0,8 · OTHER cộng customTaxAmount) là thuế công ty nộp hộ, KHÔNG
 * phải tiền trao cho NCC/nhân viên. Lấy CO làm trần chi sẽ cho chi vượt đúng bằng phần thuế đó
 * — trên T013 là 70.250.002đ (32 dòng TNCN).
 *
 * VAT giữ nguyên: VAT đầu vào được khấu trừ nên CO đã là số trước thuế, không có gì để bóc.
 * PERCENT_OF_TOTAL là dòng suy ra, không gross-up → net = chính nó.
 */
export function computeLineNetAmount(line: CostLineCalcInput, percentBase: number): number {
  if (line.lineType === "FIXED") return Math.round(line.fixedAmount ?? 0);
  if (line.lineType === "PERCENT_OF_TOTAL") return Math.round(((line.percentVal ?? 0) / 100) * percentBase);
  return Math.round(line.quantity * line.unitPrice);
}

// ─────────────────────────────────────────────────────────
// CO/CE v3 (CE-1) — CE theo dòng · gộp nhóm CE · %VAT theo dòng · phí quản lý theo mục L1.
// MỌI đại lượng mới sống ở đây (bất biến "không hệ tổng song song"); server luôn tính lại khi lưu.
// ─────────────────────────────────────────────────────────

/** Hai mức %VAT hợp lệ theo luật hiện hành — đổi luật thì sửa đúng chỗ này. */
export const VAT_PCT_OPTIONS = [8, 10] as const;

export type CeLineCalcInput = CostLineCalcInput & {
  ceQuantity?: number | null;
  ceUnitPrice?: number | null;
  ceGroupKey?: string | null;
  ceName?: string | null;
  vatPct?: number | null;
  isSponsored?: boolean;
  itemName?: string;
  stockRefUnitPrice?: number | null;
  stockResvLineId?: string | null;
};

/**
 * TRẦN CHI hiệu lực của 1 dòng — dòng VAT đã chọn % thì số phải trả NCC GỒM VAT (net × (1+%/100));
 * còn lại giữ nguyên net (PIT/CIT/OTHER: phần gross-up là thuế nộp hộ; VAT chưa chọn % giữ trần cũ
 * theo quyết định Q4 05/08/2026 — an toàn tiền hơn là tự nở hàng loạt).
 */
export function payCapFor(line: CeLineCalcInput, percentBase: number): number {
  const net = computeLineNetAmount(line, percentBase);
  if ((line.taxType ?? "VAT") === "VAT" && line.vatPct != null && line.vatPct > 0) {
    return Math.round(net * (1 + line.vatPct / 100));
  }
  return net;
}

/** Tiền THUẾ hiển thị của 1 dòng (suy lúc đọc, không lưu): VAT theo %, còn lại = amount − net. */
export function taxDisplayAmount(line: CeLineCalcInput, percentBase: number): number {
  const net = computeLineNetAmount(line, percentBase);
  if ((line.taxType ?? "VAT") === "VAT") {
    return line.vatPct != null ? Math.round((net * line.vatPct) / 100) : 0;
  }
  return computeLineAmount(line, percentBase) - net;
}

/** Một dòng CE khách nhìn — có thể là 1 dòng CO đơn lẻ hoặc N dòng CO gộp qua ceGroupKey. */
export type CeRow<L extends CeLineCalcInput> = {
  /** Dòng đại diện (dòng đầu theo thứ tự truyền vào) — mang ceName/ceQuantity/ceUnitPrice. */
  leader: L;
  coLines: L[];
  ceName: string;
  ceQuantity: number;
  ceUnitPrice: number | null;
  /** CE của hàng = ceQuantity × ceUnitPrice; dòng tài trợ (leader.isSponsored) = 0 như nếp BM02. */
  ceAmount: number;
  /** Σ CO (đã gross-up) của cả nhóm — mẫu đối chiếu margin hàng. */
  coSum: number;
};

/**
 * GỘP dòng CO thành các hàng CE khách nhìn, theo `ceGroupKey` (mirror nếp cặp kho K3 in gộp).
 * Dòng không có khoá → hàng 1-1. Thứ tự hàng theo lần xuất hiện đầu tiên của nhóm.
 *
 * CẶP KHO K3 TỰ GỘP theo `stockResvLineId` mà KHÔNG cần ceGroupKey: validator CẤM đặt ceGroupKey
 * lên dòng kho (cặp là nhóm CÓ SẴN, không cho trộn thêm dòng khác), nhưng bất biến K3 "khách chỉ
 * nhìn thấy MỘT dòng" vẫn phải giữ ở chế độ CE theo dòng — nên khoá nhóm hiệu lực suy từ chính cặp.
 */
export function ceRowsOf<L extends CeLineCalcInput>(lines: L[], percentBase: number): CeRow<L>[] {
  const rows: CeRow<L>[] = [];
  const byGroup = new Map<string, CeRow<L>>();
  for (const l of lines) {
    const key = l.ceGroupKey ?? (l.stockResvLineId ? `stock:${l.stockResvLineId}` : null);
    if (key && byGroup.has(key)) {
      const row = byGroup.get(key)!;
      row.coLines.push(l);
      row.coSum += computeLineAmount(l, percentBase);
      continue;
    }
    const ceQuantity = l.ceQuantity ?? 0;
    const ceUnitPrice = l.ceUnitPrice ?? null;
    const row: CeRow<L> = {
      leader: l,
      coLines: [l],
      ceName: (l.ceName ?? l.itemName ?? "").trim() || (l.itemName ?? ""),
      ceQuantity,
      ceUnitPrice,
      ceAmount: l.isSponsored ? 0 : Math.round(ceQuantity * (ceUnitPrice ?? 0)),
      coSum: computeLineAmount(l, percentBase),
    };
    rows.push(row);
    if (key) byGroup.set(key, row);
  }
  return rows;
}

/**
 * Bảng đã ở CHẾ ĐỘ CE THEO DÒNG chưa — mọi hàng CE ngoài Chi hộ có đơn giá CE.
 * (Nhận diện bằng dữ liệu, không có cột cờ; bảng cũ → false → giữ nguyên đường phân bổ BM02.)
 */
export function sheetHasLineCe(serviceLines: CeLineCalcInput[]): boolean {
  if (serviceLines.length === 0) return false;
  return ceRowsOf(serviceLines, 0).every((r) => r.ceUnitPrice != null);
}

/**
 * Xoá dòng ĐẠI DIỆN của một nhóm CE gộp → trả về VỊ TRÍ dòng kế thừa (dòng cùng nhóm đứng ngay sau),
 * để nơi gọi chuyển ceName/ceQuantity/ceUnitPrice sang nó. Trả null khi dòng bị xoá không phải đại
 * diện, hoặc nhóm chỉ còn một dòng.
 *
 * Không có bước này thì nhóm còn lại MẤT TRẮNG giá CE (các dòng thành viên đều để trống ceUnitPrice)
 * — bảng rơi khỏi chế độ CE theo dòng trong im lặng và tổng báo khách tụt đúng phần của nhóm đó.
 */
export function ceGroupHeirIndex(lines: { ceGroupKey?: string | null }[], removedIndex: number): number | null {
  const dead = lines[removedIndex];
  if (!dead?.ceGroupKey) return null;
  const members = lines.map((l, i) => ({ l, i })).filter((x) => x.l.ceGroupKey === dead.ceGroupKey);
  if (members.length < 2 || members[0].i !== removedIndex) return null; // chỉ đại diện mới cần bầu lại
  return members[1].i;
}

export type CeSectionInput = {
  key: string;
  parentKey: string | null;
  isProxy: boolean;
  clientFeePct?: number | null;
  lines: CeLineCalcInput[];
};

export type CeAggregates = {
  /** Σ CE các hàng dịch vụ (ngoài Chi hộ) — số to nhất trên header. */
  ceService: number;
  /** Phí quản lý báo khách theo từng mục L1: sectionKey → tiền phí. */
  feeBySection: Map<string, number>;
  feeTotal: number;
  /** = ceService + feeTotal (trước VAT). */
  cePreVat: number;
  /** = cePreVat × (1 + vatPct/100) — GIỮ ngữ nghĩa ceTotal cũ (tổng khách trả đủ). */
  ceTotalDerived: number;
  /** Q1 (05/08/2026): margin trên (CE dịch vụ + phí), TRƯỚC VAT. */
  marginPctNew: number;
  /** Mục L1 dịch vụ chưa áp phí (clientFeePct null) — chặn xuất báo giá khi còn phần tử. */
  missingFeeSectionKeys: string[];
};

/**
 * Bộ tổng CE của bảng CHẾ ĐỘ MỚI. `sections` là danh sách mục ĐÃ PHẲNG kèm parentKey; phí chỉ đọc
 * trên mục gốc không Chi hộ; CE mục con cộng dồn lên mục gốc để nhân %. Chi hộ ngoài cả CE lẫn phí.
 */
export function computeCeAggregates(sections: CeSectionInput[], vatPct: number, coTotal: number): CeAggregates {
  const byKey = new Map(sections.map((s) => [s.key, s]));
  const rootOf = (s: CeSectionInput): CeSectionInput => {
    let cur = s;
    const seen = new Set<string>([cur.key]);
    while (cur.parentKey) {
      const p = byKey.get(cur.parentKey);
      if (!p || seen.has(p.key)) break;
      seen.add(p.key);
      cur = p;
    }
    return cur;
  };

  let ceService = 0;
  const ceByRoot = new Map<string, number>();
  for (const s of sections) {
    if (s.isProxy) continue;
    const root = rootOf(s);
    if (root.isProxy) continue; // nhánh con của Chi hộ kế thừa tính chất Chi hộ
    const ce = ceRowsOf(s.lines, 0).reduce((sum, r) => sum + r.ceAmount, 0);
    ceService += ce;
    ceByRoot.set(root.key, (ceByRoot.get(root.key) ?? 0) + ce);
  }

  const feeBySection = new Map<string, number>();
  const missingFeeSectionKeys: string[] = [];
  let feeTotal = 0;
  for (const s of sections) {
    if (s.parentKey || s.isProxy) continue; // chỉ mục GỐC dịch vụ
    const ce = ceByRoot.get(s.key) ?? 0;
    if (s.clientFeePct == null) {
      missingFeeSectionKeys.push(s.key);
      continue;
    }
    const fee = Math.round((ce * s.clientFeePct) / 100);
    feeBySection.set(s.key, fee);
    feeTotal += fee;
  }

  const cePreVat = ceService + feeTotal;
  const ceTotalDerived = Math.round(cePreVat * (1 + vatPct / 100));
  const marginPctNew = cePreVat > 0 ? ((cePreVat - coTotal) / cePreVat) * 100 : 0;
  return { ceService, feeBySection, feeTotal, cePreVat, ceTotalDerived, marginPctNew, missingFeeSectionKeys };
}

/** Số La Mã cho đánh số mục L1 (đủ dùng tới 20 mục). */
const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

/**
 * Đánh số phân cấp cho mục theo vị trí trong cây: L1 → I/II/III · L2 → 1/2/3 · L3 → 1.1/1.2
 * (ghép số của L2 cha) · L4 → a/b/c. `indexPath` là chuỗi chỉ số 0-based từ gốc xuống node.
 * Dùng chung builder + export + trang in — một nguồn cho mọi nơi hiển thị STT.
 */
export function sectionNumber(indexPath: number[]): string {
  const depth = indexPath.length;
  const i = indexPath[depth - 1] ?? 0;
  if (depth <= 1) return ROMAN_NUMERALS[i] ?? String(i + 1);
  if (depth === 2) return String(i + 1);
  if (depth === 3) return `${indexPath[1] + 1}.${i + 1}`;
  return String.fromCharCode(97 + (i % 26)); // a/b/c…
}

/** Prefix dùng khi hạng mục chưa gán phòng ban, hoặc phòng đó không có costPrefix. */
export const DEFAULT_COST_PREFIX = "GEN";

/**
 * Đánh mã hiển thị cho từng dòng chi phí: `{prefix phòng ban}-{số thứ tự 3 chữ số}`.
 *
 * Số chạy RIÊNG theo từng prefix, theo đúng thứ tự dòng truyền vào (ACC-001, ACC-002, OPE-001…).
 * Thêm/xoá dòng là cả bảng đánh lại số — CHẤP NHẬN ĐƯỢC vì mã này thuần hiển thị; liên kết
 * tạm ứng/thanh toán của module ④ khoá vào `CostLine.stableKey`, không dùng mã này.
 * (Nếu có ngày nào đó khoá vào mã này thì mọi lần xoá dòng sẽ làm tiền treo sai chỗ.)
 */
export function assignItemCodes(
  lines: { sectionKey: string }[],
  prefixBySectionKey: Map<string, string>,
): string[] {
  const seq = new Map<string, number>();
  return lines.map((l) => {
    const prefix = prefixBySectionKey.get(l.sectionKey) || DEFAULT_COST_PREFIX;
    const n = (seq.get(prefix) ?? 0) + 1;
    seq.set(prefix, n);
    return `${prefix}-${String(n).padStart(3, "0")}`;
  });
}

/** Gợi ý CE từ CO (chỉ để prefill, không ép buộc) = CO × (1+VAT%) × (1−chiết khấu%). */
export function suggestCeFromCo(coTotal: number, vatPct: number, discountPct: number): number {
  return Math.round(coTotal * (1 + vatPct / 100) * (1 - discountPct / 100));
}

/** Sinh mã dự án chuẩn `T{seq:03d}{CLIENT}{YY}{TEAM}` (vd T004DHG26A1). seq chạy theo fiscal year. */
export async function generateProjectCode(
  db: { project: { count: (args: { where: { fiscalYear: number } }) => Promise<number> } },
  clientCode: string,
  teamCode: string,
  fiscalYear: number,
): Promise<string> {
  const yy = String(fiscalYear).slice(-2);
  const count = await db.project.count({ where: { fiscalYear } });
  const seq = String(count + 1).padStart(3, "0");
  return `T${seq}${clientCode}${yy}${teamCode}`;
}
