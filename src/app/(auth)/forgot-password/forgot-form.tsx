"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { forgotPasswordAction, type AuthFormState } from "../actions";
import { AuthCard, FormAlert, SubmitButton, authInput } from "../auth-ui";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot");
  const tLogin = useTranslations("auth.login");
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(forgotPasswordAction, {});

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <form action={formAction} className="space-y-4">
        <FormAlert error={state.error} success={state.success} />

        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-foreground">
            {tLogin("emailLabel")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={tLogin("emailPlaceholder")}
            required
            className={authInput}
          />
        </div>

        <SubmitButton pending={pending} label={t("submit")} pendingLabel={t("submitting")} />

        <Link href="/login" className="block pt-1 text-xs text-brand-600 hover:underline">
          {t("backToLogin")}
        </Link>
      </form>
    </AuthCard>
  );
}
