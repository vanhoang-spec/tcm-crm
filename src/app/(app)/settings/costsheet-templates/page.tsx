import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { TemplateCreateForm } from "./template-create-form";
import { requirePermission } from "@/lib/permissions";

export default async function CostsheetTemplatesPage() {
  await requirePermission("settings.templates.manage");
  const [t, locale, templates, projectTypeSet] = await Promise.all([
    getTranslations("settings.costsheetTemplates"),
    getLocale() as Promise<Locale>,
    prisma.costsheetTemplate.findMany({
      include: { projectType: true, _count: { select: { sections: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.optionSet.findUnique({ where: { code: "project_type" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
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

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface-2 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("colName")}</th>
              <th className="px-4 py-3">{t("colProjectType")}</th>
              <th className="px-4 py-3">{t("colSections")}</th>
              <th className="px-4 py-3">{t("colActive")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {templates.map((tp) => (
              <tr key={tp.id} className="hover:bg-surface-2/60">
                <td className="px-4 py-3 font-medium text-foreground">{tp.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{tp.projectType ? pickLabel(tp.projectType, locale) : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{tp._count.sections}</td>
                <td className="px-4 py-3">
                  <Badge tone={tp.isActive ? "success" : "neutral"}>{tp.isActive ? t("active") : "—"}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/settings/costsheet-templates/${tp.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                    {t("viewEdit")}
                  </Link>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">—</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <TemplateCreateForm projectTypes={(projectTypeSet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))} />
    </div>
  );
}
