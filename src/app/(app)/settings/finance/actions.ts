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
  const weeklyBuckets = Number(formData.get("weeklyBuckets") ?? NaN);
  const monthlyBuckets = Number(formData.get("monthlyBuckets") ?? NaN);
  if (
    !Number.isFinite(maxCount) || maxCount < 1 ||
    !Number.isFinite(maxAmount) || maxAmount < 0 ||
    !Number.isFinite(weeklyBuckets) || weeklyBuckets < 0 || weeklyBuckets > 12 ||
    !Number.isFinite(monthlyBuckets) || monthlyBuckets < 0 || monthlyBuckets > 12 ||
    weeklyBuckets + monthlyBuckets < 1
  ) {
    return { error: t("errorInvalid") };
  }
  const staffId = await getCurrentStaffId();
  await upsertSetting("max_advance_count_per_staff", String(Math.round(maxCount)), staffId);
  await upsertSetting("max_outstanding_advance_amount_per_staff", String(Math.round(maxAmount)), staffId);
  await upsertSetting("cashflow_weekly_buckets", String(Math.round(weeklyBuckets)), staffId);
  await upsertSetting("cashflow_monthly_buckets", String(Math.round(monthlyBuckets)), staffId);
  revalidatePath("/settings/finance");
  revalidatePath("/finance");
  revalidatePath("/finance/cashflow");
  return { success: true };
}
