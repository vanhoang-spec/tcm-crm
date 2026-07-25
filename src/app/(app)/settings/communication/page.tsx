import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getNumberSetting, getStringSetting } from "@/lib/settings";
import { SUPER_ADMIN_TITLES_DEFAULT } from "@/lib/chat";
import { CommunicationSettingsForm } from "./communication-settings-form";

export default async function SettingsCommunicationPage() {
  const [t, tIndex, superAdminTitles, pollSeconds] = await Promise.all([
    getTranslations("settings.communication"),
    getTranslations("settings.index"),
    getStringSetting("communication", "super_admin_titles", SUPER_ADMIN_TITLES_DEFAULT),
    getNumberSetting("communication", "message_poll_seconds", 4),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {tIndex("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <CommunicationSettingsForm superAdminTitles={superAdminTitles} pollSeconds={pollSeconds} />
    </div>
  );
}
