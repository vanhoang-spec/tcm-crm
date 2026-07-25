import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getKpiParams, kpiCurrentPeriod, kpiShiftPeriod, KPI_DEPT_CODES } from "@/lib/kpi";
import { ParamsForm } from "./params-form";
import { CriterionRow, CriterionCreateForm } from "./criterion-row";
import { KpiSalaryRow, CopySalariesButton } from "./salary-row";

export default async function SettingsKpiPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await searchParams;
  const [t, tIndex, params] = await Promise.all([getTranslations("settings.kpi"), getTranslations("settings.index"), getKpiParams()]);
  const periodCode = period || kpiCurrentPeriod(new Date());
  const prevPeriod = kpiShiftPeriod(periodCode, -1);
  const nextPeriod = kpiShiftPeriod(periodCode, 1);

  const [criteria, salaries, staff] = await Promise.all([
    prisma.kpiCriterion.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    prisma.positionSalary.findMany({ where: { periodCode } }),
    prisma.staff.findMany({
      where: { isActive: true, department: { code: { in: [...KPI_DEPT_CODES] } } },
      select: { title: true, department: { select: { code: true } } },
    }),
  ]);

  // Cặp (title, dept) từ nhân sự active — nguồn dòng lương; cộng thêm dòng đã có trong DB kỳ này.
  const pairs = new Map<string, { title: string; dept: string }>();
  for (const s of staff) {
    if (!s.title || !s.department) continue;
    pairs.set(`${s.title}|${s.department.code}`, { title: s.title, dept: s.department.code });
  }
  for (const r of salaries) pairs.set(`${r.positionTitle}|${r.departmentCode}`, { title: r.positionTitle, dept: r.departmentCode });
  const salaryByKey = new Map(salaries.map((r) => [`${r.positionTitle}|${r.departmentCode}`, r]));
  const pairList = Array.from(pairs.values()).sort((a, b) => a.dept.localeCompare(b.dept) || a.title.localeCompare(b.title));

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {tIndex("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("paramsTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("paramsDesc")}</p>
        <ParamsForm params={params} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("criteriaTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("criteriaDesc")}</p>
        <div className="mt-3 space-y-2">
          {criteria.map((c) => (
            <CriterionRow
              key={c.id}
              criterion={{ id: c.id, code: c.code, nameVi: c.nameVi, nameEn: c.nameEn, appliesTo: c.appliesTo, weight: c.weight, scaleMax: c.scaleMax, sourceType: c.sourceType, isActive: c.isActive }}
            />
          ))}
          <CriterionCreateForm />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("salariesTitle", { period: periodCode })}</h2>
          <div className="flex items-center gap-1.5 text-xs">
            <Link href={`/settings/kpi?period=${prevPeriod}`} className="rounded-lg border border-border-strong px-2 py-1 text-muted-foreground hover:bg-surface-2">
              ← {prevPeriod}
            </Link>
            <Link href={`/settings/kpi?period=${nextPeriod}`} className="rounded-lg border border-border-strong px-2 py-1 text-muted-foreground hover:bg-surface-2">
              {nextPeriod} →
            </Link>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("salariesDesc")}</p>
        <div className="mt-3 space-y-2">
          {pairList.length === 0 && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">{t("noSalaries")}</p>
              <CopySalariesButton fromPeriod={prevPeriod} toPeriod={periodCode} label={t("copyPrevious", { period: prevPeriod })} />
            </div>
          )}
          {pairList.map((p) => {
            const row = salaryByKey.get(`${p.title}|${p.dept}`);
            return (
              <KpiSalaryRow
                key={`${p.title}|${p.dept}`}
                positionTitle={p.title}
                departmentCode={p.dept}
                periodCode={periodCode}
                monthlySalary={row ? Number(row.monthlySalary) : null}
                note={row?.note ?? ""}
              />
            );
          })}
          {pairList.length > 0 && salaries.length === 0 && (
            <CopySalariesButton fromPeriod={prevPeriod} toPeriod={periodCode} label={t("copyPrevious", { period: prevPeriod })} />
          )}
        </div>
      </section>
    </div>
  );
}
