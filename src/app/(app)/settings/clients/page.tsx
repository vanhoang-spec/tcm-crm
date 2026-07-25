import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getNumberSetting } from "@/lib/settings";
import { ClientsSettingsForm } from "./clients-settings-form";
import { requirePermission } from "@/lib/permissions";

export default async function SettingsClientsPage() {
  await requirePermission("settings.clients.manage");
  const [t, activeDays, inactiveDays] = await Promise.all([
    getTranslations("settings.clients"),
    getNumberSetting("clients", "care_interval_active_days", 60),
    getNumberSetting("clients", "care_interval_inactive_days", 90),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <ClientsSettingsForm activeDays={activeDays} inactiveDays={inactiveDays} />
    </div>
  );
}
