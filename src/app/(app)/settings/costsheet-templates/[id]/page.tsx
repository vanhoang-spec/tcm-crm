import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { pickLabel, toNum } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { TemplateInfoForm } from "./template-info-form";
import { SectionEditor } from "./section-editor";
import { SectionCreateForm } from "./section-create-form";

export default async function CostsheetTemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const template = await prisma.costsheetTemplate.findUnique({
    where: { id },
    include: { sections: { orderBy: { sort: "asc" }, include: { lines: { orderBy: { sort: "asc" } } } } },
  });
  if (!template) notFound();

  const [t, locale, projectTypeSet, contractTypeSet] = await Promise.all([
    getTranslations("settings.costsheetTemplates"),
    getLocale() as Promise<Locale>,
    prisma.optionSet.findUnique({ where: { code: "project_type" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
    prisma.optionSet.findUnique({ where: { code: "contract_type" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/settings/costsheet-templates" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{template.name}</h1>
      </div>

      <TemplateInfoForm
        template={{
          id: template.id,
          name: template.name,
          projectTypeId: template.projectTypeId,
          contractTypeId: template.contractTypeId,
          isActive: template.isActive,
        }}
        projectTypes={(projectTypeSet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))}
        contractTypes={(contractTypeSet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))}
      />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t("sectionsTitle")}</h2>
        <div className="space-y-3">
          {template.sections.map((s, idx) => (
            <SectionEditor
              key={s.id}
              templateId={template.id}
              section={{
                id: s.id,
                code: s.code,
                icon: s.icon ?? "",
                nameVi: s.nameVi,
                nameEn: s.nameEn ?? "",
                colorSlot: s.colorSlot ?? "neutral",
                isProxy: s.isProxy,
                proxyFeeType: s.proxyFeeType,
                proxyFeeVal: s.proxyFeeVal,
              }}
              lines={s.lines.map((l) => ({
                id: l.id,
                itemName: l.itemName,
                lineType: l.lineType,
                defaultQty: l.defaultQty,
                defaultUnit: l.defaultUnit ?? "",
                defaultUnitPrice: toNum(l.defaultUnitPrice),
                fixedAmount: l.fixedAmount != null ? toNum(l.fixedAmount) : null,
                percentVal: l.percentVal,
                isLocked: l.isLocked,
                maxMarkupPct: l.maxMarkupPct,
              }))}
              isFirst={idx === 0}
              isLast={idx === template.sections.length - 1}
            />
          ))}
        </div>
        <div className="mt-3">
          <SectionCreateForm templateId={template.id} />
        </div>
      </div>
    </div>
  );
}
