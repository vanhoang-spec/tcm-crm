"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveCommunicationSettings, type CommunicationSettingsState } from "./actions";

const input = "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function CommunicationSettingsForm({ superAdminTitles, pollSeconds }: { superAdminTitles: string; pollSeconds: number }) {
  const [state, formAction, pending] = useActionState<CommunicationSettingsState, FormData>(saveCommunicationSettings, {});
  const t = useTranslations("settings.communication");

  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-border bg-surface p-6">
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("superAdminTitles")}</label>
        <p className="mb-1 text-xs text-muted-foreground">{t("superAdminTitlesHint")}</p>
        <input name="superAdminTitles" defaultValue={superAdminTitles} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("pollSeconds")}</label>
        <p className="mb-1 text-xs text-muted-foreground">{t("pollSecondsHint")}</p>
        <input name="pollSeconds" type="number" min={2} max={60} defaultValue={pollSeconds} className={input} />
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
