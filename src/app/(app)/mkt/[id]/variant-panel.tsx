"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Copy, Check, Undo2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { MktChannel } from "@/lib/mkt";
import { saveFinal, markPosted, unmarkPosted, type MktState } from "../actions";
import { generateVariant } from "../ai-actions";

export type VariantView = {
  id: string;
  channel: MktChannel;
  status: string;
  aiDraft: string | null;
  finalContent: string;
  postedAt: Date | null;
  postUrl: string | null;
  postedByName: string | null;
};

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function useErr() {
  const t = useTranslations("mkt");
  return (code?: string) => (code ? t(`err${code}` as "errGeneric") : null);
}

export function VariantPanel({
  postId,
  variant,
  canReview,
  canGenerate,
  aiConfigured,
}: {
  postId: string;
  variant: VariantView;
  canReview: boolean;
  canGenerate: boolean;
  aiConfigured: boolean;
}) {
  const t = useTranslations("mkt");
  const err = useErr();
  const posted = variant.status === "POSTED";

  const [gen, genAction, genPending] = useActionState<MktState, FormData>(
    generateVariant.bind(null, postId, variant.channel),
    {},
  );
  const [saved, saveAction, savePending] = useActionState<MktState, FormData>(saveFinal.bind(null, variant.id), {});
  const [mark, markAction, markPending] = useActionState<MktState, FormData>(markPosted.bind(null, variant.id), {});
  const [unmark, unmarkAction, unmarkPending] = useActionState<MktState, FormData>(unmarkPosted.bind(null, variant.id), {});

  // Bản cuối là ô CHỮ → phải controlled (bẫy requestFormReset của React 19). Khi AI vừa viết xong,
  // prop `variant.finalContent` đổi nhưng state cũ vẫn đang giữ chữ cũ — dùng mẫu "điều chỉnh state
  // lúc render" để đồng bộ lại, KHÔNG dùng useEffect (eslint chặn setState trong effect).
  const [text, setText] = useState(variant.finalContent);
  const [seen, setSeen] = useState(variant.finalContent);
  if (seen !== variant.finalContent) {
    setSeen(variant.finalContent);
    setText(variant.finalContent);
  }

  const [copied, setCopied] = useState(false);
  const [showDraft, setShowDraft] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t(`variantTitle${variant.channel}` as "variantTitleLINKEDIN")}
        </h3>
        <span className={"text-[11px] font-medium " + (posted ? "text-success" : variant.aiDraft ? "text-warning" : "text-muted-foreground")}>
          {t(`status${variant.status}` as "statusDRAFT")}
        </span>
      </div>

      {/* ── Nút AI ── */}
      {canGenerate && !posted && (
        <div className="mt-3">
          {!aiConfigured ? (
            <p className="rounded-lg border border-dashed border-border-strong p-2 text-[11px] text-muted-foreground">
              {t("aiNotConfigured")}
            </p>
          ) : (
            <form
              action={genAction}
              onSubmit={(e) => {
                if (!window.confirm(t("aiWriteConfirm", { channel: t(`channel${variant.channel}` as "channelLINKEDIN") }))) {
                  e.preventDefault();
                }
              }}
            >
              <button
                type="submit"
                disabled={genPending}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-brand-400 px-3 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {genPending ? t("aiRunning") : t("aiWriteBtn")}
              </button>
              {err(gen.error) && <span className="ml-2 text-[11px] text-danger">{err(gen.error)}</span>}
              {gen.aiError && <span className="ml-2 text-[11px] text-danger">{gen.aiError}</span>}
            </form>
          )}
        </div>
      )}

      {/* ── Bản cuối ── */}
      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] text-muted-foreground">{t("finalLabel")}</label>
          <button
            type="button"
            onClick={copy}
            disabled={!text}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong px-2 text-[11px] hover:bg-surface-2 disabled:opacity-40"
          >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            {copied ? t("copied") : t("copy")}
          </button>
        </div>
        <form action={saveAction} className="mt-1 space-y-2">
          <textarea
            name="finalContent"
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={!canReview || posted}
            className="w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 read-only:bg-surface-2 read-only:text-muted-foreground"
          />
          {canReview && !posted && (
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savePending}
                className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {savePending ? "..." : t("save")}
              </button>
              {saved.success && <span className="text-[11px] text-success">{t("saved")}</span>}
              {err(saved.error) && <span className="text-[11px] text-danger">{err(saved.error)}</span>}
            </div>
          )}
        </form>
      </div>

      {/* ── Bản AI để đối chiếu ── */}
      {variant.aiDraft && variant.aiDraft !== variant.finalContent && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowDraft((v) => !v)} className="text-[11px] text-muted-foreground hover:underline">
            {showDraft ? "▾ " : "▸ "}
            {t("aiDraftTitle")}
          </button>
          {showDraft && (
            <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {variant.aiDraft}
            </pre>
          )}
        </div>
      )}

      {/* ── Đánh dấu đã đăng ── */}
      {canReview && (
        <div className="mt-3 border-t border-border pt-3">
          {!posted ? (
            <form
              action={markAction}
              onSubmit={(e) => {
                if (!window.confirm(t("markPostedConfirm"))) e.preventDefault();
              }}
              className="flex flex-wrap items-end gap-2"
            >
              <label className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                {t("postUrlLabel")}
                <input name="postUrl" placeholder="https://…" className={input} />
              </label>
              <button
                type="submit"
                disabled={markPending}
                className="h-9 rounded-lg bg-success px-3 text-xs font-medium text-white disabled:opacity-50"
              >
                {markPending ? "..." : t("markPosted")}
              </button>
              {err(mark.error) && <span className="text-[11px] text-danger">{err(mark.error)}</span>}
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {t("postedInfo", {
                  date: variant.postedAt ? formatDateTime(variant.postedAt) : "—",
                  name: variant.postedByName ?? "—",
                })}
              </span>
              {variant.postUrl && (
                <a href={variant.postUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-600 hover:underline">
                  {variant.postUrl}
                </a>
              )}
              <form
                action={unmarkAction}
                onSubmit={(e) => {
                  if (!window.confirm(t("unmarkConfirm"))) e.preventDefault();
                }}
              >
                <button
                  type="submit"
                  disabled={unmarkPending}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong px-2 text-[11px] hover:bg-surface-2 disabled:opacity-50"
                >
                  <Undo2 className="h-3 w-3" />
                  {t("unmarkPosted")}
                </button>
              </form>
              {err(unmark.error) && <span className="text-[11px] text-danger">{err(unmark.error)}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
