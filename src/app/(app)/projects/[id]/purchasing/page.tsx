import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/utils";
import { getDepartmentTasks, getDepartmentStaffOptions, toDepartmentTaskBoardData } from "@/lib/department-tasks";
import { DepartmentTaskBoard } from "../department-task-board";
import { PoPanel, type PoRow, type CostLineOpt } from "./po-panel";
import { hasPermission, requirePermission } from "@/lib/permissions";

export default async function ProjectPurchasingPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.view");
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, include: { status: true } });
  if (!project) notFound();

  const [t, tPo, deptTasks, deptStaffOptions, pos, vendors, costLines, canManage, canReceive] = await Promise.all([
    getTranslations("projects.deptTasks"),
    getTranslations("projects.purchasing"),
    getDepartmentTasks(id, "PCC"),
    getDepartmentStaffOptions("PCC"),
    prisma.purchaseOrder.findMany({
      where: { projectId: id },
      orderBy: { orderedAt: "desc" },
      include: {
        vendor: { select: { name: true } },
        lines: { include: { financeCostLine: { select: { itemCode: true, itemName: true } } } },
        payments: { where: { status: { not: "CANCELED" } }, select: { amount: true } },
      },
    }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Dòng CO còn hiệu lực — nguồn neo cho từng dòng PO (bắt buộc chọn).
    prisma.financeCostLine.findMany({
      where: { projectId: id, isStale: false },
      orderBy: { sort: "asc" },
      select: { id: true, itemCode: true, itemName: true, sectionName: true, isProxy: true },
    }),
    hasPermission("purchasing.po.manage"),
    hasPermission("purchasing.po.receive"),
  ]);
  const deptTaskBoardData = deptTasks.map((task) => toDepartmentTaskBoardData(task, project.status.code, project.finishedAt));

  const poRows: PoRow[] = pos.map((po) => ({
    id: po.id,
    code: po.code,
    vendorName: po.vendor.name,
    status: po.status,
    note: po.note,
    orderedAt: po.orderedAt.toISOString(),
    ordered: po.lines.reduce((s, l) => s + toNum(l.amount), 0),
    received: po.lines.reduce((s, l) => s + Math.round(l.receivedQty * toNum(l.unitPrice)), 0),
    paid: po.payments.reduce((s, p) => s + toNum(p.amount), 0),
    lines: po.lines.map((l) => ({
      id: l.id,
      itemName: l.itemName,
      costLineLabel: l.financeCostLine ? `${l.financeCostLine.itemCode ? l.financeCostLine.itemCode + " · " : ""}${l.financeCostLine.itemName}` : null,
      quantity: l.quantity,
      unitPrice: toNum(l.unitPrice),
      amount: toNum(l.amount),
      receivedQty: l.receivedQty,
      receivedAt: l.receivedAt ? l.receivedAt.toISOString() : null,
    })),
  }));
  const costLineOpts: CostLineOpt[] = costLines.map((c) => ({
    value: c.id,
    label: `${c.itemCode ? c.itemCode + " · " : ""}${c.sectionName} — ${c.itemName}${c.isProxy ? ` · ${tPo("poProxyTag")}` : ""}`,
    itemName: c.itemName,
  }));

  return (
    <div className="space-y-4">
      {/* PO là nghiệp vụ chính của Thu mua — panel đặt trên board task. Chưa có dòng chi phí thì
          nhắc bấm "Làm mới" ở /finance trước (T005/T006 từng đúng tình trạng này). */}
      <PoPanel projectId={id} pos={poRows} vendors={vendors.map((v) => ({ value: v.id, label: v.name }))} costLines={costLineOpts} canManage={canManage} canReceive={canReceive} />
      {canManage && costLines.length === 0 && (
        <p className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">{tPo("poNoCostLines")}</p>
      )}

      <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <DepartmentTaskBoard projectId={id} department="PCC" tasks={deptTaskBoardData} staffOptions={deptStaffOptions} />
      </section>
    </div>
  );
}
