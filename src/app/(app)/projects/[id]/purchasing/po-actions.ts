"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit } from "@/lib/utils";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import { requirePermission } from "@/lib/permissions";

// C3 — Đơn đặt hàng NCC (PO) + nhận hàng ghi trên dòng. PO KHÔNG ăn trần chi (trần vẫn là tạm ứng
// + phiếu chi — phiếu chi lập theo PO mà PO cũng ăn trần là đếm tiền hai lần); PO là làn CAM KẾT
// để đối chiếu ĐẶT ↔ NHẬN ↔ CHI. Không dựng chứng từ nhập kho riêng: hàng event phần lớn giao
// thẳng ra site, nhận thiếu nhìn thấy ngay ở receivedQty < quantity.

export type PoFormState = { error?: string; success?: boolean };

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

async function audit(entityId: string, action: string, payload: unknown) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType: "purchase_order", entityId, field: "*", newValue: stringifyAudit(payload), action, changedBy: staffId },
  });
}

function revalidatePo(projectId: string) {
  revalidatePath(`/projects/${projectId}/purchasing`);
  revalidatePath("/finance/vendor-payments");
}

export async function createPurchaseOrder(projectId: string, _prev: PoFormState, formData: FormData): Promise<PoFormState> {
  await requirePermission("purchasing.po.manage");
  const t = await getTranslations("projects.purchasing");

  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { status: true } });
  if (!project) return { error: t("poErrRequired") };
  // Chỉ dự án đang thực thi — trước đây không chặn gì thì lập được PO cho job CHƯA trúng thầu.
  if (!EXECUTION_STATUS_CODES.includes(project.status.code as (typeof EXECUTION_STATUS_CODES)[number])) {
    return { error: t("poErrProjectNotExecuting") };
  }

  const vendorId = nullable(formData.get("vendorId"));
  if (!vendorId) return { error: t("poErrRequired") };
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
  if (!vendor) return { error: t("poErrRequired") };

  type LineInput = { financeCostLineId: string; itemName: string; quantity: number; unitPrice: number };
  let lines: LineInput[];
  try {
    const raw = JSON.parse(str(formData.get("linesJson")) || "[]") as LineInput[];
    lines = raw
      .map((l) => ({
        financeCostLineId: String(l.financeCostLineId ?? "").trim(),
        itemName: String(l.itemName ?? "").trim(),
        quantity: Number(l.quantity),
        unitPrice: Math.round(Number(l.unitPrice)),
      }))
      .filter((l) => l.itemName !== "" || l.financeCostLineId !== "" || l.unitPrice !== 0);
  } catch {
    return { error: t("poErrRequired") };
  }
  if (lines.length === 0) return { error: t("poErrNoLines") };
  for (const l of lines) {
    // BẮT BUỘC neo từng dòng PO vào một dòng CO (quyết định CEO: mọi khoản tiền neo cấp dòng) —
    // không tìm được dòng CO tương ứng nghĩa là CO/CE thiếu hạng mục, sửa CO/CE chứ không nới.
    if (!l.financeCostLineId || !l.itemName || !Number.isFinite(l.quantity) || l.quantity <= 0 || !Number.isFinite(l.unitPrice) || l.unitPrice < 0) {
      return { error: t("poErrLineInvalid") };
    }
  }
  const lineIds = [...new Set(lines.map((l) => l.financeCostLineId))];
  const costLines = await prisma.financeCostLine.findMany({
    where: { id: { in: lineIds } },
    select: { id: true, projectId: true, isStale: true, itemName: true },
  });
  const byId = new Map(costLines.map((c) => [c.id, c]));
  for (const id of lineIds) {
    const c = byId.get(id);
    if (!c || c.projectId !== projectId) return { error: t("poErrLineNotInProject") };
    if (c.isStale) return { error: t("poErrLineStale", { item: c.itemName }) };
  }

  const staffId = await getCurrentStaffId();
  const count = await prisma.purchaseOrder.count({ where: { projectId } });
  const code = `${project.code}-PO${count + 1}`;
  const created = await prisma.purchaseOrder.create({
    data: {
      code,
      projectId,
      vendorId,
      note: nullable(formData.get("note")),
      orderedById: staffId,
      lines: {
        create: lines.map((l) => ({
          financeCostLineId: l.financeCostLineId,
          itemName: l.itemName,
          quantity: l.quantity,
          unitPrice: BigInt(l.unitPrice),
          // Server tính lại — không tin số tổng từ client.
          amount: BigInt(Math.round(l.quantity * l.unitPrice)),
        })),
      },
    },
  });
  await audit(created.id, "CREATE", { code, projectId, vendorId, lines: lines.length });
  revalidatePo(projectId);
  return { success: true };
}

