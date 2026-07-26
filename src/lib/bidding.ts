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
