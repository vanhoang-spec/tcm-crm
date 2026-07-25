"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { saveChatAttachment } from "@/lib/chat-storage";
import { partItemCode, nextDocCode, creditBalance } from "@/lib/inventory";
import { parseInventoryCsv, type CsvRowError } from "@/lib/inventory-csv";
import { requirePermission } from "@/lib/permissions";

export type ItemFormState = { error?: string; success?: boolean };
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

export async function createItem(_prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  await requirePermission("inventory.item.manage");
  const t = await getTranslations("inventory.items");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const isReusable = formData.get("isReusable") === "on";
  const partCount = Number(formData.get("partCount") ?? 1);
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!code || !name || !Number.isInteger(partCount) || partCount < 1 || partCount > 4) return { error: t("errorInvalid") };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const parent = await tx.inventoryItem.create({ data: { code, name, categoryId, unit, isReusable, partCount, note } });
      if (partCount > 1) {
        for (let n = 1; n <= partCount; n++) {
          await tx.inventoryItem.create({
            data: {
              code: partItemCode(code, n),
              name: `${name} — Phần ${n}`,
              categoryId,
              unit,
              isReusable,
              parentItemId: parent.id,
              partNo: n,
            },
          });
        }
      }
      return parent;
    });
    await audit(created.id, "CREATE");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: t("errorCodeExists") };
    throw e;
  }
  revalidate();
  return { success: true };
}

export async function updateItem(itemId: string, _prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  await requirePermission("inventory.item.manage");
  const t = await getTranslations("inventory.items");
  const name = String(formData.get("name") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const isReusable = formData.get("isReusable") === "on";
  const isActive = formData.get("isActive") === "on";
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!name) return { error: t("errorInvalid") };

  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, include: { parts: { select: { id: true } } } });
  if (!item) return { error: t("errorInvalid") };

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

  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({ where: { id: itemId }, data: { name, categoryId, unit, isReusable, isActive, note } });
    if (item.parts.length > 0) {
      // Lan thuộc tính danh mục xuống phần con (tên phần giữ nguyên — có thể đã sửa tay)
      await tx.inventoryItem.updateMany({
        where: { parentItemId: itemId },
        data: { categoryId, isReusable, isActive },
      });
    }
  });
  await audit(itemId, "UPDATE");
  revalidate();
  return { success: true };
}

