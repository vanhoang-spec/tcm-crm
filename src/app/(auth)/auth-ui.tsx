"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";

/** Lớp input dùng chung — khớp quy ước form sẵn có trong app (xem settings/finance). */
export const authInput =
  "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

export function FormAlert({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  const danger = !!error;
  return (
    <p
      role="alert"
      className={
        danger
          ? "rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger"
          : "rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-sm text-success"
      }
    >
      {error ?? success}
    </p>
  );
}

/** Ô mật khẩu có nút hiện/ẩn — quan trọng khi bắt đặt mật khẩu phức tạp trên điện thoại. */
export function PasswordInput({
  name,
  label,
  placeholder,
  autoComplete,
}: {
  name: string;
  label: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  const t = useTranslations("auth.login");
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={shown ? "text" : "password"}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className={authInput + " pr-11"}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? t("hidePassword") : t("showPassword")}
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

/** Bảng nhắc yêu cầu mật khẩu — hiện cạnh form đặt/đổi mật khẩu. */
export function PasswordPolicyHint() {
  const t = useTranslations("auth.policy");
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <p className="text-xs font-medium text-foreground">{t("heading")}</p>
      <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
        <li>· {t("minLength", { n: PASSWORD_MIN_LENGTH })}</li>
        <li>· {t("variety")}</li>
        <li>· {t("noIdentity")}</li>
        <li>· {t("noCommon")}</li>
      </ul>
    </div>
  );
}

export function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
