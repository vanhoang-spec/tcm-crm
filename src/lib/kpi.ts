import { prisma } from "./prisma";
import { getNumberSetting } from "./settings";
import { parsePeriodCode, currentPeriodCode, shiftPeriodCode } from "./period";
import { computeMarginPct } from "./bidding";

// ─────────────────────────────────────────────────────────
// Module ⑥ KPI — Khung lương 75/25.
//
// Quyết định BoD (phase 1):
//  • Quỹ 25% zero-sum: floor_factor = cap_factor = 1.0 ⇒ teamFactor luôn 1.0, quỹ luôn chia đủ.
//    Engine hệ số margin vẫn tính + hiển thị (minh bạch trước, gắn tiền sau) — BoD bật co giãn
//    bằng cách hạ kpi.floor_factor trong Settings, KHÔNG cần sửa code.
//  • Pool trống dự án finished trong cửa sổ → kpi.empty_window_factor (chỉnh theo mùa vụ).
//  • Margin vượt target → trần cap_factor (mặc định 1.0, chưa thưởng vượt).
//  • Lead nằm TRONG quỹ team mình, BoD chấm (tiêu chí appliesTo="LEAD" là optional — chỉ tính khi có điểm).
//
// computeTeamFactor / computeKpiAllocation THUẦN (number in/out — BigInt ở biên, round cuối).
// getKpiReport là wrapper IO; kỳ CLOSED đọc từ KpiPeriod.resultJson (KHÔNG tính lại).
// ─────────────────────────────────────────────────────────

export const KPI_DEPT_CODES = ["ACCOUNT", "PLANNING", "CREATIVE", "OPE", "PRO"] as const;

export type KpiWarning =
  | { kind: "NO_SALARY_FOR_TITLE"; poolKey: string; staffName: string; title: string | null }
  | { kind: "STAFF_NO_POSITION"; poolKey: string; staffName: string }
  | { kind: "MISSING_SCORES"; poolKey: string; staffName: string } // BLOCKING — chặn chốt kỳ
  | { kind: "ZERO_SCORE_SUM"; poolKey: string } // mọi điểm = 0 → chia đều tạm
  | { kind: "NO_FINISHED_PROJECTS"; poolKey: string }
  | { kind: "NO_COSTSHEET_MARGIN"; projectCode: string }
  | { kind: "NO_TIMESHEET"; poolKey: string; staffName: string }
  | { kind: "SINGLE_MEMBER_POOL"; poolKey: string }
  | { kind: "NO_ACTIVE_CRITERIA"; poolKey: string };

export function isBlockingWarning(w: KpiWarning): boolean {
  return w.kind === "MISSING_SCORES";
}

export type KpiFactorParams = {
  targetMarginPct: number;
  floorMarginPct: number;
  floorFactor: number;
  capFactor: number;
  emptyWindowFactor: number;
};

export type KpiParams = KpiFactorParams & { poolPercent: number; marginWindowMonths: number };

/** Đường cong margin → hệ số quỹ (piecewise linear). null margin = pool trống dự án → emptyWindowFactor. */
export function computeTeamFactor(marginWeighted: number | null, p: KpiFactorParams): number {
  if (marginWeighted == null) return p.emptyWindowFactor;
  if (marginWeighted >= p.targetMarginPct) return p.capFactor;
  if (marginWeighted <= p.floorMarginPct) return p.floorFactor;
  const t = (marginWeighted - p.floorMarginPct) / (p.targetMarginPct - p.floorMarginPct);
  return p.floorFactor + t * (1 - p.floorFactor);
}

export type KpiCriterionInput = {
  id: string;
  code: string;
  nameVi: string;
  nameEn: string | null;
  appliesTo: string; // ALL | ACCOUNT | PLANNING | CREATIVE | OPE | PRO | LEAD
  weight: number;
  scaleMax: number;
  sourceType: string;
  autoKey: string | null;
  sort: number;
};

