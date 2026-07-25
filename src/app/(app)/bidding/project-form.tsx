"use client";

import { useActionState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { PENDING_TEAM_ASSIGNMENT } from "@/lib/validators/project";
import type { ProjectFormState } from "./actions";

type Option = { id: string; label: string };

type ComplexityOption = { id: string; code: string; label: string };

export function ProjectForm({
  action,
  clients,
  teams,
  staff,
  projectTypes,
  complexities,
  channels,
  defaultValues,
  submitLabel,
}: {
  action: (state: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  clients: Option[];
  teams: Option[];
  staff: Option[];
  projectTypes: Option[];
  complexities: ComplexityOption[];
  channels: Option[];
  defaultValues?: {
    name?: string;
    clientId?: string;
    ownerTeamId?: string;
    ownerId?: string;
    briefLinkUrl?: string;
    projectTypeId?: string;
    complexityId?: string;
    budget?: number;
    channelId?: string;
    scope?: string;
    venue?: string;
  };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(action, {});
  const t = useTranslations("bidding.new");
  const tComplex = useTranslations("bidding.complexity");
  const tCommon = useTranslations("common");

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</div>
      )}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("name")} error={state.fieldErrors?.name} required className="sm:col-span-2">
          <input name="name" defaultValue={defaultValues?.name} placeholder={t("namePlaceholder")} className={inputClass(!!state.fieldErrors?.name)} />
        </Field>

        <Field label={t("client")} error={state.fieldErrors?.clientId} required>
          <SearchableSelect
            name="clientId"
            defaultValue={defaultValues?.clientId}
            placeholder={t("selectClient")}
            hasError={!!state.fieldErrors?.clientId}
            options={clients.map((c) => ({ value: c.id, label: c.label }))}
          />
        </Field>

        <Field label={t("ownerTeam")} error={state.fieldErrors?.ownerTeamId} required>
          <select name="ownerTeamId" defaultValue={defaultValues?.ownerTeamId} className={inputClass(!!state.fieldErrors?.ownerTeamId)}>
            <option value="">{t("selectTeam")}</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>{tm.label}</option>
            ))}
            <option value={PENDING_TEAM_ASSIGNMENT}>{t("ownerTeamPending")}</option>
          </select>
        </Field>

        <Field label={t("owner")} error={state.fieldErrors?.ownerId}>
          <SearchableSelect
            name="ownerId"
            defaultValue={defaultValues?.ownerId ?? ""}
            placeholder={t("selectOwner")}
            options={staff.map((s) => ({ value: s.id, label: s.label }))}
          />
        </Field>

        <Field label={t("briefLink")} error={state.fieldErrors?.briefLinkUrl} required className="sm:col-span-2">
          <input
            name="briefLinkUrl"
            type="url"
            defaultValue={defaultValues?.briefLinkUrl}
            placeholder={t("briefLinkPlaceholder")}
            className={inputClass(!!state.fieldErrors?.briefLinkUrl)}
          />
        </Field>

        <Field label={t("projectType")} error={state.fieldErrors?.projectTypeId} required>
          <select name="projectTypeId" defaultValue={defaultValues?.projectTypeId} className={inputClass(!!state.fieldErrors?.projectTypeId)}>
            <option value="">{t("selectType")}</option>
            {projectTypes.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </Field>

        <Field label={t("complexity")} error={state.fieldErrors?.complexityId} required className="sm:col-span-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {complexities.map((c) => {
              const hintKey = `${c.code.toLowerCase()}Hint`;
              return (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-border-strong p-2.5 text-sm has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="complexityId"
                    value={c.id}
                    defaultChecked={
                      defaultValues?.complexityId ? defaultValues.complexityId === c.id : c.code === "SIMPLE"
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-foreground">{c.label}</span>
                    <span className="block text-xs text-muted-foreground">{tComplex(hintKey)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </Field>

        <Field label={t("budget")} error={state.fieldErrors?.budget} hint={t("budgetHint")}>
          <NumberField name="budget" defaultValue={defaultValues?.budget} className={inputClass(false)} />
        </Field>

        <Field label={t("channel")} error={state.fieldErrors?.channelId}>
          <select name="channelId" defaultValue={defaultValues?.channelId ?? ""} className={inputClass(false)}>
            <option value="">{t("selectChannel")}</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>

        <Field label={t("scope")} error={state.fieldErrors?.scope}>
          <input name="scope" defaultValue={defaultValues?.scope} className={inputClass(false)} />
        </Field>

        <Field label={t("venue")} error={state.fieldErrors?.venue}>
          <input name="venue" defaultValue={defaultValues?.venue} className={inputClass(false)} />
        </Field>
      </fieldset>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : submitLabel}
        </Button>
        <span className="text-xs text-muted-foreground">{t("codeAuto")}</span>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-foreground">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return cn(
    "h-10 w-full rounded-lg border bg-surface px-3 text-sm outline-none focus:ring-2",
    hasError ? "border-danger focus:border-danger focus:ring-danger/20" : "border-border-strong focus:border-brand-400 focus:ring-brand-100",
  );
}
