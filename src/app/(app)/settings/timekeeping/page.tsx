import { getTranslations } from "next-intl/server";
import { getTimekeepingSettings } from "@/lib/timekeeping";
import { TimekeepingSettingsForm } from "./timekeeping-settings-form";
import { requirePermission } from "@/lib/permissions";

export default async function TimekeepingSettingsPage() {
  await requirePermission("settings.timekeeping.manage");
  const [t, settings] = await Promise.all([getTranslations("settings.timekeeping"), getTimekeepingSettings()]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
      <TimekeepingSettingsForm
        standardWeekHours={settings.standardWeekHours}
        annualLeaveDays={settings.annualLeaveDays}
        carryoverDeadline={settings.carryoverDeadline}
      />
    </div>
  );
}
