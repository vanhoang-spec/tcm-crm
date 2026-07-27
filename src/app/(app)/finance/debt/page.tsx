import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDate, toNum } from "@/lib/utils";
import { arStatus, type ArAgingBucket } from "@/lib/ar";
import { clientBillableTotal } from "@/lib/bidding";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import type { Locale } from "@/i18n/locales";
import { CreateInvoiceForm, RecordPaymentForm, VoidInvoiceButton } from "./invoice-forms";
import { requirePermission } from "@/lib/permissions";

export default async function DebtPage() {
  await requirePermission("finance.view");
  const now = new Date();
  const [t, tc, locale, invoices, projects] = await Promise.all([
    getTranslations("finance.debt"),
    getTranslations("finance.common"),
    getLocale() as Promise<Locale>,
    prisma.clientInvoice.findMany({
      where: { voidedAt: null },
      include: { client: true, project: true, payments: true },
      orderBy: { invoiceDate: "desc" },
    }),
    prisma.project.findMany({ where: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } }, orderBy: { updatedAt: "desc" } }),
  ]);

  // Trần còn được xuất theo dự án (hiển thị trước cho kế toán; server tính lại trong transaction):
  // CE + Chi hộ của bảng CO/CE CTRACT hiện hành trừ hóa đơn đã xuất chưa huỷ. null = chưa có CO/CE.
  const [sheets, issuedByProject] = await Promise.all([
    prisma.costSheet.findMany({
      where: { projectId: { in: projects.map((p) => p.id) }, version: "CTRACT" },
      orderBy: { createdAt: "desc" },
      select: { projectId: true, ceTotal: true, chiHo: true },
    }),
    prisma.clientInvoice.groupBy({ by: ["projectId"], where: { voidedAt: null }, _sum: { amount: true } }),
  ]);
  const issuedBy = new Map(issuedByProject.map((r) => [r.projectId, toNum(r._sum.amount ?? BigInt(0))]));
  const projectCaps: Record<string, number | null> = {};
  for (const p of projects) projectCaps[p.id] = null;
  for (const s of sheets) {
    // findMany trả mọi bảng CTRACT theo createdAt desc — chỉ lấy bảng MỚI NHẤT của mỗi dự án.
    if (projectCaps[s.projectId] == null) {
      projectCaps[s.projectId] = clientBillableTotal(toNum(s.ceTotal), toNum(s.chiHo)) - (issuedBy.get(s.projectId) ?? 0);
    }
  }

  const rows = invoices.map((inv) => {
    const paidAmounts = inv.payments.map((p) => toNum(p.amount));
    const st = arStatus({ amount: toNum(inv.amount), invoiceDate: inv.invoiceDate, dueDate: inv.dueDate, paidAmounts }, now);
    return {
      inv,
      amount: toNum(inv.amount),
      paid: paidAmounts.reduce((s, p) => s + p, 0),
      outstanding: st.outstanding,
      bucket: st.bucket,
    };
  });

  const buckets: Record<ArAgingBucket, number> = { current: 0, d30: 0, d60: 0, d60plus: 0 };
  for (const r of rows) if (r.outstanding > 0) buckets[r.bucket] += r.outstanding;
  const totalOutstanding = buckets.current + buckets.d30 + buckets.d60 + buckets.d60plus;

  const bucketMeta: { key: ArAgingBucket; label: string; tone: "neutral" | "warning" | "danger" }[] = [
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
        {/* Nói thẳng định nghĩa: cùng dữ liệu này nhưng trang Dòng tiền cho số khác (đệm 14 ngày),
            trước đây không chỗ nào giải thích nên người đọc tưởng số bị sai. */}
        <p className="mt-3 text-xs leading-snug text-muted-foreground">{t("defNote")}</p>
      </section>

      {/* Create invoice */}
      <details className="rounded-xl border border-dashed border-border-strong p-4">
        <summary className="cursor-pointer text-sm font-medium text-brand-600">{t("createInvoice")}</summary>
        <CreateInvoiceForm projects={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} projectCaps={projectCaps} />
      </details>

      {/* Invoices */}
      <div className="space-y-3">
        {rows.map(({ inv, amount, paid, outstanding, bucket }) => (
          <div key={inv.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-foreground">{inv.invoiceNo}</span>
                <span className="ml-2 text-xs text-muted-foreground">{inv.client.name} · {inv.project.code}</span>
                {/* Hóa đơn vượt trần phải nhìn thấy ngay trong danh sách, kèm lý do ở tooltip. */}
                {inv.overCapNote && (
                  <span className="ml-2" title={inv.overCapNote}>
                    <Badge tone="danger">{t("overCapBadge")}</Badge>
                  </span>
                )}
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
            {/* Chỉ cho huỷ khi chưa ghi nhận thu tiền — server chặn lại lần nữa. */}
            {paid === 0 && (
              <div className="mt-2 border-t border-border pt-2">
                <VoidInvoiceButton invoiceId={inv.id} />
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">{t("empty")}</div>
        )}
      </div>
    </div>
  );
}
