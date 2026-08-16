import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
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
import { PrintButton } from "./print-button";

/**
 * Bản in báo cáo cashflow (A4 ngang) — nút In → "Save as PDF" là có file PDF, không cần thư viện
 * (tiền lệ bản in BM02). Render từ CÙNG getCashflowOutlook với trang chính nên không bao giờ lệch
 * số. Gác đúng mã của trang chính: `dashboard.cashflow`.
 */
export default async function CashflowPrintPage({ searchParams }: { searchParams: Promise<CashflowSearchParams> }) {
  await requirePermission("dashboard.cashflow");
  const query = normalizeCashflowQuery(await searchParams);
  const [t, locale, outlook] = await Promise.all([
    getTranslations("finance.cashflow"),
    getLocale() as Promise<Locale>,
    getCashflowOutlook(query),
  ]);
  const { buckets, totalIn, totalOut, totalNet, unscheduled, projects, asOf, start, end } = outlook;
  const bucketLabel = (b: CashBucket) => `${formatDate(b.start)}–${formatDate(new Date(b.end.getTime() - 1))}`;
  const num = "border border-neutral-300 px-2 py-1 text-right tabular-nums whitespace-nowrap";
  const head = "border border-neutral-300 px-2 py-1 text-left font-semibold";

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/finance/cashflow" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("backToReport")}
        </Link>
        <PrintButton />
      </div>

      {/* Vùng in — nền trắng chữ đen cố định để bản PDF không phụ thuộc theme đang bật */}
      <div id="cashflow-print-area" className="rounded-xl border border-border bg-white p-6 text-neutral-900">
        <h1 className="text-lg font-bold">{t("printTitle")}</h1>
        <p className="mt-0.5 text-xs text-neutral-600">
          {t("windowLabel")}: {formatDate(start)}–{formatDate(new Date(end.getTime() - 1))} · {t("asOf")}: {formatDateTime(asOf, locale)}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <p>
            {t("totalIn")}: <span className="font-bold tabular-nums">{formatNumber(totalIn, locale)}</span>
          </p>
          <p>
            {t("totalOut")}: <span className="font-bold tabular-nums">{formatNumber(totalOut, locale)}</span>
          </p>
          <p>
            {t("totalNet")}: <span className={cn("font-bold tabular-nums", totalNet < 0 && "text-red-600")}>{formatNumber(totalNet, locale)}</span>
          </p>
        </div>

        <table className="mt-4 w-full border-collapse text-xs">
          <thead>
            <tr className="bg-neutral-100">
              <th className={head}>{t("colPeriod")}</th>
              {buckets.map((b) => (
                <th key={b.key} className={cn(head, "text-right")}>
                  {bucketLabel(b)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...IN_SOURCES, ...OUT_SOURCES].map((src) => (
              <tr key={src}>
                <td className="border border-neutral-300 px-2 py-1">{t(`source${src}`)}</td>
                {buckets.map((b) => (
                  <td key={b.key} className={num}>
                    {b.bySource[src] ? formatNumber(b.bySource[src], locale) : "—"}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-neutral-100 font-semibold">
              <td className="border border-neutral-300 px-2 py-1">{t("rowNet")}</td>
              {buckets.map((b) => (
                <td key={b.key} className={cn(num, b.net < 0 && "text-red-600")}>
                  {formatNumber(b.net, locale)}
                </td>
              ))}
            </tr>
            <tr className="bg-neutral-100 font-bold">
              <td className="border border-neutral-300 px-2 py-1">{t("rowCumNet")}</td>
              {buckets.map((b) => (
                <td key={b.key} className={cn(num, b.cumNet < 0 && "text-red-600")}>
                  {formatNumber(b.cumNet, locale)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        <p className="mt-3 text-xs text-neutral-600">
          {t("unschedTitle")}: {t("unschedInTitle")} <span className="font-semibold tabular-nums">{formatNumber(unscheduled.totalIn, locale)}</span> ·{" "}
          {t("unschedOutTitle")} <span className="font-semibold tabular-nums">{formatNumber(unscheduled.totalOut, locale)}</span>
        </p>

        <h2 className="mt-4 text-sm font-bold">{t("projTitle")}</h2>
        <table className="mt-1 w-full border-collapse text-xs">
          <thead>
            <tr className="bg-neutral-100">
              <th className={head}>{t("colProject")}</th>
              <th className={head}>Team</th>
              <th className={cn(head, "text-right")}>{t("colCap")}</th>
              <th className={cn(head, "text-right")}>{t("colPaidOut")}</th>
              <th className={cn(head, "text-right")}>%</th>
              <th className={cn(head, "text-right")}>{t("colCommitted")}</th>
              <th className={cn(head, "text-right")}>{t("colRemainingP")}</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const pct = p.cap > 0 ? Math.round((p.paidOut / p.cap) * 1000) / 10 : 0;
              return (
                <tr key={p.projectId}>
                  <td className="border border-neutral-300 px-2 py-1">
                    {p.code} — {p.name}
                  </td>
                  <td className="border border-neutral-300 px-2 py-1">{p.teamCode ?? "—"}</td>
                  <td className={num}>{formatNumber(p.cap, locale)}</td>
                  <td className={num}>{formatNumber(p.paidOut, locale)}</td>
                  <td className={cn(num, pct > 100 && "text-red-600")}>{formatNumber(pct, locale)}%</td>
                  <td className={num}>{formatNumber(p.committed, locale)}</td>
                  <td className={cn(num, p.remaining < 0 && "text-red-600")}>{formatNumber(p.remaining, locale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[10px] text-neutral-500">{t("note")}</p>
      </div>
    </div>
  );
}
