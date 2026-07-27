// CTV (BM08) ↔ dòng CO/CE — hàm thuần, KHÔNG gọi Prisma, KHÔNG import gì.
//
// Tách khỏi lib/ctv.ts vì file đó kéo theo exceljs/pizzip/docxtemplater (server-only) — các hàm ở
// đây được component "use client" (operations-grid) dùng để hiện khối đối chiếu ngay khi gõ.
//
// BỐI CẢNH (quyết định CEO 27/07/2026): tiền CTV do kế toán CHUYỂN KHOẢN THẲNG theo từng số tài
// khoản trong BM08, phải ăn trần dòng CO và vào dự trù cashflow. Vì vậy mỗi đợt BM08 sinh phiếu
// chi NCC (VendorPayment) gom theo dòng CO — KHÔNG dựng hệ thanh toán song song (bất biến #3).

export type CtvCostRow = {
  amount: number | null;
  pitTax: number | null;
  netReceived: number | null;
  grossNet: string | null;
};

/**
 * Số tiền TRAO CHO NGƯỜI NHẬN của 1 dòng BM08 — cùng đơn vị với `FinanceCostLine.netAmount`
 * (trần chi = số thực trả, TRƯỚC gross-up thuế), nên so được trực tiếp và dùng làm số tiền phiếu chi.
 *
 * - grossNet = "N" (net): Thành tiền là số người nhận cầm về, thuế TNCN công ty nộp hộ nằm cột
 *   riêng → trao cho người nhận = Thành tiền.
 * - grossNet = "G" (gross): Thành tiền ĐÃ gồm thuế → trao cho người nhận = Thực nhận
 *   (thiếu thì Thành tiền − Thuế).
 * - Bỏ trống: coi như "N" — an toàn hơn (ước cao), và là cách BM08 thật thường điền.
 *
 * KHÔNG cộng phần thuế vào đây: quy ước toàn module ④ là phần gross-up thuế KHÔNG được đếm vào
 * khoản chi theo dòng (trần là netAmount; phiếu chi cho NCC dòng TNCN hôm nay cũng ghi số trước
 * thuế). Cộng thuế vào là lệch đơn vị với trần đúng bằng phần gross-up — đo trên T013 là
 * 70.250.002đ (xem lib/bidding.ts TAX_GROSSUP).
 */
export function ctvRowCost(row: CtvCostRow): number {
  const amount = row.amount ?? 0;
  if ((row.grossNet ?? "").trim().toUpperCase() === "G") {
    return row.netReceived ?? Math.max(0, amount - (row.pitTax ?? 0));
  }
  return amount;
}

/** Dòng CO hiệu lực của 1 dòng BM08: gán riêng thắng, trống thì kế thừa mặc định của đợt. */
export function ctvEffectiveLineId(rowLineId: string | null, batchDefaultLineId: string | null): string | null {
  return rowLineId ?? batchDefaultLineId;
}

export type CtvPlanLine = {
  id: string;
  itemCode: string | null;
  itemName: string;
  sectionName: string;
  /** Trần của dòng (số thực trả) — nguồn: FinanceCostLine.netAmount. */
  netAmount: number;
  isProxy: boolean;
};

export type CtvPlanVsActual = {
  /** Chỉ các dòng CO CÓ tiền CTV gán vào, giữ nguyên cờ isProxy để UI tách khối Chi hộ
   *  (bất biến #2: không cộng Chi hộ vào tổng giá vốn). */
  byLine: {
    lineId: string;
    itemCode: string | null;
    itemName: string;
    sectionName: string;
    plan: number;
    ctv: number;
    variance: number;
    isProxy: boolean;
  }[];
  /** Dòng CO bị CTV ký vượt trần (ctv > plan). */
  overLineIds: string[];
  /** Tiền CTV chưa gán được vào dòng CO nào (không gán riêng, đợt không có mặc định). */
  unassignedCost: number;
  totalPlan: number;
  totalCtv: number;
};

/** Đối chiếu Kế hoạch (netAmount từng dòng CO) ↔ CTV đã nhập/ký, gom theo dòng CO. Chỉ gom số. */
export function ctvPlanVsActual(
  plan: CtvPlanLine[],
  rows: { lineId: string | null; cost: number }[],
): CtvPlanVsActual {
  const byId = new Map(plan.map((p) => [p.id, p]));
  const ctvByLine = new Map<string, number>();
  let unassignedCost = 0;
  for (const r of rows) {
    if (r.lineId && byId.has(r.lineId)) {
      ctvByLine.set(r.lineId, (ctvByLine.get(r.lineId) ?? 0) + r.cost);
    } else {
      unassignedCost += r.cost;
    }
  }
  const byLine = [...ctvByLine.entries()].map(([lineId, ctv]) => {
    const p = byId.get(lineId)!;
    return {
      lineId,
      itemCode: p.itemCode,
      itemName: p.itemName,
      sectionName: p.sectionName,
      plan: p.netAmount,
      ctv,
      variance: ctv - p.netAmount,
      isProxy: p.isProxy,
    };
  });
  return {
    byLine,
    overLineIds: byLine.filter((l) => l.variance > 0).map((l) => l.lineId),
    unassignedCost,
    totalPlan: byLine.reduce((s, l) => s + l.plan, 0),
    totalCtv: byLine.reduce((s, l) => s + l.ctv, 0) + unassignedCost,
  };
}
