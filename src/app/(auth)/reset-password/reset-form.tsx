"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { resetPasswordAction, type AuthFormState } from "../actions";
import { AuthCard, FormAlert, PasswordInput, PasswordPolicyHint, SubmitButton } from "../auth-ui";

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const t = useTranslations("auth.reset");
  const tChange = useTranslations("auth.change");
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle", { email })}>
      <form action={formAction} className="space-y-4">
        <FormAlert error={state.error} />
        <input type="hidden" name="token" value={token} />

        <PasswordPolicyHint />
        <PasswordInput name="newPassword" label={tChange("newLabel")} autoComplete="new-password" />
        <PasswordInput name="confirmPassword" label={tChange("confirmLabel")} autoComplete="new-password" />

        <SubmitButton pending={pending} label={t("submit")} pendingLabel={tChange("submitting")} />
      </form>
    </AuthCard>
  );
}
