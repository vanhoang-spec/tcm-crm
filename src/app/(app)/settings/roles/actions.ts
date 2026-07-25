"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";

async function audit(entityId: string, oldValue: string | null, newValue: string | null) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType: "Staff.roleId", entityId, field: "roleId", oldValue, newValue, action: "UPDATE", changedBy: staffId },
  });
}

/** Gán/gỡ role cho 1 nhân sự — sentinel "" = gỡ role (roleId null). */
export async function updateStaffRole(staffId: string, formData: FormData) {
  const raw = String(formData.get("roleId") ?? "").trim();
  const roleId = raw === "" ? null : raw;

  const current = await prisma.staff.findUnique({ where: { id: staffId }, select: { roleId: true } });
  if (!current) return;
  if (current.roleId === roleId) return;

  await prisma.staff.update({ where: { id: staffId }, data: { roleId } });
  await audit(staffId, current.roleId, roleId);
  revalidatePath("/settings/roles");
}
