"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";

export type TimekeepingSettingsState = { error?: string; success?: boolean };

async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "timekeeping", key, scope: "GLOBAL", scopeRef: "" } },
    update: { value },
    create: { module: "timekeeping", key, value },
  });
}

export async function saveTimekeepingSettings(
  _prev: TimekeepingSettingsState,
  formData: FormData
): Promise<TimekeepingSettingsState> {
  await requirePermission("settings.timekeeping.manage");
  const t = await getTranslations("settings.timekeeping");
  const weekHours = Number(formData.get("standardWeekHours"));
  const leaveDays = Number(formData.get("annualLeaveDays"));
  const deadline = String(formData.get("carryoverDeadline") ?? "").trim();
  if (
    !Number.isFinite(weekHours) || weekHours <= 0 || weekHours > 168 ||
    !Number.isFinite(leaveDays) || leaveDays < 0 || leaveDays > 60 ||
    !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(deadline)
  ) {
    return { error: t("errorInvalid") };
  }

  await Promise.all([
    upsertSetting("standard_week_hours", String(weekHours)),
    upsertSetting("annual_leave_days", String(leaveDays)),
    upsertSetting("carryover_deadline", deadline),
  ]);
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType: "setting", entityId: "timekeeping", field: "*", action: "UPDATE", changedBy: staffId },
  });
  revalidatePath("/settings/timekeeping");
  revalidatePath("/staff");
  revalidatePath("/staff/leave");
  return { success: true };
}
