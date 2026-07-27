"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateDefaultPassword, type SecurityFormState } from "./actions";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function DefaultPasswordForm({ isStillFactoryDefault }: { isStillFactoryDefault: boolean }) {
  const t = useTranslations("settings.security");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<SecurityFormState, FormData>(updateDefaultPassword, {});

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("defaultPasswordTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("defaultPasswordHint")}</p>
      </div>

      {isStillFactoryDefault && (
        <p className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning" role="alert">
          {t("stillFactoryDefault")}
        </p>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          {t("newPassword")}
          <input name="defaultPassword" type="password" autoComplete="new-password" required className={input} />
        </label>
        <label className="text-xs text-muted-foreground">
          {t("confirmPassword")}
          <input name="confirmPassword" type="password" autoComplete="new-password" required className={input} />
        </label>
        {state.error && (
          <p className="text-xs text-danger sm:col-span-2" role="alert">
            {state.error}
          </p>
        )}
        {state.success && <p className="text-xs text-success sm:col-span-2">{t("saved")}</p>}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {pending ? "..." : tCommon("save")}
          </button>
        </div>
      </form>
    </div>
  );
}
