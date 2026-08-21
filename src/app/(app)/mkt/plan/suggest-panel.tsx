"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Save, X } from "lucide-react";
import { MKT_CHANNELS } from "@/lib/mkt";
import { suggestPlan, savePlanItems, type PlanState } from "./actions";
import type { Option, WeekView } from "./plan-board";

type Row = { include: boolean; weekStart: string; title: string; keyPoints: string; channels: string[]; contentTypeId: string };

const input = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const btn = "inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50";
const btnPrimary = "inline-flex h-8 items-center gap-1 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50";

/**
 * AI đề xuất kế hoạch N tuần → bảng cho HR sửa/bỏ từng dòng → "Lưu vào kế hoạch".
 *
 * ⚠ Kết quả AI chỉ nằm trong state của panel này cho tới khi bấm Lưu — rời trang là mất, đúng như
 * mọi đường AI khác của repo (AI trả về form, người duyệt rồi mới ghi).
 * ⚠ Danh sách dòng đồng bộ từ `state.suggestions` bằng mẫu "điều chỉnh state lúc render", chốt theo
 * CHÍNH mảng suggestions chứ không theo identity của state (bài học MEET-2, HANDOVER 10.39).
 */
export function SuggestPanel({ weeks, contentTypes, aiConfigured }: { weeks: WeekView[]; contentTypes: Option[]; aiConfigured: boolean }) {
  const t = useTranslations("mkt.plan");
  const [sug, suggestAction, suggesting] = useActionState<PlanState, FormData>(suggestPlan, {});
  const [save, saveAction, saving] = useActionState<PlanState, FormData>(savePlanItems, {});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [seenSug, setSeenSug] = useState<PlanState["suggestions"]>(undefined);

  if (sug.suggestions && sug.suggestions !== seenSug) {
    setSeenSug(sug.suggestions);
    setRows(
      sug.suggestions.map((s) => ({ include: true, weekStart: s.weekStart, title: s.title, keyPoints: s.keyPoints, channels: [...s.channels], contentTypeId: s.contentTypeId ?? "" })),
    );
  }
  const [savedOnce, setSavedOnce] = useState(false);
  if (save.success && !savedOnce) {
    setSavedOnce(true);
    setRows(null);
  } else if (!save.success && savedOnce) setSavedOnce(false);

  const update = (i: number, patch: Partial<Row>) => setRows((prev) => (prev ? prev.map((r, j) => (j === i ? { ...r, ...patch } : r)) : prev));
  const picked = rows?.filter((r) => r.include && r.title.trim() && r.channels.length > 0) ?? [];
  const fromWeek = (weeks.find((w) => !w.isDue) ?? weeks[0])?.key ?? "";

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("suggestTitle")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("suggestHint")}</p>
        </div>
        <form
          action={suggestAction}
          onSubmit={(e) => {
            if (!window.confirm(t("confirmSuggest"))) e.preventDefault();
          }}
        >
          <input type="hidden" name="fromWeek" value={fromWeek} />
          <button type="submit" disabled={suggesting || !aiConfigured} className={btnPrimary} title={aiConfigured ? "" : t("aiOff")}>
            <Sparkles className="h-3.5 w-3.5" /> {suggesting ? t("suggesting") : t("suggestBtn")}
          </button>
        </form>
      </div>
      {sug.error && <p className="mt-2 text-xs text-danger">{t(sug.error === "NO_GENERATE_PERM" ? "errNoGenerate" : sug.error === "AI_SHAPE" ? "errAiShape" : "errGeneric")}</p>}
      {sug.aiError && <p className="mt-2 text-xs text-danger">{sug.aiError}</p>}
      {save.success && !rows && <p className="mt-2 text-xs text-success">{t("suggestSaved")}</p>}

      {rows && (
        <form action={saveAction} onReset={(e) => e.preventDefault()} className="mt-3 space-y-3">
          <input type="hidden" name="itemsJson" value={JSON.stringify(picked.map(({ include: _i, ...r }) => r))} />
          <p className="text-xs text-muted-foreground">{t("suggestReview", { n: rows.length })}</p>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className={"rounded-lg border p-3 " + (r.include ? "border-border" : "border-dashed border-border-strong opacity-60")}>
                <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_1fr]">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} className="h-4 w-4" />
                    {t("includeRow")}
                  </label>
                  <select value={r.weekStart} onChange={(e) => update(i, { weekStart: e.target.value })} className={input}>
                    {weeks
                      .filter((w) => !w.isDue || w.key === r.weekStart)
                      .map((w) => (
                        <option key={w.key} value={w.key}>
                          {w.label}
                        </option>
                      ))}
                  </select>
                  <select value={r.contentTypeId} onChange={(e) => update(i, { contentTypeId: e.target.value })} className={input}>
                    <option value="">{t("noContentType")}</option>
                    {contentTypes.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap items-center gap-3">
                    {MKT_CHANNELS.map((ch) => (
                      <label key={ch} className="flex items-center gap-1 text-xs text-foreground">
                        <input
                          type="checkbox"
                          checked={r.channels.includes(ch)}
                          onChange={(e) => update(i, { channels: e.target.checked ? [...r.channels, ch] : r.channels.filter((x) => x !== ch) })}
                          className="h-3.5 w-3.5"
                        />
                        {ch === "LINKEDIN" ? "LinkedIn" : "Fanpage"}
                      </label>
                    ))}
                  </div>
                </div>
                <input value={r.title} onChange={(e) => update(i, { title: e.target.value })} className={input + " mt-2 font-medium"} />
                <textarea
                  value={r.keyPoints}
                  onChange={(e) => update(i, { keyPoints: e.target.value })}
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-border-strong bg-surface p-2 text-xs leading-relaxed outline-none focus:border-brand-400"
                />
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving || picked.length === 0} className={btnPrimary}>
              <Save className="h-3.5 w-3.5" /> {saving ? "…" : t("saveSuggestBtn", { n: picked.length })}
            </button>
            <button type="button" onClick={() => setRows(null)} className={btn}>
              <X className="h-3.5 w-3.5" /> {t("discardBtn")}
            </button>
            {save.error && <span className="text-xs text-danger">{t("errGeneric")}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