export async function importItemsCsv(_prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  await requirePermission("inventory.import_csv");
  const t = await getTranslations("inventory.items");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_CSV_BYTES) return { error: t("errorInvalid") };

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows, errors } = parseInventoryCsv(buffer);
  if (rows.length > MAX_CSV_ROWS) return { error: t("errorInvalid") };

  // Validate mức DB: mã đã tồn tại (kể cả mã phần con sẽ sinh ra), kho không tồn tại
  const rowErrors: CsvRowError[] = [...errors];
  if (rows.length > 0) {
    const allCodes = rows.flatMap((r) =>
      r.partCount > 1 ? [r.code, ...Array.from({ length: r.partCount }, (_, i) => partItemCode(r.code, i + 1))] : [r.code]
    );
    const [existing, warehouses] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { code: { in: allCodes } }, select: { code: true } }),
      prisma.warehouse.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
    ]);
    const existingCodes = new Set(existing.map((e) => e.code));
    const whByCode = new Map(warehouses.map((w) => [w.code, w.id]));
    for (const r of rows) {
      if (existingCodes.has(r.code) || (r.partCount > 1 && Array.from({ length: r.partCount }, (_, i) => partItemCode(r.code, i + 1)).some((c) => existingCodes.has(c)))) {
        rowErrors.push({ line: r.line, message: "CODE_EXISTS" });
      } else if (!whByCode.has(r.warehouseCode)) {
        rowErrors.push({ line: r.line, message: "UNKNOWN_WAREHOUSE" });
      }
    }
  }
  if (rowErrors.length > 0 || rows.length === 0) {
    return { rowErrors: rowErrors.sort((a, b) => a.line - b.line) };
  }

  // Resolve nhóm hàng theo code / labelVi / labelEn (không khớp → categoryId null, không chặn)
  const categories = await prisma.optionItem.findMany({ where: { set: { code: "inventory_category" }, isActive: true } });
  const catLookup = new Map<string, string>();
  for (const c of categories) {
    catLookup.set(c.code.toUpperCase(), c.id);
    catLookup.set(c.labelVi.toLowerCase(), c.id);
    if (c.labelEn) catLookup.set(c.labelEn.toLowerCase(), c.id);
  }
  const warehouses = await prisma.warehouse.findMany({ where: { isActive: true }, select: { id: true, code: true } });
  const whByCode = new Map(warehouses.map((w) => [w.code, w.id]));
  const staffId = await getCurrentStaffId();
  const sourceFileKey = await saveChatAttachment(buffer, "text/csv");
  const now = new Date();

  let importedDocs = 0;
  // Retry P2002 (max 3) mirror createDocWithRetry ở documents/actions.ts: nextDocCode count-based có thể
  // đụng mã phiếu NK tạo đồng thời từ request khác trong cùng tháng — retry tính lại seq mới.
  // (P2002 do trùng mã ITEM thì retry cũng fail y hệt → ném ra như cũ, all-or-nothing giữ nguyên.)
  const runImport = async () => await prisma.$transaction(async (tx) => {
    importedDocs = 0;
    // 1) Tạo item (+ phần con); gom stockable id theo kho để nhập
    const byWarehouse = new Map<string, { itemId: string; quantity: number }[]>();
    for (const r of rows) {
      const categoryId = catLookup.get(r.categoryLabel.toUpperCase()) ?? catLookup.get(r.categoryLabel.toLowerCase()) ?? null;
      const parent = await tx.inventoryItem.create({
        data: {
          code: r.code,
          name: r.name,
          categoryId,
          unit: r.unit || null,
          isReusable: r.isReusable,
          partCount: r.partCount,
          note: r.note || null,
        },
      });
      const stockables: string[] = [];
      if (r.partCount > 1) {
        for (let n = 1; n <= r.partCount; n++) {
          const part = await tx.inventoryItem.create({
            data: {
              code: partItemCode(r.code, n),
              name: `${r.name} — Phần ${n}`,
              categoryId,
              unit: r.unit || null,
              isReusable: r.isReusable,
              parentItemId: parent.id,
              partNo: n,
            },
          });
          stockables.push(part.id);
        }
      } else {
        stockables.push(parent.id);
      }
      if (r.quantity > 0) {
        const whId = whByCode.get(r.warehouseCode)!;
        const list = byWarehouse.get(whId) ?? [];
        // Dòng bộ: Số lượng = số BỘ đủ → credit số đó cho TỪNG phần
        for (const itemId of stockables) list.push({ itemId, quantity: r.quantity });
        byWarehouse.set(whId, list);
      }
    }
    // 2) Mỗi kho 1 phiếu NHẬP COMPLETED + credit tồn
    for (const [warehouseId, lines] of byWarehouse.entries()) {
      const code = await nextDocCode(tx, "IMPORT", now);
      await tx.stockDocument.create({
        data: {
          code,
          type: "IMPORT",
          status: "COMPLETED",
          toWarehouseId: warehouseId,
          note: `Import CSV: ${file.name}`,
          createdById: staffId,
          lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, sort: i })) },
        },
      });
      for (const l of lines) await creditBalance(tx, warehouseId, l.itemId, l.quantity);
      importedDocs++;
    }
  });
  for (let attempt = 0; ; attempt++) {
    try {
      await runImport();
      break;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }

  await prisma.auditLog.create({
    data: {
      entityType: "inventory_import",
      entityId: sourceFileKey,
      field: "*",
      action: "CREATE",
      changedBy: staffId,
      newValue: JSON.stringify({ file: file.name, rows: rows.length, docs: importedDocs }),
    },
  });
  revalidate();
  return { success: true, importedItems: rows.length, importedDocs };
}
