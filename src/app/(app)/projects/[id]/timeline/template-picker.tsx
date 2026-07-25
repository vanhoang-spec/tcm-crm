"use client";

import { useTranslations } from "next-intl";
import { applyTimelineTemplate } from "../../actions";

type Tpl = { id: string; name: string; viewMode: string; matches: boolean };

export function TemplatePicker({ projectId, templates }: { projectId: string; templates: Tpl[] }) {
  const t = useTranslations("projects.timeline");
  if (templates.length === 0) return <p className="text-xs text-muted-foreground">{t("noTemplate")}</p>;

  return (
    <form action={applyTimelineTemplate.bind(null, projectId)} className="flex flex-wrap items-center gap-2">
      <select
        name="templateId"
        required
        defaultValue=""
        className="h-9 rounded-lg border border-border-strong bg-surface px-2 text-sm outline-none focus:border-brand-400"
      >
        <option value="" disabled>
          {t("selectTemplate")}
        </option>
        {templates.map((tp) => (
          <option key={tp.id} value={tp.id}>
            {tp.matches ? "★ " : ""}
            {tp.name} · {tp.viewMode === "CHECKLIST" ? t("viewModeChecklist") : t("viewModeGantt")}
          </option>
        ))}
      </select>
      <button type="submit" className="h-9 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600">
        {t("applyTemplate")}
      </button>
      <p className="w-full text-[11px] text-muted-foreground">{t("applyTemplateHint")}</p>
    </form>
  );
}
