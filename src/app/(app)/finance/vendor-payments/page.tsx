import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatNumber, formatDate, toNum } from "@/lib/utils";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import type { Locale } from "@/i18n/locales";
import { createVendorPayment, markVendorPaymentPaid } from "../actions";

const input = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default async function VendorPaymentsPage() {
  const [t, tc, locale, payments, vendors, projects] = await Promise.all([
    getTranslations("finance.vendorPayments"),
    getTranslations("finance.common"),
    getLocale() as Promise<Locale>,
    prisma.vendorPayment.findMany({ include: { vendor: true, project: true }, orderBy: { createdAt: "desc" } }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } }, orderBy: { updatedAt: "desc" } }),
  ]);

  const totalScheduled = payments.filter((p) => p.status === "SCHEDULED").reduce((s, p) => s + toNum(p.amount), 0);
  const totalPaid = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + toNum(p.amount), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted-foreground">{t("totalScheduled")}</p>
          <p className="mt-1 text-lg font-bold text-warning">{formatNumber(totalScheduled, locale)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted-foreground">{t("totalPaid")}</p>
          <p className="mt-1 text-lg font-bold text-success">{formatNumber(totalPaid, locale)}</p>
        </div>
      </div>

      {/* Create voucher */}
      <details className="rounded-xl border border-dashed border-border-strong p-4">
        <summary className="cursor-pointer text-sm font-medium text-brand-600">{t("create")}</summary>
        <form action={createVendorPayment} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            {t("vendor")}
            <SearchableSelect
              name="vendorId"
              required
              placeholder={t("selectVendor")}
              options={vendors.map((v) => ({ value: v.id, label: v.name }))}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {tc("projectLabel")}
            <SearchableSelect
              name="projectId"
              placeholder="—"
              options={projects.map((p) => ({ value: p.id, label: p.code }))}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {tc("amount")}
            <input name="amount" type="number" step="any" min={1} className={input} />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("dueDate")}
            <DateField name="dueDate" className={input} />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("invoiceNo")}
            <input name="invoiceNo" className={input} />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("note")}
            <input name="note" className={input} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">{t("create")}</button>
          </div>
        </form>
      </details>

      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t("vendor")}</th>
              <th className="px-3 py-2">{tc("projectLabel")}</th>
              <th className="px-3 py-2 text-right">{tc("amount")}</th>
              <th className="px-3 py-2">{t("dueDate")}</th>
              <th className="px-3 py-2">{t("invoiceNo")}</th>
              <th className="px-3 py-2">{tc("status")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 font-medium text-foreground">{p.vendor.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.project?.code ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(toNum(p.amount), locale)}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.dueDate ? formatDate(p.dueDate) : "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.invoiceNo ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge tone={p.status === "PAID" ? "success" : "warning"}>{t(`status${p.status}`)}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  {p.status === "SCHEDULED" && (
                    <form action={markVendorPaymentPaid.bind(null, p.id)}>
                      <button type="submit" className="rounded-lg border border-success/40 px-2 py-1 text-xs font-medium text-success hover:bg-success/10">{t("markPaid")}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">{t("empty")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
