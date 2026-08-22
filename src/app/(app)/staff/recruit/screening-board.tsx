"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, Loader2, AlertTriangle, CalendarCheck, UserX, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { startCvScoring, setScreenDecision, type ScreenState } from "./screening-actions";

export type ScreeningRow = {
  id: string;
  fullName: string;
  positionTitle: string;
  isManagerial: boolean;
  status: string;
  receivedAt: string;
  aiParsed: boolean;
  /** QUEUED | RUNNING | ERROR | null */
  aiReviewStatus: string | null;
  aiReviewError: string | null;
  /** Bản chấm MỚI NHẤT — null nếu chưa chấm lần nào. */
  review: {
    totalScore: number;
    maxScore: number;
    recommendation: string;
    summary: string | null;
    scoredAt: string;
    criteria: { code: string; label: string; weight: number; score: number; note?: string | null }[];
  } | null;
  screenDecision: string | null;
  interviewsLabel: string;
};

const REC_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  INTERVIEW: "success",
  CONSIDER: "warning",
  REJECT: "danger",
};
const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  NEW: "warning",
  INTERVIEWING: "neutral",
  HIRED: "success",
  REJECTED: "danger",
};
const ERR: Record<string, string> = {
  NO_AI_PERM: "errNoAiPerm",
  AI_NOT_CONFIGURED: "errAiNotConfigured",
  NO_SELECTION: "errNoSelection",
  TOO_MANY: "errTooMany",
  BAD_INPUT: "errGeneric",
  NOT_FOUND: "errGeneric",
  ALREADY_CLOSED: "errAlreadyClosed",
};

const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";
const btnPrimary = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50";

/** Thanh điểm — người đọc so CHIỀU DÀI nhanh hơn so con số (bài học biểu đồ Dashboard, 10.24). */
function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const tone = pct >= 70 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-danger";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <span className={"block h-full rounded-full " + tone} style={{ width: `${pct}%` }} />
      </span>
      <b className="tabular-nums text-foreground">{score}</b>
      <span className="text-muted-foreground">/{max}</span>
    </span>
  );
}

/**
 * Bảng sàng lọc hồ sơ (TD-2a): tick nhiều → AI chấm hàng loạt → xem bảng so sánh → quyết định
 * phỏng vấn / loại.
 */
