"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { saveChatAttachment } from "@/lib/chat-storage";
import {
  ITEM_CONDITION_CODES,
  ITEM_STATUS_CODES,
  TCM_OWNER_SEG,
  buildItemCode,
  creditBalance,
  itemCodePrefix,
  nextDocCode,
  nextItemSeq,
  partItemCode,
  resolveRootCategory,
  type ItemConditionCode,
  type ItemStatusCode,
} from "@/lib/inventory";
import { lotKey, parseInventoryCsv, type CsvRowError, type ParsedInventoryRow } from "@/lib/inventory-csv";
import { requirePermission } from "@/lib/permissions";

export type ItemFormState = { error?: string; success?: boolean; createdCode?: string };
export type ImportFormState = {
  error?: string;
  rowErrors?: CsvRowError[];
  success?: boolean;
  importedItems?: number;
  importedDocs?: number;
};

const MAX_CSV_BYTES = 1024 * 1024; // 1MB
const MAX_CSV_ROWS = 500;

async function audit(entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType: "inventory_item", entityId, field: "*", action, changedBy: staffId, reason } });
}

function revalidate() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/documents");
}

/** Trường lô chung cha + phần con (kho v2) — phần con copy nguyên để guard/filter chạy ở cấp stockable. */
type LotFields = {
  catNodeId: string;
  statusCode: ItemStatusCode;
  conditionCode: ItemConditionCode;
  ownerClientId: string | null;
  boundProjectId: string | null;
  expiryDate: Date | null;
  clientDocNo: string | null;
  seq: number;
};

/**
 * Tạo item = tạo LÔ: mã sinh tự động từ tổ hợp (nhóm gốc, trạng thái, tình trạng, khách) + seq.
 * Người dùng KHÔNG tự đặt mã (quyết định Câu 1+2, 27/07).
 */
export async function createItem(_prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  await requirePermission("inventory.item.manage");
  const t = await getTranslations("inventory.items");
  const name = String(formData.get("name") ?? "").trim();
  const catNodeId = String(formData.get("catNodeId") ?? "").trim();
  const statusCode = String(formData.get("statusCode") ?? "").trim().toUpperCase();
  const conditionCode = String(formData.get("conditionCode") ?? "").trim().toUpperCase();
  const ownerClientId = String(formData.get("ownerClientId") ?? "").trim() || null;
  const boundProjectId = String(formData.get("boundProjectId") ?? "").trim() || null;
  const expiryRaw = String(formData.get("expiryDate") ?? "").trim();
  const clientDocNo = String(formData.get("clientDocNo") ?? "").trim() || null;
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const isReusable = formData.get("isReusable") === "on";
  const partCount = Number(formData.get("partCount") ?? 1);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (
    !name || !catNodeId ||
    !(ITEM_STATUS_CODES as readonly string[]).includes(statusCode) ||
    !(ITEM_CONDITION_CODES as readonly string[]).includes(conditionCode) ||
    !Number.isInteger(partCount) || partCount < 1 || partCount > 4
  ) {
    return { error: t("errorInvalid") };
  }
  const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
  if (expiryDate && Number.isNaN(expiryDate.getTime())) return { error: t("errorInvalid") };

  const node = await prisma.inventoryCategory.findUnique({ where: { id: catNodeId }, select: { isActive: true } });
  if (!node?.isActive) return { error: t("errorInvalid") };
  const root = await resolveRootCategory(catNodeId);
  if (!root?.code) return { error: t("errorRootNoCode") };
  if (root.isClientOwned && !ownerClientId) return { error: t("errorClientRequired") };
  if (statusCode === "C" && !ownerClientId) return { error: t("errorClientRequired") };
  if (statusCode === "P" && !boundProjectId) return { error: t("errorBoundProjectRequired") };

  let clientSeg = TCM_OWNER_SEG;
  if (ownerClientId) {
    const client = await prisma.client.findUnique({ where: { id: ownerClientId }, select: { code: true } });
    if (!client) return { error: t("errorInvalid") };
    clientSeg = client.code;
  }
  if (boundProjectId) {
    const project = await prisma.project.findUnique({ where: { id: boundProjectId }, select: { id: true } });
    if (!project) return { error: t("errorInvalid") };
  }

  const lot: Omit<LotFields, "seq"> = {
    catNodeId,
    statusCode: statusCode as ItemStatusCode,
    conditionCode: conditionCode as ItemConditionCode,
    ownerClientId,
    boundProjectId: statusCode === "P" ? boundProjectId : null,
    expiryDate,
    clientDocNo,
  };

  let createdCode = "";
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await prisma.$transaction(async (tx) => {
          const prefix = itemCodePrefix(root.code!, statusCode, conditionCode, clientSeg);
          const seq = await nextItemSeq(tx, prefix);
          const code = buildItemCode(root.code!, statusCode, conditionCode, clientSeg, seq);
          const parent = await tx.inventoryItem.create({
            data: { code, name, unit, isReusable, partCount, note, ...lot, seq },
          });
          for (let n = 1; n <= (partCount > 1 ? partCount : 0); n++) {
            await tx.inventoryItem.create({
              data: {
                code: partItemCode(code, n),
                name: `${name} — Phần ${n}`,
                unit,
                isReusable,
                parentItemId: parent.id,
                partNo: n,
                ...lot,
                seq,
              },
            });
          }
          createdCode = code;
          await tx.auditLog.create({
            data: { entityType: "inventory_item", entityId: parent.id, field: "*", action: "CREATE", changedBy: await getCurrentStaffId() },
          });
        });
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message === "SEQ_FULL") return { error: t("errorSeqFull") };
    throw e;
  }
  revalidate();
  return { success: true, createdCode };
}

