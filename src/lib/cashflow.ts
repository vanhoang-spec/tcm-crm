import { prisma } from "./prisma";
import { arDueBase, arOutstanding } from "./ar";
import { clientBillableTotal } from "./bidding";
import { toNum } from "./utils";

// ─────────────────────────────────────────────────────────
// Cashflow v2 — dòng tiền DỰ KIẾN toàn danh mục, khung thời gian tự chọn.
// Tính lại 100% realtime mỗi lần gọi — không lưu bảng riêng, không cache (tiền lệ sổ ISO).
// ⚠ Trang đọc dữ liệu này gác `dashboard.cashflow` (BGĐ + CFO; ADMIN là sàn cứng) — quyết định
// chủ dự án 14/08/2026: báo cáo cashflow chỉ CFO/CEO/Admin xem.
// ─────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
/** Buffer trừ hao cộng vào mốc hạn phía khách → mốc tiền về ước tính (khách luôn trả trễ hơn hạn). */
const CASH_IN_BUFFER_DAYS = 14;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type CashflowRange = "month" | "quarter" | "year" | "custom";
export type CashflowBucketBy = "week" | "month";
export type OutlookQuery = { range: CashflowRange; by: CashflowBucketBy; from?: string; to?: string };

export type CashflowSearchParams = { range?: string; by?: string; from?: string; to?: string };

/** Chuẩn hoá tham số URL (trang chính + trang in dùng chung) — sai kiểu thì rơi về mặc định. */
export function normalizeCashflowQuery(sp: CashflowSearchParams): OutlookQuery {
  const range: CashflowRange = sp.range === "quarter" || sp.range === "year" || sp.range === "custom" ? sp.range : "month";
  const by: CashflowBucketBy = sp.by === "month" ? "month" : "week";
  return { range, by, from: sp.from, to: sp.to };
}

/**
 * Khung thời gian [start, end) theo giờ ĐỊA PHƯƠNG, start không lùi về quá khứ: cashflow là dự
 * báo NHÌN TỚI — phần đã xảy ra của tháng nằm ở Dashboard (Đã thu/Đã chi MTD), trộn vào đây là
 * hai loại số khác bản chất trong một bảng. THUẦN để test được (nhận `now` từ ngoài).
 */
export function resolveCashflowWindow(q: OutlookQuery, now: Date): { start: Date; end: Date } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (q.range === "custom") {
    const RE = /^\d{4}-\d{2}-\d{2}$/;
    if (q.from && q.to && RE.test(q.from) && RE.test(q.to)) {
      // Dựng bằng thành phần ĐỊA PHƯƠNG — mốc bucket là ranh giới ngày người dùng nhìn thấy,
      // không phải cột ngày nghiệp vụ UTC-midnight (HANDOVER 4.3 chỉ áp cho cột DB).
      const [fy, fm, fd] = q.from.split("-").map(Number);
      const [ty, tm, td] = q.to.split("-").map(Number);
      const from = new Date(fy, fm - 1, fd);
      const end = new Date(ty, tm - 1, td + 1); // to là ngày CUỐI (bao gồm) → end mở
      if (end.getTime() > from.getTime()) {
        return { start: from.getTime() > today.getTime() ? from : today, end };
      }
    }
    // rơi về tháng hiện tại khi from/to hỏng — đừng ném lỗi vì đây chỉ là tham số URL
  }
  if (q.range === "quarter") {
    const qIdx = Math.floor(today.getMonth() / 3);
    return { start: today, end: new Date(today.getFullYear(), qIdx * 3 + 3, 1) };
  }
  if (q.range === "year") {
    return { start: today, end: new Date(today.getFullYear() + 1, 0, 1) };
  }
  return { start: today, end: new Date(today.getFullYear(), today.getMonth() + 1, 1) };
}

export type CashBucket = {
  key: string;
  start: Date;
  /** Mở (ngày đầu tiên KHÔNG thuộc bucket). */
  end: Date;
  in: number;
  out: number;
  net: number;
  /** Lũy kế net từ bucket đầu tới bucket này. */
  cumNet: number;
  bySource: Record<CashSource, number>;
};

