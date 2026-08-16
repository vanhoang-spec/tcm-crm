import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getNumberSetting } from "@/lib/settings";
import { FinanceSettingsForm } from "./finance-settings-form";
import { requirePermission } from "@/lib/permissions";

export default async function SettingsFinancePage() {
  await requirePermission("settings.finance.manage");
  const [t, tIndex, maxCount, maxAmount] = await Promise.all([
    getTranslations("settings.finance"),
    getTranslations("settings.index"),
    getNumberSetting("finance", "max_advance_count_per_staff", 3),
    getNumberSetting("finance", "max_outstanding_advance_amount_per_staff", 50_000_000),
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

      <FinanceSettingsForm maxCount={maxCount} maxAmount={maxAmount} />
    </div>
  );
}
