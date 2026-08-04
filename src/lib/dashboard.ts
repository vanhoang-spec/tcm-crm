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
    // Loại tạm ứng đã HUỶ-SAU-GIẢI-NGÂN (reverseDisbursedAdvance): tiền đã thu hồi thì không còn
    // là "đã chi" của tháng — giữ lại sẽ thổi phồng cash-out thực tế.
    prisma.advance.findMany({ where: { disbursedAt: { gte: monthStart, lt: now }, status: { not: "CANCELED" } }, select: { amount: true } }),
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

// ── Khối 2b: Thu/chi thực tế 6 tháng (biểu đồ xu hướng) ─

export type CashflowMonth = { year: number; month: number; inActual: number; outActual: number };

/**
 * Thu/chi ĐÃ PHÁT SINH của `months` tháng gần nhất, cũ → mới.
 *
 * Dùng ĐÚNG 3 nguồn của `inActual`/`outActual` trong getCashflowMtd, và cũng chặn `lt: now` — nên
 * cột cuối cùng của biểu đồ BẰNG ĐÚNG con số trên card "Đã thu / Đã chi (tháng này)". Hai chỗ lệch
 * nhau trên cùng một trang là lỗi nặng hơn hẳn việc thiếu biểu đồ.
 *
 * ⚠ Đây là dữ liệu dòng tiền — người gọi PHẢI gác `dashboard.cashflow` như khối cashflow.
 * Nạp một lượt cả cửa sổ rồi gom ở JS (3 truy vấn, không phải 3×N).
 */
export async function getCashflowTrend(now: Date, months = 6): Promise<CashflowMonth[]> {
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const [payments, vendorPaid, advances] = await Promise.all([
    prisma.clientPayment.findMany({ where: { paidDate: { gte: from, lt: now } }, select: { paidDate: true, amount: true } }),
    prisma.vendorPayment.findMany({ where: { status: "PAID", paidDate: { gte: from, lt: now } }, select: { paidDate: true, amount: true } }),
    prisma.advance.findMany({
      where: { disbursedAt: { gte: from, lt: now }, status: { not: "CANCELED" } },
      select: { disbursedAt: true, amount: true },
    }),
  ]);

  const buckets: CashflowMonth[] = [];
  const index = new Map<string, CashflowMonth>();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
    const row = { year: d.getFullYear(), month: d.getMonth() + 1, inActual: 0, outActual: 0 };
    buckets.push(row);
    index.set(`${row.year}-${row.month}`, row);
  }
  // Giờ ĐỊA PHƯƠNG (getFullYear/getMonth), khớp startOfMonth ở trên — đừng đổi sang getUTC*.
  const add = (d: Date | null, amount: bigint | number, key: "inActual" | "outActual") => {
    if (!d) return;
    const row = index.get(`${d.getFullYear()}-${d.getMonth() + 1}`);
    if (row) row[key] += Number(amount);
  };
  for (const p of payments) add(p.paidDate, p.amount, "inActual");
  for (const v of vendorPaid) add(v.paidDate, v.amount, "outActual");
  for (const a of advances) add(a.disbursedAt, a.amount, "outActual");

  return buckets;
}

// ── Khối 2c: Cơ cấu dự án theo chặng (biểu đồ thanh chồng) ─

/** Ba chặng gom từ 8 mã trạng thái. `EXECUTION` khớp ĐÚNG EXECUTION_STATUS_CODES. */
export type ProjectStage = "BIDDING" | "EXECUTION" | "CLOSED";
export type ProjectStageMix = { stage: ProjectStage; count: number }[];

const CLOSED_STATUS_CODES = ["FAILED", "CANCELED"] as const;

/**
 * Cơ cấu dự án của NĂM TÀI CHÍNH hiện tại theo 3 chặng — ba số cộng lại đúng bằng tổng dự án của
 * năm, nên biểu đồ tự chứng minh được nó không bỏ sót mã trạng thái nào.
 *
 * ⚠ Cùng bộ lọc `fiscalYear` cho cả ba chặng. Bản phác thảo ban đầu định ghép 19 dự án bidding
 * (KHÔNG lọc năm) với 6 dự án thực thi (CÓ lọc năm) vào một vòng tròn — hai mẫu số khác nhau, cộng
 * lại thành một "tổng" vô nghĩa. `EXECUTION` ở đây bằng đúng `runningProjectsYtd` của card phía trên.
 */
export async function getProjectStageMix(now: Date, teamCode?: string): Promise<ProjectStageMix> {
  const ownerTeam = teamCode ? { ownerTeam: { code: teamCode } } : {};
  const fiscalYear = now.getFullYear();

  const [execution, closed, total] = await Promise.all([
    prisma.project.count({ where: { fiscalYear, status: { code: { in: [...EXECUTION_STATUS_CODES] } }, ...ownerTeam } }),
    prisma.project.count({ where: { fiscalYear, status: { code: { in: [...CLOSED_STATUS_CODES] } }, ...ownerTeam } }),
    prisma.project.count({ where: { fiscalYear, ...ownerTeam } }),
  ]);

  // Chặng đầu suy ra bằng phép trừ, KHÔNG liệt kê ["BIDDING","PENDING"]: admin thêm mã trạng thái
  // mới trong Settings là dự án đó vẫn được đếm, thay vì rơi ra ngoài và làm tổng lệch âm thầm.
  return [
    { stage: "BIDDING", count: Math.max(0, total - execution - closed) },
    { stage: "EXECUTION", count: execution },
    { stage: "CLOSED", count: closed },
  ];
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
