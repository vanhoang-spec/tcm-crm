"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import {
  InsufficientStockError,
  creditBalance,
  creditHolding,
  debitBalance,
  expiryLevel,
  nextDocCode,
} from "@/lib/inventory";
import { buildRequestCode, canApproveIssue, confirmableStatus, type RequestType } from "@/lib/inventory-request";
import { hasPermission, requirePermission } from "@/lib/permissions";

export type RequestFormState = { error?: string; success?: boolean };

type LineInput = { itemId: string; quantity: number; note?: string };

async function audit(entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType: "stock_request", entityId, field: "*", action, changedBy: staffId, reason } });
}

function revalidate() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/requests");
  revalidatePath("/inventory/documents");
}

/** Fan-out notification theo MÃ QUYỀN (thay danh sách phòng ban cứng — thủ kho là role mới). */
async function notifyByPermission(permissionCode: string, type: string, title: string, body: string | null, projectId?: string | null) {
  const recipients = await prisma.staff.findMany({
    where: { isActive: true, role: { permissions: { some: { permissionCode } } } },
    select: { id: true },
  });
  if (recipients.length === 0) return;
  await prisma.notification.createMany({
    data: recipients.map((r) => ({ recipientStaffId: r.id, type, title, body, projectId: projectId ?? null })),
  });
}

async function notifyStaff(staffIds: (string | null)[], type: string, title: string, body: string | null, projectId?: string | null) {
  const ids = [...new Set(staffIds.filter((s): s is string => !!s))];
  if (ids.length === 0) return;
  await prisma.notification.createMany({
    data: ids.map((id) => ({ recipientStaffId: id, type, title, body, projectId: projectId ?? null })),
  });
}

/** Parse dòng đề xuất: item tồn tại, active, stockable, không trùng, số nguyên > 0. */
async function parseLines(formData: FormData): Promise<{ lines: LineInput[]; error?: string }> {
  const t = await getTranslations("inventory.requests");
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("linesJson") ?? "[]"));
  } catch {
    return { lines: [], error: t("errorInvalid") };
  }
  if (!Array.isArray(raw) || raw.length === 0) return { lines: [], error: t("errorNoLines") };

  const lines: LineInput[] = [];
  const seen = new Set<string>();
  for (const l of raw) {
    const itemId = typeof l?.itemId === "string" ? l.itemId : "";
    const quantity = Number(l?.quantity);
    const note = typeof l?.note === "string" && l.note.trim() !== "" ? l.note.trim() : undefined;
    if (!itemId || seen.has(itemId) || !Number.isInteger(quantity) || quantity <= 0) return { lines: [], error: t("errorInvalid") };
    seen.add(itemId);
    lines.push({ itemId, quantity, note });
  }
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: lines.map((l) => l.itemId) } },
    select: { id: true, isActive: true, partCount: true },
  });
  if (items.length !== lines.length || items.some((i) => !i.isActive || i.partCount !== 1)) {
    return { lines: [], error: t("errorInvalid") };
  }
  return { lines };
}

/** Mã đề xuất kế tiếp trong tháng — count-based, caller retry P2002 (code @unique là backstop). */
async function nextRequestCode(tx: Prisma.TransactionClient, type: RequestType, now: Date): Promise<string> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const count = await tx.stockRequest.count({ where: { type, createdAt: { gte: monthStart, lt: monthEnd } } });
  return buildRequestCode(type, now, count + 1);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
}

