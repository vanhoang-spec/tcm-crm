"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";

export type CommunicationSettingsState = { error?: string; success?: boolean };

async function upsertSetting(key: string, value: string, staffId: string | null) {
  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "communication", key, scope: "GLOBAL", scopeRef: "" } },
    update: { value, updatedBy: staffId },
    create: { module: "communication", key, value, updatedBy: staffId },
  });
}

export async function saveCommunicationSettings(
  _prev: CommunicationSettingsState,
  formData: FormData,
): Promise<CommunicationSettingsState> {
  const t = await getTranslations("settings.communication");
  const superAdminTitles = String(formData.get("superAdminTitles") ?? "").trim();
  const pollSeconds = Number(formData.get("pollSeconds") ?? NaN);
  if (!superAdminTitles || !Number.isFinite(pollSeconds) || pollSeconds < 2 || pollSeconds > 60) {
    return { error: t("errorInvalid") };
  }
  const staffId = await getCurrentStaffId();
  await upsertSetting("super_admin_titles", superAdminTitles, staffId);
  await upsertSetting("message_poll_seconds", String(Math.round(pollSeconds)), staffId);
  revalidatePath("/settings/communication");
  revalidatePath("/chat", "layout");
  return { success: true };
}
