import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import {
  getCashflowOutlook,
  normalizeCashflowQuery,
  IN_SOURCES,
  OUT_SOURCES,
  type CashflowSearchParams,
  type CashBucket,
} from "@/lib/cashflow";
import type { Locale } from "@/i18n/locales";
import { requirePermission } from "@/lib/permissions";

/**
 * Cashflow v2 — dòng tiền dự kiến toàn danh mục theo khung thời gian tự chọn.
 * ⚠ Gác `dashboard.cashflow` (BGĐ + CFO + Admin) chứ KHÔNG phải `finance.view` — quyết định chủ
 * dự án 14/08/2026. Kế toán vẫn dùng /finance các tab khác; tab Cashflow ẩn theo đúng mã này.
 */
export default async function CashflowPage({ searchParams }: { searchParams: Promise<CashflowSearchParams> }) {
  await requirePermission("dashboard.cashflow");
  const query = normalizeCashflowQuery(await searchParams);
  const [t, locale, outlook] = await Promise.all([
    getTranslations("finance.cashflow"),
    getLocale() as Promise<Locale>,
    getCashflowOutlook(query),
  ]);

  const { buckets, items, totalIn, totalOut, totalNet, beyond, unscheduled, projects, asOf, end } = outlook;
  const sel = "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400";
  const bucketLabel = (b: CashBucket) => `${formatDate(b.start)}–${formatDate(new Date(b.end.getTime() - 1))}`;
  const printHref =
    `/finance/cashflow/print?range=${query.range}&by=${query.by}` +
    (query.range === "custom" && query.from && query.to ? `&from=${query.from}&to=${query.to}` : "");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("asOf")}: {formatDateTime(asOf, locale)} · {t("windowLabel")}: {formatDate(outlook.start)}–
            {formatDate(new Date(end.getTime() - 1))}
          </p>
        </div>
        <div className="flex items-end gap-2">
          {/* Bộ chọn khung thời gian — GET để URL chia sẻ được */}
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-muted-foreground">
              {t("rangeLabel")}
              <select name="range" defaultValue={query.range} className={cn(sel, "mt-1 block")}>
                <option value="month">{t("rangeMonth")}</option>
                <option value="quarter">{t("rangeQuarter")}</option>
                <option value="year">{t("rangeYear")}</option>
                <option value="custom">{t("rangeCustom")}</option>
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t("byLabel")}
              <select name="by" defaultValue={query.by} className={cn(sel, "mt-1 block")}>
                <option value="week">{t("byWeek")}</option>
                <option value="month">{t("byMonth")}</option>
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t("fromLabel")}
              <DateField name="from" defaultValue={query.from} className={cn(sel, "mt-1 block w-32")} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t("toLabel")}
              <DateField name="to" defaultValue={query.to} className={cn(sel, "mt-1 block w-32")} />
            </label>
            <button type="submit" className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
              OK
            </button>
          </form>
          <Link
            href={printHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600"
          >
            <Printer className="h-3.5 w-3.5" /> {t("printBtn")}
          </Link>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("customHint")}</p>

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

      {beyond.count > 0 && (
        <p className="rounded-lg border border-dashed border-border-strong bg-surface-2/40 px-3 py-2 text-xs text-muted-foreground">
          {t("beyondNote", {
            count: beyond.count,
            in: formatNumber(beyond.in, locale),
            out: formatNumber(beyond.out, locale),
          })}
        </p>
      )}

      {/* Lưới bucket theo nguồn */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">{t("colPeriod")}</th>
                {buckets.map((b) => (
                  <th key={b.key} className="py-2 pr-3 text-right font-medium whitespace-nowrap">
                    {bucketLabel(b)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {IN_SOURCES.map((src) => (
                <tr key={src}>
                  <td className="py-1.5 pr-3 text-muted-foreground">{t(`source${src}`)}</td>
                  {buckets.map((b) => (
                    <td key={b.key} className="py-1.5 pr-3 text-right tabular-nums text-success">
                      {b.bySource[src] ? formatNumber(b.bySource[src], locale) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              {OUT_SOURCES.map((src) => (
                <tr key={src}>
                  <td className="py-1.5 pr-3 text-muted-foreground">{t(`source${src}`)}</td>
                  {buckets.map((b) => (
                    <td key={b.key} className="py-1.5 pr-3 text-right tabular-nums text-warning">
                      {b.bySource[src] ? formatNumber(b.bySource[src], locale) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-border">
                <td className="py-2 pr-3 font-medium text-foreground">{t("rowNet")}</td>
                {buckets.map((b) => (
                  <td key={b.key} className={cn("py-2 pr-3 text-right tabular-nums font-medium", b.net >= 0 ? "text-success" : "text-danger")}>
                    {formatNumber(b.net, locale)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 font-medium text-foreground">{t("rowCumNet")}</td>
                {buckets.map((b) => (
                  <td key={b.key} className={cn("py-2 pr-3 text-right tabular-nums font-semibold", b.cumNet >= 0 ? "text-success" : "text-danger")}>
                    {formatNumber(b.cumNet, locale)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("note")}</p>
      </section>

      {/* Chưa lên lịch — cố ý KHÔNG bịa ngày để nhét vào bucket */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("unschedTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("unschedNote")}</p>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-foreground">
              {t("unschedInTitle")} · <span className="tabular-nums text-success">{formatNumber(unscheduled.totalIn, locale)}</span>
            </p>
            {unscheduled.in.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">{t("unschedEmpty")}</p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs">
                {unscheduled.in.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2">
                    <span className="truncate text-muted-foreground">
                      <span className="font-mono">{x.projectCode}</span> · {x.name}
                    </span>
                    <span className="tabular-nums text-success">{formatNumber(x.amount, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">
              {t("unschedOutTitle")} · <span className="tabular-nums text-warning">{formatNumber(unscheduled.totalOut, locale)}</span>
            </p>
            {unscheduled.out.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">{t("unschedEmpty")}</p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs">
                {unscheduled.out.map((x) => (
                  <li key={x.projectId} className="flex justify-between gap-2">
                    <span className="truncate font-mono text-muted-foreground">{x.projectCode}</span>
                    <span className="tabular-nums text-warning">{formatNumber(x.amount, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Cash out theo dự án — % trên trần chi CO */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("projTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("projDesc")}</p>
        <div className="mt-3 overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">{t("colProject")}</th>
                <th className="py-2 pr-3">Team</th>
                <th className="py-2 pr-3 text-right">{t("colCap")}</th>
                <th className="py-2 pr-3 text-right">{t("colPaidOut")}</th>
                <th className="py-2 pr-3 text-right">%</th>
                <th className="py-2 pr-3 text-right">{t("colCommitted")}</th>
                <th className="py-2 pr-3 text-right">{t("colRemainingP")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projects.map((p) => {
                const pct = p.cap > 0 ? Math.round((p.paidOut / p.cap) * 1000) / 10 : 0;
                return (
                  <tr key={p.projectId}>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs text-muted-foreground">{p.code}</span>{" "}
                      <span className="text-foreground">{p.name}</span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{p.teamCode ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(p.cap, locale)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(p.paidOut, locale)}</td>
                    <td className={cn("py-2 pr-3 text-right tabular-nums font-medium", pct > 100 ? "text-danger" : "text-foreground")}>
                      {formatNumber(pct, locale)}%
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{formatNumber(p.committed, locale)}</td>
                    <td className={cn("py-2 pr-3 text-right tabular-nums", p.remaining < 0 ? "text-danger" : "text-muted-foreground")}>
                      {formatNumber(p.remaining, locale)}
                    </td>
                  </tr>
                );
              })}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Chi tiết từng khoản trong khung */}
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
