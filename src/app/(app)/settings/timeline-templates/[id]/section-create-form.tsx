"use client";

import { useTranslations } from "next-intl";
import { createTimelineSection } from "../actions";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function TimelineSectionCreateForm({ templateId }: { templateId: string }) {
  const t = useTranslations("settings.timelineTemplates");
  return (
    <form action={createTimelineSection.bind(null, templateId)} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border-strong bg-surface p-4">
      <label className="text-xs text-muted-foreground">
        {t("sectionCode")}
        <input name="code" className={input + " w-32"} />
      </label>
      <label className="min-w-[160px] flex-1 text-xs text-muted-foreground">
        {t("sectionNameVi")}
        <input name="nameVi" className={input} required />
      </label>
      <label className="min-w-[160px] flex-1 text-xs text-muted-foreground">
        {t("sectionNameEn")}
        <input name="nameEn" className={input} />
      </label>
      <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-medium text-white hover:bg-brand-600">
        {t("addSection")}
      </button>
    </form>
  );
}
