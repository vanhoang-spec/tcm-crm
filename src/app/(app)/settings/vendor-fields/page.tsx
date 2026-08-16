import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { parseOptions } from "@/lib/vendor-fields";
import { VendorFieldCreateForm, VendorFieldRow } from "./field-forms";

/**
 * PUR-2 — Trường tuỳ chỉnh của hồ sơ NCC. Gác `settings.vendors.manage` (BGĐ + PUR Manager) —
 * đây là danh mục cấu hình, không phải thao tác nhập hồ sơ hằng ngày.
 */
export default async function SettingsVendorFieldsPage() {
  await requirePermission("settings.vendors.manage");
  const [defs, t] = await Promise.all([
    prisma.vendorFieldDef.findMany({ orderBy: [{ isActive: "desc" }, { sort: "asc" }, { createdAt: "asc" }] }),
    getTranslations("settings.vendorFields"),
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
        <p className="mt-1 text-xs text-muted-foreground">
          <Link href="/purchasing/vendors" className="text-brand-600 hover:underline">
            {t("goVendors")}
          </Link>
        </p>
      </div>

      <div className="space-y-3">
        {defs.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {defs.map((d) => (
          <VendorFieldRow
            key={d.id}
            def={{
              id: d.id,
              key: d.key,
              labelVi: d.labelVi,
              labelEn: d.labelEn,
              type: d.type,
              options: parseOptions(d.optionsJson),
              hint: d.hint,
              required: d.required,
              sort: d.sort,
              isActive: d.isActive,
            }}
          />
        ))}
        <VendorFieldCreateForm />
      </div>
    </div>
  );
}
