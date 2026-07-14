"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateTeam, type SettingsFormState } from "./actions";

export function TeamRow({ team }: { team: { id: string; code: string; name: string; isActive: boolean } }) {
  const action = updateTeam.bind(null, team.id);
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(action, {});
  const t = useTranslations("settings.teams");
  const tCommon = useTranslations("common");

  return (
    <form action={formAction} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[100px_1fr_100px_auto] sm:items-center">
      <input
        name="code"
        defaultValue={team.code}
        maxLength={10}
        className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm uppercase outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <input
        name="name"
        defaultValue={team.name}
        className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="isActive" defaultChecked={team.isActive} className="h-3.5 w-3.5 rounded border-border-strong" />
        {t("active")}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          {pending ? "..." : tCommon("save")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