/** Chia [start, end) thành bucket tuần (7 ngày liên tiếp) hoặc THÁNG DƯƠNG LỊCH (bucket đầu/cuối có thể lửng). */
export function buildCashflowBuckets(start: Date, end: Date, by: CashflowBucketBy): { key: string; start: Date; end: Date }[] {
  const out: { key: string; start: Date; end: Date }[] = [];
  let cursor = start;
  let i = 1;
  while (cursor.getTime() < end.getTime() && out.length < 60) {
    const next =
      by === "week"
        ? addDays(cursor, 7)
        : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const bEnd = next.getTime() < end.getTime() ? next : end;
    out.push({ key: `b${i}`, start: cursor, end: bEnd });
    cursor = bEnd;
    i++;
  }
  return out;
}

export type CashSource =
  | "INVOICE" // hóa đơn đã phát hành, chưa thu hết
  | "MILESTONE" // đợt thu C5 CHƯA xuất hóa đơn (% động trên billable của CO/CE sống)
  | "VENDOR_PAYMENT" // phiếu chi NCC đã lên lịch
  | "ADVANCE" // tạm ứng chờ kế toán chi
  | "OVERHEAD_SPEND" // khoản chi văn phòng đã lên phiếu, chưa chi
  | "OVERHEAD_PLAN" // phần ngân sách văn phòng đã duyệt của tháng, chưa thành phiếu
  | "PAYROLL_PLAN"; // lương theo ngân sách đã duyệt (chờ module ⑦ thay nguồn)

export const IN_SOURCES: CashSource[] = ["INVOICE", "MILESTONE"];
export const OUT_SOURCES: CashSource[] = ["VENDOR_PAYMENT", "ADVANCE", "OVERHEAD_SPEND", "OVERHEAD_PLAN", "PAYROLL_PLAN"];

export type CashItem = {
  id: string;
  type: "IN" | "OUT";
  date: Date;
  amount: number;
  projectCode: string;
  counterpart: string;
  source: CashSource;
};

export type ProjectCashOutRow = {
  projectId: string;
  code: string;
  name: string;
  teamCode: string | null;
  statusCode: string;
  /** Trần chi = Σ payCap dòng sống ngoài Chi hộ. Sau FIN-B (duyệt CO) đây chính là CO đã duyệt. */
  cap: number;
  /** Tiền ĐÃ RA: tạm ứng đã chi/đã hoàn + phiếu chi PAID. */
  paidOut: number;
  /** Cam kết sắp ra: tạm ứng chờ chi + phiếu chi SCHEDULED. */
  committed: number;
  remaining: number;
};

export type CashflowOutlook = {
  asOf: Date;
  start: Date;
  end: Date;
  buckets: CashBucket[];
  items: CashItem[];
  totalIn: number;
  totalOut: number;
  totalNet: number;
  /** Khoản có ngày nhưng nằm SAU khung — hiện để người đọc biết bảng chưa phải toàn bộ. */
  beyond: { in: number; out: number; count: number };
  /** Khoản KHÔNG có ngày — cố ý không bịa ngày để nhét vào bucket (quyết định chủ dự án). */
  unscheduled: {
    /** Đợt thu C5 chưa có hạn thu dự kiến. */
    in: { id: string; projectCode: string; name: string; amount: number }[];
    /** Phần CO còn lại chưa thành phiếu/tạm ứng của từng dự án đang chạy. */
    out: { projectId: string; projectCode: string; amount: number }[];
    totalIn: number;
    totalOut: number;
  };
  projects: ProjectCashOutRow[];
};

/** Trạng thái dự án còn kỳ vọng THU tiếp (FINISHED chỉ còn hóa đơn đã phát hành — nhánh INVOICE lo). */
const COLLECTING_STATUS_CODES = ["PROCESSING", "HANDOVER", "LIQUIDATION"] as const;

