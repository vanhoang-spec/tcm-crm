import { prisma } from "./prisma";
import { getStringSetting } from "./settings";

// ─────────────────────────────────────────────────────────
// Cost-per-task Creative — Kế hoạch (ma trận %) vs Thực tế (phân bổ theo giờ hoursSpent).
//
// ⚠ 2 sự thật phải nhớ khi đọc số ở đây:
//  1) actualCost là PHÂN BỔ quỹ lương theo giờ, KHÔNG phải tiền đã chi. Lương vẫn trả dù có task hay không.
//     UI ghi "phân bổ theo giờ thực tế", không ghi "chi phí thực tế".
//  2) Chênh lệch ở cấp VỊ TRÍ ≈ 0 về mặt cấu trúc (Σ_T actualCost[p][T] ≡ pool_p). Chênh lệch chỉ có ý nghĩa
//     ở từng ô (vị trí × loại task) và tổng theo cột loại task.
//
// Hàm computeCreativeCost THUẦN (number in/out — BigInt×Float không typecheck; Number() ở biên, round ở cuối).
// getCreativeCostReport là wrapper IO (đọc DB).
// ─────────────────────────────────────────────────────────

// Period engine đã tách ra src/lib/period.ts (dùng chung với module KPI) — re-export giữ nguyên caller cũ.
import { COST_REVIEW_CYCLES, type CostReviewCycle } from "./period";
export { COST_REVIEW_CYCLES, parsePeriodCode, currentPeriodCode, shiftPeriodCode } from "./period";
export type { CostReviewCycle, ParsedPeriod } from "./period";
import { parsePeriodCode } from "./period";

export async function getCostReviewCycle(): Promise<CostReviewCycle> {
  const raw = await getStringSetting("creative", "cost_review_cycle", "MONTH");
  return (COST_REVIEW_CYCLES as readonly string[]).includes(raw) ? (raw as CostReviewCycle) : "MONTH";
}

// ── Kiểu dữ liệu hàm thuần ──
export type CostWarning =
  | { kind: "NO_RATIOS"; positionTitle: string }
  | { kind: "NO_HOURS"; positionTitle: string }
  | { kind: "NO_BUDGET"; positionTitle: string; deliveredCount: number }
  | { kind: "NO_HEADCOUNT"; positionTitle: string }
  | { kind: "RATIO_SUM_NOT_100"; positionTitle: string; sum: number }
  | { kind: "TASKS_MISSING_HOURS"; count: number }
  | { kind: "TASKS_MISSING_TYPE"; count: number }
  | { kind: "TASKS_MISSING_ASSIGNEE"; count: number }
  | { kind: "ORPHAN_BUDGET"; positionTitle: string };

export type CostInput = {
  periodMonths: number;
  positions: { title: string; monthlySalary: number; headcount: number }[]; // headcount đã resolve
  ratios: { title: string; taskTypeId: string; percent: number }[];
  tasks: { taskTypeId: string | null; positionTitle: string | null; hours: number | null }[]; // task DELIVERED trong kỳ
  taskTypes: { id: string; labelVi: string; labelEn: string | null }[];
  activeTitlesWithStaff: string[]; // title CREATIVE có nhân sự active — để cảnh báo budget mồ côi
};

export type CostCell = { plannedPercent: number; plannedCost: number; actualHours: number; actualPercent: number; actualCost: number; variance: number; deliveredCount: number };
export type CostPositionRow = {
  title: string;
  monthlySalary: number;
  headcount: number;
  pool: number;
  totalHours: number;
  unallocatedPlannedCost: number; // pool × (1 − Σratio/100)
  untypedActualCost: number; // phần giờ của task không có loại
  cells: Record<string, CostCell>; // key = taskTypeId
};
export type CostReport = {
  positions: CostPositionRow[];
  byTaskType: { taskTypeId: string; labelVi: string; labelEn: string | null; plannedCost: number; actualCost: number; variance: number; deliveredCount: number; costPerTaskActual: number | null }[];
  totals: { pool: number; plannedAllocated: number; actualAllocated: number; deliveredCount: number };
  warnings: CostWarning[];
};

const SENTINEL_TITLE = "—"; // task assignee không có title

