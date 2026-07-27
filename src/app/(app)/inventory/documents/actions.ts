"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import {
  ITEM_CONDITION_CODES,
  ITEM_STATUS_CODES,
  InsufficientStockError,
  TCM_OWNER_SEG,
  buildItemCode,
  creditBalance,
  creditHolding,
  debitBalance,
  debitHolding,
  expiryLevel,
  itemCodePrefix,
  nextDocCode,
  nextItemSeq,
  partItemCode,
  resolveRootCategory,
  type DocType,
  type ItemConditionCode,
  type ItemStatusCode,
} from "@/lib/inventory";
import { requirePermission } from "@/lib/permissions";

export type DocFormState = { error?: string; success?: boolean };

type LineInput = { itemId: string; quantity: number; note?: string };

async function audit(entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType: "stock_document", entityId, field: "*", action, changedBy: staffId, reason } });
}

function revalidate() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/documents");
  revalidatePath("/reminders");
}

/** Fan-out notification cho staff OPE + PRO (chưa có mapping thủ kho — nợ v2). */
async function notifyFieldDepts(type: string, title: string, body: string | null, projectId?: string | null) {
  const recipients = await prisma.staff.findMany({
    where: { department: { code: { in: ["OPE", "PRO"] } }, isActive: true },
    select: { id: true },
  });
  if (recipients.length === 0) return;
  await prisma.notification.createMany({
    data: recipients.map((r) => ({ recipientStaffId: r.id, type, title, body, projectId: projectId ?? null })),
  });
}

/** Parse + validate dòng hàng chung: item tồn tại, active, stockable, không trùng; qty nguyên ≠ 0 (âm chỉ cho ADJUST). */
async function parseLines(
  formData: FormData,
  opts: { allowNegative: boolean }
): Promise<{ lines: LineInput[]; error?: string }> {
  const t = await getTranslations("inventory.documents");
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
    if (!itemId || seen.has(itemId) || !Number.isInteger(quantity) || quantity === 0 || (!opts.allowNegative && quantity < 0)) {
      return { lines: [], error: t("errorInvalid") };
    }
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

/** Tạo phiếu với retry mã trùng (count-based nextDocCode có race — P2002 tối đa 3 lần). */
async function createDocWithRetry<T>(fn: (attempt: number) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
}

async function insufficientMessage(itemId: string): Promise<string> {
  const t = await getTranslations("inventory.documents");
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { code: true, name: true } });
  return t("errorInsufficient", { item: item ? `${item.name} (${item.code})` : itemId });
}

// ── NHẬP KHO / ĐIỀU CHỈNH — COMPLETED ngay ───────────────

async function createInboundDoc(type: DocType, _prev: DocFormState, formData: FormData): Promise<DocFormState> {
  const t = await getTranslations("inventory.documents");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!warehouseId) return { error: t("errorInvalid") };
  const { lines, error } = await parseLines(formData, { allowNegative: type === "ADJUST" });
  if (error) return { error };

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await createDocWithRetry(() =>
      prisma.$transaction(async (tx) => {
        const code = await nextDocCode(tx, type, new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type,
            status: "COMPLETED",
            toWarehouseId: warehouseId,
            note,
            createdById: staffId,
            lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
          },
        });
        for (const l of lines) {
          if (l.quantity > 0) await creditBalance(tx, warehouseId, l.itemId, l.quantity);
          else await debitBalance(tx, warehouseId, l.itemId, -l.quantity);
        }
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof InsufficientStockError) return { error: await insufficientMessage(e.itemId) };
    throw e;
  }
  await audit(docId, "CREATE");
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

/** Nhập kho TRỰC TIẾP (kiểm kê, tồn đầu kỳ) — thủ kho tự làm; hàng có người báo về đi qua đề xuất DN. */
export async function createImportDoc(prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.intake.confirm");
  return createInboundDoc("IMPORT", prev, formData);
}
export async function createAdjustDoc(prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.doc.create");
  return createInboundDoc("ADJUST", prev, formData);
}

// ── CHUYỂN KHO — 2 bước: PENDING (trừ nguồn) → nhận/hủy ──

