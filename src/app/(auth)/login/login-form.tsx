"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { loginAction, type AuthFormState } from "../actions";
import { AuthCard, FormAlert, PasswordInput, SubmitButton, authInput } from "../auth-ui";

export function LoginForm() {
  const t = useTranslations("auth.login");
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(loginAction, {});

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <form action={formAction} className="space-y-4">
        <FormAlert error={state.error} />

        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-foreground">
            {t("emailLabel")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t("emailPlaceholder")}
            required
            className={authInput}
          />
        </div>

        <PasswordInput name="password" label={t("passwordLabel")} placeholder={t("passwordPlaceholder")} autoComplete="current-password" />

        <SubmitButton pending={pending} label={t("submit")} pendingLabel={t("submitting")} />

        <div className="flex items-center justify-between pt-1">
          <Link href="/forgot-password" className="text-xs text-brand-600 hover:underline">
            {t("forgot")}
          </Link>
        </div>

        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">
          {t("firstTimeHint")}
        </p>
      </form>
    </AuthCard>
  );
}
