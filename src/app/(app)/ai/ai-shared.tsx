"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Copy, Check } from "lucide-react";

export const aiInput =
  "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
export const aiTextarea =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function ToolCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function RunButton({ pending, hasResult }: { pending: boolean; hasResult: boolean }) {
  const t = useTranslations("ai");
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
    >
      <Sparkles className="h-4 w-4" />
      {pending ? t("running") : hasResult ? t("rerun") : t("run")}
    </button>
  );
}

/**
 * Hiển thị kết quả AI. Cố ý KHÔNG render markdown thành HTML (repo chưa có thư viện markdown,
 * và render HTML từ nội dung model sinh ra là bề mặt tấn công không cần thiết) — dùng
 * `whitespace-pre-wrap` cho text thuần, vẫn đọc tốt và copy sang Word/Canva giữ nguyên định dạng.
 */
export function AiResult({ text, error }: { text?: string; error?: string }) {
  const t = useTranslations("ai");
  const [copied, setCopied] = useState(false);

  if (error) {
    return (
      <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (!text) {
    return <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{t("emptyResult")}</p>;
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{t("disclaimer")}</p>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <div className="mt-2 max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-4 text-sm leading-relaxed text-foreground">
        {text}
      </div>
    </div>
  );
}

export function NotConfiguredBanner() {
  const t = useTranslations("ai");
  return (
    <p className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2.5 text-sm text-warning">
      {t("notConfiguredBanner")}
    </p>
  );
}
