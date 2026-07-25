"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { PERMISSION_CODES } from "@/lib/permission-catalog";

async function audit(entityId: string, oldValue: string | null, newValue: string | null) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType: "Staff.roleId", entityId, field: "roleId", oldValue, newValue, action: "UPDATE", changedBy: staffId },
  });
}

/**
 * Lưu toàn bộ ma trận quyền trong 1 lần submit.
 *
 * Checkbox tên `p:<roleId>:<permissionCode>`; HTML chỉ gửi ô ĐƯỢC TICK, nên bỏ tick = vắng mặt
 * trong formData. Vì vậy phải so với trạng thái đang lưu để biết cái nào thêm / cái nào gỡ —
 * không thể chỉ đọc formData rồi ghi đè mù.
 *
 * Role ADMIN cố ý không có dòng grant nào (sàn cứng trong lib/permissions.ts) nên bị loại khỏi
 * cả hai chiều: không thêm, không gỡ.
 */
export async function savePermissionMatrix(formData: FormData) {
  await requirePermission("settings.permissions.manage");

  const roles = await prisma.role.findMany({ where: { isActive: true }, select: { id: true, code: true } });
  const editableRoleIds = new Set(roles.filter((r) => r.code !== "ADMIN").map((r) => r.id));
  const validCodes = new Set(PERMISSION_CODES);

  // Trạng thái mong muốn từ form — bỏ qua mọi cặp không hợp lệ (role lạ / mã quyền không có
  // trong danh mục), tránh rác từ request giả đi thẳng vào DB.
  const wanted = new Set<string>();
  for (const key of formData.keys()) {
    if (!key.startsWith("p:")) continue;
    const [, roleId, code] = key.split(":");
    if (editableRoleIds.has(roleId) && validCodes.has(code)) wanted.add(`${roleId}:${code}`);
  }

  const current = await prisma.rolePermission.findMany({ select: { id: true, roleId: true, permissionCode: true } });
  const currentKeys = new Map(current.filter((r) => editableRoleIds.has(r.roleId)).map((r) => [`${r.roleId}:${r.permissionCode}`, r.id]));

  const toAdd = [...wanted].filter((k) => !currentKeys.has(k));
  const toRemoveIds = [...currentKeys].filter(([k]) => !wanted.has(k)).map(([, id]) => id);
  if (toAdd.length === 0 && toRemoveIds.length === 0) return;

  await prisma.$transaction([
    ...(toRemoveIds.length ? [prisma.rolePermission.deleteMany({ where: { id: { in: toRemoveIds } } })] : []),
    ...(toAdd.length
      ? [
          prisma.rolePermission.createMany({
            data: toAdd.map((k) => {
              const i = k.indexOf(":");
              return { roleId: k.slice(0, i), permissionCode: k.slice(i + 1) };
            }),
          }),
        ]
      : []),
  ]);

  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: {
      entityType: "RolePermission",
      entityId: "matrix",
      field: "permissions",
      oldValue: `${currentKeys.size} grant`,
      newValue: `${wanted.size} grant (+${toAdd.length} / -${toRemoveIds.length})`,
      action: "UPDATE",
      changedBy: staffId,
    },
  });
  revalidatePath("/settings/roles");
}

/** Gán/gỡ role cho 1 nhân sự — sentinel "" = gỡ role (roleId null). */
export async function updateStaffRole(staffId: string, formData: FormData) {
  await requirePermission("settings.roles.manage");
  const raw = String(formData.get("roleId") ?? "").trim();
  const roleId = raw === "" ? null : raw;

  const current = await prisma.staff.findUnique({ where: { id: staffId }, select: { roleId: true } });
  if (!current) return;
  if (current.roleId === roleId) return;

  await prisma.staff.update({ where: { id: staffId }, data: { roleId } });
  await audit(staffId, current.roleId, roleId);
  revalidatePath("/settings/roles");
}