export type KpiMemberInput = {
  staffId: string;
  fullName: string;
  title: string | null;
  salary: number | null; // lương full VND/tháng theo vị trí — null = thiếu dòng PositionSalary
  attendance: number | null; // worked/planned clamp 0..1 — null = không có timesheet CONFIRMED
  scores: Record<string, number>; // criterionId → điểm đã lưu (KpiScore)
};

export type KpiPoolInput = {
  poolKey: string; // "TEAM:A1" | "DEPT:CREATIVE"
  label: string;
  deptCode: string;
  members: KpiMemberInput[];
  marginWeighted: number | null; // null = không có dự án finished trong cửa sổ
  projects: { code: string; name: string; marginPct: number; ceTotal: number }[];
};

export type KpiInput = { periodMonths: number; pools: KpiPoolInput[]; criteria: KpiCriterionInput[]; params: KpiParams };

export type KpiMemberRow = {
  staffId: string;
  fullName: string;
  title: string | null;
  salary: number; // full/tháng (0 nếu thiếu)
  fixedPart: number; // (100 − poolPercent)% × salary × months
  perfBase: number; // poolPercent% × salary × months — phần cá nhân góp vào quỹ
  weightedScore: number;
  attendance: number; // 1.0 nếu không có timesheet
  share: number; // 0..1 trong quỹ
  payout: number; // VND phần performance nhận
  excluded: "NO_SALARY" | "MISSING_SCORES" | null;
};

export type KpiPoolReport = {
  poolKey: string;
  label: string;
  deptCode: string;
  base: number; // Σ perfBase các NV hợp lệ
  marginWeighted: number | null;
  teamFactor: number;
  poolAmount: number; // base × teamFactor
  projects: { code: string; name: string; marginPct: number; ceTotal: number }[];
  rows: KpiMemberRow[];
  blocking: boolean; // còn cảnh báo chặn chốt kỳ
};

export type KpiReport = {
  periodMonths: number;
  params: KpiParams;
  pools: KpiPoolReport[];
  warnings: KpiWarning[];
};

/** Tiêu chí áp cho pool: ALL + đúng dept (ACCOUNT phủ mọi team A1-3). LEAD là optional (không bắt buộc chấm). */
export function criteriaForPool(criteria: KpiCriterionInput[], deptCode: string): { required: KpiCriterionInput[]; optional: KpiCriterionInput[] } {
  const required = criteria.filter((c) => c.appliesTo === "ALL" || c.appliesTo === deptCode);
  const optional = criteria.filter((c) => c.appliesTo === "LEAD");
  return { required, optional };
}

