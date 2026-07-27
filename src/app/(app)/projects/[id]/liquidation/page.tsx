import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSpreadsheet, CheckCircle2, Circle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import { formatDate, formatDateTime, formatNumber, formatPercent, pickLabel, toNum } from "@/lib/utils";
import { clientBillableTotal, computeMarginPct } from "@/lib/bidding";
import { STATUS_TONE } from "@/lib/bidding-ui";
import type { Locale } from "@/i18n/locales";
import { confirmClientAcceptance, setExpectedAcceptanceSignDate, sendCostSheetToLiquidation } from "../../actions";
import { LiquidationInvoiceForm } from "./invoice-form";
import { hasPermission, requirePermission } from "@/lib/permissions";

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

const smallInput =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default async function ProjectLiquidationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.view");
  const { id } = await params;

  const [t, locale, project, invoices, canCreateInvoice, canSendLiquidation] = await Promise.all([
    getTranslations("projects.liquidation"),
    getLocale() as Promise<Locale>,
    prisma.project.findUnique({
      where: { id },
      include: {
        status: true,
        contract: { include: { clientAcceptanceConfirmedBy: true } },
        costSheets: {
          where: { version: "CTRACT" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            sentToLiquidationRevision: true,
            sentToLiquidationBy: true,
            revisions: { orderBy: { revNo: "desc" }, take: 1, select: { revNo: true } },
          },
        },
      },
    }),
    prisma.clientInvoice.findMany({
      where: { projectId: id, voidedAt: null },
      orderBy: { invoiceDate: "desc" },
      include: { payments: { select: { amount: true } } },
    }),
    hasPermission("finance.invoice.manage"),
    hasPermission("projects.liquidation.send"),
  ]);
  if (!project) notFound();

  const contract = project.contract;
  const sheet = project.costSheets[0] ?? null;
  const sentRev = sheet?.sentToLiquidationRevision ?? null;

  // Bản đã chuyển nghiệm thu là ẢNH CHỤP thủ công: CO/CE vẫn sửa tiếp được sau đó. Không cảnh báo
  // thì kế toán xuất hóa đơn theo số cũ mà không biết.
  const latestRevNo = sheet?.revisions[0]?.revNo ?? null;
  const isStaleRev = !!sentRev && latestRevNo != null && latestRevNo > sentRev.revNo;

  // Trần xuất hóa đơn = CE + Chi hộ của ĐÚNG bản đã chuyển nghiệm thu (xem clientBillableTotal).
  const billable = sentRev ? clientBillableTotal(toNum(sentRev.ceTotal), toNum(sentRev.chiHo)) : 0;
  const issued = invoices.reduce((s, inv) => s + toNum(inv.amount), 0);
  const remainingBillable = billable - issued;

  // Ngày mặc định trên form: hôm nay, và hạn = hôm nay + payment term của hợp đồng (UTC, HANDOVER 4.3).
  const now = new Date();
  const todayIso = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
  const dueIso = contract?.paymentTermDays
    ? new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + contract.paymentTermDays)).toISOString().slice(0, 10)
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        </div>
        <Link
          href={`/projects/${id}/co-ce`}
          className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" /> {t("openInCoCe")}
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("currentStatus")}:</span>
          <Badge tone={STATUS_TONE[project.status.code] ?? "neutral"}>{pickLabel(project.status, locale)}</Badge>
        </div>

        <ConfirmRow
          label={t("contractConfirm")}
          done={!!contract?.accountantConfirmedAt}
          at={contract?.accountantConfirmedAt ?? null}
          locale={locale}
          confirmedLabel={t("confirmedAt")}
          notLabel={t("notConfirmed")}
        />
        <ConfirmRow
          label={t("docsConfirm")}
          done={!!contract?.acceptanceDocsConfirmedAt}
          at={contract?.acceptanceDocsConfirmedAt ?? null}
          locale={locale}
          confirmedLabel={t("confirmedAt")}
          notLabel={t("notConfirmed")}
        />

        <p className="rounded-lg border border-dashed border-border-strong bg-surface-2/40 px-3 py-2 text-xs text-muted-foreground">
          {t("onlyExecutionNote")} · {t("liquidNote")}
        </p>
      </div>

      {/* CO/CE đã chuyển sang Nghiệm thu */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-foreground">{t("coceSnapshotTitle")}</h3>
        {!sentRev || !sheet ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{t("coceSnapshotEmpty")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("coceSnapshotHint")}</p>
          </>
        ) : (
          <>
            {isStaleRev && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2">
                <p className="text-xs text-warning">{t("staleRevWarning", { sent: sentRev.revNo, latest: latestRevNo ?? 0 })}</p>
                {canSendLiquidation && (
                  <form action={sendCostSheetToLiquidation.bind(null, id)}>
                    <button
                      type="submit"
                      className="h-8 rounded-lg border border-warning/40 px-3 text-xs font-medium text-warning hover:bg-warning/10"
                    >
                      {t("staleRevAction")}
                    </button>
                  </form>
                )}
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard label={t("coceRevLabel")} value={`v${sentRev.revNo}`} />
              <SummaryCard label={t("coTotal")} value={formatNumber(sentRev.coTotal, locale)} />
              <SummaryCard label={t("ceTotal")} value={formatNumber(sentRev.ceTotal, locale)} />
              <SummaryCard
                label={t("margin")}
                value={`${formatPercent(computeMarginPct(Number(sentRev.ceTotal), Number(sentRev.coTotal)), locale)}%`}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("sentAtLabel")}: {sheet.sentToLiquidationAt ? formatDateTime(sheet.sentToLiquidationAt, locale) : "—"}
              {" · "}
              {t("sentByLabel")}: {sheet.sentToLiquidationBy?.fullName ?? "—"}
            </p>
          </>
        )}
      </section>

      {/* Khách hàng xác nhận nghiệm thu + Ngày dự kiến ký */}
      <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("clientAcceptanceTitle")}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {contract?.clientAcceptanceConfirmedAt ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm text-foreground">{t("clientAcceptanceConfirm")}</span>
                <span className="text-xs text-success">
                  {t("clientAcceptanceConfirmedBy", {
                    name: contract.clientAcceptanceConfirmedBy?.fullName ?? "—",
                    date: formatDateTime(contract.clientAcceptanceConfirmedAt, locale),
                  })}
                </span>
              </>
            ) : (
              <form action={confirmClientAcceptance.bind(null, id)}>
                <button
                  type="submit"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-success/40 px-3 text-xs font-medium text-success hover:bg-success/10"
                >
                  <Circle className="h-3.5 w-3.5" /> {t("clientAcceptanceConfirm")}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <label className="mb-1 block text-xs font-medium text-foreground">{t("expectedSignDateLabel")}</label>
          <form action={setExpectedAcceptanceSignDate.bind(null, id)} className="flex flex-wrap items-end gap-2">
            <DateField
              name="expectedAcceptanceSignDate"
              defaultValue={toDateInput(contract?.expectedAcceptanceSignDate ?? null)}
              className={smallInput + " sm:max-w-xs"}
            />
            <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-medium text-white hover:bg-brand-600">
              {t("expectedSignDateSave")}
            </button>
          </form>
          <p className="mt-1 text-xs text-muted-foreground">{t("expectedSignDateHint")}</p>
        </div>
      </section>

      {/* Xuất hóa đơn — tạo ClientInvoice THẬT (một nguồn sự thật, dùng chung với /finance/debt) */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-foreground">{t("invoiceTitle")}</h3>
        {!sentRev ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("invoiceNeedSentRev")}</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryCard label={t("invoiceBillableLabel")} value={formatNumber(billable, locale)} />
              <SummaryCard label={t("invoiceIssuedLabel")} value={formatNumber(issued, locale)} />
              <SummaryCard label={t("invoiceRemainingLabel")} value={formatNumber(remainingBillable, locale)} />
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-medium text-foreground">{t("invoiceListTitle")}</p>
              {invoices.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">{t("invoiceListEmpty")}</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {invoices.map((inv) => {
                    const paid = inv.payments.reduce((s, p) => s + toNum(p.amount), 0);
                    return (
                      <li key={inv.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{inv.invoiceNo}</span>
                        <span className="tabular-nums">{formatNumber(toNum(inv.amount), locale)}</span>
                        <span className="text-success">
                          {t("invoicePaidShort")}: {formatNumber(paid, locale)}
                        </span>
                        <span>{formatDate(inv.invoiceDate)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link href="/finance/debt" className="mt-2 inline-block text-xs text-brand-600 hover:underline">
                {t("invoiceOpenDebt")} →
              </Link>
            </div>

            {canCreateInvoice && remainingBillable > 0 && (
              <LiquidationInvoiceForm
                projectId={id}
                suggestedAmount={remainingBillable}
                defaultInvoiceDate={todayIso}
                defaultDueDate={dueIso}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

function ConfirmRow({
  label,
  done,
  at,
  locale,
  confirmedLabel,
  notLabel,
}: {
  label: string;
  done: boolean;
  at: Date | null;
  locale: Locale;
  confirmedLabel: string;
  notLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
      <span className="text-sm text-foreground">{label}</span>
      {done && at ? (
        <span className="text-xs text-success">
          {confirmedLabel}: {formatDateTime(at, locale)}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{notLabel}</span>
      )}
    </div>
  );
}
