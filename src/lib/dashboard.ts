import { prisma } from "./prisma";
import { arStatus } from "./ar";
import { EXECUTION_STATUS_CODES } from "./projects";
import { getCreativeDashboardStats } from "./creative";
import { getCreativeOverdueTasks } from "./reminders";

// ─────────────────────────────────────────────────────────
// Dashboard tổng quan — khối kinh doanh theo team, cashflow MTD (tháng dương lịch, không buffer),
// tiến độ task theo bộ phận. Đọc-only, không có side effect. BigInt → Number tại điểm cộng dồn.
// ─────────────────────────────────────────────────────────

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

// ── Khối 1: Kinh doanh ──────────────────────────────────

export type BusinessVolume = {
  activeClients: number;
  totalClients: number;
  runningProjectsMtd: number;
  runningProjectsYtd: number;
  biddingProjects: number;
};

/** teamCode undefined = toàn công ty (không cộng dồn từ các team — đếm trực tiếp để không lệch khi có dự án chưa gán team). */
export async function getBusinessVolume(teamCode: string | undefined, now: Date): Promise<BusinessVolume> {
  const ownerTeam = teamCode ? { ownerTeam: { code: teamCode } } : {};
  const monthStart = startOfMonth(now);
  // YTD = năm TÀI CHÍNH của dự án (Project.fiscalYear), KHÔNG phải năm bản ghi được tạo trong DB —
  // 2 giá trị lệch nhau khi import dữ liệu lịch sử hoặc dự án tạo cuối năm nhưng gán fiscalYear sau.
  const fiscalYear = now.getFullYear();

  const [activeClients, totalClients, runningProjectsMtd, runningProjectsYtd, biddingProjects] = await Promise.all([
    prisma.client.count({ where: { isActive: true, status: { code: "ACTIVE" }, ...ownerTeam } }),
    prisma.client.count({ where: { isActive: true, ...ownerTeam } }),
    prisma.project.count({
      where: { status: { code: { in: [...EXECUTION_STATUS_CODES] } }, processingAt: { gte: monthStart }, ...ownerTeam },
    }),
    prisma.project.count({
      where: { status: { code: { in: [...EXECUTION_STATUS_CODES] } }, fiscalYear, ...ownerTeam },
    }),
    prisma.project.count({ where: { status: { code: { in: ["BIDDING", "PENDING"] } }, ...ownerTeam } }),
  ]);

  return { activeClients, totalClients, runningProjectsMtd, runningProjectsYtd, biddingProjects };
}

export async function getBusinessVolumeAllTeams(now: Date): Promise<Record<string, BusinessVolume>> {
  const teams = await prisma.team.findMany({ where: { isActive: true }, select: { code: true }, orderBy: { code: "asc" } });
  const entries = await Promise.all([
    ...teams.map(async (t) => [t.code, await getBusinessVolume(t.code, now)] as const),
    (async () => ["ALL", await getBusinessVolume(undefined, now)] as const)(),
  ]);
  return Object.fromEntries(entries);
}

// ── Khối 2: Cashflow MTD (tháng dương lịch, không buffer) — chỉ exec (CEO/CFO) gọi ──

export type CashflowMtd = {
  inActual: number;
  inRemaining: number;
  /** Phần của inRemaining đã quá hạn — tách ra để BGĐ nhìn phát biết ngay, xem ghi chú bên dưới. */
  inOverdue: number;
  outActual: number;
  outRemaining: number;
};

