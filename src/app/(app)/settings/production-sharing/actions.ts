"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";
import { getCurrentStaffId } from "@/lib/current-staff";
import { prisma } from "@/lib/prisma";
import { writeProductionSharing, readProductionSharing } from "@/lib/purchasing-scope";

export type SharingFormState = { ok?: boolean; error?: string };

/**
 * Lưu cấu hình "Sản xuất dùng chung gì của Thu mua".
 *
 * ⚠ Gác bằng `settings.vendors.manage` (BGĐ + Trưởng phòng Thu mua) — KHÔNG mã quyền mới. Đây là
 * quyết định của người quản lý hồ sơ NCC: chia sẻ cho ai, phần nào.
 */
export async function saveProductionSharing(_prev: SharingFormState, formData: FormData): Promise<SharingFormState> {
  await requirePermission("settings.vendors.manage");
  const staffId = await getCurrentStaffId();

  const groupCodes = formData.getAll("group").map(String).filter(Boolean);
  const vendorIds = formData.getAll("vendor").map(String).filter(Boolean);

  // Không tin payload: chỉ nhận id NCC có thật và đang hoạt động.
  const valid = await prisma.vendor.findMany({ where: { id: { in: vendorIds }, isActive: true }, select: { id: true } });
  const before = await readProductionSharing();
  await writeProductionSharing({ groupCodes, vendorIds: valid.map((v) => v.id) });

  await prisma.auditLog.create({
    data: {
      entityType: "ProductionSharing",
      entityId: "GLOBAL",
      action: "UPDATE",
      field: "shared_scope",
      oldValue: `nhóm: ${before.groupCodes.join(",") || "—"} | NCC: ${before.vendorIds.length}`,
      newValue: `nhóm: ${groupCodes.join(",") || "—"} | NCC: ${valid.length}`,
      changedBy: staffId,
    },
  });

  revalidatePath("/settings/production-sharing");
  return { ok: true };
}
