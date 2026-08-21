"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { PlugZap, Unplug, CheckCircle2, AlertTriangle } from "lucide-react";
import { saveChannel, checkChannel, disconnectChannel, type ChannelState } from "./actions";

export type ChannelView = {
  channel: string;
  connected: boolean;
  targetId: string;
  targetName: string | null;
  isActive: boolean;
  tokenExpiresAt: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastError: string | null;
};

const input = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const btn = "inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";
const btnPrimary = "inline-flex h-9 items-center gap-1 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50";

const ERR: Record<string, string> = {
  NO_SECRET: "errNoSecret",
  BAD_CHANNEL: "errGeneric",
  NO_TARGET: "errNoTarget",
  BAD_URN: "errBadUrn",
  BAD_PAGE_ID: "errBadPageId",
  NO_TOKEN: "errNoToken",
  NO_CONNECTION: "errNoConnection",
  BAD_TOKEN: "errBadToken",
  AUTH: "errAuth",
  TEMP: "errTemp",
  BAD_REQUEST: "errBadRequest",
  NOT_CONFIGURED: "errNoSecret",
};

/**
 * ⚠ Ô TOKEN là `type="password"`, `autoComplete="off"`, và LUÔN TRỐNG khi mở trang — app không bao
 * giờ đọc ngược token ra. Để trống lúc sửa = giữ token cũ.
 * ⚠ Form chặn `reset` (React 19 xoá cả select/checkbox sau mỗi lần action chạy — HANDOVER 10.37).
 */
export function ChannelCard({ view, cryptoOn }: { view: ChannelView; cryptoOn: boolean }) {
  const t = useTranslations("settings.mktChannels");
  const [state, action, pending] = useActionState<ChannelState, FormData>(saveChannel, {});
  const [check, checkAction, checking] = useActionState<ChannelState, FormData>(checkChannel.bind(null, view.channel), {});
  const [targetId, setTargetId] = useState(view.targetId);
  const [expires, setExpires] = useState(view.tokenExpiresAt ?? "");
  const label = view.channel === "LINKEDIN" ? "LinkedIn" : "Facebook Fanpage";

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{view.channel === "LINKEDIN" ? t("liHint") : t("fbHint")}</p>
        </div>
        {view.connected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success">
            <PlugZap className="h-3.5 w-3.5" /> {t("connected")}
          </span>
        ) : (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">{t("notConnected")}</span>
        )}
      </div>

      {view.connected && (
        <div className="mt-2 space-y-1 rounded-lg border border-border bg-surface-2 p-2.5 text-[11px] text-muted-foreground">
          <p>{t("target", { name: view.targetName ?? "—", id: view.targetId })}</p>
          {view.tokenExpiresAt && <p>{t("expires", { date: view.tokenExpiresAt })}</p>}
          {view.lastCheckAt && (
            <p className={view.lastCheckOk ? "text-success" : "text-danger"}>
              {view.lastCheckOk ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : <AlertTriangle className="mr-1 inline h-3 w-3" />}
              {t("lastCheck", { at: view.lastCheckAt })}
              {!view.lastCheckOk && view.lastError ? ` — ${view.lastError}` : ""}
            </p>
          )}
          {!view.isActive && <p className="text-warning">{t("inactive")}</p>}
        </div>
      )}

      <form action={action} onReset={(e) => e.preventDefault()} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="channel" value={view.channel} />
        <label className="text-[11px] text-muted-foreground">
          {view.channel === "LINKEDIN" ? t("fOrgUrn") : t("fPageId")}
          <input name="targetId" value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder={view.channel === "LINKEDIN" ? "urn:li:organization:12345678" : "123456789012345"} className={input + " mt-1 font-mono"} required />
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("fExpires")}
          <input name="tokenExpiresAt" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={input + " mt-1"} />
          <span className="mt-0.5 block text-[11px]">{t("fExpiresHint")}</span>
        </label>
        <label className="text-[11px] text-muted-foreground sm:col-span-2">
          {t("fToken")}
          <input name="token" type="password" autoComplete="off" placeholder={view.connected ? t("fTokenKeep") : ""} className={input + " mt-1 font-mono"} />
          <span className="mt-0.5 block text-[11px] text-warning">{t("fTokenWarn")}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
          <input type="checkbox" name="isActive" defaultChecked={view.connected ? view.isActive : true} className="h-4 w-4" />
          {t("fActive")}
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending || !cryptoOn} className={btnPrimary}>
            {pending ? "…" : view.connected ? t("saveBtn") : t("connectBtn")}
          </button>
          {state.error && <span className="text-xs text-danger">{t(ERR[state.error] ?? "errGeneric")}</span>}
          {state.success && <span className="text-xs text-success">{t("saved")}</span>}
        </div>
      </form>

      {view.connected && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <form action={checkAction}>
            <button type="submit" disabled={checking} className={btn}>
              {checking ? "…" : t("testBtn")}
            </button>
          </form>
          {check.success && <span className="text-xs text-success">{t("testOk", { name: check.message ?? "" })}</span>}
          {check.error && (
            <span className="text-xs text-danger">
              {t(ERR[check.error] ?? "errGeneric")}
              {check.message ? ` — ${check.message}` : ""}
            </span>
          )}
          <form
            action={disconnectChannel.bind(null, view.channel)}
            onSubmit={(e) => {
              if (!window.confirm(t("confirmDisconnect"))) e.preventDefault();
            }}
            className="ml-auto"
          >
            <button type="submit" className={btn + " text-danger"}>
              <Unplug className="h-3.5 w-3.5" /> {t("disconnectBtn")}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
