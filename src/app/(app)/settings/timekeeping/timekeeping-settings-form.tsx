"use client";

import { useActionState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { saveTimekeepingSettings, type TimekeepingSettingsState } from "./actions";

const input =
  "h-9 w-full max-w-xs rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function TimekeepingSettingsForm({
  standardWeekHours,
  annualLeaveDays,
  carryoverDeadline,
}: {
  standardWeekHours: number;
  annualLeaveDays: number;
  carryoverDeadline: string;
}) {
  const [state, formAction, pending] = useActionState<TimekeepingSettingsState, FormData>(saveTimekeepingSettings, {});
  const t = useTranslations("settings.timekeeping");

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <label className="block space-y-1 text-sm font-medium text-foreground">
        {t("weekHours")}
        <NumberField name="standardWeekHours" defaultValue={standardWeekHours} className={input} />
        <span className="block text-xs font-normal text-muted-foreground">{t("weekHoursHint")}</span>
      </label>
      <label className="block space-y-1 text-sm font-medium text-foreground">
        {t("annualLeaveDays")}
        <NumberField name="annualLeaveDays" defaultValue={annualLeaveDays} className={input} />
        <span className="block text-xs font-normal text-muted-foreground">{t("annualLeaveDaysHint")}</span>
      </label>
      <label className="block space-y-1 text-sm font-medium text-foreground">
        {t("carryoverDeadline")}
        <input name="carryoverDeadline" defaultValue={carryoverDeadline} placeholder="03-31" className={input + " font-mono"} />
        <span className="block text-xs font-normal text-muted-foreground">{t("carryoverDeadlineHint")}</span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : t("save")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}
