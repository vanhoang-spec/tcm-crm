"use client";

import { useActionState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { saveClientsSettings, type ClientsSettingsState } from "./actions";

export function ClientsSettingsForm({
  activeDays,
  inactiveDays,
  kbPassPct,
}: {
  activeDays: number;
  inactiveDays: number;
  kbPassPct: number;
}) {
  const [state, formAction, pending] = useActionState<ClientsSettingsState, FormData>(saveClientsSettings, {});
  const t = useTranslations("settings.clients");

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("activeInterval")}</label>
          <p className="mb-1 text-xs text-muted-foreground">{t("activeIntervalHint")}</p>
          <NumberField name="activeDays" defaultValue={activeDays} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("inactiveInterval")}</label>
          <p className="mb-1 text-xs text-muted-foreground">{t("inactiveIntervalHint")}</p>
          <NumberField name="inactiveDays" defaultValue={inactiveDays} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("kbPassPct")}</label>
          <p className="mb-1 text-xs text-muted-foreground">{t("kbPassPctHint")}</p>
          <NumberField name="kbPassPct" defaultValue={kbPassPct} className={input} />
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {t("save")}
        </button>
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
        {state.success && <span className="text-sm text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

const input =
  "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