/** Tính toán thuần — không đọc DB. Nguyên tắc: cảnh báo & hiện ra, không bịa số, không âm thầm bỏ. */
export function computeKpiAllocation(input: KpiInput): KpiReport {
  const { periodMonths, pools, criteria, params } = input;
  const warnings: KpiWarning[] = [];
  const poolReports: KpiPoolReport[] = [];

  for (const pool of pools) {
    const { required, optional } = criteriaForPool(criteria, pool.deptCode);
    if (required.length === 0) warnings.push({ kind: "NO_ACTIVE_CRITERIA", poolKey: pool.poolKey });

    const teamFactor = computeTeamFactor(pool.marginWeighted, params);
    if (pool.marginWeighted == null) warnings.push({ kind: "NO_FINISHED_PROJECTS", poolKey: pool.poolKey });

    // Phân loại thành viên: đủ điều kiện (có lương) vs bị loại.
    const rows: KpiMemberRow[] = [];
    let base = 0;
    let poolBlocking = false;

    for (const m of pool.members) {
      const salary = m.salary;
      if (salary == null) {
        if (m.title == null) warnings.push({ kind: "STAFF_NO_POSITION", poolKey: pool.poolKey, staffName: m.fullName });
        else warnings.push({ kind: "NO_SALARY_FOR_TITLE", poolKey: pool.poolKey, staffName: m.fullName, title: m.title });
        rows.push({ staffId: m.staffId, fullName: m.fullName, title: m.title, salary: 0, fixedPart: 0, perfBase: 0, weightedScore: 0, attendance: 1, share: 0, payout: 0, excluded: "NO_SALARY" });
        continue;
      }
      const perfBase = Math.round(salary * periodMonths * (params.poolPercent / 100));
      const fixedPart = Math.round(salary * periodMonths) - perfBase;
      base += perfBase;

      const attendance = m.attendance == null ? 1 : Math.max(0, Math.min(1, m.attendance));
      if (m.attendance == null) warnings.push({ kind: "NO_TIMESHEET", poolKey: pool.poolKey, staffName: m.fullName });

      // Điểm có trọng số: required + optional-có-điểm. Thiếu TOÀN BỘ điểm required → chặn chốt (không default).
      const hasAnyRequiredScore = required.some((c) => m.scores[c.id] != null);
      let ws = 0;
      for (const c of [...required, ...optional]) {
        const s = m.scores[c.id];
        if (s == null) continue;
        ws += c.weight * (Math.max(0, Math.min(c.scaleMax, s)) / c.scaleMax);
      }
      const eligibleCount = pool.members.filter((x) => x.salary != null).length;
      const missingScores = !hasAnyRequiredScore && required.length > 0 && eligibleCount > 1;
      if (missingScores) {
        warnings.push({ kind: "MISSING_SCORES", poolKey: pool.poolKey, staffName: m.fullName });
        poolBlocking = true;
      }

      rows.push({ staffId: m.staffId, fullName: m.fullName, title: m.title, salary, fixedPart, perfBase, weightedScore: ws, attendance, share: 0, payout: 0, excluded: missingScores ? "MISSING_SCORES" : null });
    }

    const poolAmount = Math.round(base * teamFactor);
    const eligible = rows.filter((r) => r.excluded === null);

    if (eligible.length === 1) {
      // Pool 1 người: chia điểm vô nghĩa → nhận thẳng phần của mình × hệ số.
      warnings.push({ kind: "SINGLE_MEMBER_POOL", poolKey: pool.poolKey });
      eligible[0].share = 1;
      eligible[0].payout = Math.round(eligible[0].perfBase * teamFactor);
    } else if (eligible.length > 1) {
      const denom = eligible.reduce((s, r) => s + r.weightedScore * r.attendance, 0);
      if (denom <= 0) {
        // Mọi điểm = 0 (đã chấm nhưng toàn 0) → chia đều tạm + cảnh báo, không NaN.
        warnings.push({ kind: "ZERO_SCORE_SUM", poolKey: pool.poolKey });
        for (const r of eligible) {
          r.share = 1 / eligible.length;
          r.payout = Math.round(poolAmount / eligible.length);
        }
      } else {
        for (const r of eligible) {
          r.share = (r.weightedScore * r.attendance) / denom;
          r.payout = Math.round(poolAmount * r.share);
        }
        // Bù sai số làm tròn vào người share cao nhất để Σ payout ≡ poolAmount.
        const sumPayout = eligible.reduce((s, r) => s + r.payout, 0);
        const diff = poolAmount - sumPayout;
        if (diff !== 0) {
          const top = eligible.reduce((a, b) => (b.share > a.share ? b : a));
          top.payout += diff;
        }
      }
    }

    poolReports.push({
      poolKey: pool.poolKey,
      label: pool.label,
      deptCode: pool.deptCode,
      base,
      marginWeighted: pool.marginWeighted,
      teamFactor,
      poolAmount,
      projects: pool.projects,
      rows,
      blocking: poolBlocking,
    });
  }

  return { periodMonths, params, pools: poolReports, warnings };
}

// ── IO ──────────────────────────────────────────────────

export async function getKpiParams(): Promise<KpiParams> {
  const [poolPercent, targetMarginPct, floorMarginPct, floorFactor, capFactor, emptyWindowFactor, marginWindowMonths] = await Promise.all([
    getNumberSetting("kpi", "pool_percent", 25),
    getNumberSetting("kpi", "target_margin_pct", 31),
    getNumberSetting("kpi", "floor_margin_pct", 15),
    getNumberSetting("kpi", "floor_factor", 1),
    getNumberSetting("kpi", "cap_factor", 1),
    getNumberSetting("kpi", "empty_window_factor", 1),
    getNumberSetting("kpi", "margin_window_months", 3),
  ]);
  return { poolPercent, targetMarginPct, floorMarginPct, floorFactor, capFactor, emptyWindowFactor, marginWindowMonths };
}

