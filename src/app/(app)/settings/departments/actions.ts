"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit } from "@/lib/utils";
import { requirePermission } from "@/lib/permissions";

export type DepartmentFormState = { error?: string; success?: boolean };

/**
 * Sửa Phòng ban. Trước đây KHÔNG có trang nào — `leadStaffId` (trưởng phòng: người xếp lịch tuần,
 * và là "quản lý Planning" duyệt proposal) cùng `costPrefix` (prefix mã dòng CO/CE: ACC-001…)
 * chỉ đổi được bằng seed hoặc SQL tay. Nhân sự thay đổi là hệ thống sai cho tới lần deploy sau.
 */
export async function updateDepartment(
  departmentId: string,
  _prev: DepartmentFormState,
  formData: FormData,
): Promise<DepartmentFormState> {
  await requirePermission("settings.departments.manage");
  const t = await getTranslations("settings.departments");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: t("errNameRequired") };

  // Prefix đi vào mã hiển thị của mọi dòng chi phí — giữ ngắn, viết hoa, không dấu cách.
  const rawPrefix = String(formData.get("costPrefix") ?? "").trim().toUpperCase();
  if (rawPrefix && !/^[A-Z]{2,5}$/.test(rawPrefix)) return { error: t("errPrefixFormat") };
  const costPrefix = rawPrefix || null;

  const leadStaffId = String(formData.get("leadStaffId") ?? "").trim() || null;

  // Prefix trùng nhau sẽ làm 2 phòng đánh số chồng lên nhau (ACC-001 xuất hiện 2 lần).
  if (costPrefix) {
    const dup = await prisma.department.findFirst({
      where: { costPrefix, NOT: { id: departmentId } },
      select: { name: true },
    });
    if (dup) return { error: t("errPrefixTaken", { name: dup.name }) };
  }

  const before = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!before) return { error: t("errNotFound") };

  await prisma.department.update({
    where: { id: departmentId },
    data: { name, costPrefix, leadStaffId, isActive: formData.get("isActive") === "on" },
  });
  await prisma.auditLog.create({
    data: {
      entityType: "department",
      entityId: departmentId,
      field: "*",
      oldValue: stringifyAudit({ name: before.name, costPrefix: before.costPrefix, leadStaffId: before.leadStaffId }),
      newValue: stringifyAudit({ name, costPrefix, leadStaffId }),
      action: "UPDATE",
      changedBy: await getCurrentStaffId(),
    },
  });

  revalidatePath("/settings/departments");
  return { success: true };
}
