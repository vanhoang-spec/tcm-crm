"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";

export type SecurityFormState = { error?: string; success?: boolean };

const MIN_LENGTH = 8;

/**
 * Đổi MẬT KHẨU CHUNG cấp cho nhân sự mới / khi admin cấp lại (setting auth.default_password).
 *
 * Trước đây chỉ đổi được bằng SQL, dù lib/auth.ts đã ghi "admin đổi được ở /settings/security" —
 * trang đó không tồn tại. Mật khẩu chung là thứ mọi nhân sự mới dùng lần đầu, để nguyên
 * "TCM123456" sau khi lên production là rủi ro thật.
 *
 * KHÔNG đụng mật khẩu đã đặt của ai: người đã có mật khẩu riêng vẫn dùng mật khẩu đó.
 */
export async function updateDefaultPassword(
  _prev: SecurityFormState,
  formData: FormData,
): Promise<SecurityFormState> {
  await requirePermission("settings.security.manage");
  const t = await getTranslations("settings.security");

  const value = String(formData.get("defaultPassword") ?? "").trim();
  const confirm = String(formData.get("confirmPassword") ?? "").trim();
  if (value.length < MIN_LENGTH) return { error: t("errTooShort", { min: MIN_LENGTH }) };
  if (value !== confirm) return { error: t("errMismatch") };

  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "auth", key: "default_password", scope: "GLOBAL", scopeRef: "" } },
    update: { value, updatedBy: await getCurrentStaffId() },
    create: { module: "auth", key: "default_password", scope: "GLOBAL", scopeRef: "", value, updatedBy: await getCurrentStaffId() },
  });
  // CỐ Ý không ghi giá trị vào AuditLog — đó là mật khẩu.
  await prisma.auditLog.create({
    data: {
      entityType: "setting",
      entityId: "auth.default_password",
      field: "value",
      newValue: "(đã đổi)",
      action: "UPDATE",
      changedBy: await getCurrentStaffId(),
    },
  });

  revalidatePath("/settings/security");
  return { success: true };
}