/** Tiêu chí active cho 1 kỳ (period bounds so sánh chuỗi — cùng định dạng "YYYY-Mmm" nên lexical đúng). */
export async function getActiveCriteria(periodCode: string): Promise<KpiCriterionInput[]> {
  const all = await prisma.kpiCriterion.findMany({ where: { isActive: true }, orderBy: { sort: "asc" } });
  return all
    .filter((c) => (c.activeFromPeriod == null || c.activeFromPeriod <= periodCode) && (c.activeToPeriod == null || c.activeToPeriod >= periodCode))
    .map((c) => ({ id: c.id, code: c.code, nameVi: c.nameVi, nameEn: c.nameEn, appliesTo: c.appliesTo, weight: c.weight, scaleMax: c.scaleMax, sourceType: c.sourceType, autoKey: c.autoKey, sort: c.sort }));
}

/** Điểm AUTO gợi ý (prefill matrix — KHÔNG dùng trực tiếp vào công thức; chỉ điểm ĐÃ LƯU mới tính). */
export async function computeAutoScores(periodCode: string, criteria: KpiCriterionInput[]): Promise<Record<string, Record<string, number>>> {
  const parsed = parsePeriodCode(periodCode);
  const out: Record<string, Record<string, number>> = {};
  if (!parsed) return out;
  const autoCriteria = criteria.filter((c) => c.sourceType === "AUTO" && c.autoKey);
  if (autoCriteria.length === 0) return out;

  const ym = /^(\d{4})-M(\d{2})$/.exec(periodCode);
  for (const c of autoCriteria) {
    out[c.id] = {};
    if (c.autoKey === "ATTENDANCE" && ym) {
      const { getMonthlyTimesheet } = await import("./timekeeping");
      const rows = await getMonthlyTimesheet(`${ym[1]}-${ym[2]}`);
      for (const r of rows ?? []) {
        if (r.plannedHours <= 0) continue;
        out[c.id][r.staffId] = Math.round(Math.max(0, Math.min(1, r.workedHours / r.plannedHours)) * c.scaleMax * 10) / 10;
      }
    } else if (c.autoKey === "CREATIVE_ONTIME") {
      const tasks = await prisma.creativeTask.findMany({
        where: { status: "DELIVERED", deliveredAt: { gte: parsed.start, lt: parsed.end }, assigneeId: { not: null }, deadline: { not: null } },
        select: { assigneeId: true, deadline: true, deliveredAt: true },
      });
      const byStaff = new Map<string, { total: number; onTime: number }>();
      for (const t of tasks) {
        const e = byStaff.get(t.assigneeId!) ?? { total: 0, onTime: 0 };
        e.total++;
        if (t.deliveredAt && t.deadline && t.deliveredAt <= t.deadline) e.onTime++;
        byStaff.set(t.assigneeId!, e);
      }
      for (const [staffId, e] of byStaff) {
        out[c.id][staffId] = Math.round((e.onTime / e.total) * c.scaleMax * 10) / 10;
      }
    }
  }
  return out;
}

export type KpiPeriodStatusMap = Record<string, { status: string; closedAt: Date | null }>; // poolKey → trạng thái

/**
 * Báo cáo KPI 1 kỳ (tháng). Pool OPEN tính live; pool CLOSED hydrate từ snapshot resultJson —
 * đổi setting/điểm sau khi chốt KHÔNG đổi số đã trả.
 */
