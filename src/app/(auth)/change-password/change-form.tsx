"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { changePasswordAction, type AuthFormState } from "../actions";
import { AuthCard, FormAlert, PasswordInput, PasswordPolicyHint, SubmitButton } from "../auth-ui";

export function ChangePasswordForm({ forced, reason }: { forced: boolean; reason: "firstLogin" | "reset" | "expired" }) {
  const t = useTranslations("auth.change");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(changePasswordAction, {});

  const reasonKey = reason === "firstLogin" ? "forcedFirstLogin" : reason === "expired" ? "forcedExpired" : "forcedReset";

  return (
    <AuthCard title={forced ? t("forcedTitle") : t("title")} subtitle={forced ? t(reasonKey) : undefined}>
      <form action={formAction} className="space-y-4">
        <FormAlert error={state.error} />

        <PasswordInput name="currentPassword" label={t("currentLabel")} autoComplete="current-password" />
        <PasswordPolicyHint />
        <PasswordInput name="newPassword" label={t("newLabel")} autoComplete="new-password" />
        <PasswordInput name="confirmPassword" label={t("confirmLabel")} autoComplete="new-password" />

        <SubmitButton pending={pending} label={t("submit")} pendingLabel={t("submitting")} />

        {!forced && (
          <Link href="/" className="block pt-1 text-xs text-brand-600 hover:underline">
            ← {tCommon("back")}
          </Link>
        )}
      </form>
    </AuthCard>
  );
}