export async function createTransferDoc(_prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.transfer.create");
  const t = await getTranslations("inventory.documents");
  const fromWarehouseId = String(formData.get("fromWarehouseId") ?? "");
  const toWarehouseId = String(formData.get("toWarehouseId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!fromWarehouseId || !toWarehouseId) return { error: t("errorInvalid") };
  if (fromWarehouseId === toWarehouseId) return { error: t("errorSameWarehouse") };
  const { lines, error } = await parseLines(formData, { allowNegative: false });
  if (error) return { error };

  const staffId = await getCurrentStaffId();
  let docId = "";
  let docCode = "";
  try {
    await createDocWithRetry(() =>
      prisma.$transaction(async (tx) => {
        const code = await nextDocCode(tx, "TRANSFER", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "TRANSFER",
            status: "PENDING",
            fromWarehouseId,
            toWarehouseId,
            note,
            createdById: staffId,
            lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
          },
        });
        for (const l of lines) await debitBalance(tx, fromWarehouseId, l.itemId, l.quantity);
        docId = doc.id;
        docCode = doc.code;
      })
    );
  } catch (e) {
    if (e instanceof InsufficientStockError) return { error: await insufficientMessage(e.itemId) };
    throw e;
  }
  await audit(docId, "CREATE");
  // Notify SAU commit — giữ transaction ngắn (SQLite single-writer)
  const to = await prisma.warehouse.findUnique({ where: { id: toWarehouseId }, select: { name: true } });
  await notifyFieldDepts("INVENTORY_TRANSFER_INCOMING", `Phiếu chuyển kho ${docCode} đang tới ${to?.name ?? ""}`, "Vui lòng xác nhận khi nhận đủ hàng.");
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

export async function confirmTransferReceive(docId: string, _prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.transfer.confirm");
  const t = await getTranslations("inventory.documents");
  const doc = await prisma.stockDocument.findUnique({ where: { id: docId }, include: { lines: true } });
  if (!doc || doc.type !== "TRANSFER" || !doc.toWarehouseId) return { error: t("errorInvalid") };

  // Số thực nhận từng dòng: mặc định = SL gửi; 0 ≤ nhận ≤ gửi
  const received = new Map<string, number>();
  for (const l of doc.lines) {
    const raw = formData.get(`received_${l.id}`);
    const r = raw === null || String(raw).trim() === "" ? l.quantity : Number(raw);
    if (!Number.isInteger(r) || r < 0 || r > l.quantity) return { error: t("errorInvalid") };
    received.set(l.id, r);
  }

  const staffId = await getCurrentStaffId();
  const done = await prisma.$transaction(async (tx) => {
    // Guard idempotent: chỉ 1 request thắng khi double-submit (2 tab cùng bấm)
    const res = await tx.stockDocument.updateMany({
      where: { id: docId, status: "PENDING" },
      data: { status: "COMPLETED", confirmedById: staffId, confirmedAt: new Date() },
    });
    if (res.count === 0) return false;
    for (const l of doc.lines) {
      const r = received.get(l.id)!;
      await tx.stockDocumentLine.update({ where: { id: l.id }, data: { receivedQuantity: r } });
      if (r > 0) await creditBalance(tx, doc.toWarehouseId!, l.itemId, r);
    }
    return true;
  });
  if (!done) return { error: t("errorAlreadyProcessed") };
  await audit(docId, "UPDATE", "confirm receive");
  revalidate();
  return { success: true };
}

export async function cancelTransfer(docId: string, _prev: DocFormState, _formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.transfer.cancel");
  const t = await getTranslations("inventory.documents");
  const doc = await prisma.stockDocument.findUnique({ where: { id: docId }, include: { lines: true } });
  if (!doc || doc.type !== "TRANSFER" || !doc.fromWarehouseId) return { error: t("errorInvalid") };

  const staffId = await getCurrentStaffId();
  const done = await prisma.$transaction(async (tx) => {
    const res = await tx.stockDocument.updateMany({
      where: { id: docId, status: "PENDING" },
      data: { status: "CANCELED", canceledById: staffId, canceledAt: new Date() },
    });
    if (res.count === 0) return false;
    for (const l of doc.lines) await creditBalance(tx, doc.fromWarehouseId!, l.itemId, l.quantity);
    return true;
  });
  if (!done) return { error: t("errorAlreadyProcessed") };
  await audit(docId, "UPDATE", "cancel transfer");
  revalidate();
  return { success: true };
}

// ── TRẢ VỀ KHO — 1 bước, gắn dự án ───────────────────────
// XUẤT KHO nay đi qua tầng đề xuất (K2): inventory/requests — thủ kho xác nhận mới sinh phiếu XE.

export async function createReturnDoc(_prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.doc.create");
  const t = await getTranslations("inventory.documents");
  const toWarehouseId = String(formData.get("toWarehouseId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!toWarehouseId || !projectId) return { error: t("errorInvalid") };
  const { lines, error } = await parseLines(formData, { allowNegative: false });
  if (error) return { error };

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await createDocWithRetry(() =>
      prisma.$transaction(async (tx) => {
        const code = await nextDocCode(tx, "RETURN", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "RETURN",
            status: "COMPLETED",
            toWarehouseId,
            projectId,
            note,
            createdById: staffId,
            lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
          },
        });
        for (const l of lines) {
          await debitHolding(tx, projectId, l.itemId, l.quantity); // guard: không trả quá số đang giữ
          await creditBalance(tx, toWarehouseId, l.itemId, l.quantity);
        }
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof InsufficientStockError) return { error: await insufficientMessage(e.itemId) };
    throw e;
  }
  await audit(docId, "CREATE");
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

// ── KHO V2: XUẤT HỦY (DESTROY) — 1 bước, bắt buộc lý do ──
// Đường ra DUY NHẤT cho hàng hết hạn / trạng thái D. K2 siết về quyền thủ kho riêng.

export async function createDestroyDoc(_prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.destroy");
  const t = await getTranslations("inventory.documents");
  const fromWarehouseId = String(formData.get("fromWarehouseId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!fromWarehouseId) return { error: t("errorInvalid") };
  if (!note) return { error: t("errorReasonRequired") };
  const { lines, error } = await parseLines(formData, { allowNegative: false });
  if (error) return { error };

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await createDocWithRetry(() =>
      prisma.$transaction(async (tx) => {
        const code = await nextDocCode(tx, "DESTROY", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "DESTROY",
            status: "COMPLETED",
            fromWarehouseId,
            note,
            createdById: staffId,
            lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
          },
        });
        for (const l of lines) await debitBalance(tx, fromWarehouseId, l.itemId, l.quantity);
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof InsufficientStockError) return { error: await insufficientMessage(e.itemId) };
    throw e;
  }
  await audit(docId, "CREATE", note);
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

// ── KHO V2: CHUYỂN ĐỔI LÔ (CONVERT) — đổi trạng thái/tình trạng = chạy số lượng giữa 2 mã ──
// Quyết định Câu 2 (27/07): mỗi mã là một LÔ đồng nhất; brand new / second hand không chung mã.
// Lô đích tự tìm theo (tên, node, khách, dự án ràng, hạn dùng, partCount) hoặc tạo mới với seq kế tiếp.
// Nguồn là BỘ tách phần → chuyển cả bộ: mỗi phần một dòng ledger, số lượng = số bộ.

type ConvertLineInput = {
  itemId: string;
  quantity: number;
  toStatus: ItemStatusCode;
  toCond: ItemConditionCode;
  note?: string;
};

export async function createConvertDoc(_prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.lot.convert");
  const t = await getTranslations("inventory.documents");
  const warehouseId = String(formData.get("fromWarehouseId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!warehouseId) return { error: t("errorInvalid") };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("linesJson") ?? "[]"));
  } catch {
    return { error: t("errorInvalid") };
  }
  if (!Array.isArray(raw) || raw.length === 0) return { error: t("errorNoLines") };
  const inputs: ConvertLineInput[] = [];
  const seen = new Set<string>();
  for (const l of raw) {
    const itemId = typeof l?.itemId === "string" ? l.itemId : "";
    const quantity = Number(l?.quantity);
    const toStatus = String(l?.toStatus ?? "");
    const toCond = String(l?.toCond ?? "");
    const lineNote = typeof l?.note === "string" && l.note.trim() !== "" ? l.note.trim() : undefined;
    if (
      !itemId || seen.has(itemId) || !Number.isInteger(quantity) || quantity <= 0 ||
      !(ITEM_STATUS_CODES as readonly string[]).includes(toStatus) ||
      !(ITEM_CONDITION_CODES as readonly string[]).includes(toCond)
    ) {
      return { error: t("errorInvalid") };
    }
    seen.add(itemId);
    inputs.push({ itemId, quantity, toStatus: toStatus as ItemStatusCode, toCond: toCond as ItemConditionCode, note: lineNote });
  }

  const sources = await prisma.inventoryItem.findMany({
    where: { id: { in: inputs.map((l) => l.itemId) } },
    include: { parts: { orderBy: { partNo: "asc" } }, ownerClient: { select: { code: true } } },
  });
  const srcById = new Map(sources.map((s) => [s.id, s]));
  for (const input of inputs) {
    const src = srcById.get(input.itemId);
    if (!src || !src.isActive) return { error: t("errorInvalid") };
    // Chỉ lô v2 (đủ node + trạng thái + tình trạng); phần con phải chuyển từ item cha (cả bộ)
    if (src.parentItemId) return { error: t("errorConvertPart", { item: src.code }) };
    if (!src.catNodeId || !src.statusCode || !src.conditionCode) return { error: t("errorConvertLegacy", { item: src.code }) };
    if (src.statusCode === input.toStatus && src.conditionCode === input.toCond) {
      return { error: t("errorConvertSame", { item: src.code }) };
    }
  }
  // Ký tự nhóm gốc cho từng nguồn (cây ≤3 cấp, ngoài transaction — cây không đổi trong lúc lập phiếu)
  const rootBySrc = new Map<string, string>();
  for (const src of sources) {
    const root = await resolveRootCategory(src.catNodeId!);
    if (!root?.code) return { error: t("errorInvalid") };
    rootBySrc.set(src.id, root.code);
  }

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await createDocWithRetry(() =>
      prisma.$transaction(async (tx) => {
        const ledger: { itemId: string; convertToItemId: string; quantity: number; note?: string }[] = [];
        for (const input of inputs) {
          const src = srcById.get(input.itemId)!;
          const lotWhere = {
            parentItemId: null,
            name: src.name,
            catNodeId: src.catNodeId,
            statusCode: input.toStatus,
            conditionCode: input.toCond,
            ownerClientId: src.ownerClientId,
            boundProjectId: src.boundProjectId,
            expiryDate: src.expiryDate,
            partCount: src.partCount,
            isActive: true,
          };
          let target = await tx.inventoryItem.findFirst({ where: lotWhere, include: { parts: { orderBy: { partNo: "asc" } } } });
          if (!target) {
            const clientSeg = src.ownerClient?.code ?? TCM_OWNER_SEG;
            const prefix = itemCodePrefix(rootBySrc.get(src.id)!, input.toStatus, input.toCond, clientSeg);
            const seq = await nextItemSeq(tx, prefix);
            const code = buildItemCode(rootBySrc.get(src.id)!, input.toStatus, input.toCond, clientSeg, seq);
            const lotData = {
              name: src.name,
              catNodeId: src.catNodeId,
              unit: src.unit,
              isReusable: src.isReusable,
              statusCode: input.toStatus,
              conditionCode: input.toCond,
              ownerClientId: src.ownerClientId,
              boundProjectId: src.boundProjectId,
              expiryDate: src.expiryDate,
              clientDocNo: src.clientDocNo,
              seq,
            };
            target = await tx.inventoryItem.create({
              data: { code, partCount: src.partCount, ...lotData },
              include: { parts: true },
            });
            if (src.partCount > 1) {
              for (const p of src.parts) {
                await tx.inventoryItem.create({
                  data: {
                    code: partItemCode(code, p.partNo!),
                    ...lotData,
                    name: p.name,
                    unit: p.unit,
                    parentItemId: target.id,
                    partNo: p.partNo,
                  },
                });
              }
              target = (await tx.inventoryItem.findUnique({ where: { id: target.id }, include: { parts: { orderBy: { partNo: "asc" } } } }))!;
            }
          }
          if (src.partCount > 1) {
            const tgtByNo = new Map(target.parts.map((p) => [p.partNo, p]));
            for (const p of src.parts) {
              const tp = tgtByNo.get(p.partNo);
              if (!tp) throw new Error("CONVERT_TARGET_PARTS");
              ledger.push({ itemId: p.id, convertToItemId: tp.id, quantity: input.quantity, note: input.note });
            }
          } else {
            ledger.push({ itemId: src.id, convertToItemId: target.id, quantity: input.quantity, note: input.note });
          }
        }
        const code = await nextDocCode(tx, "CONVERT", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "CONVERT",
            status: "COMPLETED",
            fromWarehouseId: warehouseId,
            note,
            createdById: staffId,
            lines: { create: ledger.map((l, i) => ({ ...l, sort: i })) },
          },
        });
        for (const l of ledger) {
          await debitBalance(tx, warehouseId, l.itemId, l.quantity);
          await creditBalance(tx, warehouseId, l.convertToItemId, l.quantity);
        }
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof InsufficientStockError) return { error: await insufficientMessage(e.itemId) };
    if (e instanceof Error && e.message === "SEQ_FULL") return { error: t("errorSeqFull") };
    throw e;
  }
  await audit(docId, "CREATE");
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

/** Field duy nhất sửa được sau COMPLETED (trên phiếu ISSUE) — reset cờ nhắc để nhắc lại theo hạn mới. */
export async function updateExpectedReturn(docId: string, _prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.doc.create");
  const t = await getTranslations("inventory.documents");
  const raw = String(formData.get("expectedReturnAt") ?? "").trim();
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return { error: t("errorInvalid") };

  const doc = await prisma.stockDocument.findUnique({ where: { id: docId }, select: { type: true, status: true } });
  if (!doc || doc.type !== "ISSUE" || doc.status !== "COMPLETED") return { error: t("errorInvalid") };

  await prisma.stockDocument.update({
    where: { id: docId },
    data: { expectedReturnAt: d, returnReminderSentAt: null },
  });
  await audit(docId, "UPDATE", "expected return changed");
  revalidate();
  return { success: true };
}