export async function getKpiReport(periodCode: string): Promise<{ report: KpiReport; statusMap: KpiPeriodStatusMap; criteria: KpiCriterionInput[]; autoScores: Record<string, Record<string, number>> } | null> {
  const parsed = parsePeriodCode(periodCode);
  if (!parsed) return null;

  const params = await getKpiParams();
  const criteria = await getActiveCriteria(periodCode);

  // Cửa sổ margin trượt: N tháng kết thúc tại cuối kỳ.
  const windowStart = new Date(parsed.end);
  windowStart.setUTCMonth(windowStart.getUTCMonth() - Math.max(1, Math.round(params.marginWindowMonths)));

  const [staff, salaries, scores, finishedProjects, periodRows] = await Promise.all([
    prisma.staff.findMany({
      where: { isActive: true, department: { code: { in: [...KPI_DEPT_CODES] } } },
      select: { id: true, fullName: true, title: true, firstWorkDate: true, department: { select: { code: true } }, team: { select: { code: true, name: true } } },
      orderBy: { fullName: "asc" },
    }),
    prisma.positionSalary.findMany({ where: { periodCode: { lte: periodCode } }, orderBy: { periodCode: "asc" } }),
    prisma.kpiScore.findMany({ where: { periodCode }, select: { criterionId: true, staffId: true, score: true } }),
    prisma.project.findMany({
      where: { finishedAt: { gte: windowStart, lt: parsed.end } },
      select: {
        id: true, code: true, name: true, ownerTeamId: true,
        ownerTeam: { select: { code: true } },
        costSheets: { where: { version: "CTRACT" }, select: { ceTotal: true, coTotal: true, revisions: { orderBy: { revNo: "desc" }, take: 1, select: { marginPct: true } } } },
        orders: { where: { isDraft: false }, select: { department: true } },
      },
    }),
    prisma.kpiPeriod.findMany({ where: { periodCode } }),
  ]);

  const warningsIO: KpiWarning[] = [];

  // Resolve lương: dòng periodCode LỚN NHẤT ≤ kỳ đang tính cho từng (title, dept) — orderBy asc nên ghi đè dần.
  const salaryMap = new Map<string, number>(); // `${title}|${dept}` → VND
  for (const s of salaries) salaryMap.set(`${s.positionTitle}|${s.departmentCode}`, Number(s.monthlySalary));

  // Attendance (chỉ kỳ tháng).
  const attendanceMap = new Map<string, number>();
  const ym = /^(\d{4})-M(\d{2})$/.exec(periodCode);
  if (ym) {
    const { getMonthlyTimesheet } = await import("./timekeeping");
    const rows = await getMonthlyTimesheet(`${ym[1]}-${ym[2]}`);
    for (const r of rows ?? []) {
      if (r.plannedHours > 0) attendanceMap.set(r.staffId, Math.max(0, Math.min(1, r.workedHours / r.plannedHours)));
    }
  }

  const scoreMap = new Map<string, Record<string, number>>(); // staffId → criterionId → score
  for (const s of scores) {
    const e = scoreMap.get(s.staffId) ?? {};
    e[s.criterionId] = s.score;
    scoreMap.set(s.staffId, e);
  }

  // Margin per pool: gom dự án theo pool key.
  type ProjEntry = { code: string; name: string; marginPct: number; ceTotal: number };
  const projectsByPool = new Map<string, ProjEntry[]>();
  const pushProj = (poolKey: string, p: ProjEntry) => {
    const list = projectsByPool.get(poolKey) ?? [];
    list.push(p);
    projectsByPool.set(poolKey, list);
  };
  for (const p of finishedProjects) {
    const sheet = p.costSheets[0];
    if (!sheet) {
      warningsIO.push({ kind: "NO_COSTSHEET_MARGIN", projectCode: p.code });
      continue;
    }
    const marginPct = sheet.revisions[0]?.marginPct ?? computeMarginPct(Number(sheet.ceTotal), Number(sheet.coTotal));
    const entry: ProjEntry = { code: p.code, name: p.name, marginPct, ceTotal: Number(sheet.ceTotal) };
    if (p.ownerTeam?.code) pushProj(`TEAM:${p.ownerTeam.code}`, entry);
    const depts = new Set(p.orders.map((o) => o.department).filter((d) => d !== "ACCOUNT" && d !== "BRAINSTORM"));
    for (const d of depts) {
      if ((KPI_DEPT_CODES as readonly string[]).includes(d)) pushProj(`DEPT:${d}`, entry);
    }
  }
  const weightedMargin = (list: ProjEntry[] | undefined): number | null => {
    if (!list || list.length === 0) return null;
    const sumCe = list.reduce((s, p) => s + p.ceTotal, 0);
    if (sumCe <= 0) return null;
    return list.reduce((s, p) => s + p.marginPct * p.ceTotal, 0) / sumCe;
  };

  // Dựng pools: ACCOUNT theo team, các dept còn lại theo dept.
  const poolMap = new Map<string, KpiPoolInput>();
  const ensurePool = (poolKey: string, label: string, deptCode: string) => {
    let pool = poolMap.get(poolKey);
    if (!pool) {
      pool = { poolKey, label, deptCode, members: [], marginWeighted: weightedMargin(projectsByPool.get(poolKey)), projects: projectsByPool.get(poolKey) ?? [] };
      poolMap.set(poolKey, pool);
    }
    return pool;
  };
  for (const s of staff) {
    if (s.firstWorkDate && s.firstWorkDate >= parsed.end) continue; // vào làm sau kỳ này
    const dept = s.department!.code;
    const poolKey = dept === "ACCOUNT" ? `TEAM:${s.team?.code ?? "—"}` : `DEPT:${dept}`;
    const label = dept === "ACCOUNT" ? (s.team ? `Account ${s.team.code}` : "Account (chưa gán team)") : dept;
    const pool = ensurePool(poolKey, label, dept);
    const salary = s.title != null ? (salaryMap.get(`${s.title}|${dept}`) ?? null) : null;
    pool.members.push({
      staffId: s.id,
      fullName: s.fullName,
      title: s.title,
      salary,
      attendance: attendanceMap.get(s.id) ?? null,
      scores: scoreMap.get(s.id) ?? {},
    });
  }

  const pools = Array.from(poolMap.values()).sort((a, b) => a.poolKey.localeCompare(b.poolKey));
  const report = computeKpiAllocation({ periodMonths: parsed.months, pools, criteria, params });
  report.warnings.push(...warningsIO);

  // Hydrate pool CLOSED từ snapshot.
  const statusMap: KpiPeriodStatusMap = {};
  for (const row of periodRows) {
    statusMap[row.poolKey] = { status: row.status, closedAt: row.closedAt };
    if (row.status === "CLOSED" && row.resultJson) {
      const idx = report.pools.findIndex((p) => p.poolKey === row.poolKey);
      if (idx >= 0) {
        try {
          report.pools[idx] = JSON.parse(row.resultJson) as KpiPoolReport;
        } catch {
          // snapshot hỏng → giữ bản live (hiếm; không throw để trang vẫn render)
        }
      }
    }
  }

  // Kỳ đã CLOSED đọc số từ snapshot đóng băng — cảnh báo tính trên dữ liệu/setting HIỆN TẠI của
  // pool đó không còn ý nghĩa (không ảnh hưởng tiền đã trả) và dễ gây hiểu nhầm "kỳ đã chốt vẫn
  // còn vấn đề". Lọc bỏ khỏi danh sách hiển thị; cảnh báo không gắn poolKey (NO_COSTSHEET_MARGIN)
  // luôn giữ vì không thuộc riêng pool nào.
  report.warnings = report.warnings.filter((w) => !("poolKey" in w) || statusMap[w.poolKey]?.status !== "CLOSED");

  const autoScores = await computeAutoScores(periodCode, criteria);
  return { report, statusMap, criteria, autoScores };
}

/** Kỳ KPI của tháng hiện tại + điều hướng (KPI luôn chạy chu kỳ THÁNG). */
export function kpiCurrentPeriod(date: Date): string {
  return currentPeriodCode("MONTH", date);
}
export function kpiShiftPeriod(code: string, dir: 1 | -1): string {
  return shiftPeriodCode("MONTH", code, dir);
}
