"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, CheckCircle2, Undo2, Save, RefreshCw } from "lucide-react";
import { saveMonthPlan, approveMonthPlan, reopenMonthPlan, suggestMonthPlan, type MonthState } from "./month-actions";

export type MonthView = {
  monthKey: string;
  label: string;
  theme: string;
  goals: string;
  note: string | null;
  status: string;
  approvedAt: string | null;
  approvedByName: string | null;
  itemCount: number;
  /** Số dòng còn PLANNED — đúng số dòng nút "Xoá đề xuất – Chạy lại" sẽ xoá. */
  plannedCount: number;
  /** Số tuần TƯƠNG LAI còn lại trong tháng; 0 thì AI không đề xuất được nữa. */
  futureWeeks: number;
  /** Số bài đã lên kế hoạch / chỉ tiêu, theo kênh. */
  counts: { channel: string; planned: number; target: number }[];
};

const input = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const btn = "inline-flex h-9 items-center gap-1 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";
const btnPrimary = "inline-flex h-9 items-center gap-1 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50";

const ERR: Record<string, string> = {
  BAD_MONTH: "errBadMonth",
  NO_THEME: "errNoTheme",
  NOT_FOUND: "errNotFound",
  ALREADY_APPROVED: "errAlreadyApproved",
  NO_ITEMS: "errNoItems",
  HAS_ITEMS: "errHasItems",
  LOCKED: "errMonthLocked",
  NO_GENERATE_PERM: "errNoGenerate",
  NO_FUTURE_WEEK: "errNoFutureWeek",
  AI_SHAPE: "errAiShape",
};

/**
 * Đầu trang kế hoạch: chủ đề tháng + nút AI đề xuất cả tháng + nút Duyệt.
 *
 * ⚠ Form chặn `reset` (React 19 xoá cả select/checkbox sau mỗi lần action chạy — HANDOVER 10.37).
 */