export async function getCashflowOutlook(query: OutlookQuery): Promise<CashflowOutlook> {
  const now = new Date();
  const { start, end } = resolveCashflowWindow(query, now);
  const today = startOfToday();

  const [invoices, vendorPayments, advances, milestones, ctrSheets, lineAgg, advRows, payRows, projectsMeta, lockedBudgets] =
    await Promise.all([
      prisma.clientInvoice.findMany({
        where: { voidedAt: null },
        include: { client: true, project: { select: { code: true } }, payments: { select: { amount: true } } },
      }),
      prisma.vendorPayment.findMany({
        where: { status: "SCHEDULED" },
        include: { vendor: true, project: { select: { code: true } } },
      }),
      prisma.advance.findMany({
        where: { status: "REQUESTED" },
        include: { recipientVendor: true, recipientStaff: true, project: { select: { code: true } } },
      }),
      prisma.collectionMilestone.findMany({
        where: { project: { status: { code: { in: [...COLLECTING_STATUS_CODES] } } } },
        include: {
          invoices: { where: { voidedAt: null }, select: { amount: true } },
          project: { select: { id: true, code: true } },
        },
      }),
      prisma.costSheet.findMany({ where: { version: "CTRACT" }, select: { projectId: true, ceTotal: true, chiHo: true } }),
      // Trần + đã chi theo DỰ ÁN — đúng ngữ nghĩa projectDisbursement (ngoài Chi hộ; phiếu chi
      // cấp dự án financeCostLineId=null vẫn ăn trần).
      prisma.financeCostLine.groupBy({
        by: ["projectId"],
        where: { isStale: false, isProxy: false },
        _sum: { payCap: true },
      }),
      prisma.advance.findMany({
        where: { status: { not: "CANCELED" }, financeCostLine: { isProxy: false } },
        select: { projectId: true, amount: true, status: true },
      }),
      prisma.vendorPayment.findMany({
        where: {
          status: { not: "CANCELED" },
          projectId: { not: null },
          OR: [{ financeCostLineId: null }, { financeCostLine: { isProxy: false } }],
        },
        select: { projectId: true, amount: true, status: true },
      }),
      prisma.project.findMany({
        select: { id: true, code: true, name: true, ownerTeam: { select: { code: true } }, status: { select: { code: true } } },
      }),
      prisma.overheadBudget.findMany({
        where: { status: "LOCKED" },
        include: {
          items: {
            where: { isActive: true },
            select: {
              id: true,
              actualSource: true,
              budgetMonths: { select: { month: true, amount: true } },
              spends: { where: { status: { not: "CANCELED" } }, select: { month: true, amountTotal: true, status: true, expectedDate: true, name: true, id: true } },
            },
          },
        },
      }),
    ]);

  const items: CashItem[] = [];

  // ── IN 1: hóa đơn đã phát hành, còn phải thu ──
  for (const inv of invoices) {
    const outstanding = arOutstanding({
      amount: Number(inv.amount),
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      paidAmounts: inv.payments.map((p) => Number(p.amount)),
    });
    if (outstanding <= 0) continue;
    items.push({
      id: `inv-${inv.id}`,
      type: "IN",
      date: addDays(arDueBase(inv), CASH_IN_BUFFER_DAYS),
      amount: outstanding,
      projectCode: inv.project.code,
      counterpart: inv.client.name,
      source: "INVOICE",
    });
  }

  // ── IN 2: đợt thu C5 chưa xuất hóa đơn — % ĐỘNG trên billable CO/CE sống (cùng công thức trang
  // Nghiệm thu). Phần đã xuất hóa đơn trừ ra để không đếm trùng với nhánh INVOICE ở trên. ──
  const billableByProject = new Map<string, number>();
  for (const s of ctrSheets) billableByProject.set(s.projectId, clientBillableTotal(toNum(s.ceTotal), toNum(s.chiHo)));
  const unscheduledIn: CashflowOutlook["unscheduled"]["in"] = [];
  for (const m of milestones) {
    const billable = billableByProject.get(m.project.id) ?? 0;
    if (billable <= 0) continue;
    const planAmount = Math.round((billable * m.pct) / 100);
    const invoiced = m.invoices.reduce((s, inv) => s + toNum(inv.amount), 0);
    const expect = planAmount - invoiced;
    if (expect <= 0) continue;
    if (m.dueDate) {
      items.push({
        id: `ms-${m.id}`,
        type: "IN",
        date: addDays(m.dueDate, CASH_IN_BUFFER_DAYS),
        amount: expect,
        projectCode: m.project.code,
        counterpart: m.name,
        source: "MILESTONE",
      });
    } else {
      unscheduledIn.push({ id: m.id, projectCode: m.project.code, name: m.name, amount: expect });
    }
  }

  // ── OUT 1+2: phiếu chi NCC đã lên lịch + tạm ứng chờ chi (chưa có hạn = cần chi ngay) ──
  for (const vp of vendorPayments) {
    items.push({
      id: `vp-${vp.id}`,
      type: "OUT",
      date: vp.dueDate ?? today,
      amount: Number(vp.amount),
      projectCode: vp.project?.code ?? "—",
      counterpart: vp.vendor.name,
      source: "VENDOR_PAYMENT",
    });
  }
  for (const adv of advances) {
    items.push({
      id: `adv-${adv.id}`,
      type: "OUT",
      date: adv.requestedAt,
      amount: Number(adv.amount),
      projectCode: adv.project.code,
      counterpart: adv.recipientVendor?.name ?? adv.recipientStaff?.fullName ?? "—",
      source: "ADVANCE",
    });
  }

  // ── OUT 3: chi văn phòng + lương theo ngân sách ĐÃ DUYỆT (LOCKED) ──
  // Khoản đã lên phiếu (SCHEDULED) là item riêng theo expectedDate (thiếu thì lấy cuối tháng ghi
  // nhận). Phần kế hoạch tháng CHƯA thành phiếu = ngân sách tháng − mọi khoản chi chưa huỷ của
  // tháng đó (cùng cơ sở amountTotal với màn Overhead) — gom 1 dòng/tháng, tách LƯƠNG riêng vì
  // người đọc cần thấy quỹ lương là khoản ra lớn nhất. Tháng đã QUA không dựng phần kế hoạch nữa.
  for (const budget of lockedBudgets) {
    for (const item of budget.items) {
      for (const sp of item.spends) {
        if (sp.status !== "SCHEDULED") continue;
        const fallback = new Date(budget.fiscalYear, sp.month, 0); // ngày cuối tháng ghi nhận
        items.push({
          id: `ohs-${sp.id}`,
          type: "OUT",
          date: sp.expectedDate ?? fallback,
          amount: toNum(sp.amountTotal),
          projectCode: "—",
          counterpart: sp.name,
          source: "OVERHEAD_SPEND",
        });
      }
    }
    const planBySrc = new Map<string, number>(); // key = `${source}-${month}`
    for (const item of budget.items) {
      const spentByMonth = new Map<number, number>();
      for (const sp of item.spends) spentByMonth.set(sp.month, (spentByMonth.get(sp.month) ?? 0) + toNum(sp.amountTotal));
      for (const bm of item.budgetMonths) {
        const monthEnd = new Date(budget.fiscalYear, bm.month, 0);
        if (monthEnd.getTime() < today.getTime()) continue; // tháng đã qua: chỉ số thực còn ý nghĩa
        const remainder = toNum(bm.amount) - (spentByMonth.get(bm.month) ?? 0);
        if (remainder <= 0) continue;
        const src: CashSource = item.actualSource === "PAYROLL" ? "PAYROLL_PLAN" : "OVERHEAD_PLAN";
        const key = `${src}-${budget.fiscalYear}-${bm.month}`;
        planBySrc.set(key, (planBySrc.get(key) ?? 0) + remainder);
      }
    }
    for (const [key, amount] of planBySrc) {
      const [src, yearStr, monthStr] = key.split("-");
      items.push({
        id: `plan-${key}`,
        type: "OUT",
        date: new Date(Number(yearStr), Number(monthStr), 0),
        amount,
        projectCode: "—",
        counterpart: `Ngân sách T${monthStr}/${yearStr}`,
        source: src as CashSource,
      });
    }
  }

  // ── Bảng cash-out theo dự án + phần CO "chưa lên lịch" ──
  const metaById = new Map(projectsMeta.map((p) => [p.id, p]));
  const paidOutBy = new Map<string, number>();
  const committedBy = new Map<string, number>();
  for (const a of advRows) {
    const target = a.status === "REQUESTED" ? committedBy : paidOutBy; // DISBURSED/SETTLED = tiền đã ra
    target.set(a.projectId, (target.get(a.projectId) ?? 0) + Number(a.amount));
  }
  for (const p of payRows) {
    const pid = p.projectId as string;
    const target = p.status === "SCHEDULED" ? committedBy : paidOutBy; // PAID = tiền đã ra
    target.set(pid, (target.get(pid) ?? 0) + Number(p.amount));
  }
  const projects: ProjectCashOutRow[] = [];
  const unscheduledOut: CashflowOutlook["unscheduled"]["out"] = [];
  for (const row of lineAgg) {
    const meta = metaById.get(row.projectId);
    if (!meta) continue;
    const cap = Number(row._sum.payCap ?? 0);
    if (cap <= 0) continue;
    const paidOut = paidOutBy.get(row.projectId) ?? 0;
    const committed = committedBy.get(row.projectId) ?? 0;
    const remaining = cap - paidOut - committed;
    projects.push({
      projectId: row.projectId,
      code: meta.code,
      name: meta.name,
      teamCode: meta.ownerTeam?.code ?? null,
      statusCode: meta.status.code,
      cap,
      paidOut,
      committed,
      remaining,
    });
    // Chỉ dự án ĐANG CHẠY mới kỳ vọng phần CO còn lại sẽ thành tiền ra (Finished thì phần chưa
    // chi là tiết kiệm được, không phải khoản sắp phải chi).
    if (remaining > 0 && (COLLECTING_STATUS_CODES as readonly string[]).includes(meta.status.code)) {
      unscheduledOut.push({ projectId: row.projectId, projectCode: meta.code, amount: remaining });
    }
  }
  projects.sort((a, b) => b.cap - a.cap);
  unscheduledOut.sort((a, b) => b.amount - a.amount);

  // ── Chia bucket: quá hạn dồn về hôm nay (bucket đầu = cần xử lý ngay), sau khung thì đếm riêng ──
  const beyond = { in: 0, out: 0, count: 0 };
  const inWindow: CashItem[] = [];
  for (const it of items) {
    if (it.date.getTime() < today.getTime()) it.date = today;
    if (it.date.getTime() >= end.getTime()) {
      beyond.count++;
      if (it.type === "IN") beyond.in += it.amount;
      else beyond.out += it.amount;
      continue;
    }
    if (it.date.getTime() < start.getTime()) continue; // custom bắt đầu tương lai: khoản trước đó ngoài khung
    inWindow.push(it);
  }
  inWindow.sort((a, b) => a.date.getTime() - b.date.getTime());

  const emptyBySource = () =>
    Object.fromEntries([...IN_SOURCES, ...OUT_SOURCES].map((s) => [s, 0])) as Record<CashSource, number>;
  const buckets: CashBucket[] = buildCashflowBuckets(start, end, query.by).map((b) => ({
    ...b,
    in: 0,
    out: 0,
    net: 0,
    cumNet: 0,
    bySource: emptyBySource(),
  }));
  for (const it of inWindow) {
    const b = buckets.find((x) => it.date.getTime() >= x.start.getTime() && it.date.getTime() < x.end.getTime());
    if (!b) continue;
    b.bySource[it.source] += it.amount;
    if (it.type === "IN") b.in += it.amount;
    else b.out += it.amount;
  }
  let cum = 0;
  for (const b of buckets) {
    b.net = b.in - b.out;
    cum += b.net;
    b.cumNet = cum;
  }

  const totalIn = buckets.reduce((s, b) => s + b.in, 0);
  const totalOut = buckets.reduce((s, b) => s + b.out, 0);

  return {
    asOf: now,
    start,
    end,
    buckets,
    items: inWindow,
    totalIn,
    totalOut,
    totalNet: totalIn - totalOut,
    beyond,
    unscheduled: {
      in: unscheduledIn,
      out: unscheduledOut,
      totalIn: unscheduledIn.reduce((s, x) => s + x.amount, 0),
      totalOut: unscheduledOut.reduce((s, x) => s + x.amount, 0),
    },
    projects,
  };
}
