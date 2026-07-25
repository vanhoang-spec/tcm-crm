"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveSalaryBudget, type CreativeSettingsState } from "./actions";

const input = "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function SalaryRow({
  positionTitle,
  periodCode,
  monthlySalary,
  headcountOverride,
  note,
}: {
  positionTitle: string;
  periodCode: string;
  monthlySalary: number;
  headcountOverride: number | null;
  note: string;
}) {
  const action = saveSalaryBudget.bind(null, positionTitle, periodCode);
  const [state, formAction, pending] = useActionState<CreativeSettingsState, FormData>(action, {});
  const t = useTranslations("settings.creative");

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[140px_1fr_110px_1fr_auto] sm:items-center"
    >
      <span className="text-sm font-medium text-foreground">{positionTitle}</span>
      <div>
        <input name="monthlySalary" type="number" min={0} step={100000} defaultValue={monthlySalary} placeholder={t("monthlySalary")} className={input + " w-full"} />
      </div>
      <input
        name="headcountOverride"
        type="number"
        min={0}
        defaultValue={headcountOverride ?? ""}
        placeholder={t("headcountLive")}
        className={input}
        title={t("headcountOverrideHint")}
      />
      <input name="note" defaultValue={note} placeholder={t("note")} className={input + " w-full"} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50">
          {pending ? "..." : t("save")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
