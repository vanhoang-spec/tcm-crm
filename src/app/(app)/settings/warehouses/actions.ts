"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";

export type WarehouseFormState = { error?: string; success?: boolean };

async function audit(entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType: "warehouse", entityId, field: "*", action, changedBy: staffId, reason } });
}

function revalidate() {
  revalidatePath("/settings/warehouses");
  revalidatePath("/inventory");
  revalidatePath("/inventory/documents");
}

export async function createWarehouse(_prev: WarehouseFormState, formData: FormData): Promise<WarehouseFormState> {
  const t = await getTranslations("settings.warehouses");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() || null;
  const isMain = formData.get("isMain") === "on";
  if (!code || !name) return { error: t("errorInvalid") };

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (isMain) await tx.warehouse.updateMany({ where: { isMain: true }, data: { isMain: false } });
      return tx.warehouse.create({ data: { code, name, location, isMain } });
    });
    await audit(created.id, "CREATE");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: t("errorCodeExists") };
    throw e;
  }
  revalidate();
  return { success: true };
}

export async function updateWarehouse(warehouseId: string, _prev: WarehouseFormState, formData: FormData): Promise<WarehouseFormState> {
  const t = await getTranslations("settings.warehouses");
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() || null;
  const isMain = formData.get("isMain") === "on";
  const isActive = formData.get("isActive") === "on";
  if (!name) return { error: t("errorInvalid") };

  if (!isActive) {
    // Chặn ngưng kho còn tồn hàng hoặc đang dính phiếu chuyển chờ nhận
    const [stock, pending] = await Promise.all([
      prisma.stockBalance.count({ where: { warehouseId, quantity: { gt: 0 } } }),
      prisma.stockDocument.count({
        where: { type: "TRANSFER", status: "PENDING", OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] },
      }),
    ]);
    if (stock > 0 || pending > 0) return { error: t("errorHasStock") };
  }

  await prisma.$transaction(async (tx) => {
    if (isMain) await tx.warehouse.updateMany({ where: { isMain: true, id: { not: warehouseId } }, data: { isMain: false } });
    await tx.warehouse.update({ where: { id: warehouseId }, data: { name, location, isMain, isActive } });
  });
  await audit(warehouseId, "UPDATE");
  revalidate();
  return { success: true };
}
