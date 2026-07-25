"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateTimelineTemplate, type TimelineTemplateFormState } from "../actions";

const COLS = ["pic2", "accountable", "duration", "deadline", "qty", "unit", "status"] as const;

export function TimelineTemplateInfoForm({
  template,
  projectTypes,
}: {
  template: { id: string; name: string; projectTypeId: string | null; viewMode: string; isActive: boolean; columns: string[] };
  projectTypes: { id: string; label: string }[];
}) {
  const bound = updateTimelineTemplate.bind(null, template.id);
  const [state, formAction, pending] = useActionState<TimelineTemplateFormState, FormData>(bound, {});
  const t = useTranslations("settings.timelineTemplates");
  const tCommon = useTranslations("common");
  const colLabel: Record<string, string> = {
    pic2: t("colPic2"),
    accountable: t("colAccountable"),
    duration: t("colDuration"),
    deadline: t("colDeadline"),
    qty: t("colQty"),
    unit: t("colUnit"),
    status: t("colStatus"),
  };

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("templateName")}</label>
        <input
          name="name"
          defaultValue={template.name}
          className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        {state.fieldErrors?.name && <p className="mt-1 text-xs text-danger">{state.fieldErrors.name}</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("projectType")}</label>
          <select name="projectTypeId" defaultValue={template.projectTypeId ?? ""} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm">
            <option value="">{t("selectProjectType")}</option>
            {projectTypes.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("viewMode")}</label>
          <select name="viewMode" defaultValue={template.viewMode} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm">
            <option value="GANTT">{t("viewModeGantt")}</option>
            <option value="CHECKLIST">{t("viewModeChecklist")}</option>
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("columns")}</label>
        <div className="flex flex-wrap gap-3">
          {COLS.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" name="col" value={c} defaultChecked={template.columns.includes(c)} className="h-3.5 w-3.5 rounded border-border-strong" />
              {colLabel[c]}
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="isActive" defaultChecked={template.isActive} className="h-3.5 w-3.5 rounded border-border-strong" />
        {t("active")}
      </label>
      <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
        {pending ? tCommon("saving") : t("saveTemplateInfo")}
      </button>
    </form>
  );
}