export function MonthPanel({ month, canReview, canGenerate, aiConfigured }: { month: MonthView; canReview: boolean; canGenerate: boolean; aiConfigured: boolean }) {
  const t = useTranslations("mkt.plan");
  const [save, saveAction, saving] = useActionState<MonthState, FormData>(saveMonthPlan, {});
  const [sug, sugAction, suggesting] = useActionState<MonthState, FormData>(suggestMonthPlan.bind(null, month.monthKey), {});
  const [apr, aprAction, approving] = useActionState<MonthState, FormData>(approveMonthPlan.bind(null, month.monthKey), {});
  const [reo, reoAction, reopening] = useActionState<MonthState, FormData>(reopenMonthPlan.bind(null, month.monthKey), {});
  const [theme, setTheme] = useState(month.theme);
  const [goals, setGoals] = useState(month.goals);
  const approved = month.status === "APPROVED";
  // Hết tuần tương lai thì AI không đề xuất được nữa (server cũng chặn) — nói thẳng thay vì để
  // người dùng bấm rồi nhận lỗi.
  const noFuture = month.futureWeeks === 0;

  const err = (s: MonthState) => (s.error ? t(ERR[s.error] ?? "errGeneric") : s.aiError ? s.aiError : null);

  return (
    <section className={"rounded-xl border bg-surface p-4 " + (approved ? "border-success/40" : "border-border")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("monthTitle", { month: month.label })}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("monthHint")}</p>
        </div>
        {approved ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("monthApproved", { at: month.approvedAt ?? "—", name: month.approvedByName ?? "—" })}
          </span>
        ) : (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">{t("monthDraft")}</span>
        )}
      </div>

      {/* Đối chiếu chỉ tiêu — HR thấy ngay tháng đã đủ bài chưa */}
      <div className="mt-2 flex flex-wrap gap-2">
        {month.counts.map((c) => {
          const okCount = c.planned >= c.target;
          return (
            <span key={c.channel} className={"rounded-lg border px-2 py-1 text-[11px] " + (okCount ? "border-success/40 text-success" : "border-warning/40 text-warning")}>
              {c.channel === "LINKEDIN" ? "LinkedIn" : "Fanpage"}: <b>{c.planned}</b>/{c.target} {t("postsWord")}
            </span>
          );
        })}
      </div>

      {canReview && (
        <>
          <form action={saveAction} onReset={(e) => e.preventDefault()} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="month" value={month.monthKey} />
            <label className="text-[11px] text-muted-foreground sm:col-span-2">
              {t("fTheme")}
              <input name="theme" value={theme} onChange={(e) => setTheme(e.target.value)} className={input + " mt-1"} placeholder={t("fThemePh")} required />
            </label>
            <label className="text-[11px] text-muted-foreground sm:col-span-2">
              {t("fGoals")}
              <textarea
                name="goals"
                rows={2}
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm outline-none focus:border-brand-400"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={saving} className={btn}>
                <Save className="h-3.5 w-3.5" /> {saving ? "…" : t("saveMonthBtn")}
              </button>
            </div>
          </form>

          {/* ⚠ Các form hành động phải nằm NGOÀI form lưu chủ đề: HTML cấm form lồng form, React ném
              "A React form was unexpectedly submitted" và nút bên trong KHÔNG gửi được (đúng bẫy đã
              trả giá ở MEET-2 — HANDOVER 10.39). */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
              {/* ⚠ Hai nút dùng CHUNG một action, khác nhau đúng ô ẩn `replace`. Cả hai gửi kèm
                  chủ đề + định hướng ĐANG GÕ trên màn hình (chưa bấm Lưu cũng có tác dụng) — đó là
                  yêu cầu "chạy lại phải dựa trên định hướng mới cập nhật". */}
              {!approved && canGenerate && (noFuture ? (
                <span className="text-[11px] text-warning">{t("errNoFutureWeek")}</span>
              ) : month.plannedCount > 0 ? (
                <form
                  action={sugAction}
                  onSubmit={(e) => {
                    if (!window.confirm(t("confirmRedoMonth", { n: month.plannedCount }))) e.preventDefault();
                  }}
                  className="inline"
                >
                  <input type="hidden" name="themeHint" value={theme} />
                  <input type="hidden" name="goalsHint" value={goals} />
                  <input type="hidden" name="replace" value="1" />
                  <button type="submit" disabled={suggesting || !aiConfigured} className={btnPrimary}>
                    <RefreshCw className="h-3.5 w-3.5" /> {suggesting ? t("suggesting") : t("redoMonthBtn")}
                  </button>
                </form>
              ) : (
                <form
                  action={sugAction}
                  onSubmit={(e) => {
                    if (month.itemCount > 0 || !window.confirm(t("confirmSuggestMonth"))) e.preventDefault();
                  }}
                  className="inline"
                >
                  <input type="hidden" name="themeHint" value={theme} />
                  <input type="hidden" name="goalsHint" value={goals} />
                  <button type="submit" disabled={suggesting || !aiConfigured || month.itemCount > 0} className={btnPrimary} title={month.itemCount > 0 ? t("suggestMonthHasItems") : ""}>
                    <Sparkles className="h-3.5 w-3.5" /> {suggesting ? t("suggesting") : t("suggestMonthBtn")}
                  </button>
                </form>
              ))}

              {!approved ? (
                <form action={aprAction} className="inline">
                  <button type="submit" disabled={approving || month.itemCount === 0} className="inline-flex h-9 items-center gap-1 rounded-lg bg-success px-4 text-xs font-semibold text-white disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {approving ? "…" : t("approveMonthBtn")}
                  </button>
                </form>
              ) : (
                <form action={reoAction} className="inline">
                  <button type="submit" disabled={reopening} className={btn}>
                    <Undo2 className="h-3.5 w-3.5" /> {reopening ? "…" : t("reopenMonthBtn")}
                  </button>
                </form>
              )}
          </div>

          <div className="mt-2 space-y-1">
            {[save, sug, apr, reo].map((st, i) =>
              err(st) ? (
                <p key={i} className="text-xs text-danger">
                  {err(st)}
                </p>
              ) : null,
            )}
            {(save.success || sug.success || apr.success || reo.success) && <p className="text-xs text-success">{t("saved")}</p>}
          </div>

              <p className="mt-2 text-[11px] text-muted-foreground">{approved ? t("approvedNote") : t("draftNote")}</p>
          {!approved && canGenerate && !noFuture && <p className="mt-1 text-[11px] text-muted-foreground">{t("futureOnlyNote", { n: month.futureWeeks })}</p>}
        </>
      )}
    </section>
  );
}
