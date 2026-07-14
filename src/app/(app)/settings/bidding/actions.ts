"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";

export type BiddingSettingsState = { error?: string; success?: boolean };

async function upsertSetting(key: string, value: string, staffId: string | null) {
  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "bidding", key, scope: "GLOBAL", scopeRef: "" } },
    update: { value, updatedBy: staffId },
    create: { module: "bidding", key, value, updatedBy: staffId },
  });
}

export async function saveBiddingSettings(
  _prev: BiddingSettingsState,
  formData: FormData,
): Promise<BiddingSettingsState> {
  const t = await getTranslations("settings.bidding");
  const minMargin = Number(formData.get("minMargin") ?? NaN);
  const threshold = Number(formData.get("threshold") ?? NaN);
  const processingReminderDays = Number(formData.get("processingReminderDays") ?? NaN);
  const liquidationReminderDays = Number(formData.get("liquidationReminderDays") ?? NaN);
  const orderResponseDays = Number(formData.get("orderResponseDays") ?? NaN);
  if (
    !Number.isFinite(minMargin) ||
    minMargin < 0 ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    !Number.isFinite(processingReminderDays) ||
    processingReminderDays < 1 ||
    !Number.isFinite(liquidationReminderDays) ||
    liquidationReminderDays < 1 ||
    !Number.isFinite(orderResponseDays) ||
    orderResponseDays < 1
  ) {
    return { error: t("errorInvalid") };
  }

  const staffId = await getCurrentStaffId();
  await upsertSetting("min_margin_pct", String(minMargin), staffId);
  await upsertSetting("auto_approve_threshold", String(Math.round(threshold)), staffId);
  await upsertSetting("processing_reminder_days", String(Math.round(processingReminderDays)), staffId);
  await upsertSetting("liquidation_reminder_interval_days", String(Math.round(liquidationReminderDays)), staffId);
  await upsertSetting("order_response_days", String(Math.round(orderResponseDays)), staffId);

  revalidatePath("/settings/bidding");
  revalidatePath("/bidding");
  return { success: true };
}
