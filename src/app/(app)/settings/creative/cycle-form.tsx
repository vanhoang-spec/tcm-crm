"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveCreativeCycle, type CreativeSettingsState } from "./actions";
import { COST_REVIEW_CYCLES, type CostReviewCycle } from "@/lib/creative-cost";

export function CycleForm({ cycle }: { cycle: CostReviewCycle }) {
  const [state, formAction, pending] = useActionState<CreativeSettingsState, FormData>(saveCreativeCycle, {});
  const t = useTranslations("settings.creative");

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <select
        name="cycle"
        defaultValue={cycle}
        className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        {COST_REVIEW_CYCLES.map((c) => (
          <option key={c} value={c}>
            {t(`cycle.${c}`)}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
        {t("save")}
      </button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
      {state.success && <span className="text-xs text-success">{t("saved")}</span>}
    </form>
  );
}
