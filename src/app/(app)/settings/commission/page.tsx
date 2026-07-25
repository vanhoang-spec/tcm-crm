import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { CommissionForm } from "./commission-form";
import { requirePermission } from "@/lib/permissions";

export default async function SettingsCommissionPage() {
  await requirePermission("settings.commission.manage");
  const [scheme, t] = await Promise.all([
    prisma.commissionScheme.findUnique({ where: { code: "default" } }),
    getTranslations("settings.commission"),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.rich("desc", { strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      </div>

      <CommissionForm
        defaultValues={{
          baseCommissionAmount: scheme?.baseCommissionAmount ?? 0,
          contractCommissionAmount: scheme?.contractCommissionAmount ?? 0,
          note: scheme?.note ?? "",
        }}
      />
    </div>
  );
}
