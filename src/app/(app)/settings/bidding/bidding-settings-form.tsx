"use client";

import { useActionState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { saveBiddingSettings, type BiddingSettingsState } from "./actions";

export function BiddingSettingsForm({
  minMargin,
  threshold,
  processingReminderDays,
  liquidationReminderDays,
  orderResponseDays,
}: {
  minMargin: number;
  threshold: number;
  processingReminderDays: number;
  liquidationReminderDays: number;
  orderResponseDays: number;
}) {
  const [state, formAction, pending] = useActionState<BiddingSettingsState, FormData>(saveBiddingSettings, {});
  const t = useTranslations("settings.bidding");

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("minMargin")}</label>
          <p className="mb-1 text-xs text-muted-foreground">{t("minMarginHint")}</p>
          <NumberField decimals={2} name="minMargin" defaultValue={minMargin} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("threshold")}</label>
          <p className="mb-1 text-xs text-muted-foreground">{t("thresholdHint")}</p>
          <NumberField name="threshold" defaultValue={threshold} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("processingReminder")}</label>
          <p className="mb-1 text-xs text-muted-foreground">{t("processingReminderHint")}</p>
          <NumberField
            name="processingReminderDays"
            defaultValue={processingReminderDays}
            className={input}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("liquidationReminder")}</label>
          <p className="mb-1 text-xs text-muted-foreground">{t("liquidationReminderHint")}</p>
          <NumberField
            name="liquidationReminderDays"
            defaultValue={liquidationReminderDays}
            className={input}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("orderResponseDays")}</label>
          <p className="mb-1 text-xs text-muted-foreground">{t("orderResponseDaysHint")}</p>
          <NumberField name="orderResponseDays" defaultValue={orderResponseDays} className={input} />
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

const input = "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
