"use client";

import { useActionState, useTransition } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { saveKpiScores, closeKpiPeriod, reopenKpiPeriod, type KpiActionState } from "./actions";

const cellInput = "h-8 w-16 rounded-lg border border-border-strong bg-surface px-2 text-center text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:opacity-50";

export type MatrixCriterion = { id: string; label: string; scaleMax: number; isAuto: boolean; isLead: boolean; weight: number };
export type MatrixMember = { staffId: string; fullName: string; scores: Record<string, number>; auto: Record<string, number> };

/** Bulk matrix chấm điểm 1 pool — pattern `score_<staffId>_<criterionId>` (mirror ratio-matrix-form). */
export function ScoreMatrixForm({
  poolKey,
  periodCode,
  criteria,
  members,
  closed,
}: {
  poolKey: string;
  periodCode: string;
  criteria: MatrixCriterion[];
  members: MatrixMember[];
  closed: boolean;
}) {
  const t = useTranslations("kpi");
  const action = saveKpiScores.bind(null, poolKey, periodCode);
  const [state, formAction, pending] = useActionState<KpiActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-2">
      <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface text-left text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-2">{t("colStaff")}</th>
              {criteria.map((c) => (
                <th key={c.id} className="px-1 py-1.5 text-center">
                  <span className="block max-w-[90px] truncate" title={c.label}>
                    {c.label}
                  </span>
                  <span className="font-normal text-muted-foreground">
                    /{c.scaleMax} ×{c.weight}
                    {c.isAuto && <span className="ml-1 rounded bg-brand-100 px-1 font-semibold text-brand-700">{t("autoBadge")}</span>}
                    {c.isLead && <span className="ml-1 rounded bg-surface-2 px-1">{t("leadBadge")}</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => (
              <tr key={m.staffId}>
                <td className="py-1.5 pr-2 font-medium text-foreground">{m.fullName}</td>
                {criteria.map((c) => {
                  const saved = m.scores[c.id];
                  const auto = m.auto[c.id];
                  return (
                    <td key={c.id} className="px-1 py-1 text-center">
                      <NumberField decimals={2}
                        name={`score_${m.staffId}_${c.id}`}
                        defaultValue={saved ?? auto ?? ""}
                        placeholder={auto != null ? String(auto) : ""}
                        disabled={closed}
                        className={cellInput}
                        aria-label={`${m.fullName} — ${c.label}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!closed && (
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {pending ? "..." : t("saveScores")}
          </button>
          {state.error && <span className="text-xs text-danger">{state.error}</span>}
          {state.success && <span className="text-xs text-success">{t("scoresSaved")}</span>}
        </div>
      )}
    </form>
  );
}

/** Nút Chốt kỳ (submit toàn bộ pool OPEN) + Mở lại kỳ. */
export function ClosePeriodControls({ periodCode, hasClosed, blocked }: { periodCode: string; hasClosed: boolean; blocked: boolean }) {
  const t = useTranslations("kpi");
  const action = closeKpiPeriod.bind(null, periodCode);
  const [state, formAction, pending] = useActionState<KpiActionState, FormData>(action, {});
  const [reopenPending, startReopen] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending || blocked}
          title={blocked ? t("closeBlocked") : undefined}
          className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {pending ? "..." : t("closePeriod")}
        </button>
      </form>
      {hasClosed && (
        <button
          type="button"
          disabled={reopenPending}
          onClick={() => startReopen(() => reopenKpiPeriod(periodCode))}
          className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          {reopenPending ? "..." : t("reopenPeriod")}
        </button>
      )}
      {blocked && <span className="text-xs text-warning">{t("closeBlocked")}</span>}
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </div>
  );
}
