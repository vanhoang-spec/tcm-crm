import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { CreateVendorForm, VendorRow } from "./vendor-forms";
import { requirePermission } from "@/lib/permissions";

export default async function SettingsVendorsPage() {
  await requirePermission("settings.vendors.manage");
  const [vendors, t] = await Promise.all([
    prisma.vendor.findMany({ orderBy: [{ isActive: "desc" }, { code: "asc" }] }),
    getTranslations("settings.vendors"),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <CreateVendorForm />

      <div className="space-y-3">
        {vendors.map((v) => (
          <VendorRow
            key={v.id}
            vendor={{
              id: v.id,
              code: v.code,
              name: v.name,
              category: v.category,
              contact: v.contact,
              phone: v.phone,
              email: v.email,
              taxCode: v.taxCode,
              isActive: v.isActive,
            }}
          />
        ))}
      </div>
    </div>
  );
}
