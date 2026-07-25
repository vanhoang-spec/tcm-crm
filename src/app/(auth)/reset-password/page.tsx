import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { consumeResetTokenLookup } from "@/lib/auth-session";
import { AuthCard } from "../auth-ui";
import { ResetPasswordForm } from "./reset-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const [tErr, tReset, tForgot] = await Promise.all([
    getTranslations("auth.errors"),
    getTranslations("auth.reset"),
    getTranslations("auth.forgot"),
  ]);

  const record = token ? await consumeResetTokenLookup(token) : null;

  if (!record) {
    return (
      <AuthCard title={tReset("title")}>
        <p className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {token ? tErr("tokenExpired") : tErr("tokenInvalid")}
        </p>
        <Link href="/forgot-password" className="mt-4 block text-xs text-brand-600 hover:underline">
          {tForgot("title")}
        </Link>
      </AuthCard>
    );
  }

  return <ResetPasswordForm token={token!} email={record.staff.email} />;
}