/** Tính toán thuần — không đọc DB. Xem doc-comment đầu file cho ý nghĩa số. */
export function computeCreativeCost(input: CostInput): CostReport {
  const { periodMonths, positions, ratios, tasks, taskTypes } = input;
  const warnings: CostWarning[] = [];

  // Gom giờ theo (title, taskTypeId) + tổng giờ theo title + đếm task DELIVERED theo (title,type) và theo type.
  const hoursByTitleType = new Map<string, number>(); // key `${title}|${typeId}`
  const totalHoursByTitle = new Map<string, number>();
  const untypedHoursByTitle = new Map<string, number>();
  const countByTitleType = new Map<string, number>();
  const countByType = new Map<string, number>();
  let missingHours = 0, missingType = 0, missingAssignee = 0;

  for (const task of tasks) {
    if (!task.positionTitle) {
      missingAssignee++;
      continue; // không quy được về vị trí nào
    }
    const title = task.positionTitle || SENTINEL_TITLE;
    const h = task.hours ?? 0;
    if (task.hours == null) missingHours++;
    totalHoursByTitle.set(title, (totalHoursByTitle.get(title) ?? 0) + h);
    if (task.taskTypeId) {
      const k = `${title}|${task.taskTypeId}`;
      hoursByTitleType.set(k, (hoursByTitleType.get(k) ?? 0) + h);
      countByTitleType.set(k, (countByTitleType.get(k) ?? 0) + 1);
      countByType.set(task.taskTypeId, (countByType.get(task.taskTypeId) ?? 0) + 1);
    } else {
      missingType++;
      untypedHoursByTitle.set(title, (untypedHoursByTitle.get(title) ?? 0) + h);
    }
  }
  if (missingHours > 0) warnings.push({ kind: "TASKS_MISSING_HOURS", count: missingHours });
  if (missingType > 0) warnings.push({ kind: "TASKS_MISSING_TYPE", count: missingType });
  if (missingAssignee > 0) warnings.push({ kind: "TASKS_MISSING_ASSIGNEE", count: missingAssignee });

  // Ratio theo (title, typeId).
  const ratioMap = new Map<string, number>();
  const ratioSumByTitle = new Map<string, number>();
  for (const r of ratios) {
    ratioMap.set(`${r.title}|${r.taskTypeId}`, r.percent);
    ratioSumByTitle.set(r.title, (ratioSumByTitle.get(r.title) ?? 0) + r.percent);
  }

  const positionRows: CostPositionRow[] = [];
  const perTypePlanned = new Map<string, number>();
  const perTypeActual = new Map<string, number>();

  for (const pos of positions) {
    const title = pos.title;
    const pool = Math.round(pos.monthlySalary * pos.headcount * periodMonths);
    const totalHours = totalHoursByTitle.get(title) ?? 0;
    const ratioSum = ratioSumByTitle.get(title) ?? 0;
    const hasRatios = ratios.some((r) => r.title === title);

    if (pos.headcount === 0) warnings.push({ kind: "NO_HEADCOUNT", positionTitle: title });
    if (!hasRatios) warnings.push({ kind: "NO_RATIOS", positionTitle: title });
    else if (Math.round(ratioSum) !== 100) warnings.push({ kind: "RATIO_SUM_NOT_100", positionTitle: title, sum: ratioSum });
    if (totalHours === 0) warnings.push({ kind: "NO_HOURS", positionTitle: title });
    if (!input.activeTitlesWithStaff.includes(title)) warnings.push({ kind: "ORPHAN_BUDGET", positionTitle: title });

    const cells: Record<string, CostCell> = {};
    for (const tt of taskTypes) {
      const plannedPercent = ratioMap.get(`${title}|${tt.id}`) ?? 0;
      const plannedCost = Math.round(pool * (plannedPercent / 100));
      const actualHours = hoursByTitleType.get(`${title}|${tt.id}`) ?? 0;
      const actualPercent = totalHours > 0 ? (actualHours / totalHours) * 100 : 0;
      const actualCost = Math.round(pool * (actualPercent / 100));
      const deliveredCount = countByTitleType.get(`${title}|${tt.id}`) ?? 0;
      cells[tt.id] = { plannedPercent, plannedCost, actualHours, actualPercent, actualCost, variance: actualCost - plannedCost, deliveredCount };
      perTypePlanned.set(tt.id, (perTypePlanned.get(tt.id) ?? 0) + plannedCost);
      perTypeActual.set(tt.id, (perTypeActual.get(tt.id) ?? 0) + actualCost);
    }

    const untypedHours = untypedHoursByTitle.get(title) ?? 0;
    const untypedActualCost = totalHours > 0 ? Math.round(pool * (untypedHours / totalHours)) : 0;
    const unallocatedPlannedCost = Math.round(pool * (1 - ratioSum / 100));

    positionRows.push({ title, monthlySalary: pos.monthlySalary, headcount: pos.headcount, pool, totalHours, unallocatedPlannedCost, untypedActualCost, cells });
  }

  // Vị trí có giờ/task DELIVERED nhưng KHÔNG có ngân sách lương (không nằm trong `positions`) — KHÔNG được
  // âm thầm rơi mất. Tạo dòng pool=0 để vẫn hiện giờ + deliveredCount, kèm cảnh báo NO_BUDGET bắt buộc.
  const knownTitles = new Set(positions.map((p) => p.title));
  for (const [title, totalHours] of totalHoursByTitle.entries()) {
    if (knownTitles.has(title)) continue;
    const deliveredCount = Array.from(countByTitleType.entries())
      .filter(([k]) => k.startsWith(`${title}|`))
      .reduce((sum, [, c]) => sum + c, 0);
    warnings.push({ kind: "NO_BUDGET", positionTitle: title, deliveredCount });

    const cells: Record<string, CostCell> = {};
    for (const tt of taskTypes) {
      const actualHours = hoursByTitleType.get(`${title}|${tt.id}`) ?? 0;
      const actualPercent = totalHours > 0 ? (actualHours / totalHours) * 100 : 0;
      const dc = countByTitleType.get(`${title}|${tt.id}`) ?? 0;
      cells[tt.id] = { plannedPercent: 0, plannedCost: 0, actualHours, actualPercent, actualCost: 0, variance: 0, deliveredCount: dc };
    }
    positionRows.push({ title, monthlySalary: 0, headcount: 0, pool: 0, totalHours, unallocatedPlannedCost: 0, untypedActualCost: 0, cells });
  }

  const byTaskType = taskTypes.map((tt) => {
    const planned = perTypePlanned.get(tt.id) ?? 0;
    const actual = perTypeActual.get(tt.id) ?? 0;
    const count = countByType.get(tt.id) ?? 0;
    return {
      taskTypeId: tt.id,
      labelVi: tt.labelVi,
      labelEn: tt.labelEn,
      plannedCost: planned,
      actualCost: actual,
      variance: actual - planned,
      deliveredCount: count,
      costPerTaskActual: count > 0 ? Math.round(actual / count) : null, // 0 task → null → UI hiện "—"
    };
  });

  const totalPool = positionRows.reduce((s, p) => s + p.pool, 0);
  const totalPlanned = byTaskType.reduce((s, t) => s + t.plannedCost, 0);
  const totalActual = byTaskType.reduce((s, t) => s + t.actualCost, 0);
  const totalDelivered = byTaskType.reduce((s, t) => s + t.deliveredCount, 0);

  return {
    positions: positionRows,
    byTaskType,
    totals: { pool: totalPool, plannedAllocated: totalPlanned, actualAllocated: totalActual, deliveredCount: totalDelivered },
    warnings,
  };
}

