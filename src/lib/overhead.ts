/**
 * Chi phí văn phòng — HÀM THUẦN, không gọi Prisma (quy ước HANDOVER 4.1, tiền lệ src/lib/pnl.ts).
 * IO nằm ở src/lib/overhead-data.ts, đọc Excel ở src/lib/overhead-import.ts.
 *
 * BA LÀN TIỀN — mượn nguyên khái niệm của src/lib/pnl.ts, đừng trộn vào nhau:
 *   KẾ HOẠCH  = ngân sách đã chốt cho khoản đó
 *   ĐÃ CHI    = khoản chi status PAID (kế toán đã xác nhận thanh toán)
 *   CAM KẾT   = khoản chi status SCHEDULED — tiền SẼ ra, CHƯA trừ vào "đã dùng"
 * Gộp CAM KẾT vào ĐÃ CHI là báo vượt ngân sách oan cho những phiếu còn chờ thanh toán.
 */

export const OVERHEAD_BUDGET_STATUSES = ["DRAFT", "PENDING_CFO", "PENDING_CEO", "LOCKED", "REJECTED"] as const;
export type OverheadBudgetStatus = (typeof OVERHEAD_BUDGET_STATUSES)[number];

export const OVERHEAD_SPEND_STATUSES = ["SCHEDULED", "PAID", "CANCELED"] as const;
export type OverheadSpendStatus = (typeof OVERHEAD_SPEND_STATUSES)[number];

/** Cột "Loại đề nghị" của file gốc. */
export const OVERHEAD_REQUEST_KINDS = ["MONTHLY", "ON_DEMAND", "YEARLY"] as const;
export type OverheadRequestKind = (typeof OVERHEAD_REQUEST_KINDS)[number];

export const OVERHEAD_ACTUAL_SOURCES = ["MANUAL", "PAYROLL"] as const;
export type OverheadActualSource = (typeof OVERHEAD_ACTUAL_SOURCES)[number];

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function isValidMonth(m: number): boolean {
  return Number.isInteger(m) && m >= 1 && m <= 12;
}

/** Ngân sách đã KHOÁ thì không sửa được nữa (trừ đường sửa có lý do, gác riêng ở action). */
export function isBudgetLocked(status: string): boolean {
  return status === "LOCKED";
}

/** Chỉ bản DRAFT hoặc REJECTED mới cho HR sửa số. */
export function isBudgetEditable(status: string): boolean {
  return status === "DRAFT" || status === "REJECTED";
}

export type OverheadItemInput = {
  id: string;
  pidCode: string;
  name: string;
  categoryLabel: string;
  requestKind: string;
  actualSource: string;
  isActive: boolean;
  sort: number;
};

export type OverheadMonthInput = { itemId: string; month: number; amount: number };

/**
 * ⚠ `amountTotal` (= net + TNCN + TNDN, KHÔNG gồm VAT) mới là con số đối chiếu ngân sách, KHÔNG
 * phải `amountNet`. Đây là kết luận ĐO ĐƯỢC trên file thật, không phải suy đoán: thử cả 4 tổ hợp
 * (net/tổng × luỹ kế tới T6/T7) trên 50 khoản chi năm 2026 thì
 *   · so bằng TỔNG, luỹ kế tới T6 → 26 khoản khớp cột "TỔNG ĐÃ SỬ DỤNG" của file
 *   · so bằng NET,  luỹ kế tới T6 → chỉ 14 khoản khớp
 * Ngân sách trong file cũng đặt tên "TỔNG CHI TRƯỚC THUẾ" nhưng thực chất đã gồm TNCN/TNDN.
 * `amountNet` vẫn phải lưu — đó là tiền mặt thật trả ra, cần cho kế toán và cho đối chiếu chứng từ.
 */
export type OverheadSpendInput = { itemId: string; month: number; amountTotal: number; status: string };

export type OverheadMonthCell = { month: number; plan: number; paid: number; scheduled: number };

export type OverheadItemReport = {
  itemId: string;
  pidCode: string;
  name: string;
  categoryLabel: string;
  requestKind: string;
  actualSource: string;
  isActive: boolean;
  /** Tổng ngân sách cả 12 tháng — cột "TỔNG CHI TRƯỚC THUẾ" của file gốc. */
  planYear: number;
  /** Ngân sách luỹ kế tới tháng đang xem. */
  planYtd: number;
  /** Đã chi thật (PAID) luỹ kế — cột "TỔNG ĐÃ SỬ DỤNG". */
  paidYtd: number;
  /** Đã lên phiếu nhưng chưa thanh toán — KHÔNG cộng vào paidYtd. */
  scheduledYtd: number;
  /** planYear − paidYtd. ÂM là đã vượt ngân sách năm — file gốc có 2 khoản đang âm, có lý do đàng hoàng. */
  remaining: number;
  /** paidYtd − planYtd: lệch so với tiến độ ngân sách tính tới tháng đang xem. */
  variance: number;
  overBudget: boolean;
  months: OverheadMonthCell[];
};

export type OverheadTotals = {
  planYear: number;
  planYtd: number;
  paidYtd: number;
  scheduledYtd: number;
  remaining: number;
  overBudgetItems: number;
};

export type OverheadReport = { items: OverheadItemReport[]; totals: OverheadTotals };