/**
 * Sửa lô: CHỈ các trường không nằm trong mã (tên, ĐVT, tái sử dụng, hạn dùng, số phiếu KH, note, active).
 * Trạng thái/tình trạng đổi qua phiếu CHUYỂN ĐỔI LÔ; nhóm/khách cố định theo mã đã sinh.
 */
export async function updateItem(itemId: string, _prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  await requirePermission("inventory.item.manage");
  const t = await getTranslations("inventory.items");
  const name = String(formData.get("name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const isReusable = formData.get("isReusable") === "on";
  const isActive = formData.get("isActive") === "on";
  const expiryRaw = String(formData.get("expiryDate") ?? "").trim();
  const clientDocNo = String(formData.get("clientDocNo") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!name) return { error: t("errorInvalid") };
  const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
  if (expiryDate && Number.isNaN(expiryDate.getTime())) return { error: t("errorInvalid") };

  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, include: { parts: { select: { id: true } } } });
  if (!item || item.parentItemId) return { error: t("errorInvalid") };

  const affectedIds = [itemId, ...item.parts.map((p) => p.id)];
  // Lật isReusable khi còn đồ ở hiện trường sẽ làm holding mất nghĩa; ngưng dùng khi còn tồn cũng vậy → chặn
  if (isReusable !== item.isReusable) {
    const holding = await prisma.projectHolding.count({ where: { itemId: { in: affectedIds }, quantity: { gt: 0 } } });
    if (holding > 0) return { error: t("errorInUse") };
  }
  if (!isActive && item.isActive) {
    const [stock, holding] = await Promise.all([
      prisma.stockBalance.count({ where: { itemId: { in: affectedIds }, quantity: { gt: 0 } } }),
      prisma.projectHolding.count({ where: { itemId: { in: affectedIds }, quantity: { gt: 0 } } }),
    ]);
    if (stock > 0 || holding > 0) return { error: t("errorInUse") };
  }

  // K4: đổi hạn dùng thì XOÁ mốc đã cảnh báo — không xoá thì lô lùi hạn (nhập lại date xa hơn) vẫn
  // mang mốc cũ và thang cảnh báo sẽ câm cho tới khi vượt mức đã bắn.
  const expiryChanged = (item.expiryDate?.getTime() ?? null) !== (expiryDate?.getTime() ?? null);
  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { name, unit, isReusable, isActive, expiryDate, clientDocNo, note, ...(expiryChanged ? { expiryReminderLevel: null } : {}) },
    });
    if (item.parts.length > 0) {
      // Lan thuộc tính lô xuống phần con (tên phần giữ nguyên — có thể đã sửa tay)
      await tx.inventoryItem.updateMany({
        where: { parentItemId: itemId },
        data: { isReusable, isActive, expiryDate, clientDocNo, ...(expiryChanged ? { expiryReminderLevel: null } : {}) },
      });
    }
  });
  await audit(itemId, "UPDATE");
  revalidate();
  return { success: true };
}

