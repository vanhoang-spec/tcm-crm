import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import type { Locale } from "@/i18n/locales";
import { prisma } from "@/lib/prisma";
import { formatNumber, formatDecimal } from "@/lib/utils";
import { getKpiReport, kpiCurrentPeriod, kpiShiftPeriod, criteriaForPool, type KpiWarning } from "@/lib/kpi";
import { ScoreMatrixForm, ClosePeriodControls, type MatrixCriterion, type MatrixMember } from "./score-matrix-form";

export default async function KpiPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await searchParams;
  const [t, locale] = await Promise.all([getTranslations("kpi"), getLocale() as Promise<Locale>]);
  const periodCode = period || kpiCurrentPeriod(new Date());
  const prevPeriod = kpiShiftPeriod(periodCode, -1);
  const nextPeriod = kpiShiftPeriod(periodCode, 1);

  const data = await getKpiReport(periodCode);
  const money = (n: number) => `${formatNumber(n, locale)}đ`;
  const label = (vi: string, en: string | null) => (locale === "en" ? (en ?? vi) : vi);

  if (!data) return null;
  const { report, statusMap, criteria, autoScores } = data;
  const scores = await prisma.kpiScore.findMany({ where: { periodCode }, select: { criterionId: true, staffId: true, score: true } });
  const scoreByStaff = new Map<string, Record<string, number>>();
  for (const s of scores) {
    const e = scoreByStaff.get(s.staffId) ?? {};
    e[s.criterionId] = s.score;
    scoreByStaff.set(s.staffId, e);
  }

  const zeroSum = report.params.floorFactor === 1 && report.params.capFactor === 1 && report.params.emptyWindowFactor === 1;
  const hasClosed = report.pools.some((p) => statusMap[p.poolKey]?.status === "CLOSED");
  const anyBlocking = report.pools.some((p) => statusMap[p.poolKey]?.status !== "CLOSED" && p.blocking);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={`/kpi?period=${prevPeriod}`} className="rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-2">
            ← {prevPeriod}
          </Link>
          <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">{periodCode}</span>
          <Link href={`/kpi?period=${nextPeriod}`} className="rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-2">
            {nextPeriod} →
          </Link>
        </div>
      </div>

      {zeroSum && <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-xs text-brand-900">{t("zeroSumNote")}</div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ClosePeriodControls periodCode={periodCode} hasClosed={hasClosed} blocked={anyBlocking} />
        <a
          href={`/api/kpi/export?period=${periodCode}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2"
        >
          <Download className="h-3.5 w-3.5" />
          {t("exportExcel")}
        </a>
      </div>

      {report.warnings.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-warning/30 bg-warning-bg p-4">
          <p className="text-xs font-semibold text-warning">{t("warningsTitle")}</p>
          <ul className="space-y-1">
            {report.warnings.map((w, i) => (
              <li key={i} className="text-xs text-warning">
                {warningText(t, w)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.pools.length === 0 && <p className="text-sm text-muted-foreground">{t("emptyStaff")}</p>}

      {report.pools.map((pool) => {
        const status = statusMap[pool.poolKey]?.status ?? "OPEN";
        const closed = status === "CLOSED";
        const { required, optional } = criteriaForPool(criteria, pool.deptCode);
        const matrixCriteria: MatrixCriterion[] = [...required, ...optional].map((c) => ({
          id: c.id,
          label: label(c.nameVi, c.nameEn),
          scaleMax: c.scaleMax,
          isAuto: c.sourceType === "AUTO",
          isLead: c.appliesTo === "LEAD",
          weight: c.weight,
        }));
        const matrixMembers: MatrixMember[] = pool.rows
          .filter((r) => r.excluded !== "NO_SALARY")
          .map((r) => ({
            staffId: r.staffId,
            fullName: r.fullName,
            scores: scoreByStaff.get(r.staffId) ?? {},
            auto: Object.fromEntries(Object.entries(autoScores).map(([critId, byStaff]) => [critId, byStaff[r.staffId]]).filter(([, v]) => v != null)) as Record<string, number>,
          }));

        return (
          <section key={pool.poolKey} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">{pool.label}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${closed ? "bg-success-bg text-success" : "bg-brand-50 text-brand-700"}`}>
                {closed ? t("statusClosed") : t("statusOpen")}
              </span>
            </div>
            {closed && <p className="mt-1 text-xs text-muted-foreground">{t("periodClosed")}</p>}

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-muted-foreground">{t("poolBase")}</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">{money(pool.base)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-muted-foreground">{t("marginWeighted")}</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {pool.marginWeighted != null ? `${formatDecimal(pool.marginWeighted, locale)}%` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {pool.marginWeighted != null ? t("marginWindow", { months: report.params.marginWindowMonths }) : t("noMargin")}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-muted-foreground">{t("factor")}</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">×{formatDecimal(pool.teamFactor, locale)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-muted-foreground">{t("poolAmount")}</p>
                <p className="mt-0.5 text-sm font-semibold text-brand-700">{money(pool.poolAmount)}</p>
              </div>
            </div>

            {pool.projects.length > 0 && (
              <details className="mt-3 rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-xs font-medium text-foreground">
                  {t("projectsTitle")} ({pool.projects.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {pool.projects.map((p) => (
                    <li key={p.code} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-foreground">{p.code}</span> · {p.name}
                      </span>
                      <span className="flex-none">
                        {formatDecimal(p.marginPct, locale)}% · CE {money(p.ceTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {matrixMembers.length > 1 && (
              <div className="mt-4 border-t border-border pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("scoreSection", { pool: pool.label })}</h3>
                <p className="mb-2 mt-1 text-xs text-muted-foreground">{t("scoreHint", { scale: matrixCriteria[0]?.scaleMax ?? 5 })}</p>
                <ScoreMatrixForm poolKey={pool.poolKey} periodCode={periodCode} criteria={matrixCriteria} members={matrixMembers} closed={closed} />
              </div>
            )}
            {matrixMembers.length === 1 && <p className="mt-3 text-xs text-muted-foreground">{t("singleMemberNote")}</p>}

            <div className="mt-4 border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("resultsSection")}</h3>
              <div className="mt-2 overflow-x-auto overflow-y-auto max-h-[70vh]">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs font-medium text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">{t("colStaff")}</th>
                      <th className="py-2 pr-3">{t("colPosition")}</th>
                      <th className="py-2 pr-3">{t("colFixed")}</th>
                      <th className="py-2 pr-3">{t("colPerfBase")}</th>
                      <th className="py-2 pr-3">{t("colScore")}</th>
                      <th className="py-2 pr-3">{t("colAttendance")}</th>
                      <th className="py-2 pr-3">{t("colShare")}</th>
                      <th className="py-2 pr-3">{t("colPayout")}</th>
                      <th className="py-2 pr-3">{t("colTotal")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pool.rows.map((r) => (
                      <tr key={r.staffId} className={r.excluded ? "opacity-60" : ""}>
                        <td className="py-2 pr-3 font-medium text-foreground">
                          {r.fullName}
                          {r.excluded === "NO_SALARY" && <span className="ml-1.5 rounded bg-warning-bg px-1.5 py-0.5 text-[10px] text-warning">{t("excludedNoSalary")}</span>}
                          {r.excluded === "MISSING_SCORES" && <span className="ml-1.5 rounded bg-danger-bg px-1.5 py-0.5 text-[10px] text-danger">{t("excludedNoScores")}</span>}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{r.title ?? "—"}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{money(r.fixedPart)}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{money(r.perfBase)}</td>
                        <td className="py-2 pr-3 text-foreground">{formatDecimal(r.weightedScore, locale)}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{formatDecimal(r.attendance * 100, locale)}%</td>
                        <td className="py-2 pr-3 text-muted-foreground">{formatDecimal(r.share * 100, locale)}%</td>
                        <td className="py-2 pr-3 font-medium text-brand-700">{money(r.payout)}</td>
                        <td className="py-2 pr-3 font-semibold text-foreground">{money(r.fixedPart + r.payout)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function warningText(t: Awaited<ReturnType<typeof getTranslations<"kpi">>>, w: KpiWarning): string {
  switch (w.kind) {
    case "NO_SALARY_FOR_TITLE":
      return t("warnNoSalary", { name: w.staffName, title: w.title ?? "—" });
    case "STAFF_NO_POSITION":
      return t("warnNoPosition", { name: w.staffName });
    case "MISSING_SCORES":
      return t("warnMissingScores", { pool: w.poolKey, name: w.staffName });
    case "ZERO_SCORE_SUM":
      return t("warnZeroScoreSum", { pool: w.poolKey });
    case "NO_FINISHED_PROJECTS":
      return t("warnNoFinished", { pool: w.poolKey });
    case "NO_COSTSHEET_MARGIN":
      return t("warnNoCostsheet", { code: w.projectCode });
    case "NO_TIMESHEET":
      return t("warnNoTimesheet", { name: w.staffName });
    case "SINGLE_MEMBER_POOL":
      return t("warnSingleMember", { pool: w.poolKey });
    case "NO_ACTIVE_CRITERIA":
      return t("warnNoCriteria", { pool: w.poolKey });
    default:
      return "";
  }
}
