"use client";

import { useActionState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { saveKpiCriterion, toggleKpiCriterion, type KpiSettingsState } from "./actions";

const input = "h-8 rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export type CriterionData = {
  id: string;
  code: string;
  nameVi: string;
  nameEn: string | null;
  appliesTo: string;
  weight: number;
  scaleMax: number;
  sourceType: string;
  isActive: boolean;
};

export const APPLIES_TO_OPTIONS = ["ALL", "ACCOUNT", "PLANNING", "CREATIVE", "OPE", "PRO", "LEAD"] as const;

export function CriterionRow({ criterion }: { criterion: CriterionData }) {
  const t = useTranslations("settings.kpi");
  const tCommon = useTranslations("common");
  const action = saveKpiCriterion.bind(null, criterion.id);
  const [state, formAction, pending] = useActionState<KpiSettingsState, FormData>(action, {});

  return (
    <form action={formAction} className={`grid grid-cols-1 items-center gap-2 rounded-lg border border-border p-2.5 sm:grid-cols-[1fr_1fr_130px_70px_70px_auto] ${criterion.isActive ? "" : "opacity-50"}`}>
      <div className="min-w-0">
        <input name="nameVi" defaultValue={criterion.nameVi} className={input + " w-full"} aria-label={t("fieldNameVi")} />
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
          {criterion.code}
          {criterion.sourceType === "AUTO" && <span className="ml-1 rounded bg-brand-100 px-1 font-semibold text-brand-700">AUTO</span>}
        </span>
      </div>
      <input name="nameEn" defaultValue={criterion.nameEn ?? ""} placeholder={t("fieldNameEn")} className={input + " w-full"} aria-label={t("fieldNameEn")} />
      <select name="appliesTo" defaultValue={criterion.appliesTo} className={input} aria-label={t("colAppliesTo")}>
        {APPLIES_TO_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {t(`appliesTo${o}`)}
          </option>
        ))}
      </select>
      <NumberField decimals={2} name="weight" defaultValue={criterion.weight} className={input} aria-label={t("colWeight")} />
      <NumberField name="scaleMax" defaultValue={criterion.scaleMax} className={input} aria-label={t("colScale")} />
      <div className="flex items-center gap-1.5">
        <button type="submit" disabled={pending} className="h-8 rounded-lg border border-border-strong px-2.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50">
          {pending ? "..." : tCommon("save")}
        </button>
        <button
          type="button"
          onClick={() => toggleKpiCriterion(criterion.id)}
          className={`h-8 rounded-lg px-2.5 text-xs font-medium ${criterion.isActive ? "border border-border-strong text-muted-foreground hover:bg-surface-2" : "bg-brand-500 text-white hover:bg-brand-600"}`}
        >
          {criterion.isActive ? t("activeOff") : t("activeOn")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

export function CriterionCreateForm() {
  const t = useTranslations("settings.kpi");
  const action = saveKpiCriterion.bind(null, null);
  const [state, formAction, pending] = useActionState<KpiSettingsState, FormData>(action, {});

  return (
    <form action={formAction} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-dashed border-border-strong p-2.5 sm:grid-cols-[110px_1fr_1fr_130px_70px_70px_auto]">
      <input name="code" placeholder={t("fieldCode")} required className={input + " w-full"} aria-label={t("fieldCode")} />
      <input name="nameVi" placeholder={t("fieldNameVi")} required className={input + " w-full"} aria-label={t("fieldNameVi")} />
      <input name="nameEn" placeholder={t("fieldNameEn")} className={input + " w-full"} aria-label={t("fieldNameEn")} />
      <select name="appliesTo" defaultValue="ALL" className={input} aria-label={t("colAppliesTo")}>
        {APPLIES_TO_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {t(`appliesTo${o}`)}
          </option>
        ))}
      </select>
      <NumberField decimals={2} name="weight" defaultValue={1} className={input} aria-label={t("colWeight")} />
      <NumberField name="scaleMax" defaultValue={5} className={input} aria-label={t("colScale")} />
      <div className="flex items-center gap-1.5">
        <button type="submit" disabled={pending} className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
          {pending ? "..." : t("addCriterion")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