/** Ghi SL đã nhận cho 1 dòng PO (nhận từng phần được). Đủ hết mọi dòng → PO chuyển RECEIVED. */
export async function receivePoLine(lineId: string, _prev: PoFormState, formData: FormData): Promise<PoFormState> {
  await requirePermission("purchasing.po.receive");
  const t = await getTranslations("projects.purchasing");
  const receivedQty = Number(str(formData.get("receivedQty")));
  if (!Number.isFinite(receivedQty) || receivedQty < 0) return { error: t("poErrRequired") };

  const line = await prisma.purchaseOrderLine.findUnique({
    where: { id: lineId },
    include: { purchaseOrder: { select: { id: true, projectId: true, status: true } } },
  });
  if (!line) return { error: t("poErrRequired") };
  if (line.purchaseOrder.status === "CANCELED") return { error: t("poErrCanceled") };

  const staffId = await getCurrentStaffId();
  await prisma.purchaseOrderLine.update({
    where: { id: lineId },
    data: { receivedQty, receivedById: staffId, receivedAt: new Date() },
  });
  // Đủ hết mọi dòng → RECEIVED; nhận bớt lại (sửa số) → quay về OPEN.
  const siblings = await prisma.purchaseOrderLine.findMany({
    where: { purchaseOrderId: line.purchaseOrder.id },
    select: { quantity: true, receivedQty: true },
  });
  const allReceived = siblings.every((s) => s.receivedQty >= s.quantity);
  await prisma.purchaseOrder.update({
    where: { id: line.purchaseOrder.id },
    data: { status: allReceived ? "RECEIVED" : "OPEN" },
  });
  await audit(line.purchaseOrder.id, "RECEIVE_LINE", { lineId, receivedQty });
  revalidatePo(line.purchaseOrder.projectId);
  return { success: true };
}

/** "Nhận đủ tất cả" — điền receivedQty = quantity cho mọi dòng còn thiếu rồi chuyển RECEIVED. */
export async function markPoFullyReceived(poId: string, _prev: PoFormState, _formData: FormData): Promise<PoFormState> {
  await requirePermission("purchasing.po.receive");
  const t = await getTranslations("projects.purchasing");
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: true } });
  if (!po) return { error: t("poErrRequired") };
  if (po.status === "CANCELED") return { error: t("poErrCanceled") };

  const staffId = await getCurrentStaffId();
  const now = new Date();
  for (const l of po.lines) {
    if (l.receivedQty < l.quantity) {
      await prisma.purchaseOrderLine.update({
        where: { id: l.id },
        data: { receivedQty: l.quantity, receivedById: staffId, receivedAt: now },
      });
    }
  }
  await prisma.purchaseOrder.update({ where: { id: poId }, data: { status: "RECEIVED" } });
  await audit(poId, "RECEIVE_ALL", {});
  revalidatePo(po.projectId);
  return { success: true };
}

/** Huỷ PO đặt nhầm — giữ bản ghi + lý do. Chỉ huỷ khi CHƯA có phiếu chi (chưa huỷ) gắn vào. */
export async function cancelPurchaseOrder(poId: string, _prev: PoFormState, formData: FormData): Promise<PoFormState> {
  await requirePermission("purchasing.po.manage");
  const t = await getTranslations("projects.purchasing");
  const note = str(formData.get("cancelNote"));
  if (!note) return { error: t("poErrCancelReason") };

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: { projectId: true, status: true, _count: { select: { payments: { where: { status: { not: "CANCELED" } } } } } },
  });
  if (!po) return { error: t("poErrRequired") };
  if (po.status === "CANCELED") return { error: t("poErrCanceled") };
  // Có phiếu chi sống gắn vào thì phải huỷ phiếu trước — không để PO huỷ mà tiền vẫn chảy theo nó.
  if (po._count.payments > 0) return { error: t("poErrHasPayments") };

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: "CANCELED", canceledById: await getCurrentStaffId(), canceledAt: new Date(), cancelNote: note },
  });
  await audit(poId, "CANCEL", { reason: note });
  revalidatePo(po.projectId);
  return { success: true };
}