/** Số đã duyệt chưa xuất theo (kho, item) — giữ chỗ mềm để hai đề xuất không hứa cùng một lô hàng. */
async function approvedNotIssuedByItem(warehouseId: string, itemIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.stockRequestLine.findMany({
    where: { itemId: { in: itemIds }, request: { type: "ISSUE", status: "APPROVED", warehouseId } },
    select: { itemId: true, quantity: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.itemId, (map.get(r.itemId) ?? 0) + r.quantity);
  return map;
}

// ── ĐỀ XUẤT XUẤT KHO (workflow a) ─────────────────────────

export async function createIssueRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const expectedReturnRaw = String(formData.get("expectedReturnAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!warehouseId || !projectId) return { error: t("errorInvalid") };
  const { lines, error } = await parseLines(formData);
  if (error) return { error };

  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { status: true } });
  if (!project || !(EXECUTION_STATUS_CODES as readonly string[]).includes(project.status.code)) return { error: t("errorProjectRequired") };

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: lines.map((l) => l.itemId) } },
    select: { id: true, code: true, isReusable: true, expiryDate: true, statusCode: true, ownerClientId: true, boundProjectId: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  // Hàng hết hạn: chặn ngay từ khâu đề xuất (đường ra duy nhất là phiếu xuất hủy)
  const expired = items.filter((i) => expiryLevel(i.expiryDate, new Date()) === "EXPIRED");
  if (expired.length > 0) return { error: t("errorExpired", { items: expired.map((i) => i.code).join(", ") }) };
  // Lô ràng dự án khác / hàng của khách khác — không dùng chéo được (trạng thái P và C trong mã)
  const wrongProject = items.filter((i) => i.boundProjectId && i.boundProjectId !== projectId);
  if (wrongProject.length > 0) return { error: t("errorBoundOtherProject", { items: wrongProject.map((i) => i.code).join(", ") }) };
  const wrongClient = items.filter((i) => i.ownerClientId && i.ownerClientId !== project.clientId);
  if (wrongClient.length > 0) return { error: t("errorOtherClientGoods", { items: wrongClient.map((i) => i.code).join(", ") }) };

  const [balances, reserved] = await Promise.all([
    prisma.stockBalance.findMany({ where: { warehouseId, itemId: { in: lines.map((l) => l.itemId) } } }),
    approvedNotIssuedByItem(warehouseId, lines.map((l) => l.itemId)),
  ]);
  const balByItem = new Map(balances.map((b) => [b.itemId, b.quantity]));
  const short = lines.filter((l) => l.quantity > Math.max(0, (balByItem.get(l.itemId) ?? 0) - (reserved.get(l.itemId) ?? 0)));
  if (short.length > 0) return { error: t("errorInsufficientAvailable", { items: short.map((l) => byId.get(l.itemId)?.code ?? "").join(", ") }) };

  const hasReusable = lines.some((l) => byId.get(l.itemId)?.isReusable);
  const expectedReturnAt = expectedReturnRaw ? new Date(expectedReturnRaw) : null;
  if (hasReusable && (!expectedReturnAt || Number.isNaN(expectedReturnAt.getTime()))) return { error: t("errorReturnRequired") };

  const staffId = await getCurrentStaffId();
  let reqId = "";
  let reqCode = "";
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const code = await nextRequestCode(tx, "ISSUE", new Date());
      const req = await tx.stockRequest.create({
        data: {
          code,
          type: "ISSUE",
          status: "PROPOSED",
          warehouseId,
          projectId,
          expectedReturnAt: hasReusable ? expectedReturnAt : null,
          note,
          createdById: staffId,
          lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
        },
      });
      reqId = req.id;
      reqCode = req.code;
    })
  );
  await audit(reqId, "CREATE");
  // Báo đúng người duyệt: PIC + Leader dự án; không có ai thì báo nhóm duyệt-mọi-dự-án
  if (project.ownerId || project.leaderId) {
    await notifyStaff([project.ownerId, project.leaderId], "INVENTORY_REQUEST_PENDING", `Đề xuất xuất kho ${reqCode} chờ duyệt`, `${project.code} — ${lines.length} dòng hàng`, projectId);
  } else {
    await notifyByPermission("inventory.request.approve_any", "INVENTORY_REQUEST_PENDING", `Đề xuất xuất kho ${reqCode} chờ duyệt`, `${project.code} — dự án chưa gán PIC`, projectId);
  }
  revalidate();
  redirect(`/inventory/requests/${reqId}`);
}

export async function approveIssueRequest(requestId: string, _prev: RequestFormState, _formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.approve");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({
    where: { id: requestId },
    include: { project: { select: { id: true, code: true, ownerId: true, leaderId: true } }, lines: true },
  });
  if (!req || req.type !== "ISSUE" || !req.project) return { error: t("errorInvalid") };

  const staffId = await getCurrentStaffId();
  // Ngoại lệ có chủ đích (mirror finance over_cap): hasPermission BÊN TRONG action đã có
  // requirePermission ở đầu — quyền "duyệt mọi dự án" chỉ nới phạm vi, không mở thêm cửa mới.
  const approveAny = await hasPermission("inventory.request.approve_any");
  if (!canApproveIssue(req.project, staffId, approveAny)) return { error: t("errorNotPic") };

  // Tồn phải còn đủ ở thời điểm DUYỆT (đề xuất cũ có thể đã lỗi thời)
  const balances = await prisma.stockBalance.findMany({
    where: { warehouseId: req.warehouseId, itemId: { in: req.lines.map((l) => l.itemId) } },
  });
  const reserved = await approvedNotIssuedByItem(req.warehouseId, req.lines.map((l) => l.itemId));
  const balByItem = new Map(balances.map((b) => [b.itemId, b.quantity]));
  const short = req.lines.filter((l) => l.quantity > Math.max(0, (balByItem.get(l.itemId) ?? 0) - (reserved.get(l.itemId) ?? 0)));
  if (short.length > 0) {
    const codes = await prisma.inventoryItem.findMany({ where: { id: { in: short.map((l) => l.itemId) } }, select: { code: true } });
    return { error: t("errorInsufficientAvailable", { items: codes.map((c) => c.code).join(", ") }) };
  }

  const done = await prisma.stockRequest.updateMany({
    where: { id: requestId, status: "PROPOSED" },
    data: { status: "APPROVED", approvedById: staffId, approvedAt: new Date() },
  });
  if (done.count === 0) return { error: t("errorAlreadyProcessed") };
  await audit(requestId, "UPDATE", "approve");
  await notifyByPermission("inventory.issue.confirm", "INVENTORY_REQUEST_APPROVED", `Lệnh xuất kho ${req.code} đã duyệt — chờ soạn hàng`, `${req.project.code} — ${req.lines.length} dòng hàng`, req.projectId);
  revalidate();
  return { success: true };
}

