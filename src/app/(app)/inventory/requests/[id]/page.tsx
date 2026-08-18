import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { canApproveIssue, lotOwnerKind } from "@/lib/inventory-request";
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
      project: { select: { id: true, code: true, name: true, ownerId: true, leaderId: true, owner: { select: { fullName: true } }, leader: { select: { fullName: true } }, ownerTeam: { select: { code: true, leadStaffId: true } } } },
      // K6: dự án CHỦ HÀNG của phiếu (sau khi tách) — team Account của nó duyệt
      ownerProject: { select: { id: true, code: true, name: true, ownerId: true, leaderId: true, owner: { select: { fullName: true } }, leader: { select: { fullName: true } }, ownerTeam: { select: { code: true, leadStaffId: true, lead: { select: { fullName: true } } } } } },
      purchaseOrder: { select: { id: true, code: true, projectId: true } },
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      rejectedBy: { select: { fullName: true } },
      confirmedBy: { select: { fullName: true } },
      canceledBy: { select: { fullName: true } },
      document: { select: { id: true, code: true } },
      lines: { include: { item: { include: { ownerClient: { select: { code: true } }, boundProject: { select: { code: true, ownerTeam: { select: { code: true } } } } } } }, orderBy: { sort: "asc" } },
    },
  });
  if (!req) notFound();

  const isIssue = req.type === "ISSUE";
  const isReserve = req.type === "RESERVE";
  const isTransfer = req.type === "TRANSFER";
  const isDestroy = req.type === "DESTROY";
  // K6: người duyệt = dự án CHỦ HÀNG (ownerProject) nếu có, không thì dự án đang xin (K2)
  const approverProject = req.ownerProject ?? req.project;
  // Giữ chỗ: Kế toán HOẶC HR Manager duyệt (một mã quyền, không ràng PIC dự án như lệnh xuất).
  const showApproveReserve = isReserve && req.status === "PROPOSED" && perms.has("inventory.reservation.approve");
  const showApprove =
    isIssue &&
    req.status === "PROPOSED" &&
    perms.has("inventory.request.approve") &&
    // K6-4: phiếu hàng OVERHEAD → chỉ mã approve_overhead (Senior HR Manager); approve_any không bao
    (req.isOverhead ? perms.has("inventory.request.approve_overhead") : !!approverProject && canApproveIssue(approverProject, staffId, perms.has("inventory.request.approve_any")));
  // K6: đề xuất hủy hàng khách — team Account chủ duyệt; lô khách cũ không có dự án chủ thì chỉ approve_any
  const showApproveDestroy =
    isDestroy &&
    req.status === "PROPOSED" &&
    perms.has("inventory.request.approve") &&
    (req.ownerProject ? canApproveIssue(req.ownerProject, staffId, perms.has("inventory.request.approve_any")) : perms.has("inventory.request.approve_any"));
  // Giữ chỗ KHÔNG có bước xác nhận: vòng đời dừng ở APPROVED, tồn kho không đổi.
  const showApproveTransfer = isTransfer && req.status === "PROPOSED" && perms.has("inventory.transfer.approve");
  const showConfirm =
    ((isIssue || isTransfer) && req.status === "APPROVED" && perms.has("inventory.issue.confirm")) ||
    (isDestroy && req.status === "APPROVED" && perms.has("inventory.destroy")) ||
    (req.type === "INTAKE" && req.status === "PROPOSED" && perms.has("inventory.intake.confirm"));
  const showCancel =
    ["PROPOSED", "APPROVED"].includes(req.status) &&
    (req.createdById === staffId || perms.has("inventory.request.approve_any"));
  // Người duyệt được nhưng KHÔNG phải PIC dự án — nói rõ lý do nút duyệt không hiện
  const blockedByPic = ((isIssue && !showApprove) || (isDestroy && !showApproveDestroy)) && req.status === "PROPOSED" && perms.has("inventory.request.approve");

  const meta: { label: string; value: string }[] = [
    { label: t("colWarehouse"), value: req.warehouse.name },
    ...(req.toWarehouse ? [{ label: t("formToWarehouse"), value: req.toWarehouse.name }] : []),
    ...(req.createdBy ? [{ label: t("createdBy"), value: req.createdBy.fullName }] : []),
    ...(req.project?.owner ? [{ label: t("projectPic"), value: req.project.owner.fullName }] : []),
    ...(req.project?.leader ? [{ label: t("projectLeader"), value: req.project.leader.fullName }] : []),
    // K6-4: phiếu hàng overhead công ty — Senior HR Manager duyệt
    ...(req.isOverhead ? [{ label: t("ownerProjectApprover"), value: t("overheadApprover") }] : []),
    // K6: nói rõ AI duyệt phiếu này — dự án chủ hàng + PIC/Leader/trưởng team của nó
    ...(req.ownerProject
      ? [{
          label: t("ownerProjectApprover"),
          value: `${req.ownerProject.code} (${req.ownerProject.ownerTeam?.code ?? "?"}) — ${[req.ownerProject.owner?.fullName, req.ownerProject.leader?.fullName].filter(Boolean).join(" / ") || req.ownerProject.ownerTeam?.lead?.fullName || t("noPicApproveAny")}`,
        }]
      : []),
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
                  {/* K6: người duyệt phải thấy lô này CỦA AI — hàng chung TCM / dự án này / dự án khác / khách gửi */}
                  {(() => {
                    const kind = lotOwnerKind(l.item, req.projectId);
                    if (kind === "OVERHEAD") return <p className="text-[11px] text-muted-foreground">{t("ownerOVERHEAD")}</p>;
                    if (kind === "MINE") return <p className="text-[11px] text-success">{t("ownerMineShort", { project: l.item.boundProject?.code ?? "" })}</p>;
                    if (kind === "OTHER_PROJECT") return <p className="text-[11px] text-warning">{t("ownerOtherShort", { project: l.item.boundProject?.code ?? "", team: l.item.boundProject?.ownerTeam?.code ?? "?" })}</p>;
                    return <p className="text-[11px] text-brand-600">{t("ownerClientShort", { client: l.item.ownerClient?.code ?? "", project: l.item.boundProject?.code ?? "—", team: l.item.boundProject?.ownerTeam?.code ?? "?" })}</p>;
                  })()}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {l.confirmedQuantity !== null
                      ? `${formatNumber(l.confirmedQuantity, locale)} / ${formatNumber(l.quantity, locale)}`
                      : formatNumber(l.quantity, locale)}
                    {l.item.unit ? ` ${l.item.unit}` : ""}
                  </p>
                  {/* K6: kết quả duyệt từng dòng — 0 = từ chối · < đề xuất = một phần */}
                  {l.approvedQuantity !== null && l.approvedQuantity !== undefined && (
                    l.approvedQuantity === 0
                      ? <Badge tone="danger">{t("lineRejected")}</Badge>
                      : l.approvedQuantity < l.quantity
                        ? <Badge tone="warning">{t("linePartial", { approved: l.approvedQuantity, requested: l.quantity })}</Badge>
                        : <Badge tone="success">{t("lineFull")}</Badge>
                  )}
                  {short && <Badge tone="danger">{t("shortBy", { count: l.quantity - (l.confirmedQuantity ?? 0) })}</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {blockedByPic && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{req.isOverhead ? t("notOverheadApproverHint") : t("notPicHint")}</p>
      )}
      {showApprove && <ApproveForm requestId={req.id} lines={req.lines.map((l) => ({ id: l.id, code: l.item.code, name: l.item.name, unit: l.item.unit, quantity: l.quantity }))} />}
      {showApproveDestroy && <ApproveForm requestId={req.id} kind="DESTROY" lines={req.lines.map((l) => ({ id: l.id, code: l.item.code, name: l.item.name, unit: l.item.unit, quantity: l.quantity }))} />}
      {showApproveReserve && <ApproveForm requestId={req.id} kind="RESERVE" />}
      {showApproveTransfer && <ApproveForm requestId={req.id} kind="TRANSFER" />}
      {showConfirm && (
        <ConfirmForm
          requestId={req.id}
          kind={isIssue ? "ISSUE" : isTransfer ? "TRANSFER" : isDestroy ? "DESTROY" : "INTAKE"}
          lines={req.lines.map((l) => ({ id: l.id, code: l.item.code, name: l.item.name, unit: l.item.unit, quantity: l.quantity, approvedQuantity: l.approvedQuantity }))}
        />
      )}
      {showCancel && <CancelRequestForm requestId={req.id} />}
    </div>
  );
}
