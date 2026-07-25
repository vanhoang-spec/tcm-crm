"use client";

import { useActionState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { saveKpiParams, type KpiSettingsState } from "./actions";
import type { KpiParams } from "@/lib/kpi";

const input = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function ParamsForm({ params }: { params: KpiParams }) {
  const t = useTranslations("settings.kpi");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<KpiSettingsState, FormData>(saveKpiParams, {});

  const fields: { key: string; label: string; hint?: string; value: number; step?: number }[] = [
    { key: "pool_percent", label: t("poolPercent"), hint: t("poolPercentHint"), value: params.poolPercent, step: 1 },
    { key: "target_margin_pct", label: t("targetMarginPct"), value: params.targetMarginPct, step: 0.5 },
    { key: "floor_margin_pct", label: t("floorMarginPct"), value: params.floorMarginPct, step: 0.5 },
    { key: "floor_factor", label: t("floorFactor"), hint: t("floorFactorHint"), value: params.floorFactor, step: 0.05 },
    { key: "cap_factor", label: t("capFactor"), value: params.capFactor, step: 0.05 },
    { key: "empty_window_factor", label: t("emptyWindowFactor"), hint: t("emptyWindowFactorHint"), value: params.emptyWindowFactor, step: 0.05 },
    { key: "margin_window_months", label: t("marginWindowMonths"), value: params.marginWindowMonths, step: 1 },
  ];

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
            <NumberField decimals={2} name={f.key} defaultValue={f.value} className={input + " mt-1"} />
            {f.hint && <span className="mt-1 block text-[11px] text-muted-foreground">{f.hint}</span>}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
          {pending ? "..." : tCommon("save")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}
