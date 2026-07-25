import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSpreadsheet, CheckCircle2, Circle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import { formatDateTime, formatNumber, formatPercent, pickLabel } from "@/lib/utils";
import { computeMarginPct } from "@/lib/bidding";
import { STATUS_TONE } from "@/lib/bidding-ui";
import type { Locale } from "@/i18n/locales";
import { confirmClientAcceptance, setExpectedAcceptanceSignDate, saveInvoiceInfo } from "../../actions";
import { requirePermission } from "@/lib/permissions";

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

const smallInput =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default async function ProjectLiquidationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.view");
  const { id } = await params;

  const [t, locale, project] = await Promise.all([
    getTranslations("projects.liquidation"),
    getLocale() as Promise<Locale>,
    prisma.project.findUnique({
      where: { id },
      include: {
        status: true,
        contract: { include: { clientAcceptanceConfirmedBy: true, invoiceBy: true } },
        costSheets: {
          where: { version: "CTRACT" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sentToLiquidationRevision: true, sentToLiquidationBy: true },
        },
      },
    }),
  ]);
  if (!project) notFound();

  const contract = project.contract;
  const sheet = project.costSheets[0] ?? null;
  const sentRev = sheet?.sentToLiquidationRevision ?? null;

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

      {/* Xuất hóa đơn */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-foreground">{t("invoiceTitle")}</h3>
        <form action={saveInvoiceInfo.bind(null, id)} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">{t("invoiceNoLabel")}</label>
            <input name="invoiceNo" defaultValue={contract?.invoiceNo ?? ""} className={smallInput} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">{t("invoiceDateLabel")}</label>
            <DateField name="invoiceDate" defaultValue={toDateInput(contract?.invoiceDate ?? null)} className={smallInput} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-medium text-white hover:bg-brand-600">
              {t("invoiceSave")}
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          {contract?.invoiceNo ? t("invoiceSavedBy", { name: contract.invoiceBy?.fullName ?? "—" }) : t("invoiceEmpty")}
        </p>
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
