import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { formatNumber, formatPercent, toNum } from "@/lib/utils";
import { computePnl } from "@/lib/pnl";
import { ctvRowCost } from "@/lib/ctv-costing";
import type { Locale } from "@/i18n/locales";
import { requirePermission } from "@/lib/permissions";

/**
 * C4 — P&L dự án (chỉ ĐỌC, gác projects.pnl.view — BGĐ + CFO). Mọi con số lấy từ các nguồn đã có,
 * không nhập liệu thêm, không bảng tổng mới (bất biến #3). Xem nguyên tắc ở lib/pnl.ts.
 */
function Card({ label, value, tone, locale }: { label: string; value: number; tone?: "success" | "warning" | "danger"; locale: Locale }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-foreground"}`}>
        {formatNumber(value, locale)}
      </p>
    </div>
  );
}

export default async function ProjectPnlPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.pnl.view");
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, code: true, name: true } });
  if (!project) notFound();

  const [t, locale, sheet, invoices, advAgg, payAgg, pos, poPayAgg, ctvBatches, ctvPayAgg] = await Promise.all([
    getTranslations("projects.pnl"),
    getLocale() as Promise<Locale>,
    prisma.costSheet.findFirst({
      where: { projectId: id, version: "CTRACT" },
      orderBy: { createdAt: "desc" },
      select: { ceTotal: true, coTotal: true, chiHo: true },
    }),
    prisma.clientInvoice.findMany({
      where: { projectId: id, voidedAt: null },
      select: { amount: true, payments: { select: { amount: true } } },
    }),
    // "Đã chi" — CÙNG bộ lọc với projectDisbursement: chưa huỷ + loại khoản gắn dòng Chi hộ.
    prisma.advance.aggregate({
      where: { projectId: id, status: { not: "CANCELED" }, financeCostLine: { isProxy: false } },
      _sum: { amount: true },
    }),
    prisma.vendorPayment.aggregate({
      where: { projectId: id, status: { not: "CANCELED" }, OR: [{ financeCostLineId: null }, { financeCostLine: { isProxy: false } }] },
      _sum: { amount: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { projectId: id, status: { not: "CANCELED" } },
      select: { lines: { select: { amount: true } } },
    }),
    prisma.vendorPayment.aggregate({
      where: { projectId: id, status: { not: "CANCELED" }, purchaseOrderId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.ctvBatch.findMany({
      where: { projectId: id },
      select: { rows: { select: { amount: true, pitTax: true, netReceived: true, grossNet: true } } },
    }),
    prisma.vendorPayment.aggregate({
      where: { projectId: id, status: { not: "CANCELED" }, ctvBatchId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const invoiced = invoices.reduce((s, inv) => s + toNum(inv.amount), 0);
  const collected = invoices.reduce((s, inv) => s + inv.payments.reduce((s2, p) => s2 + toNum(p.amount), 0), 0);
  const disbursed = toNum(advAgg._sum.amount ?? BigInt(0)) + toNum(payAgg._sum.amount ?? BigInt(0));

  // Cam kết SẼ chi thêm: PO sống chưa chi + CTV đã nhập chưa thành phiếu chi (đều floor 0 — phiếu
  // chi có thể lớn hơn PO khi chi gộp; không để số âm bù trừ lung tung).
  const poOrdered = pos.reduce((s, po) => s + po.lines.reduce((s2, l) => s2 + toNum(l.amount), 0), 0);
  const poPaid = toNum(poPayAgg._sum.amount ?? BigInt(0));
  const ctvEntered = ctvBatches.reduce(
    (s, b) =>
      s +
      b.rows.reduce(
        (s2, r) =>
          s2 +
          ctvRowCost({
            amount: r.amount == null ? null : toNum(r.amount),
            pitTax: r.pitTax == null ? null : toNum(r.pitTax),
            netReceived: r.netReceived == null ? null : toNum(r.netReceived),
            grossNet: r.grossNet,
          }),
        0,
      ),
    0,
  );
  const ctvPaid = toNum(ctvPayAgg._sum.amount ?? BigInt(0));
  const committed = Math.max(0, poOrdered - poPaid) + Math.max(0, ctvEntered - ctvPaid);

  const pnl = computePnl({
    cePlan: sheet ? toNum(sheet.ceTotal) : 0,
    coPlan: sheet ? toNum(sheet.coTotal) : 0,
    chiHoPlan: sheet ? toNum(sheet.chiHo) : 0,
    invoiced,
    collected,
    disbursed,
    committed,
    hasSheet: !!sheet,
    hasInvoices: invoices.length > 0,
  });

  const warnings: string[] = [];
  if (!pnl.hasSheet) warnings.push(t("warnNoSheet"));
  if (pnl.hasSheet && !pnl.hasInvoices) warnings.push(t("warnNoInvoices"));
  if (pnl.hasSheet) warnings.push(t("warnCoIsPlan"));
  if (pnl.chiHoPlan > 0) warnings.push(t("warnChiHoMixed"));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2">
          {warnings.map((w) => (
            <p key={w} className="text-xs text-warning">• {w}</p>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t("revenueTitle")}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card locale={locale} label={t("cePlan")} value={pnl.cePlan} />
          <Card locale={locale} label={t("invoiced")} value={pnl.invoiced} />
          <Card locale={locale} label={t("collected")} value={pnl.collected} tone="success" />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t("costTitle")}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card locale={locale} label={t("coPlan")} value={pnl.coPlan} />
          <Card locale={locale} label={t("disbursed")} value={pnl.disbursed} tone={pnl.disbursed > pnl.coPlan ? "danger" : undefined} />
          <Card locale={locale} label={t("committed")} value={pnl.committed} tone="warning" />
        </div>
        {pnl.projectedSpend > pnl.coPlan && pnl.hasSheet && (
          <p className="text-xs text-danger">{t("warnProjectedOver", { amount: formatNumber(pnl.projectedSpend - pnl.coPlan, locale) })}</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t("resultTitle")}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted-foreground">{t("grossPlan")}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${pnl.grossPlan >= 0 ? "text-foreground" : "text-danger"}`}>
              {formatNumber(pnl.grossPlan, locale)}
            </p>
            <p className="text-xs text-muted-foreground">{t("marginPlan", { pct: formatPercent(pnl.marginPlanPct, locale) })}</p>
          </div>
          <Card locale={locale} label={t("grossCashActual")} value={pnl.grossCashActual} tone={pnl.grossCashActual >= 0 ? "success" : "danger"} />
          {pnl.chiHoPlan > 0 && <Card locale={locale} label={t("chiHoPlan")} value={pnl.chiHoPlan} />}
        </div>
        <p className="text-xs leading-snug text-muted-foreground">{t("grossCashNote")}</p>
      </section>
    </div>
  );
}
