import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCostReviewCycle, currentPeriodCode, getCreativePositionTitles, shiftPeriodCode } from "@/lib/creative-cost";
import { CycleForm } from "./cycle-form";
import { SalaryRow } from "./salary-row";
import { RatioMatrixForm } from "./ratio-matrix-form";
import { DeleteOrphanButton } from "./delete-orphan-button";
import { requirePermission } from "@/lib/permissions";

export default async function SettingsCreativePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission("settings.creative.manage");
  const { period } = await searchParams;
  const [t, tIndex, cycle] = await Promise.all([
    getTranslations("settings.creative"),
    getTranslations("settings.index"),
    getCostReviewCycle(),
  ]);
  const periodCode = period || currentPeriodCode(cycle, new Date());
  const prevPeriod = shiftPeriodCode(cycle, periodCode, -1);
  const nextPeriod = shiftPeriodCode(cycle, periodCode, 1);

  const [activeTitles, budgets, ratios, taskTypeSet] = await Promise.all([
    getCreativePositionTitles(),
    prisma.creativeSalaryBudget.findMany({ where: { periodCode } }),
    prisma.creativeAllocationRatio.findMany({ where: { periodCode } }),
    prisma.optionSet.findUnique({ where: { code: "creative_task_type" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
  ]);

  const taskTypes = (taskTypeSet?.items ?? []).map((it) => ({ id: it.id, label: it.labelVi }));
  const budgetByTitle = new Map(budgets.map((b) => [b.positionTitle, b]));
  const orphanBudgets = budgets.filter((b) => !activeTitles.includes(b.positionTitle));
  const ratioByKey = Object.fromEntries(ratios.map((r) => [`${r.positionTitle}|${r.taskTypeId}`, r.percent]));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {tIndex("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("cycleTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("cycleDesc")}</p>
        <CycleForm cycle={cycle} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("periodTitle", { period: periodCode })}</h2>
          <div className="flex items-center gap-1 text-xs">
            <Link href={`/settings/creative?period=${prevPeriod}`} className="rounded-lg border border-border-strong px-2 py-1 text-muted-foreground hover:bg-surface-2">
              ←
            </Link>
            <Link href={`/settings/creative?period=${nextPeriod}`} className="rounded-lg border border-border-strong px-2 py-1 text-muted-foreground hover:bg-surface-2">
              →
            </Link>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("salaryTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("salaryDesc")}</p>
          {activeTitles.length === 0 && <p className="text-sm text-muted-foreground">{t("noPositions")}</p>}
          <div className="space-y-2">
            {activeTitles.map((title) => {
              const b = budgetByTitle.get(title);
              return (
                <SalaryRow
                  key={title}
                  positionTitle={title}
                  periodCode={periodCode}
                  monthlySalary={b ? Number(b.monthlySalary) : 0}
                  headcountOverride={b?.headcountOverride ?? null}
                  note={b?.note ?? ""}
                />
              );
            })}
          </div>

          {orphanBudgets.length > 0 && (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning-bg p-3">
              <p className="text-xs font-medium text-warning">{t("orphanTitle")}</p>
              <ul className="mt-1.5 space-y-1">
                {orphanBudgets.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 text-xs text-foreground">
                    <span>{b.positionTitle}</span>
                    <DeleteOrphanButton id={b.id} label={t("deleteOrphan")} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("matrixTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("matrixDesc")}</p>
          {activeTitles.length === 0 || taskTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noMatrix")}</p>
          ) : (
            <RatioMatrixForm periodCode={periodCode} positions={activeTitles} taskTypes={taskTypes} ratioByKey={ratioByKey} />
          )}
        </div>
      </section>
    </div>
  );
}
