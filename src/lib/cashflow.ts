import { prisma } from "./prisma";
import { arDueBase, arOutstanding } from "./ar";
import { getNumberSetting } from "./settings";

// ─────────────────────────────────────────────────────────
// Công cụ ước tính Cashflow toàn danh mục dự án (không thuộc riêng 1 dự án).
// Tính lại 100% realtime mỗi lần gọi — không lưu bảng riêng, không cache.
// ─────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
/** Buffer trừ hao cộng vào mốc hạn thanh toán khách → mốc tiền về ước tính (best practice: khách luôn trả trễ hơn hạn). */
const CASH_IN_BUFFER_DAYS = 14;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type CashItem = {
  id: string;
  type: "IN" | "OUT";
  date: Date;
  amount: number;
  projectId: string;
  projectCode: string;
  projectName: string;
  teamCode: string | null;
  counterpart: string;
  source: "INVOICE" | "VENDOR_PAYMENT" | "ADVANCE";
  /** Chỉ dùng để sắp thứ tự hiển thị: dự án Liquidation ưu tiên lên trước Processing. */
  priorityRank: number;
};

export type CashflowPeriod = {
  key: string;
  labelKey: "periodLabelWeek" | "periodLabelMonth";
  labelN: number;
  startDate: Date;
  endDate: Date;
  cashIn: number;
  cashOut: number;
  net: number;
};

export type CashflowForecast = {
  asOf: Date;
  periods: CashflowPeriod[];
  items: CashItem[];
  totalIn: number;
  totalOut: number;
  totalNet: number;
};

type PeriodDef = { key: string; labelKey: CashflowPeriod["labelKey"]; labelN: number; startDay: number; endDay: number };

/** Số lượng chu kỳ tuần/tháng do CFO cấu hình ở /settings/finance (mặc định 4 tuần + 2 tháng). */
export async function getCashflowBucketConfig(): Promise<{ weeklyBuckets: number; monthlyBuckets: number }> {
  const [weeklyBuckets, monthlyBuckets] = await Promise.all([
    getNumberSetting("finance", "cashflow_weekly_buckets", 4),
    getNumberSetting("finance", "cashflow_monthly_buckets", 2),
  ]);
  return { weeklyBuckets: Math.max(0, Math.round(weeklyBuckets)), monthlyBuckets: Math.max(0, Math.round(monthlyBuckets)) };
}

function buildPeriodDefs(weeklyBuckets: number, monthlyBuckets: number): PeriodDef[] {
  const defs: PeriodDef[] = [];
  let cursor = 0;
  for (let i = 1; i <= weeklyBuckets; i++) {
    defs.push({ key: `w${i}`, labelKey: "periodLabelWeek", labelN: i, startDay: cursor, endDay: cursor + WEEK_DAYS });
    cursor += WEEK_DAYS;
  }
  for (let i = 1; i <= monthlyBuckets; i++) {
    defs.push({ key: `m${i}`, labelKey: "periodLabelMonth", labelN: i, startDay: cursor, endDay: cursor + MONTH_DAYS });
    cursor += MONTH_DAYS;
  }
  // Fallback nếu CFO đặt cả 2 = 0 — luôn có ít nhất 1 chu kỳ (tuần hiện tại) để không vỡ UI.
  if (defs.length === 0) defs.push({ key: "w1", labelKey: "periodLabelWeek", labelN: 1, startDay: 0, endDay: WEEK_DAYS });
  return defs;
}

