"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";

export type FinanceSettingsState = { error?: string; success?: boolean };

async function upsertSetting(key: string, value: string, staffId: string | null) {
  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "finance", key, scope: "GLOBAL", scopeRef: "" } },
    update: { value, updatedBy: staffId },
    create: { module: "finance", key, value, updatedBy: staffId },
  });
}

export async function saveFinanceSettings(
  _prev: FinanceSettingsState,
  formData: FormData,
): Promise<FinanceSettingsState> {
  await requirePermission("settings.finance.manage");
  const t = await getTranslations("settings.finance");
  const maxCount = Number(formData.get("maxCount") ?? NaN);
  const maxAmount = Number(formData.get("maxAmount") ?? NaN);
  // Hai setting cashflow_*_buckets cũ đã nghỉ hưu cùng bản forecast cũ — Cashflow v2 chọn khung
  // thời gian ngay trên trang báo cáo, không còn gì đọc chúng.
  if (!Number.isFinite(maxCount) || maxCount < 1 || !Number.isFinite(maxAmount) || maxAmount < 0) {
    return { error: t("errorInvalid") };
  }
  const staffId = await getCurrentStaffId();
  await upsertSetting("max_advance_count_per_staff", String(Math.round(maxCount)), staffId);
  await upsertSetting("max_outstanding_advance_amount_per_staff", String(Math.round(maxAmount)), staffId);
  revalidatePath("/settings/finance");
  revalidatePath("/finance");
  revalidatePath("/finance/cashflow");
  return { success: true };
}
