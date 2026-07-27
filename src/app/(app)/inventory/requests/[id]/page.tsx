import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { canApproveIssue } from "@/lib/inventory-request";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getMyPermissions, requirePermission } from "@/lib/permissions";
import { ApproveForm, CancelRequestForm, ConfirmForm } from "../request-actions-forms";

const STATUS_TONE = { PROPOSED: "warning", APPROVED: "brand", DONE: "success", REJECTED: "danger", CANCELED: "neutral" } as const;

export default async function StockRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("inventory.view");
  const { id } = await params;
  const [t, locale, perms, staffId] = await Promise.all([
    getTranslations("inventory.requests"),
    getLocale() as Promise<Locale>,
    getMyPermissions(),
    getCurrentStaffId(),
  ]);

  const req = await prisma.stockRequest.findUnique({
    where: { id },
    include: {
      warehouse: true,
      toWarehouse: true,
      project: { select: { id: true, code: true, name: true, ownerId: true, leaderId: true, owner: { select: { fullName: true } }, leader: { select: { fullName: true } } } },
      purchaseOrder: { select: { id: true, code: true, projectId: true } },
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      rejectedBy: { select: { fullName: true } },
      confirmedBy: { select: { fullName: true } },
      canceledBy: { select: { fullName: true } },
      document: { select: { id: true, code: true } },
      lines: { include: { item: true }, orderBy: { sort: "asc" } },
    },
  });
  if (!req) notFound();

  const isIssue = req.type === "ISSUE";
  const isReserve = req.type === "RESERVE";
  const isTransfer = req.type === "TRANSFER";
  // Giữ chỗ: Kế toán HOẶC HR Manager duyệt (một mã quyền, không ràng PIC dự án như lệnh xuất).
  const showApproveReserve = isReserve && req.status === "PROPOSED" && perms.has("inventory.reservation.approve");
  const showApprove =
    isIssue &&
    req.status === "PROPOSED" &&
    perms.has("inventory.request.approve") &&
    !!req.project &&
    canApproveIssue(req.project, staffId, perms.has("inventory.request.approve_any"));
  // Giữ chỗ KHÔNG có bước xác nhận: vòng đời dừng ở APPROVED, tồn kho không đổi.
  const showApproveTransfer = isTransfer && req.status === "PROPOSED" && perms.has("inventory.transfer.approve");
  const showConfirm =
    ((isIssue || isTransfer) && req.status === "APPROVED" && perms.has("inventory.issue.confirm")) ||
    (req.type === "INTAKE" && req.status === "PROPOSED" && perms.has("inventory.intake.confirm"));
  const showCancel =
    ["PROPOSED", "APPROVED"].includes(req.status) &&
    (req.createdById === staffId || perms.has("inventory.request.approve_any"));
  // Người duyệt được nhưng KHÔNG phải PIC dự án — nói rõ lý do nút duyệt không hiện
  const blockedByPic = isIssue && req.status === "PROPOSED" && perms.has("inventory.request.approve") && !showApprove;

  const meta: { label: string; value: string }[] = [
    { label: t("colWarehouse"), value: req.warehouse.name },
    ...(req.toWarehouse ? [{ label: t("formToWarehouse"), value: req.toWarehouse.name }] : []),
    ...(req.createdBy ? [{ label: t("createdBy"), value: req.createdBy.fullName }] : []),
    ...(req.project?.owner ? [{ label: t("projectPic"), value: req.project.owner.fullName }] : []),
    ...(req.project?.leader ? [{ label: t("projectLeader"), value: req.project.leader.fullName }] : []),
    ...(req.approvedBy ? [{ label: t("approvedBy"), value: `${req.approvedBy.fullName} · ${formatDate(req.approvedAt!)}` }] : []),
    ...(req.rejectedBy ? [{ label: t("rejectedBy"), value: `${req.rejectedBy.fullName} — ${req.rejectReason ?? ""}` }] : []),
    ...(req.confirmedBy ? [{ label: t("confirmedBy"), value: `${req.confirmedBy.fullName} · ${formatDate(req.confirmedAt!)}` }] : []),
    ...(req.canceledBy ? [{ label: t("canceledBy"), value: req.canceledBy.fullName }] : []),
    ...(req.expectedReturnAt ? [{ label: t("expectedReturn"), value: formatDate(req.expectedReturnAt) }] : []),
    ...(req.note ? [{ label: t("note"), value: req.note }] : []),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-lg font-semibold text-foreground">{req.code}</h1>
        <Badge tone="brand">{t(`type${req.type}` as Parameters<typeof t>[0])}</Badge>
        <Badge tone={STATUS_TONE[req.status as keyof typeof STATUS_TONE] ?? "neutral"}>{t(`status${req.status}` as Parameters<typeof t>[0])}</Badge>
        <span className="text-xs text-muted-foreground">{formatDate(req.createdAt)}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
        {req.project && (
          <p className="text-sm sm:col-span-2">
            <span className="text-xs text-muted-foreground">{t("colProject")}: </span>
            <Link href={`/projects/${req.project.id}`} className="font-medium text-brand-600 hover:underline">
              {req.project.code} — {req.project.name}
            </Link>
          </p>
        )}
        {req.purchaseOrder && (
          <p className="text-sm sm:col-span-2">
            <span className="text-xs text-muted-foreground">{t("formPo")}: </span>
            <Link href={`/projects/${req.purchaseOrder.projectId}/purchasing`} className="font-mono font-medium text-brand-600 hover:underline">
              {req.purchaseOrder.code}
            </Link>
          </p>
        )}
        {meta.map((m) => (
          <p key={m.label} className="text-sm">
            <span className="text-xs text-muted-foreground">{m.label}: </span>
            <span className="text-foreground">{m.value}</span>
          </p>
        ))}
        {req.document && (
          <p className="text-sm sm:col-span-2">
            <span className="text-xs text-muted-foreground">{t("stockDoc")}: </span>
            <Link href={`/inventory/documents/${req.document.id}`} className="font-mono font-medium text-brand-600 hover:underline">
              {req.document.code}
            </Link>
          </p>
        )}
      </div>

      <section className="rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">{t("linesTitle")}</h2>
        <ul>
          {req.lines.map((l) => {
            const short = l.confirmedQuantity !== null && l.confirmedQuantity < l.quantity;
            return (
              <li key={l.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{l.item.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {l.item.code}
                    {l.note ? ` · ${l.note}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {l.confirmedQuantity !== null
                      ? `${formatNumber(l.confirmedQuantity, locale)} / ${formatNumber(l.quantity, locale)}`
                      : formatNumber(l.quantity, locale)}
                    {l.item.unit ? ` ${l.item.unit}` : ""}
                  </p>
                  {short && <Badge tone="danger">{t("shortBy", { count: l.quantity - (l.confirmedQuantity ?? 0) })}</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {blockedByPic && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{t("notPicHint")}</p>}
      {showApprove && <ApproveForm requestId={req.id} />}
      {showApproveReserve && <ApproveForm requestId={req.id} kind="RESERVE" />}
      {showApproveTransfer && <ApproveForm requestId={req.id} kind="TRANSFER" />}
      {showConfirm && (
        <ConfirmForm
          requestId={req.id}
          kind={isIssue ? "ISSUE" : isTransfer ? "TRANSFER" : "INTAKE"}
          lines={req.lines.map((l) => ({ id: l.id, code: l.item.code, name: l.item.name, unit: l.item.unit, quantity: l.quantity }))}
        />
      )}
      {showCancel && <CancelRequestForm requestId={req.id} />}
    </div>
  );
}