export async function rejectIssueRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.approve");
  const t = await getTranslations("inventory.requests");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: t("errorReasonRequired") };
  const req = await prisma.stockRequest.findUnique({
    where: { id: requestId },
    include: { project: { select: { id: true, ownerId: true, leaderId: true } } },
  });
  if (!req || req.type !== "ISSUE" || !req.project) return { error: t("errorInvalid") };

  const staffId = await getCurrentStaffId();
  const approveAny = await hasPermission("inventory.request.approve_any");
  if (!canApproveIssue(req.project, staffId, approveAny)) return { error: t("errorNotPic") };

  const done = await prisma.stockRequest.updateMany({
    where: { id: requestId, status: "PROPOSED" },
    data: { status: "REJECTED", rejectedById: staffId, rejectedAt: new Date(), rejectReason: reason },
  });
  if (done.count === 0) return { error: t("errorAlreadyProcessed") };
  await audit(requestId, "UPDATE", `reject: ${reason}`);
  await notifyStaff([req.createdById], "INVENTORY_REQUEST_REJECTED", `Đề xuất xuất kho ${req.code} bị từ chối`, reason, req.projectId);
  revalidate();
  return { success: true };
}

/** Huỷ đề xuất khi chưa xác nhận — người lập hoặc người duyệt-mọi-dự-án. */
export async function cancelRequest(requestId: string, _prev: RequestFormState, _formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({ where: { id: requestId }, select: { status: true, createdById: true, code: true } });
  if (!req) return { error: t("errorInvalid") };
  const staffId = await getCurrentStaffId();
  if (req.createdById !== staffId && !(await hasPermission("inventory.request.approve_any"))) return { error: t("errorNotOwner") };

  const done = await prisma.stockRequest.updateMany({
    where: { id: requestId, status: { in: ["PROPOSED", "APPROVED"] } },
    data: { status: "CANCELED", canceledById: staffId, canceledAt: new Date() },
  });
  if (done.count === 0) return { error: t("errorAlreadyProcessed") };
  await audit(requestId, "UPDATE", "cancel");
  revalidate();
  return { success: true };
}

/**
 * Thủ kho xác nhận THỰC XUẤT (bước cuối, nơi tồn kho mới thay đổi):
 * số thực ≤ số duyệt từng dòng, sinh phiếu XE + trừ tồn + cộng holding trong CÙNG transaction.
 */
export async function confirmIssueRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.issue.confirm");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({ where: { id: requestId }, include: { lines: true } });
  if (!req || req.type !== "ISSUE" || !req.projectId) return { error: t("errorInvalid") };

  const actual = new Map<string, number>();
  for (const l of req.lines) {
    const raw = formData.get(`qty_${l.id}`);
    const v = raw === null || String(raw).trim() === "" ? l.quantity : Number(raw);
    if (!Number.isInteger(v) || v < 0 || v > l.quantity) return { error: t("errorInvalid") };
    actual.set(l.id, v);
  }
  if ([...actual.values()].every((v) => v === 0)) return { error: t("errorNothingIssued") };

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: req.lines.map((l) => l.itemId) } },
    select: { id: true, isReusable: true },
  });
  const reusableIds = new Set(items.filter((i) => i.isReusable).map((i) => i.id));
  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        // Guard idempotent: chỉ một request thắng khi double-submit
        const claimed = await tx.stockRequest.updateMany({
          where: { id: requestId, status: confirmableStatus("ISSUE") },
          data: { status: "DONE", confirmedById: staffId, confirmedAt: new Date() },
        });
        if (claimed.count === 0) throw new Error("ALREADY_PROCESSED");

        const issued = req.lines.filter((l) => (actual.get(l.id) ?? 0) > 0);
        const code = await nextDocCode(tx, "ISSUE", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "ISSUE",
            status: "COMPLETED",
            fromWarehouseId: req.warehouseId,
            projectId: req.projectId,
            expectedReturnAt: req.expectedReturnAt,
            note: req.note ? `${req.code} · ${req.note}` : req.code,
            createdById: staffId,
            lines: { create: issued.map((l, i) => ({ itemId: l.itemId, quantity: actual.get(l.id)!, note: l.note, sort: i })) },
          },
        });
        for (const l of issued) {
          const qty = actual.get(l.id)!;
          await debitBalance(tx, req.warehouseId, l.itemId, qty);
          if (reusableIds.has(l.itemId)) await creditHolding(tx, req.projectId!, l.itemId, qty);
        }
        for (const l of req.lines) {
          await tx.stockRequestLine.update({ where: { id: l.id }, data: { confirmedQuantity: actual.get(l.id)! } });
        }
        await tx.stockRequest.update({ where: { id: requestId }, data: { documentId: doc.id } });
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_PROCESSED") return { error: t("errorAlreadyProcessed") };
    if (e instanceof InsufficientStockError) {
      const item = await prisma.inventoryItem.findUnique({ where: { id: e.itemId }, select: { code: true } });
      return { error: t("errorInsufficientAvailable", { items: item?.code ?? e.itemId }) };
    }
    throw e;
  }
  await audit(requestId, "UPDATE", "confirm issue");
  await notifyStaff([req.createdById, req.approvedById], "INVENTORY_REQUEST_ISSUED", `Đã xuất kho theo lệnh ${req.code}`, null, req.projectId);
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

