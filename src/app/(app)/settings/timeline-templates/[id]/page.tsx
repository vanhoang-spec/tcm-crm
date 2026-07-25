import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { TimelineTemplateInfoForm } from "./template-info-form";
import { TimelineSectionEditor } from "./section-editor";
import { TimelineSectionCreateForm } from "./section-create-form";

export default async function TimelineTemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const template = await prisma.timelineTemplate.findUnique({
    where: { id },
    include: { sections: { orderBy: { sort: "asc" }, include: { items: { orderBy: { sort: "asc" } } } } },
  });
  if (!template) notFound();

  const [t, locale, projectTypeSet, departments] = await Promise.all([
    getTranslations("settings.timelineTemplates"),
    getLocale() as Promise<Locale>,
    prisma.optionSet.findUnique({ where: { code: "project_type" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);

  const departmentOptions = departments.map((d) => ({ code: d.code, name: d.name }));
  let columns: string[] = [];
  try {
    columns = template.columnsJson ? (JSON.parse(template.columnsJson) as string[]) : [];
  } catch {
    columns = [];
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/settings/timeline-templates" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{template.name}</h1>
      </div>

      <TimelineTemplateInfoForm
        template={{
          id: template.id,
          name: template.name,
          projectTypeId: template.projectTypeId,
          viewMode: template.viewMode,
          isActive: template.isActive,
          columns,
        }}
        projectTypes={(projectTypeSet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))}
      />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t("sectionsTitle")}</h2>
        <div className="space-y-3">
          {template.sections.map((s, idx) => (
            <TimelineSectionEditor
              key={s.id}
              templateId={template.id}
              departments={departmentOptions}
              section={{ id: s.id, code: s.code, nameVi: s.nameVi, nameEn: s.nameEn ?? "" }}
              items={s.items.map((it) => ({
                id: it.id,
                title: it.title,
                parentLabel: it.parentLabel ?? "",
                defaultDepartmentCode: it.defaultDepartmentCode ?? "",
                defaultDurationDays: it.defaultDurationDays,
                defaultUnit: it.defaultUnit ?? "",
                defaultQty: it.defaultQty,
              }))}
              isFirst={idx === 0}
              isLast={idx === template.sections.length - 1}
            />
          ))}
        </div>
        <div className="mt-3">
          <TimelineSectionCreateForm templateId={template.id} />
        </div>
      </div>
    </div>
  );
}
