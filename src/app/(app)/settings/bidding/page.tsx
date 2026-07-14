import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getNumberSetting } from "@/lib/settings";
import { BiddingSettingsForm } from "./bidding-settings-form";

export default async function SettingsBiddingPage() {
  const [t, minMargin, threshold, processingReminderDays, liquidationReminderDays, orderResponseDays] = await Promise.all([
    getTranslations("settings.bidding"),
    getNumberSetting("bidding", "min_margin_pct", 31),
    getNumberSetting("bidding", "auto_approve_threshold", 100_000_000),
    getNumberSetting("bidding", "processing_reminder_days", 7),
    getNumberSetting("bidding", "liquidation_reminder_interval_days", 7),
    getNumberSetting("bidding", "order_response_days", 4),
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

      <BiddingSettingsForm
        minMargin={minMargin}
        threshold={threshold}
        processingReminderDays={processingReminderDays}
        liquidationReminderDays={liquidationReminderDays}
        orderResponseDays={orderResponseDays}
      />
    </div>
  );
}
