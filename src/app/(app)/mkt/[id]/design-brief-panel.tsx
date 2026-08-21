"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { generateDesignBrief } from "../ai-actions";
import type { MktState } from "../actions";

/**
 * MKT-2a — khối BRIEF CHO DESIGNER trên trang bài. Bài dựng từ master plan có brief sẵn (AI soạn
 * nền); bài tạo tay thì HR bấm nút. Brief là text thuần, render whitespace-pre-wrap.
 */
export function DesignBriefPanel({ postId, brief, canGenerate, aiConfigured }: { postId: string; brief: string | null; canGenerate: boolean; aiConfigured: boolean }) {
  const t = useTranslations("mkt");
  const [state, formAction, pending] = useActionState<MktState, FormData>(generateDesignBrief.bind(null, postId), {});

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("designBriefTitle")}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("designBriefHint")}</p>
        </div>
        {canGenerate && (
          <form
            action={formAction}
            onSubmit={(e) => {
              if (brief && !window.confirm(t("designBriefOverwriteConfirm"))) e.preventDefault();
            }}
          >
            <button
              type="submit"
              disabled={pending || !aiConfigured}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {pending ? t("designBriefWriting") : brief ? t("designBriefRewrite") : t("designBriefWrite")}
            </button>
          </form>
        )}
      </div>
      {state.error && <p className="mt-2 text-[11px] text-danger">{t(`err${state.error}` as "errGeneric")}</p>}
      {state.aiError && <p className="mt-2 text-[11px] text-danger">{state.aiError}</p>}
      {brief ? (
        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed text-foreground">{brief}</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{t("designBriefEmpty")}</p>
      )}
    </section>
  );
}
