"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";

export type ClientsSettingsState = { error?: string; success?: boolean };

async function upsertSetting(key: string, value: string, staffId: string | null) {
  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "clients", key, scope: "GLOBAL", scopeRef: "" } },
    update: { value, updatedBy: staffId },
    create: { module: "clients", key, value, updatedBy: staffId },
  });
}

export async function saveClientsSettings(
  _prev: ClientsSettingsState,
  formData: FormData,
): Promise<ClientsSettingsState> {
  await requirePermission("settings.clients.manage");
  const t = await getTranslations("settings.clients");
  const activeDays = Number(formData.get("activeDays") ?? NaN);
  const inactiveDays = Number(formData.get("inactiveDays") ?? NaN);
  if (!Number.isFinite(activeDays) || activeDays < 1 || !Number.isFinite(inactiveDays) || inactiveDays < 1) {
    return { error: t("errorInvalid") };
  }

  const staffId = await getCurrentStaffId();
  await upsertSetting("care_interval_active_days", String(Math.round(activeDays)), staffId);
  await upsertSetting("care_interval_inactive_days", String(Math.round(inactiveDays)), staffId);

  revalidatePath("/settings/clients");
  revalidatePath("/clients/care-report");
  revalidatePath("/reminders");
  return { success: true };
}
