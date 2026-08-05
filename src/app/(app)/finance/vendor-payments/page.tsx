import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDate, toNum } from "@/lib/utils";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import type { Locale } from "@/i18n/locales";
import { type PickerLine } from "./line-picker";
import { CreateVendorPaymentForm, MarkPaidButton, UnmarkPaidButton, CancelPaymentButton } from "./payment-forms";
import { requirePermission } from "@/lib/permissions";

export default async function VendorPaymentsPage() {
  await requirePermission("finance.view");
  const [t, tc, locale, payments, vendors, projects] = await Promise.all([
    getTranslations("finance.vendorPayments"),
    getTranslations("finance.common"),
    getLocale() as Promise<Locale>,
    // Phiếu đã huỷ rời khỏi danh sách (bản ghi vẫn còn trong DB + AuditLog) — nhất quán với hóa
    // đơn đã huỷ ở trang Công nợ.
    prisma.vendorPayment.findMany({ where: { status: { not: "CANCELED" } }, include: { vendor: true, project: true, purchaseOrder: { select: { code: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } }, orderBy: { updatedAt: "desc" } }),
  ]);

  // Dòng chi phí còn hạn mức — nguồn cho ô "gắn vào dòng" của phiếu chi. Bỏ dòng stale (dòng
  // CO/CE đã đổi tên/xoá) và dòng đã chi hết: chọn vào chỉ để bị server chặn.
  const rawLines = await prisma.financeCostLine.findMany({
    where: { isStale: false, project: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } } },
    orderBy: [{ projectId: "asc" }, { sort: "asc" }],
    include: {
      advances: { where: { status: { not: "CANCELED" } }, select: { amount: true } },
      vendorPayments: { where: { status: { not: "CANCELED" } }, select: { amount: true } },
    },
  });
  const pickerLines: PickerLine[] = rawLines.map((l) => ({
    id: l.id,
    projectId: l.projectId,
    itemCode: l.itemCode,
    itemName: l.itemName,
    sectionName: l.sectionName,
    remaining:
      toNum(l.payCap) -
      l.advances.reduce((s, a) => s + toNum(a.amount), 0) -
      l.vendorPayments.reduce((s, p) => s + toNum(p.amount), 0),
  }));

  // Trần chi CẤP DỰ ÁN cho phiếu không gắn dòng — cùng công thức với projectDisbursement ở
  // lib/finance.ts (Σ netAmount dòng còn hiệu lực, KHÔNG gồm Chi hộ, trừ đã ứng và đã lập phiếu).
  // Ở đây chỉ để HIỂN THỊ; server vẫn tính lại trong transaction trước khi ghi.
  const [capLines, advByProject, payByProject] = await Promise.all([
    prisma.financeCostLine.groupBy({ by: ["projectId"], where: { isStale: false, isProxy: false }, _sum: { payCap: true } }),
    prisma.advance.groupBy({
      by: ["projectId"],
      where: { status: { not: "CANCELED" }, financeCostLine: { isProxy: false } },
      _sum: { amount: true },
    }),
    prisma.vendorPayment.groupBy({
      by: ["projectId"],
      where: { status: { not: "CANCELED" }, OR: [{ financeCostLineId: null }, { financeCostLine: { isProxy: false } }] },
      _sum: { amount: true },
    }),
  ]);
  const capBaseBy = new Map(capLines.map((r) => [r.projectId, toNum(r._sum.payCap ?? BigInt(0))]));
  const advBy = new Map(advByProject.map((r) => [r.projectId, toNum(r._sum.amount ?? BigInt(0))]));
  const payBy = new Map(payByProject.map((r) => [r.projectId ?? "", toNum(r._sum.amount ?? BigInt(0))]));
  const projectCaps: Record<string, { remaining: number; hasLines: boolean }> = {};
  for (const p of projects) {
    const base = capBaseBy.get(p.id) ?? 0;
    projectCaps[p.id] = {
      remaining: base - (advBy.get(p.id) ?? 0) - (payBy.get(p.id) ?? 0),
      hasLines: capBaseBy.has(p.id),
    };
  }

  // PO còn sống — ô gắn phiếu chi vào PO (C3, đối chiếu ĐẶT / NHẬN / CHI). Server kiểm PO đúng dự án.
  const openPos = await prisma.purchaseOrder.findMany({
    where: { status: { not: "CANCELED" }, project: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } } },
    orderBy: { orderedAt: "desc" },
    include: { vendor: { select: { name: true } } },
  });
  const poOptions = openPos.map((po) => ({ value: po.id, label: po.code + " — " + po.vendor.name }));

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
        <CreateVendorPaymentForm
          vendors={vendors.map((v) => ({ value: v.id, label: v.name }))}
          projects={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
          lines={pickerLines}
          projectCaps={projectCaps}
          poOptions={poOptions}
        />
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
              <th className="px-3 py-2">PO</th>
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
                <td className="px-3 py-2 text-muted-foreground">{p.purchaseOrder?.code ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={p.status === "PAID" ? "success" : "warning"}>{t(`status${p.status}`)}</Badge>
                    {/* Phiếu vượt trần phải nhìn thấy ngay trong danh sách, kèm lý do ở tooltip. */}
                    {p.overCapNote && <span title={p.overCapNote}><Badge tone="danger">{t("overCapBadge")}</Badge></span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  {p.status === "SCHEDULED" ? (
                    <div className="flex flex-col items-end gap-1">
                      <MarkPaidButton id={p.id} />
                      <CancelPaymentButton id={p.id} />
                    </div>
                  ) : (
                    <UnmarkPaidButton id={p.id} />
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">{t("empty")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