/** Wrapper IO: nạp budget/ratio/task DELIVERED trong kỳ + resolve headcount live, rồi gọi computeCreativeCost. */
export async function getCreativeCostReport(periodCode: string): Promise<CostReport | null> {
  const parsed = parsePeriodCode(periodCode);
  if (!parsed) return null;

  const [budgets, ratios, taskTypeSet, creativeStaff, deliveredTasks] = await Promise.all([
    prisma.creativeSalaryBudget.findMany({ where: { periodCode } }),
    prisma.creativeAllocationRatio.findMany({ where: { periodCode } }),
    prisma.optionSet.findUnique({ where: { code: "creative_task_type" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
    // payrollExempt bị loại khỏi headcount: quỹ lương vị trí = lương/tháng × số NGƯỜI ĐƯỢC TRẢ,
    // đếm cả người TCM không trả lương sẽ thổi quỹ lên nguyên một suất và làm sai cost-per-task.
    prisma.staff.findMany({ where: { department: { code: "CREATIVE" }, isActive: true, payrollExempt: false }, select: { id: true, title: true } }),
    prisma.creativeTask.findMany({
      where: { status: "DELIVERED", deliveredAt: { gte: parsed.start, lt: parsed.end } },
      select: { taskTypeId: true, hoursSpent: true, assignee: { select: { title: true } } },
    }),
  ]);

  // headcount live theo title (nhân sự CREATIVE active), override nếu budget có headcountOverride.
  const staffCountByTitle = new Map<string, number>();
  for (const s of creativeStaff) {
    const title = s.title ?? "—";
    staffCountByTitle.set(title, (staffCountByTitle.get(title) ?? 0) + 1);
  }
  const activeTitlesWithStaff = Array.from(staffCountByTitle.keys());

  const positions = budgets.map((b) => ({
    title: b.positionTitle,
    monthlySalary: Number(b.monthlySalary),
    headcount: b.headcountOverride ?? staffCountByTitle.get(b.positionTitle) ?? 0,
  }));

  const taskTypes = (taskTypeSet?.items ?? []).map((it) => ({ id: it.id, labelVi: it.labelVi, labelEn: it.labelEn }));

  const tasks = deliveredTasks.map((t) => ({
    taskTypeId: t.taskTypeId,
    positionTitle: t.assignee?.title ?? (t.assignee ? "—" : null), // có assignee nhưng title null → sentinel; không assignee → null
    hours: t.hoursSpent,
  }));

  return computeCreativeCost({
    periodMonths: parsed.months,
    positions,
    ratios: ratios.map((r) => ({ title: r.positionTitle, taskTypeId: r.taskTypeId, percent: r.percent })),
    tasks,
    taskTypes,
    activeTitlesWithStaff,
  });
}

/** Danh sách title vị trí CREATIVE đang có nhân sự active (nguồn cho <select> ở Settings). */
export async function getCreativePositionTitles(): Promise<string[]> {
  const staff = await prisma.staff.findMany({ where: { department: { code: "CREATIVE" }, isActive: true }, select: { title: true } });
  const titles = new Set<string>();
  for (const s of staff) titles.add(s.title ?? "—");
  return Array.from(titles).sort();
}