/**
 * @param upToMonth tháng cuối tính luỹ kế (1..12). Mặc định 12 = cả năm.
 *
 * Khoản chi CANCELED bị loại hoàn toàn — huỷ rồi thì không còn là tiền.
 */
export function computeOverheadReport(
  items: OverheadItemInput[],
  budgetMonths: OverheadMonthInput[],
  spends: OverheadSpendInput[],
  upToMonth: number = 12,
): OverheadReport {
  const cap = isValidMonth(upToMonth) ? upToMonth : 12;

  const planBy = new Map<string, Map<number, number>>();
  for (const b of budgetMonths) {
    if (!isValidMonth(b.month)) continue;
    const m = planBy.get(b.itemId) ?? new Map<number, number>();
    m.set(b.month, (m.get(b.month) ?? 0) + b.amount);
    planBy.set(b.itemId, m);
  }

  const paidBy = new Map<string, Map<number, number>>();
  const schedBy = new Map<string, Map<number, number>>();
  for (const s of spends) {
    if (!isValidMonth(s.month)) continue;
    if (s.status === "CANCELED") continue;
    const target = s.status === "PAID" ? paidBy : schedBy;
    const m = target.get(s.itemId) ?? new Map<number, number>();
    m.set(s.month, (m.get(s.month) ?? 0) + s.amountTotal);
    target.set(s.itemId, m);
  }

  const reportItems = items
    .slice()
    .sort((a, b) => a.sort - b.sort || a.pidCode.localeCompare(b.pidCode))
    .map((it) => {
      const plan = planBy.get(it.id) ?? new Map<number, number>();
      const paid = paidBy.get(it.id) ?? new Map<number, number>();
      const sched = schedBy.get(it.id) ?? new Map<number, number>();

      const months: OverheadMonthCell[] = MONTHS.map((m) => ({
        month: m,
        plan: plan.get(m) ?? 0,
        paid: paid.get(m) ?? 0,
        scheduled: sched.get(m) ?? 0,
      }));

      const planYear = months.reduce((a, c) => a + c.plan, 0);
      const planYtd = months.filter((c) => c.month <= cap).reduce((a, c) => a + c.plan, 0);
      const paidYtd = months.filter((c) => c.month <= cap).reduce((a, c) => a + c.paid, 0);
      const scheduledYtd = months.filter((c) => c.month <= cap).reduce((a, c) => a + c.scheduled, 0);
      const remaining = planYear - paidYtd;

      return {
        itemId: it.id,
        pidCode: it.pidCode,
        name: it.name,
        categoryLabel: it.categoryLabel,
        requestKind: it.requestKind,
        actualSource: it.actualSource,
        isActive: it.isActive,
        planYear,
        planYtd,
        paidYtd,
        scheduledYtd,
        remaining,
        variance: paidYtd - planYtd,
        overBudget: remaining < 0,
        months,
      };
    });

  return {
    items: reportItems,
    totals: {
      planYear: reportItems.reduce((a, c) => a + c.planYear, 0),
      planYtd: reportItems.reduce((a, c) => a + c.planYtd, 0),
      paidYtd: reportItems.reduce((a, c) => a + c.paidYtd, 0),
      scheduledYtd: reportItems.reduce((a, c) => a + c.scheduledYtd, 0),
      remaining: reportItems.reduce((a, c) => a + c.remaining, 0),
      overBudgetItems: reportItems.filter((c) => c.overBudget).length,
    },
  };
}

/**
 * Khoản chi sắp tạo có làm vượt ngân sách NĂM của khoản đó không.
 *
 * Trả `true` thì action BẮT BUỘC có `overBudgetNote` — nhưng vẫn cho đi tiếp. "Vượt phải giải trình",
 * KHÔNG phải "vượt thì cấm": file gốc đã có 2 khoản âm kèm lý do (dự định bán xe nhưng chưa bán được).
 * Chặn cứng chỉ khiến kế toán ghi khoản chi vào một dòng khác cho lọt, tức mất luôn dấu vết.
 */
export function wouldExceedBudget(planYear: number, paidSoFar: number, newAmountTotal: number): boolean {
  return paidSoFar + newAmountTotal > planYear;
}

/**
 * "TỔNG CHI PHÍ TRƯỚC THUẾ" theo đúng công thức file gốc — chỉ để hiển thị/đối chiếu chứng từ,
 * KHÔNG dùng so ngân sách (ngân sách so bằng `amountNet`).
 *
 * ⚠ VAT KHÔNG CỘNG VÀO. Đã đối chiếu bằng số trên sheet "Chi tiết 2026-BOD":
 *   · Điện kho Q12 T1: chi 466.682 · VAT 37.334 → tổng 466.682  (VAT bị bỏ ra)
 *   · CP văn phòng T1: chi 13.493.625 · VAT 578.701 · TNDN 1.240.387 → tổng 14.734.012
 * Đây đúng quy tắc VAT đầu vào được khấu trừ mà CO/CE đang dùng (src/lib/bidding.ts: hệ số VAT = 1).
 * Cộng VAT vào là thổi chi phí lên đúng bằng phần thuế được khấu trừ.
 */
export function spendTotal(amountNet: number, _vat: number, tncn: number, tndn: number): number {
  return amountNet + tncn + tndn;
}
