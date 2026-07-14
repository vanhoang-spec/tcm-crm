"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createTemplate, type TemplateFormState } from "./actions";

export function TemplateCreateForm({ projectTypes }: { projectTypes: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(createTemplate, {});
  const t = useTranslations("settings.costsheetTemplates");
  const tCommon = useTranslations("common");

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-dashed border-border-strong bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("addTemplate")}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <input
            name="name"
            placeholder={t("templateNamePlaceholder")}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {state.fieldErrors?.name && <p className="mt-1 text-xs text-danger">{state.fieldErrors.name}</p>}
        </div>
        <select name="projectTypeId" className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm">
          <option value="">{t("selectProjectType")}</option>
          {projectTypes.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
        {pending ? tCommon("saving") : t("addTemplate")}
      </button>
    </form>
  );
}