/** Ước tính Cash In/Out theo các chu kỳ CFO cấu hình (mặc định tuần×4 + tháng×2) cho TOÀN BỘ dự án. */
export async function getCashflowForecast(): Promise<CashflowForecast> {
  const { weeklyBuckets, monthlyBuckets } = await getCashflowBucketConfig();
  const periodDefs = buildPeriodDefs(weeklyBuckets, monthlyBuckets);
  const today = startOfToday();
  const horizonEnd = addDays(today, periodDefs[periodDefs.length - 1].endDay);

  const [invoices, vendorPayments, advances] = await Promise.all([
    prisma.clientInvoice.findMany({
      include: { client: true, project: { include: { ownerTeam: true, status: true } }, payments: { select: { amount: true } } },
    }),
    prisma.vendorPayment.findMany({
      where: { status: "SCHEDULED" },
      include: { vendor: true, project: { include: { ownerTeam: true } } },
    }),
    prisma.advance.findMany({
      where: { status: "REQUESTED" },
      include: { recipientVendor: true, recipientStaff: true, project: { include: { ownerTeam: true } } },
    }),
  ]);

  const items: CashItem[] = [];

  // Cash In — công nợ phải thu (hóa đơn khách chưa thu hết). Ưu tiên hiển thị dự án Liquidation trước Processing.
  // Mốc tiền về = hạn thanh toán (hoặc ngày hóa đơn nếu không có hạn) + 14 ngày trừ hao.
  for (const inv of invoices) {
    // Định nghĩa "còn phải thu" và "mốc đến hạn" dùng chung ở lib/ar.ts. Đệm 14 ngày bên dưới là
    // khác biệt CỐ Ý của riêng trang này nên không gộp vào đó.
    const outstanding = arOutstanding({
      amount: Number(inv.amount),
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      paidAmounts: inv.payments.map((p) => Number(p.amount)),
    });
    if (outstanding <= 0) continue;
    const baseDate = arDueBase(inv);
    items.push({
      id: `inv-${inv.id}`,
      type: "IN",
      date: addDays(baseDate, CASH_IN_BUFFER_DAYS),
      amount: outstanding,
      projectId: inv.projectId,
      projectCode: inv.project.code,
      projectName: inv.project.name,
      teamCode: inv.project.ownerTeam?.code ?? null,
      counterpart: inv.client.name,
      source: "INVOICE",
      priorityRank: inv.project.status.code === "LIQUIDATION" ? 0 : 1,
    });
  }

  // Cash Out — kế hoạch thanh toán NCC: trả đúng hạn (không quá hạn), nếu chưa có hạn coi như cần chi ngay.
  for (const vp of vendorPayments) {
    items.push({
      id: `vp-${vp.id}`,
      type: "OUT",
      date: vp.dueDate ?? today,
      amount: Number(vp.amount),
      projectId: vp.projectId ?? "",
      projectCode: vp.project?.code ?? "—",
      projectName: vp.project?.name ?? "—",
      teamCode: vp.project?.ownerTeam?.code ?? null,
      counterpart: vp.vendor.name,
      source: "VENDOR_PAYMENT",
      priorityRank: 1,
    });
  }

  // Cash Out — tạm ứng đang chờ Kế toán chi (REQUESTED, chưa thực chi) → tính là dòng tiền ra sắp tới.
  for (const adv of advances) {
    items.push({
      id: `adv-${adv.id}`,
      type: "OUT",
      date: adv.requestedAt,
      amount: Number(adv.amount),
      projectId: adv.projectId,
      projectCode: adv.project.code,
      projectName: adv.project.name,
      teamCode: adv.project.ownerTeam?.code ?? null,
      counterpart: adv.recipientVendor?.name ?? adv.recipientStaff?.fullName ?? "—",
      source: "ADVANCE",
      priorityRank: 1,
    });
  }

  // Chỉ giữ item trong phạm vi cấu hình (item quá khứ/quá hạn dồn vào chu kỳ đầu tiên — cần xử lý ngay).
  const inRange = items.filter((it) => it.date < horizonEnd);
  for (const it of inRange) {
    if (it.date < today) it.date = today;
  }
  inRange.sort((a, b) => a.date.getTime() - b.date.getTime() || a.priorityRank - b.priorityRank);

  const periods: CashflowPeriod[] = periodDefs.map((p) => ({
    key: p.key,
    labelKey: p.labelKey,
    labelN: p.labelN,
    startDate: addDays(today, p.startDay),
    endDate: addDays(today, p.endDay),
    cashIn: 0,
    cashOut: 0,
    net: 0,
  }));

  for (const it of inRange) {
    const offsetDays = Math.floor((it.date.getTime() - today.getTime()) / DAY_MS);
    const period = periods.find((p, idx) => offsetDays >= periodDefs[idx].startDay && offsetDays < periodDefs[idx].endDay) ?? periods[0];
    if (it.type === "IN") period.cashIn += it.amount;
    else period.cashOut += it.amount;
  }
  for (const p of periods) p.net = p.cashIn - p.cashOut;

  const totalIn = periods.reduce((s, p) => s + p.cashIn, 0);
  const totalOut = periods.reduce((s, p) => s + p.cashOut, 0);

  return { asOf: today, periods, items: inRange, totalIn, totalOut, totalNet: totalIn - totalOut };
}
