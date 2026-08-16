// PUR-1b — SO SÁNH BÁO GIÁ N NCC × M dòng. THUẦN: không prisma, không AI.
//
// Số liệu (rẻ nhất, chênh %, thiếu NCC, vượt CO, tổng theo NCC, coverage) tính ở ĐÂY bằng code —
// AI (rfq-prompts.ts) chỉ nhận ma trận đã tính để viết nhận xét + gợi ý có lý do. Đây là chốt chặn
// "không để AI làm toán": số AI trả về không bao giờ được dùng làm số so sánh, chỉ dùng câu chữ.

export type CompareVendorInput = {
  rfqVendorId: string;
  vendorName: string;
  status: string; // INVITED | SUBMITTED | DECLINED
  terms: Record<string, unknown>;
  quotes: { rfqLineId: string; unitPrice: number; quantity: number | null; amount: number; extra: Record<string, unknown>; note: string | null }[];
};
export type CompareLineInput = { id: string; itemName: string; quantity: number; unit: string | null; refUnitPrice: number | null };

export type CompareCell = { rfqVendorId: string; unitPrice: number; amount: number; quantity: number | null; note: string | null; extra: Record<string, unknown> };
export type CompareLine = {
  rfqLineId: string;
  itemName: string;
  quantity: number;
  unit: string | null;
  /** Đơn giá CO trước thuế lúc tạo RFQ — tham chiếu; null = không có. */
  refUnitPrice: number | null;
  /** Thành tiền tham chiếu = refUnitPrice × SL hỏi. */
  refAmount: number | null;
  cells: CompareCell[];
  /** rfqVendorId có amount thấp nhất trong các NCC đã báo dòng này; null nếu không ai báo. */
  cheapestVendorId: string | null;
  cheapestAmount: number | null;
  /** (đắt nhất − rẻ nhất) / rẻ nhất, %; null nếu < 2 NCC báo. */
  spreadPct: number | null;
  /** NCC đã SUBMITTED nhưng không báo dòng này. */
  missingVendorIds: string[];
  /** rẻ nhất vẫn > refAmount (vượt CO). */
  overRef: boolean;
};
export type CompareVendorTotal = {
  rfqVendorId: string;
  vendorName: string;
  status: string;
  /** Σ amount các dòng NCC báo. */
  quotedTotal: number;
  /** Số dòng có báo / tổng dòng. */
  linesQuoted: number;
  coveragePct: number;
  /** Σ refAmount của ĐÚNG các dòng NCC báo — để so cùng mẫu số. */
  refTotalOnQuoted: number;
  /** Số dòng NCC này rẻ nhất. */
  cheapestCount: number;
  terms: Record<string, unknown>;
};
export type CompareMatrix = {
  lines: CompareLine[];
  vendors: CompareVendorTotal[];
  /** Tổng nếu chọn NCC rẻ nhất từng dòng (chỉ dòng có ít nhất 1 báo giá). */
  bestMixTotal: number;
  /** Số dòng không NCC nào báo. */
  unquotedLines: number;
  refTotal: number;
};

export function buildCompareMatrix(lines: CompareLineInput[], vendors: CompareVendorInput[]): CompareMatrix {
  const submitted = vendors.filter((v) => v.status === "SUBMITTED");
  const outLines: CompareLine[] = lines.map((l) => {
    const cells: CompareCell[] = [];
    for (const v of submitted) {
      const q = v.quotes.find((x) => x.rfqLineId === l.id);
      if (q) cells.push({ rfqVendorId: v.rfqVendorId, unitPrice: q.unitPrice, amount: q.amount, quantity: q.quantity, note: q.note, extra: q.extra });
    }
    const priced = cells.filter((c) => c.amount > 0);
    let cheapest: CompareCell | null = null;
    let dearest: CompareCell | null = null;
    for (const c of priced) {
      if (!cheapest || c.amount < cheapest.amount) cheapest = c;
      if (!dearest || c.amount > dearest.amount) dearest = c;
    }
    const refAmount = l.refUnitPrice == null ? null : Math.round(l.refUnitPrice * l.quantity);
    return {
      rfqLineId: l.id,
      itemName: l.itemName,
      quantity: l.quantity,
      unit: l.unit,
      refUnitPrice: l.refUnitPrice,
      refAmount,
      cells,
      cheapestVendorId: cheapest?.rfqVendorId ?? null,
      cheapestAmount: cheapest?.amount ?? null,
      spreadPct: cheapest && dearest && priced.length >= 2 && cheapest.amount > 0 ? Math.round(((dearest.amount - cheapest.amount) / cheapest.amount) * 1000) / 10 : null,
      missingVendorIds: submitted.filter((v) => !cells.some((c) => c.rfqVendorId === v.rfqVendorId)).map((v) => v.rfqVendorId),
      overRef: cheapest != null && refAmount != null && refAmount > 0 && cheapest.amount > refAmount,
    };
  });

  const outVendors: CompareVendorTotal[] = vendors.map((v) => {
    const mine = outLines.filter((l) => l.cells.some((c) => c.rfqVendorId === v.rfqVendorId));
    const quotedTotal = mine.reduce((s, l) => s + (l.cells.find((c) => c.rfqVendorId === v.rfqVendorId)?.amount ?? 0), 0);
    return {
      rfqVendorId: v.rfqVendorId,
      vendorName: v.vendorName,
      status: v.status,
      quotedTotal,
      linesQuoted: mine.length,
      coveragePct: lines.length ? Math.round((mine.length / lines.length) * 1000) / 10 : 0,
      refTotalOnQuoted: mine.reduce((s, l) => s + (l.refAmount ?? 0), 0),
      cheapestCount: outLines.filter((l) => l.cheapestVendorId === v.rfqVendorId).length,
      terms: v.terms,
    };
  });

  return {
    lines: outLines,
    vendors: outVendors,
    bestMixTotal: outLines.reduce((s, l) => s + (l.cheapestAmount ?? 0), 0),
    unquotedLines: outLines.filter((l) => l.cheapestVendorId == null).length,
    refTotal: outLines.reduce((s, l) => s + (l.refAmount ?? 0), 0),
  };
}

/** Lựa chọn CUỐI của PUR (finalJson): từng dòng → NCC + lý do; dòng không chọn = giữ nguyên CO. */
export type RfqSelection = {
  picks: Record<string, { rfqVendorId: string; reason: string }>;
  note: string | null;
  /** Ghi lúc PUR trình — để Account đọc đúng phiên bản. */
  submittedAt?: string;
};

export function parseSelection(raw: string | null | undefined): RfqSelection | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || typeof v.picks !== "object") return null;
    return { picks: v.picks ?? {}, note: typeof v.note === "string" ? v.note : null, submittedAt: typeof v.submittedAt === "string" ? v.submittedAt : undefined };
  } catch {
    return null;
  }
}

/** Tổng tiền theo lựa chọn (Σ amount của ô được chọn) — Account đọc để so với CO. */
export function selectionTotal(matrix: CompareMatrix, sel: RfqSelection): { total: number; refTotalOnPicked: number; picked: number } {
  let total = 0;
  let ref = 0;
  let picked = 0;
  for (const l of matrix.lines) {
    const p = sel.picks[l.rfqLineId];
    if (!p) continue;
    const cell = l.cells.find((c) => c.rfqVendorId === p.rfqVendorId);
    if (!cell) continue;
    total += cell.amount;
    ref += l.refAmount ?? 0;
    picked++;
  }
  return { total, refTotalOnPicked: ref, picked };
}
