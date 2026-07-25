import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import { getCashflowForecast } from "@/lib/cashflow";
import type { Locale } from "@/i18n/locales";
import { requirePermission } from "@/lib/permissions";

export default async function CashflowPage() {
  await requirePermission("finance.view");
  const [t, locale, forecast] = await Promise.all([
    getTranslations("finance.cashflow"),
    getLocale() as Promise<Locale>,
    getCashflowForecast(),
  ]);

  const { periods, items, totalIn, totalOut, totalNet, asOf } = forecast;

  const periodLabel = (p: (typeof periods)[number]) =>
    t(p.labelKey, { n: p.labelN }) + ` (${formatDate(p.startDate)}–${formatDate(addOneDayInclusive(p.endDate))})`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("asOf")}: {formatDateTime(asOf, locale)}
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted-foreground">{t("totalIn")}</p>
          <p className="mt-1 text-xl font-bold text-success tabular-nums">{formatNumber(totalIn, locale)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted-foreground">{t("totalOut")}</p>
          <p className="mt-1 text-xl font-bold text-warning tabular-nums">{formatNumber(totalOut, locale)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted-foreground">{t("totalNet")}</p>
          <p className={cn("mt-1 text-xl font-bold tabular-nums", totalNet >= 0 ? "text-success" : "text-danger")}>
            {formatNumber(totalNet, locale)}
          </p>
        </div>
      </div>

      {/* Period grid — 4 tuần + 2 tháng */}
      {/* Scroll container KHÔNG padding — padding trên container làm sticky header dính dưới mép padding, lộ dải hở phía trên. */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3">{t("colPeriod")}</th>
              {periods.map((p) => (
                <th key={p.key} className="py-2 pr-3 text-right font-medium">
                  {periodLabel(p)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <td className="py-2 pr-3 text-muted-foreground">{t("rowCashIn")}</td>
              {periods.map((p) => (
                <td key={p.key} className="py-2 pr-3 text-right tabular-nums text-success">
                  {formatNumber(p.cashIn, locale)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-2 pr-3 text-muted-foreground">{t("rowCashOut")}</td>
              {periods.map((p) => (
                <td key={p.key} className="py-2 pr-3 text-right tabular-nums text-warning">
                  {formatNumber(p.cashOut, locale)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-2 pr-3 font-medium text-foreground">{t("rowNet")}</td>
              {periods.map((p) => (
                <td key={p.key} className={cn("py-2 pr-3 text-right tabular-nums font-medium", p.net >= 0 ? "text-success" : "text-danger")}>
                  {formatNumber(p.net, locale)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        </div>
      </section>

      <p className="rounded-lg border border-dashed border-border-strong bg-surface-2/40 px-3 py-2 text-xs text-muted-foreground">
        {t("note")}
      </p>

      {/* Detail list */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("detailTitle")}</h2>
        <div className="mt-3 overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">{t("colDate")}</th>
                <th className="py-2 pr-3">{t("colType")}</th>
                <th className="py-2 pr-3">{t("colProject")}</th>
                <th className="py-2 pr-3">{t("colCounterpart")}</th>
                <th className="py-2 pr-3">{t("colSource")}</th>
                <th className="py-2 pr-3 text-right">{t("colAmount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="py-2 pr-3 text-muted-foreground">{formatDate(it.date)}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={it.type === "IN" ? "success" : "warning"}>{t(it.type === "IN" ? "typeIn" : "typeOut")}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-foreground">{it.projectCode}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{it.counterpart}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{t(`source${it.source}`)}</td>
                  <td className={cn("py-2 pr-3 text-right tabular-nums font-medium", it.type === "IN" ? "text-success" : "text-warning")}>
                    {formatNumber(it.amount, locale)}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function addOneDayInclusive(endExclusive: Date): Date {
  return new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);
}