export async function getCashflowMtd(now: Date): Promise<CashflowMtd> {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [payments, unpaidInvoices, vendorPaymentsPaid, advancesDisbursed, vendorPaymentsScheduled, advancesRequested] = await Promise.all([
    prisma.clientPayment.findMany({ where: { paidDate: { gte: monthStart, lt: now } }, select: { amount: true } }),
    prisma.clientInvoice.findMany({ where: { voidedAt: null }, select: { amount: true, invoiceDate: true, dueDate: true, payments: { select: { amount: true } } } }),
    prisma.vendorPayment.findMany({ where: { status: "PAID", paidDate: { gte: monthStart, lt: now } }, select: { amount: true } }),
    prisma.advance.findMany({ where: { disbursedAt: { gte: monthStart, lt: now } }, select: { amount: true } }),
    // dueDate nullable và form cho để trống — Prisma/SQL loại NULL khỏi `lt` nên phiếu chưa có hạn
    // đang VÔ HÌNH ở đây, trong khi cashflow.ts coi là cần chi ngay hôm nay. Lấy cả hai cho khớp.
    prisma.vendorPayment.findMany({
      where: { status: "SCHEDULED", OR: [{ dueDate: { lt: monthEnd } }, { dueDate: null }] },
      select: { amount: true },
    }),
    prisma.advance.findMany({ where: { status: "REQUESTED" }, select: { amount: true } }),
  ]);

  const inActual = payments.reduce((s, p) => s + Number(p.amount), 0);

  // "Sẽ thu" = mọi khoản còn dư có hạn rơi TRƯỚC cuối tháng, TÍNH CẢ phần đã quá hạn từ trước.
  // Trước đây có thêm điều kiện `baseDate < now → bỏ qua`, tức loại sạch khoản quá hạn: nợ càng
  // xấu (quá hạn càng lâu) thì càng vô hình trên dashboard — đúng chỗ BGĐ cần thấy nhất.
  let inRemaining = 0;
  let inOverdue = 0;
  for (const inv of unpaidInvoices) {
    const st = arStatus(
      {
        amount: Number(inv.amount),
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        paidAmounts: inv.payments.map((p) => Number(p.amount)),
      },
      now,
    );
    if (st.outstanding <= 0 || st.dueBase >= monthEnd) continue;
    inRemaining += st.outstanding;
    if (st.isOverdue) inOverdue += st.outstanding;
  }

  const outActual = vendorPaymentsPaid.reduce((s, p) => s + Number(p.amount), 0) + advancesDisbursed.reduce((s, a) => s + Number(a.amount), 0);
  const outRemaining =
    vendorPaymentsScheduled.reduce((s, p) => s + Number(p.amount), 0) + advancesRequested.reduce((s, a) => s + Number(a.amount), 0);

  return { inActual, inRemaining, inOverdue, outActual, outRemaining };
}

// ── Khối 3: Tiến độ task theo bộ phận ──────────────────

export type DeptTaskRatio = { key: string; deptCode: string; teamCode: string | null; overdue: number; total: number };

const TIMELINE_DEPTS = ["ACCOUNT", "PLANNING", "OPE", "PRO", "PCC"] as const;

/**
 * teamCode: khi truyền → chỉ tính bucket TEAM:<code> (Account). Khi undefined → tính tất cả bucket
 * (Creative company-wide + Account theo từng team A1/A2/A3 + Planning/OPE/PRO/PCC company-wide).
 */
export async function getDeptTaskRatios(now: Date, onlyTeamCode?: string): Promise<DeptTaskRatio[]> {
  const results: DeptTaskRatio[] = [];

  // Creative — tái dùng helper sẵn có, KHÔNG viết lại. Company-wide (không tách team).
  if (!onlyTeamCode) {
    const [stats, overdue] = await Promise.all([getCreativeDashboardStats(), getCreativeOverdueTasks()]);
    results.push({ key: "CREATIVE", deptCode: "CREATIVE", teamCode: null, overdue: overdue.length, total: stats.totalActive.bidding + stats.totalActive.working });
  }

  // Account (theo team) + Planning/OPE/PRO/PCC — nguồn chung TimelineItem, resolve dept ở JS.
  const items = await prisma.timelineItem.findMany({
    where: {
      project: {
        status: { code: { in: [...EXECUTION_STATUS_CODES] } },
        ...(onlyTeamCode ? { ownerTeam: { code: onlyTeamCode } } : {}),
      },
    },
    select: {
      endDate: true,
      departmentCode: true,
      status: { select: { code: true } },
      ownerStaff: { select: { department: { select: { code: true } } } },
      project: { select: { ownerTeam: { select: { code: true } } } },
    },
  });

  type Bucket = { overdue: number; total: number };
  const buckets = new Map<string, Bucket>();
  const bucketKey = (deptCode: string, teamCode: string | null) => `${deptCode}|${teamCode ?? ""}`;

  for (const it of items) {
    const deptCode = it.ownerStaff?.department?.code ?? it.departmentCode ?? null;
    if (!deptCode || !(TIMELINE_DEPTS as readonly string[]).includes(deptCode)) continue;
    // Khi lọc theo 1 team (Account staff): CHỈ tính bucket ACCOUNT của chính team đó — tránh lộ
    // task Planning/OPE/PRO/PCC của dự án team đó sang view của NV Account (không phải scope của họ).
    if (onlyTeamCode && deptCode !== "ACCOUNT") continue;
    const teamCode = deptCode === "ACCOUNT" ? (it.project.ownerTeam?.code ?? null) : null;
    if (deptCode === "ACCOUNT" && !teamCode) continue; // dự án chưa gán team — không quy được về A1/A2/A3
    const key = bucketKey(deptCode, teamCode);
    const b = buckets.get(key) ?? { overdue: 0, total: 0 };
    const isDone = it.status?.code === "DONE";
    if (!isDone) {
      b.total++;
      if (it.endDate && it.endDate < now) b.overdue++;
    }
    buckets.set(key, b);
  }

  for (const [key, b] of buckets) {
    const [deptCode, teamCode] = key.split("|");
    results.push({ key, deptCode, teamCode: teamCode || null, overdue: b.overdue, total: b.total });
  }

  return results;
}
