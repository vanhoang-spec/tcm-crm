"use client";

import { useActionState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { updateCommissionScheme, type SettingsFormState } from "./actions";

export function CommissionForm({
  defaultValues,
}: {
  defaultValues: { baseCommissionAmount: number; contractCommissionAmount: number; note: string };
}) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(updateCommissionScheme, {});
  const t = useTranslations("settings.commission");
  const tCommon = useTranslations("common");

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">
            {t("baseLabel")} <span className="text-danger">*</span>
          </label>
          <p className="mb-1 text-xs text-muted-foreground">{t("baseHint")}</p>
          <NumberField
            name="baseCommissionAmount"
            defaultValue={defaultValues.baseCommissionAmount}
            className="h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">
            {t("contractLabel")} <span className="text-danger">*</span>
          </label>
          <p className="mb-1 text-xs text-muted-foreground">{t("contractHint")}</p>
          <NumberField
            name="contractCommissionAmount"
            defaultValue={defaultValues.contractCommissionAmount}
            className="h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("note")}</label>
        <textarea
          name="note"
          defaultValue={defaultValues.note}
          rows={2}
          className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {pending ? tCommon("saving") : t("save")}
        </button>
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
        {state.success && <span className="text-sm text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}
