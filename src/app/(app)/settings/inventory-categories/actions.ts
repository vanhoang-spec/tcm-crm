"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { GROUP_CODE_RE } from "@/lib/inventory-lot";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";

export type CategoryFormState = { error?: string; success?: boolean };

async function audit(entityId: string, action: string, detail?: object) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: {
      entityType: "inventory_category",
      entityId,
      field: "*",
      action,
      changedBy: staffId,
      newValue: detail ? JSON.stringify(detail) : null,
    },
  });
}

function revalidate() {
  revalidatePath("/settings/inventory-categories");
  revalidatePath("/inventory");
  revalidatePath("/inventory/items");
}

/**
 * Tạo node cây danh mục (≤3 cấp). Node GỐC bắt buộc code 2 ký tự A-Z (khối đầu của mã sản phẩm PO-0042 —
 * mã lô v3 18/08/2026, trước là 1 ký tự; spec "có thể thêm/bớt") + được đặt cờ isClientOwned; node con chỉ có tên.
 */
export async function createCategory(_prev: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  await requirePermission("inventory.item.manage");
  const t = await getTranslations("settings.inventoryCategories");
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const isClientOwned = formData.get("isClientOwned") === "on";
  const sortRaw = String(formData.get("sort") ?? "").trim();
  const sort = sortRaw === "" ? 0 : Number(sortRaw);
  if (!name || !Number.isInteger(sort)) return { error: t("errorInvalid") };

  if (!parentId) {
    if (!GROUP_CODE_RE.test(code)) return { error: t("errorRootCode") };
    const dup = await prisma.inventoryCategory.findFirst({ where: { parentId: null, code } });
    if (dup) return { error: t("errorRootCodeExists", { code }) };
  } else {
    const parent = await prisma.inventoryCategory.findUnique({
      where: { id: parentId },
      include: { parent: { select: { parentId: true } } },
    });
    if (!parent || !parent.isActive) return { error: t("errorInvalid") };
    // Cây tối đa 3 cấp: cha đã ở cấp 3 (ông có cha) thì không thêm con nữa
    if (parent.parent?.parentId) return { error: t("errorTooDeep") };
  }

  const created = await prisma.inventoryCategory.create({
    data: {
      parentId,
      name,
      code: parentId ? null : code,
      isClientOwned: parentId ? false : isClientOwned,
      sort,
    },
  });
  await audit(created.id, "CREATE", { name, code: parentId ? null : code, parentId });
  revalidate();
  return { success: true };
}

/**
 * Sửa node: tên / thứ tự / active. Code + cờ hàng khách + vị trí trong cây BẤT BIẾN sau khi tạo
 * (đã đi vào mã lô của item). Tắt active bị chặn khi còn node con đang active.
 */
export async function updateCategory(nodeId: string, _prev: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  await requirePermission("inventory.item.manage");
  const t = await getTranslations("settings.inventoryCategories");
  const name = String(formData.get("name") ?? "").trim();
  const sortRaw = String(formData.get("sort") ?? "").trim();
  const sort = sortRaw === "" ? 0 : Number(sortRaw);
  const isActive = formData.get("isActive") === "on";
  if (!name || !Number.isInteger(sort)) return { error: t("errorInvalid") };

  const node = await prisma.inventoryCategory.findUnique({ where: { id: nodeId }, select: { isActive: true } });
  if (!node) return { error: t("errorInvalid") };
  if (!isActive && node.isActive) {
    const activeChildren = await prisma.inventoryCategory.count({ where: { parentId: nodeId, isActive: true } });
    if (activeChildren > 0) return { error: t("errorHasActiveChildren") };
  }

  await prisma.inventoryCategory.update({ where: { id: nodeId }, data: { name, sort, isActive } });
  await audit(nodeId, "UPDATE", { name, sort, isActive });
  revalidate();
  return { success: true };
}
