import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { formatNumber, formatDecimal } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import {
  getCostReviewCycle,
  currentPeriodCode,
  shiftPeriodCode,
  getCreativeCostReport,
  type CostWarning,
} from "@/lib/creative-cost";
import { CopyPreviousPeriodButton } from "./copy-previous-period-button";
import { requirePermission } from "@/lib/permissions";

export default async function CreativeCostPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission("creative.cost.view");
  const { period } = await searchParams;
  const [t, locale, cycle] = await Promise.all([
    getTranslations("creative.cost"),
    getLocale() as Promise<Locale>,
    getCostReviewCycle(),
  ]);
  const periodCode = period || currentPeriodCode(cycle, new Date());
  const prevPeriod = shiftPeriodCode(cycle, periodCode, -1);
  const nextPeriod = shiftPeriodCode(cycle, periodCode, 1);

  const report = await getCreativeCostReport(periodCode);
  const money = (n: number) => `${formatNumber(n, locale)}đ`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={`/creative/cost?period=${prevPeriod}`} className="rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-2">
            ← {prevPeriod}
          </Link>
          <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">{periodCode}</span>
          <Link href={`/creative/cost?period=${nextPeriod}`} className="rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-2">
            {nextPeriod} →
          </Link>
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-xs text-brand-900">
        <p>{t("allocationNote")}</p>
        <p>{t("varianceNote")}</p>
      </div>

      {!report || report.positions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("noBudgetDesc", { period: periodCode })}</p>
          <div className="mt-3">
            <CopyPreviousPeriodButton fromPeriod={prevPeriod} toPeriod={periodCode} label={t("copyPrevious", { period: prevPeriod })} />
          </div>
        </div>
      ) : (
        <>
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

          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("positionsSectionTitle")}</h2>
            <div className="mt-3 overflow-x-auto overflow-y-auto max-h-[70vh]">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">{t("colPosition")}</th>
                    <th className="py-2 pr-3">{t("colSalary")}</th>
                    <th className="py-2 pr-3">{t("colHeadcount")}</th>
                    <th className="py-2 pr-3">{t("colPool")}</th>
                    <th className="py-2 pr-3">{t("colHours")}</th>
                    <th className="py-2 pr-3">{t("colUnallocated")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.positions.map((p) => (
                    <tr key={p.title}>
                      <td className="py-2 pr-3 font-medium text-foreground">{p.title}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{money(p.monthlySalary)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{formatNumber(p.headcount, locale)}</td>
                      <td className="py-2 pr-3 text-foreground">{money(p.pool)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{formatDecimal(p.totalHours, locale)}h</td>
                      <td className={`py-2 pr-3 ${p.unallocatedPlannedCost !== 0 ? "text-warning" : "text-muted-foreground"}`}>{money(p.unallocatedPlannedCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("byTypeSectionTitle")}</h2>
            <div className="mt-3 overflow-x-auto overflow-y-auto max-h-[70vh]">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">{t("colType")}</th>
                    <th className="py-2 pr-3">{t("colPlanned")}</th>
                    <th className="py-2 pr-3">{t("colActual")}</th>
                    <th className="py-2 pr-3">{t("colVariance")}</th>
                    <th className="py-2 pr-3">{t("colDelivered")}</th>
                    <th className="py-2 pr-3">{t("colCostPerTask")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.byTaskType.map((row) => (
                    <tr key={row.taskTypeId}>
                      <td className="py-2 pr-3 font-medium text-foreground">{locale === "en" ? (row.labelEn ?? row.labelVi) : row.labelVi}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{money(row.plannedCost)}</td>
                      <td className="py-2 pr-3 text-foreground">{money(row.actualCost)}</td>
                      <td className={`py-2 pr-3 ${row.variance > 0 ? "text-success" : row.variance < 0 ? "text-danger" : "text-muted-foreground"}`}>
                        {row.variance > 0 ? "+" : ""}
                        {money(row.variance)}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{formatNumber(row.deliveredCount, locale)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{row.costPerTaskActual != null ? money(row.costPerTaskActual) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border font-semibold text-foreground">
                  <tr>
                    <td className="py-2 pr-3">{t("totalsRow")}</td>
                    <td className="py-2 pr-3">{money(report.totals.plannedAllocated)}</td>
                    <td className="py-2 pr-3">{money(report.totals.actualAllocated)}</td>
                    <td className="py-2 pr-3" />
                    <td className="py-2 pr-3">{formatNumber(report.totals.deliveredCount, locale)}</td>
                    <td className="py-2 pr-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("matrixDetailTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("matrixDetailDesc")}</p>
            <div className="mt-3 space-y-2">
              {report.positions.map((p) => (
                <details key={p.title} className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">{p.title}</summary>
                  <div className="mt-3 overflow-x-auto overflow-y-auto max-h-[70vh]">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead className="sticky top-0 z-10 border-b border-border bg-surface text-left text-muted-foreground">
                        <tr>
                          <th className="py-1.5 pr-2">{t("colType")}</th>
                          <th className="py-1.5 pr-2">{t("colPlannedPercent")}</th>
                          <th className="py-1.5 pr-2">{t("colActualPercent")}</th>
                          <th className="py-1.5 pr-2">{t("colPlanned")}</th>
                          <th className="py-1.5 pr-2">{t("colActual")}</th>
                          <th className="py-1.5 pr-2">{t("colVariance")}</th>
                          <th className="py-1.5 pr-2">{t("colDelivered")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {report.byTaskType.map((tt) => {
                          const cell = p.cells[tt.taskTypeId];
                          if (!cell) return null;
                          return (
                            <tr key={tt.taskTypeId}>
                              <td className="py-1.5 pr-2 font-medium text-foreground">{locale === "en" ? (tt.labelEn ?? tt.labelVi) : tt.labelVi}</td>
                              <td className="py-1.5 pr-2 text-muted-foreground">{formatDecimal(cell.plannedPercent, locale)}%</td>
                              <td className="py-1.5 pr-2 text-muted-foreground">{formatDecimal(cell.actualPercent, locale)}%</td>
                              <td className="py-1.5 pr-2 text-muted-foreground">{money(cell.plannedCost)}</td>
                              <td className="py-1.5 pr-2 text-foreground">{money(cell.actualCost)}</td>
                              <td className={`py-1.5 pr-2 ${cell.variance > 0 ? "text-success" : cell.variance < 0 ? "text-danger" : "text-muted-foreground"}`}>
                                {cell.variance > 0 ? "+" : ""}
                                {money(cell.variance)}
                              </td>
                              <td className="py-1.5 pr-2 text-muted-foreground">{formatNumber(cell.deliveredCount, locale)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {p.untypedActualCost !== 0 && (
                        <tfoot>
                          <tr>
                            <td colSpan={7} className="pt-2 text-warning">
                              {t("untypedRow", { amount: money(p.untypedActualCost) })}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function warningText(t: Awaited<ReturnType<typeof getTranslations<"creative.cost">>>, w: CostWarning): string {
  switch (w.kind) {
    case "NO_RATIOS":
      return t("warnNoRatios", { positionTitle: w.positionTitle });
    case "NO_HOURS":
      return t("warnNoHours", { positionTitle: w.positionTitle });
    case "NO_BUDGET":
      return t("warnNoBudget", { positionTitle: w.positionTitle, count: w.deliveredCount });
    case "NO_HEADCOUNT":
      return t("warnNoHeadcount", { positionTitle: w.positionTitle });
    case "RATIO_SUM_NOT_100":
      return t("warnRatioSum", { positionTitle: w.positionTitle, sum: w.sum });
    case "TASKS_MISSING_HOURS":
      return t("warnMissingHours", { count: w.count });
    case "TASKS_MISSING_TYPE":
      return t("warnMissingType", { count: w.count });
    case "TASKS_MISSING_ASSIGNEE":
      return t("warnMissingAssignee", { count: w.count });
    case "ORPHAN_BUDGET":
      return t("warnOrphanBudget", { positionTitle: w.positionTitle });
    default:
      return "";
  }
}