/**
 * Import CSV kiểm kê (kho v2): mỗi dòng = (lô × kho); các dòng cùng lô gom thành MỘT item,
 * mã sinh tự động; mỗi kho một phiếu NK. All-or-nothing như cũ.
 */
export async function importItemsCsv(_prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  await requirePermission("inventory.import_csv");
  const t = await getTranslations("inventory.items");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_CSV_BYTES) return { error: t("errorInvalid") };

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows, errors } = parseInventoryCsv(buffer);
  if (rows.length > MAX_CSV_ROWS) return { error: t("errorInvalid") };

  const rowErrors: CsvRowError[] = [...errors];
  type ResolvedRow = ParsedInventoryRow & { catNodeId: string; rootCode: string; rootClientOwned: boolean; clientId: string | null };
  const resolved: ResolvedRow[] = [];
  if (rows.length > 0) {
    const [nodes, clients, warehouses] = await Promise.all([
      prisma.inventoryCategory.findMany({ where: { isActive: true } }),
      prisma.client.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
      prisma.warehouse.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
    ]);
    const roots = new Map(nodes.filter((n) => !n.parentId && n.code).map((n) => [n.code!.toUpperCase(), n]));
    const byName = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const key = n.name.toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(n);
      byName.set(key, list);
    }
    const parentById = new Map(nodes.map((n) => [n.id, n.parentId] as const));
    const rootOf = (id: string): (typeof nodes)[number] | null => {
      let cur: string | null = id;
      for (let hop = 0; cur && hop < 4; hop++) {
        const parent: string | null = parentById.get(cur) ?? null;
        if (!parent) return nodes.find((n) => n.id === cur) ?? null;
        cur = parent;
      }
      return null;
    };
    const clientByCode = new Map(clients.map((c) => [c.code.toUpperCase(), c.id]));
    const whByCode = new Map(warehouses.map((w) => [w.code, w.id]));

    for (const r of rows) {
      // Nhóm: khớp code node gốc trước, sau đó tên node bất kỳ (trùng tên → bắt ghi rõ hơn)
      let node = roots.get(r.categoryRef.toUpperCase()) ?? null;
      if (!node) {
        const matches = byName.get(r.categoryRef.toLowerCase()) ?? [];
        if (matches.length > 1) {
          rowErrors.push({ line: r.line, message: "AMBIGUOUS_CATEGORY" });
          continue;
        }
        node = matches[0] ?? null;
      }
      if (!node) {
        rowErrors.push({ line: r.line, message: "UNKNOWN_CATEGORY" });
        continue;
      }
      const root = rootOf(node.id);
      if (!root?.code) {
        rowErrors.push({ line: r.line, message: "UNKNOWN_CATEGORY" });
        continue;
      }
      if (r.statusCode === "P") {
        // Lô theo chính xác dự án cần gắn dự án — CSV không có cột này, nhập tay qua form
        rowErrors.push({ line: r.line, message: "STATUS_P_NOT_SUPPORTED" });
        continue;
      }
      let clientId: string | null = null;
      if (r.clientCode) {
        clientId = clientByCode.get(r.clientCode) ?? null;
        if (!clientId) {
          rowErrors.push({ line: r.line, message: "UNKNOWN_CLIENT" });
          continue;
        }
      } else if (root.isClientOwned || r.statusCode === "C") {
        rowErrors.push({ line: r.line, message: "MISSING_CLIENT" });
        continue;
      }
      if (!whByCode.has(r.warehouseCode)) {
        rowErrors.push({ line: r.line, message: "UNKNOWN_WAREHOUSE" });
        continue;
      }
      resolved.push({ ...r, catNodeId: node.id, rootCode: root.code, rootClientOwned: root.isClientOwned, clientId });
    }

    // Gom lô + kiểm nhất quán trong nhóm (ĐVT / tái sử dụng / số phần / node phải trùng nhau)
    const groups = new Map<string, ResolvedRow[]>();
    for (const r of resolved) {
      const key = lotKey(r);
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      const first = list[0];
      const seenWh = new Set<string>();
      for (const r of list) {
        if (r.unit !== first.unit || r.isReusable !== first.isReusable || r.partCount !== first.partCount || r.catNodeId !== first.catNodeId) {
          rowErrors.push({ line: r.line, message: "INCONSISTENT_LOT" });
        } else if (seenWh.has(r.warehouseCode)) {
          rowErrors.push({ line: r.line, message: "DUPLICATE_ROW" });
        }
        seenWh.add(r.warehouseCode);
      }
    }
  }
  if (rowErrors.length > 0 || resolved.length === 0) {
    return { rowErrors: rowErrors.sort((a, b) => a.line - b.line) };
  }

  const warehouses = await prisma.warehouse.findMany({ where: { isActive: true }, select: { id: true, code: true } });
  const whByCode = new Map(warehouses.map((w) => [w.code, w.id]));
  const staffId = await getCurrentStaffId();
  const sourceFileKey = await saveChatAttachment(buffer, "text/csv");
  const now = new Date();

  const groups = new Map<string, ResolvedRow[]>();
  for (const r of resolved) {
    const key = lotKey(r);
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  let importedDocs = 0;
  // Retry P2002 (max 3): nextDocCode count-based + nextItemSeq đều có race với request khác — retry tính lại.
  const runImport = async () => await prisma.$transaction(async (tx) => {
    importedDocs = 0;
    const byWarehouse = new Map<string, { itemId: string; quantity: number }[]>();
    for (const list of groups.values()) {
      const g = list[0];
      const clientSeg = g.clientCode || TCM_OWNER_SEG;
      const prefix = itemCodePrefix(g.rootCode, g.statusCode, g.conditionCode, clientSeg);
      const seq = await nextItemSeq(tx, prefix);
      const code = buildItemCode(g.rootCode, g.statusCode, g.conditionCode, clientSeg, seq);
      const lot = {
        catNodeId: g.catNodeId,
        statusCode: g.statusCode,
        conditionCode: g.conditionCode,
        ownerClientId: g.clientId,
        boundProjectId: null,
        expiryDate: g.expiryRaw ? new Date(g.expiryRaw) : null,
        clientDocNo: g.clientDocNo || null,
        seq,
      };
      const parent = await tx.inventoryItem.create({
        data: { code, name: g.name, unit: g.unit || null, isReusable: g.isReusable, partCount: g.partCount, note: g.note || null, ...lot },
      });
      const stockables: string[] = [];
      if (g.partCount > 1) {
        for (let n = 1; n <= g.partCount; n++) {
          const part = await tx.inventoryItem.create({
            data: {
              code: partItemCode(code, n),
              name: `${g.name} — Phần ${n}`,
              unit: g.unit || null,
              isReusable: g.isReusable,
              parentItemId: parent.id,
              partNo: n,
              ...lot,
            },
          });
          stockables.push(part.id);
        }
      } else {
        stockables.push(parent.id);
      }
      for (const r of list) {
        if (r.quantity <= 0) continue;
        const whId = whByCode.get(r.warehouseCode)!;
        const linesForWh = byWarehouse.get(whId) ?? [];
        // Dòng bộ: Số lượng = số BỘ đủ → credit số đó cho TỪNG phần
        for (const itemId of stockables) linesForWh.push({ itemId, quantity: r.quantity });
        byWarehouse.set(whId, linesForWh);
      }
    }
    for (const [warehouseId, docLines] of byWarehouse.entries()) {
      const code = await nextDocCode(tx, "IMPORT", now);
      await tx.stockDocument.create({
        data: {
          code,
          type: "IMPORT",
          status: "COMPLETED",
          toWarehouseId: warehouseId,
          note: `Import CSV: ${file.name}`,
          createdById: staffId,
          lines: { create: docLines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, sort: i })) },
        },
      });
      for (const l of docLines) await creditBalance(tx, warehouseId, l.itemId, l.quantity);
      importedDocs++;
    }
  });
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await runImport();
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message === "SEQ_FULL") return { error: t("errorSeqFull") };
    throw e;
  }

  await prisma.auditLog.create({
    data: {
      entityType: "inventory_import",
      entityId: sourceFileKey,
      field: "*",
      action: "CREATE",
      changedBy: staffId,
      newValue: JSON.stringify({ file: file.name, lots: groups.size, docs: importedDocs }),
    },
  });
  revalidate();
  return { success: true, importedItems: groups.size, importedDocs };
}
