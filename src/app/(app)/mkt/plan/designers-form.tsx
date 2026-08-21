"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveDesigners, type PlanState } from "./actions";

export type DesignerOption = { id: string; name: string; title: string | null; dept: string | null; checked: boolean };

/** Ai nhận brief thiết kế khi bài được dựng — tick theo người, lưu vào setting `mkt.designer_staff_ids`. */
export function DesignersForm({ options }: { options: DesignerOption[] }) {
  const t = useTranslations("mkt.plan");
  const [state, action, pending] = useActionState<PlanState, FormData>(saveDesigners, {});
  const none = !options.some((o) => o.checked);

  return (
    <form action={action} onReset={(e) => e.preventDefault()} className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("designersTitle")}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("designersHint")}</p>
      {none && <p className="mt-1 text-xs text-warning">{t("designersNone")}</p>}
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface-2">
            <input type="checkbox" name="designerId" value={o.id} defaultChecked={o.checked} className="h-4 w-4" />
            <span className="min-w-0 flex-1 truncate text-foreground">{o.name}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{[o.title, o.dept].filter(Boolean).join(" · ")}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50">
          {pending ? "…" : t("saveBtn")}
        </button>
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}
