"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateTemplate, type TemplateFormState } from "../actions";

export function TemplateInfoForm({
  template,
  projectTypes,
  contractTypes,
}: {
  template: { id: string; name: string; projectTypeId: string | null; contractTypeId: string | null; isActive: boolean };
  projectTypes: { id: string; label: string }[];
  contractTypes: { id: string; label: string }[];
}) {
  const bound = updateTemplate.bind(null, template.id);
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(bound, {});
  const t = useTranslations("settings.costsheetTemplates");
  const tCommon = useTranslations("common");

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
          <label className="mb-1 block text-xs font-medium text-foreground">{t("contractType")}</label>
          <select name="contractTypeId" defaultValue={template.contractTypeId ?? ""} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm">
            <option value="">{t("selectContractType")}</option>
            {contractTypes.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
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