export function ScreeningBoard({
  rows,
  canManage,
  canAiScore,
  canDecide,
  aiConfigured,
  maxBatch,
}: {
  rows: ScreeningRow[];
  canManage: boolean;
  canAiScore: boolean;
  canDecide: boolean;
  aiConfigured: boolean;
  maxBatch: number;
}) {
  const t = useTranslations("recruit");
  const [scoreState, scoreAction, scoring] = useActionState<ScreenState, FormData>(startCvScoring, {});
  const [decideState, decideAction, deciding] = useActionState<ScreenState, FormData>(setScreenDecision, {});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState(false);

  const selectable = rows.filter((r) => r.aiReviewStatus !== "RUNNING");
  const allPicked = selectable.length > 0 && selectable.every((r) => picked.has(r.id));
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(selectable.map((r) => r.id)));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const scored = rows.filter((r) => r.review);
  const compareRows = picked.size > 0 ? scored.filter((r) => picked.has(r.id)) : scored;
  // Cột của bảng so sánh = hợp các tiêu chí xuất hiện trong những bản chấm đang xem. Không khoá cứng
  // theo bộ hiện hành: bản chấm cũ có thể dùng bộ khác (vị trí quản lý / HR đã đổi tiêu chí).
  const compareCols: { code: string; label: string; weight: number }[] = [];
  for (const r of compareRows)
    for (const c of r.review?.criteria ?? [])
      if (!compareCols.some((x) => x.code === c.code)) compareCols.push({ code: c.code, label: c.label, weight: c.weight });
  // ⚠ Trộn hồ sơ VỊ TRÍ THƯỜNG với VỊ TRÍ QUẢN LÝ thì cùng một mã tiêu chí có trọng số KHÁC nhau
  // (JD_MATCH là 30 ở bộ thường, 20 ở bộ quản lý). Lúc đó con số "/30" ở tiêu đề cột là SAI với
  // hàng quản lý — bắt được lúc verify: Mai Hương 18/20 hiện dưới cột ghi "/30".
  // Nên: hỗn hợp thì bỏ trọng số khỏi tiêu đề và ghi "điểm/trọng số" ngay trong Ô.
  const mixedScopes = new Set(compareRows.map((r) => r.review?.criteria.map((c) => `${c.code}:${c.weight}`).join(","))).size > 1;

  const err = (s: ScreenState) => (s.error ? t(ERR[s.error] ?? "errGeneric") : null);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("runningTitle")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {scored.length > 0 && (
            <button type="button" onClick={() => setCompare((v) => !v)} className={btn}>
              <Table2 className="h-3.5 w-3.5" />
              {compare ? t("hideCompare") : t("showCompare", { n: scored.length })}
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 && <p className="text-sm text-muted-foreground">{t("noCandidates")}</p>}

      {rows.length > 0 && (
        <div className="space-y-2">
          {/* ⚠ Form chấm điểm CHỈ bọc thanh công cụ, KHÔNG bọc cả bảng: mỗi hàng có form quyết định
              riêng, mà HTML cấm form lồng form (React ném "A React form was unexpectedly submitted"
              và nút bên trong im lặng không gửi — HANDOVER 10.39, 10.60). Bọc cả bảng cũng làm hai
              bên tranh nhau ô `candidateId`.
              ⚠ Form chặn `reset`: React 19 gọi requestFormReset sau MỌI lần chạy action kể cả khi
              action TRẢ LỖI, và nó xoá cả checkbox (HANDOVER 10.37). */}
          {canManage && (
          <form action={scoreAction} onReset={(e) => e.preventDefault()}>
            {[...picked].map((id) => (
              <input key={id} type="hidden" name="candidateId" value={id} />
            ))}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input type="checkbox" checked={allPicked} onChange={toggleAll} className="h-4 w-4 rounded border-border-strong" />
                {t("selectAll")}
              </label>
              <span className="text-xs text-muted-foreground">{t("pickedCount", { n: picked.size })}</span>
              {canAiScore ? (
                <button
                  type="submit"
                  disabled={scoring || picked.size === 0 || !aiConfigured}
                  className={btnPrimary}
                  onClick={(e) => {
                    if (!window.confirm(t("confirmAiScore", { n: picked.size }))) e.preventDefault();
                  }}
                >
                  {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {t("aiScoreBtn")}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">{t("aiScoreNoPerm")}</span>
              )}
              <span className="text-[11px] text-muted-foreground">{t("aiScoreHint", { n: maxBatch })}</span>
            </div>
          </form>
          )}

          {err(scoreState) && <p className="text-xs text-danger">{err(scoreState)}</p>}
          {scoreState.success && <p className="text-xs text-success">{t("aiScoreQueued", { n: scoreState.queued ?? 0 })}</p>}
          {err(decideState) && <p className="text-xs text-danger">{err(decideState)}</p>}

          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-border bg-surface-2 text-xs font-medium text-muted-foreground">
                  <tr>
                    {canManage && <th className="w-10 px-3 py-2.5" />}
                    <th className="px-4 py-2.5 text-left">{t("colName")}</th>
                    <th className="px-4 py-2.5 text-left">{t("colPosition")}</th>
                    <th className="px-4 py-2.5 text-left">{t("colAiScore")}</th>
                    <th className="px-4 py-2.5 text-left">{t("colRecommendation")}</th>
                    <th className="px-4 py-2.5 text-left">{t("colScreen")}</th>
                    <th className="px-4 py-2.5 text-left">{t("colInterviews")}</th>
                    <th className="px-4 py-2.5 text-left">{t("colReceived")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-2">
                      {canManage && (
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={picked.has(c.id)}
                            onChange={() => toggle(c.id)}
                            disabled={c.aiReviewStatus === "RUNNING"}
                            className="h-4 w-4 rounded border-border-strong"
                            aria-label={c.fullName}
                          />
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <Link href={`/staff/recruit/candidates/${c.id}`} className="font-medium text-brand-700 hover:underline">
                          {c.fullName}
                        </Link>
                        <span className="ml-2 inline-flex items-center gap-1.5 align-middle">
                          <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{t(`status${c.status}`)}</Badge>
                          {!c.aiParsed && <span className="text-xs text-muted-foreground">{t("notParsed")}</span>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {c.positionTitle}
                        {c.isManagerial && <span className="ml-1 text-[10px] uppercase text-brand-700">{t("managerial")}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {c.aiReviewStatus === "RUNNING" || c.aiReviewStatus === "QUEUED" ? (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {t(c.aiReviewStatus === "RUNNING" ? "aiRunning" : "aiQueued")}
                          </span>
                        ) : c.aiReviewStatus === "ERROR" ? (
                          <span className="inline-flex items-center gap-1.5 text-danger" title={c.aiReviewError ?? ""}>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {t(`aiErr${c.aiReviewError ?? "AI_ERROR"}` as "aiErrAI_ERROR")}
                          </span>
                        ) : c.review ? (
                          <ScoreBar score={c.review.totalScore} max={c.review.maxScore} />
                        ) : (
                          <span className="text-muted-foreground">{t("notScored")}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {c.review ? <Badge tone={REC_TONE[c.review.recommendation] ?? "neutral"}>{t(`rec${c.review.recommendation}`)}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {c.screenDecision === "INTERVIEW" ? (
                          <Badge tone="success">{t("screenINTERVIEW")}</Badge>
                        ) : c.screenDecision === "REJECT" ? (
                          <Badge tone="danger">{t("screenREJECT")}</Badge>
                        ) : canDecide ? (
                          <form action={decideAction} onReset={(e) => e.preventDefault()} className="flex flex-wrap gap-1">
                            <input type="hidden" name="candidateId" value={c.id} />
                            <button
                              type="submit"
                              name="decision"
                              value="INTERVIEW"
                              disabled={deciding}
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-success/40 px-2 text-[11px] font-medium text-success hover:bg-success-bg disabled:opacity-50"
                            >
                              <CalendarCheck className="h-3 w-3" />
                              {t("screenPassBtn")}
                            </button>
                            <button
                              type="submit"
                              name="decision"
                              value="REJECT"
                              disabled={deciding}
                              onClick={(e) => {
                                if (!window.confirm(t("confirmScreenReject", { name: c.fullName }))) e.preventDefault();
                              }}
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-danger/40 px-2 text-[11px] font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
                            >
                              <UserX className="h-3 w-3" />
                              {t("screenRejectBtn")}
                            </button>
                          </form>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.interviewsLabel}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.receivedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {compare && compareRows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border bg-surface-2 px-4 py-2 text-xs text-muted-foreground">
            {t("compareHint", { n: compareRows.length })}
            {mixedScopes && <span className="ml-1 text-warning">{t("compareMixed")}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left">{t("colName")}</th>
                  {compareCols.map((c) => (
                    <th key={c.code} className="px-3 py-2.5 text-center" title={c.label}>
                      {c.label}
                      {!mixedScopes && <span className="block font-normal text-[10px] text-muted-foreground">/{c.weight}</span>}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center">{t("colTotal")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...compareRows]
                  .sort((a, b) => (b.review?.totalScore ?? 0) - (a.review?.totalScore ?? 0))
                  .map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2">
                      <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
                        <Link href={`/staff/recruit/candidates/${r.id}`} className="font-medium text-brand-700 hover:underline">
                          {r.fullName}
                        </Link>
                        <span className="block text-[11px] text-muted-foreground">{r.positionTitle}</span>
                      </td>
                      {compareCols.map((col) => {
                        const cell = r.review?.criteria.find((x) => x.code === col.code);
                        if (!cell) return <td key={col.code} className="px-3 py-2.5 text-center text-muted-foreground">—</td>;
                        const pct = cell.weight > 0 ? cell.score / cell.weight : 0;
                        const tone = pct >= 0.7 ? "text-success" : pct >= 0.4 ? "text-warning" : "text-danger";
                        return (
                          <td key={col.code} className={"px-3 py-2.5 text-center tabular-nums font-medium " + tone} title={cell.note ?? ""}>
                            {cell.score}
                            {mixedScopes && <span className="text-[10px] font-normal text-muted-foreground">/{cell.weight}</span>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center">
                        <ScoreBar score={r.review?.totalScore ?? 0} max={r.review?.maxScore ?? 100} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
