"use client";

import { useActionState, useState } from "react";
import { Copy, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { createGuestInvite, revokeGuestInvite, type GuestInviteState } from "../actions";

export type InviteData = {
  id: string;
  name: string;
  email: string;
  revokedAt: Date | null;
  lastAccessAt: Date | null;
};

export function GuestInviteManager({
  projectId,
  invites,
  baseUrl,
}: {
  projectId: string;
  invites: InviteData[];
  baseUrl: string;
}) {
  const t = useTranslations("projects.guestInvite");
  const locale = useLocale() as Locale;
  const [state, formAction, pending] = useActionState<GuestInviteState, FormData>(
    createGuestInvite.bind(null, projectId),
    {},
  );
  const [copied, setCopied] = useState(false);
  const input =
    "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  const fullLink = state.link ? `${baseUrl}${state.link}` : null;

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {invites.map((iv) => (
          <li key={iv.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{iv.name}</span>
              <span className="text-xs text-muted-foreground">{iv.email}</span>
              {iv.revokedAt ? <Badge tone="danger">{t("revoked")}</Badge> : <Badge tone="success">{t("active")}</Badge>}
              <span className="text-xs text-muted-foreground">
                {iv.lastAccessAt ? t("lastAccess", { date: formatDateTime(iv.lastAccessAt, locale) }) : t("neverAccessed")}
              </span>
            </span>
            {!iv.revokedAt && (
              <form action={revokeGuestInvite.bind(null, projectId, iv.id)}>
                <button type="submit" className="rounded-lg border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger-bg">
                  {t("revoke")}
                </button>
              </form>
            )}
          </li>
        ))}
        {invites.length === 0 && <li className="text-sm text-muted-foreground">{t("empty")}</li>}
      </ul>

      {fullLink && (
        <div className="rounded-lg border border-success/30 bg-success-bg p-3">
          <p className="text-xs font-medium text-success">{t("linkCreatedOnce")}</p>
          <div className="mt-1 flex items-center gap-2">
            <input readOnly value={fullLink} className={input + " flex-1 font-mono text-xs"} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(fullLink);
                setCopied(true);
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("copyHint")}</p>
        </div>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <input name="name" placeholder={t("inviteName")} className={input + " min-w-[140px] flex-1"} required />
        <input name="email" type="email" placeholder={t("inviteEmail")} className={input + " min-w-[160px] flex-1"} required />
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {t("createInvite")}
        </button>
      </form>
    </div>
  );
}
