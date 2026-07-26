import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDate, toNum } from "@/lib/utils";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import type { Locale } from "@/i18n/locales";
import { CreateInvoiceForm, RecordPaymentForm } from "./invoice-forms";
import { requirePermission } from "@/lib/permissions";

type Bucket = "current" | "d30" | "d60" | "d60plus";
// Mốc quá hạn = dueDate ?? invoiceDate — thống nhất với cashflow.ts/dashboard.ts/getArOverdueItems:
// hóa đơn không có dueDate nhưng phát hành đã lâu vẫn phải rơi vào bucket quá hạn, không "vô hình".
function agingBucket(dueDate: Date | null, invoiceDate: Date, now: Date): Bucket {
  const base = dueDate ?? invoiceDate;
  const days = Math.floor((now.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "current";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  return "d60plus";
}

export default async function DebtPage() {
  await requirePermission("finance.view");
  const now = new Date();
  const [t, tc, locale, invoices, projects] = await Promise.all([
    getTranslations("finance.debt"),
    getTranslations("finance.common"),
    getLocale() as Promise<Locale>,
    prisma.clientInvoice.findMany({
      include: { client: true, project: true, payments: true },
      orderBy: { invoiceDate: "desc" },
    }),
    prisma.project.findMany({ where: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } }, orderBy: { updatedAt: "desc" } }),
  ]);

  const rows = invoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + toNum(p.amount), 0);
    const amount = toNum(inv.amount);
    const outstanding = amount - paid;
    return { inv, amount, paid, outstanding, bucket: outstanding > 0 ? agingBucket(inv.dueDate, inv.invoiceDate, now) : ("current" as Bucket) };
  });

  const buckets: Record<Bucket, number> = { current: 0, d30: 0, d60: 0, d60plus: 0 };
  for (const r of rows) if (r.outstanding > 0) buckets[r.bucket] += r.outstanding;
  const totalOutstanding = buckets.current + buckets.d30 + buckets.d60 + buckets.d60plus;

  const bucketMeta: { key: Bucket; label: string; tone: "neutral" | "warning" | "danger" }[] = [
    { key: "current", label: t("agingCurrent"), tone: "neutral" },
    { key: "d30", label: t("aging30"), tone: "warning" },
    { key: "d60", label: t("aging60"), tone: "warning" },
    { key: "d60plus", label: t("aging60plus"), tone: "danger" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      {/* Aging summary */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("agingTitle")}</h2>
          <span className="text-xs text-muted-foreground">{t("totalOutstanding")}: <span className="font-semibold text-foreground">{formatNumber(totalOutstanding, locale)}</span></span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {bucketMeta.map((b) => (
            <div key={b.key} className="rounded-lg border border-border p-3">
              <Badge tone={b.tone}>{b.label}</Badge>
              <p className="mt-1.5 text-base font-bold text-foreground tabular-nums">{formatNumber(buckets[b.key], locale)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Create invoice */}
      <details className="rounded-xl border border-dashed border-border-strong p-4">
        <summary className="cursor-pointer text-sm font-medium text-brand-600">{t("createInvoice")}</summary>
        <CreateInvoiceForm projects={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} />
      </details>

      {/* Invoices */}
      <div className="space-y-3">
        {rows.map(({ inv, amount, paid, outstanding, bucket }) => (
          <div key={inv.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-foreground">{inv.invoiceNo}</span>
                <span className="ml-2 text-xs text-muted-foreground">{inv.client.name} · {inv.project.code}</span>
              </div>
              {outstanding > 0 && (
                <Badge tone={bucket === "d60plus" ? "danger" : bucket === "current" ? "neutral" : "warning"}>
                  {bucketMeta.find((b) => b.key === bucket)?.label}
                </Badge>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><span className="block text-xs text-muted-foreground">{t("amount")}</span><span className="font-medium tabular-nums">{formatNumber(amount, locale)}</span></div>
              <div><span className="block text-xs text-muted-foreground">{t("paid")}</span><span className="font-medium tabular-nums text-success">{formatNumber(paid, locale)}</span></div>
              <div><span className="block text-xs text-muted-foreground">{t("outstanding")}</span><span className="font-medium tabular-nums text-warning">{formatNumber(outstanding, locale)}</span></div>
              <div><span className="block text-xs text-muted-foreground">{t("dueDate")}</span><span className="text-muted-foreground">{inv.dueDate ? formatDate(inv.dueDate) : "—"}</span></div>
            </div>

            {outstanding > 0 && <RecordPaymentForm invoiceId={inv.id} />}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">{t("empty")}</div>
        )}
      </div>
    </div>
  );
}