// ── BÁO HÀNG VỀ + THỦ KHO XÁC NHẬN THỰC NHẬP (workflow c) ─

export async function createIntakeRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!warehouseId) return { error: t("errorInvalid") };
  const { lines, error } = await parseLines(formData);
  if (error) return { error };

  if (purchaseOrderId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { status: true } });
    if (!po || po.status === "CANCELED") return { error: t("errorInvalidPo") };
  }

  const staffId = await getCurrentStaffId();
  let reqId = "";
  let reqCode = "";
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const code = await nextRequestCode(tx, "INTAKE", new Date());
      const req = await tx.stockRequest.create({
        data: {
          code,
          type: "INTAKE",
          status: "PROPOSED",
          warehouseId,
          purchaseOrderId,
          note,
          createdById: staffId,
          lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
        },
      });
      reqId = req.id;
      reqCode = req.code;
    })
  );
  await audit(reqId, "CREATE");
  await notifyByPermission("inventory.intake.confirm", "INVENTORY_INTAKE_PENDING", `Báo hàng về ${reqCode} — chờ thủ kho nhận`, `${lines.length} dòng hàng`);
  revalidate();
  redirect(`/inventory/requests/${reqId}`);
}

/** Thủ kho xác nhận THỰC NHẬP — số thực ≤ số báo; sinh phiếu NK + cộng tồn trong cùng transaction. */
export async function confirmIntakeRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.intake.confirm");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({ where: { id: requestId }, include: { lines: true } });
  if (!req || req.type !== "INTAKE") return { error: t("errorInvalid") };

  const actual = new Map<string, number>();
  for (const l of req.lines) {
    const raw = formData.get(`qty_${l.id}`);
    const v = raw === null || String(raw).trim() === "" ? l.quantity : Number(raw);
    if (!Number.isInteger(v) || v < 0 || v > l.quantity) return { error: t("errorInvalid") };
    actual.set(l.id, v);
  }
  if ([...actual.values()].every((v) => v === 0)) return { error: t("errorNothingReceived") };

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const claimed = await tx.stockRequest.updateMany({
          where: { id: requestId, status: confirmableStatus("INTAKE") },
          data: { status: "DONE", confirmedById: staffId, confirmedAt: new Date() },
        });
        if (claimed.count === 0) throw new Error("ALREADY_PROCESSED");

        const received = req.lines.filter((l) => (actual.get(l.id) ?? 0) > 0);
        const code = await nextDocCode(tx, "IMPORT", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "IMPORT",
            status: "COMPLETED",
            toWarehouseId: req.warehouseId,
            note: req.note ? `${req.code} · ${req.note}` : req.code,
            createdById: staffId,
            lines: { create: received.map((l, i) => ({ itemId: l.itemId, quantity: actual.get(l.id)!, note: l.note, sort: i })) },
          },
        });
        for (const l of received) await creditBalance(tx, req.warehouseId, l.itemId, actual.get(l.id)!);
        for (const l of req.lines) {
          await tx.stockRequestLine.update({ where: { id: l.id }, data: { confirmedQuantity: actual.get(l.id)! } });
        }
        await tx.stockRequest.update({ where: { id: requestId }, data: { documentId: doc.id } });
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_PROCESSED") return { error: t("errorAlreadyProcessed") };
    throw e;
  }
  await audit(requestId, "UPDATE", "confirm intake");
  await notifyStaff([req.createdById], "INVENTORY_INTAKE_RECEIVED", `Đã nhập kho theo báo hàng ${req.code}`, null);
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}
