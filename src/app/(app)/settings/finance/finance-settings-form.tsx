"use client";

import { useActionState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { saveFinanceSettings, type FinanceSettingsState } from "./actions";

const input = "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function FinanceSettingsForm({ maxCount, maxAmount }: { maxCount: number; maxAmount: number }) {
  const [state, formAction, pending] = useActionState<FinanceSettingsState, FormData>(saveFinanceSettings, {});
  const t = useTranslations("settings.finance");

  return (
    <form action={formAction} className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("advanceLimitsTitle")}</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">{t("maxCount")}</label>
            <p className="mb-1 text-xs text-muted-foreground">{t("maxCountHint")}</p>
            <NumberField name="maxCount" defaultValue={maxCount} className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">{t("maxAmount")}</label>
            <p className="mb-1 text-xs text-muted-foreground">{t("maxAmountHint")}</p>
            <NumberField name="maxAmount" defaultValue={maxAmount} className={input} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
          {t("save")}
        </button>
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
        {state.success && <span className="text-sm text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}
