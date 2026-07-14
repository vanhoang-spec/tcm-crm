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

/** 5 phòng ban nhận Order (department code → tên hiển thị trong notification, luôn tiếng Việt). */
export const ORDER_DEPARTMENT_LABELS: Record<string, string> = {
  PLANNING: "Planning",
  CREATIVE: "Creative",
  PCC: "Purchasing",
  OPE: "Operation",
  PRO: "Production",
};

export type CostLineInput = {
  quantity: number;
  unitPrice: number;
  isLocked: boolean;
  maxMarkupPct: number | null;
};

export function computeAmount(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice);
}

export function computeCoTotal(lines: { quantity: number; unitPrice: number }[]): number {
  return lines.reduce((sum, l) => sum + computeAmount(l.quantity, l.unitPrice), 0);
}

/** margin = (CE − CO) / CE. Chi hộ tách riêng, KHÔNG tính vào đây. Trả về % (0-100). */
export function computeMarginPct(ceTotal: number, coTotal: number): number {
  if (ceTotal <= 0) return 0;
  return ((ceTotal - coTotal) / ceTotal) * 100;
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
    .reduce((s, l) => s + computeAmount(l.quantity, l.unitPrice), 0);
  const markupableCo = coTotal - lockedCo;
  if (markupableCo <= 0) return { suggestedCe: coTotal, reachedTarget: false };

  const uniformMarkup = (targetCe - coTotal) / markupableCo; // fraction

  let ce = lockedCo;
  for (const l of lines) {
    if (l.isLocked) continue;
    const co = computeAmount(l.quantity, l.unitPrice);
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
};

/** Số tiền 1 dòng — percentBase dùng cho dòng PERCENT_OF_TOTAL (= directCo, tính trước, không đệ quy). */
export function computeLineAmount(line: CostLineCalcInput, percentBase: number): number {
  if (line.lineType === "FIXED") return Math.round(line.fixedAmount ?? 0);
  if (line.lineType === "PERCENT_OF_TOTAL") return Math.round(((line.percentVal ?? 0) / 100) * percentBase);
  return computeAmount(line.quantity, line.unitPrice); // QTY_PRICE (default)
}

export type SectionCalcInput = {
  isProxy: boolean;
  proxyFeeType?: string | null;
  proxyFeeVal?: number | null;
  lines: CostLineCalcInput[];
};

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
  const proxySection = proxySections[0];
  const proxyFeeAmt = !proxySection
    ? 0
    : proxySection.proxyFeeType === "FIXED"
      ? Math.round(proxySection.proxyFeeVal ?? 0)
      : Math.round((proxySubtotal * (proxySection.proxyFeeVal ?? 0)) / 100);
  const chiHo = proxySubtotal + proxyFeeAmt;

  return { directCo, percentLinesTotal, adjustedCoSubtotal, mgmtFeeAmt, contingencyAmt, coTotal, proxySubtotal, proxyFeeAmt, chiHo };
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
