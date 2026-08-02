import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { loadBudgetYears, loadSpends, loadItemOptions } from "@/lib/overhead-data";
import { MONTHS, OVERHEAD_SPEND_STATUSES } from "@/lib/overhead";
import { YearPicker } from "../year-picker";
import { CreateSpendForm, SpendTable } from "./spend-panels";

export default async function OverheadSpendsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; status?: string }>;
}) {
  await requirePermission("overhead.view");
  const sp = await searchParams;

  const [t, years, canRecord, canPay, canOverBudget] = await Promise.all([
    getTranslations("overhead"),
    loadBudgetYears(),
    hasPermission("overhead.spend.record"),
    hasPermission("overhead.spend.pay"),
    hasPermission("overhead.spend.over_budget"),
  ]);

  const year = Number(sp.year) || years[0] || new Date().getFullYear();
  const month = sp.month ? Number(sp.month) : undefined;
  const status = sp.status;
  const [rows, items] = await Promise.all([loadSpends(year, { month, status }), loadItemOptions(year)]);

  const chip = (label: string, href: string, on: boolean) => (
    <Link
      key={href}
      href={href}
      className={`rounded-md px-2 py-1 text-[11px] ${on ? "bg-brand-600 text-white" : "border border-border-strong text-foreground hover:bg-surface-2"}`}
    >
      {label}
    </Link>
  );
  const base = `/overhead/spends?year=${year}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <YearPicker years={years} current={year} />
        {canRecord && <CreateSpendForm fiscalYear={year} items={items} canOverBudget={canOverBudget} />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">{t("spendMonth")}</span>
        {chip(t("filterAll"), base, !month)}
        {MONTHS.map((m) => chip(String(m), `${base}&month=${m}${status ? `&status=${status}` : ""}`, month === m))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">{t("colStatus")}</span>
        {chip(t("filterAll"), `${base}${month ? `&month=${month}` : ""}`, !status)}
        {OVERHEAD_SPEND_STATUSES.map((s) =>
          chip(t(`spend${s}` as "spendPAID"), `${base}${month ? `&month=${month}` : ""}&status=${s}`, status === s),
        )}
      </div>

      <SpendTable rows={rows} canPay={canPay} canRecord={canRecord} />
    </div>
  );
}
