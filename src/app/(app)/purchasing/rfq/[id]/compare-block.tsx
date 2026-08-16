"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, Send, CheckCircle2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import { selectionTotal, type CompareMatrix, type RfqSelection } from "@/lib/rfq-compare";
import type { RfqCompareResult } from "@/lib/ai/rfq-prompts";
import type { Locale } from "@/i18n/locales";
import { runRfqCompareAi, submitRfqToAccount, saveRfqSelection, returnRfqToPur, confirmRfqIntoCostSheet, type CompareState } from "../compare-actions";

const ERR_KEY: Record<string, string> = {
  NOT_FOUND: "errNotFound",
  BAD_STATUS: "errBadStatus",
  NO_AI_PERM: "errNoAiPerm",
  NO_QUOTES: "errNoQuotes",
  NO_PICKS: "errNoPicks",
  REASON_REQUIRED: "errReasonRequired",
  NO_PERM: "errNoPerm",
  NO_SHEET: "errNoSheet",
  LINES_GONE: "errLinesGone",
};
const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50";
const btnPrimary = "inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50";
const cell = "h-8 w-full rounded border border-border-strong bg-surface px-1.5 text-xs outline-none focus:border-brand-400";

/**
 * KHỐI SO SÁNH (PUR-1b): ma trận N NCC × M dòng (số tính bằng CODE), nhận xét AI (nháp), PUR chọn
 * NCC từng dòng + lý do → Trình Account; Account xem lựa chọn → Chốt & đưa vào CO hoặc trả lại.
 * Trạng thái quyết định ai thấy gì: COMPARING → PUR sửa; SUBMITTED → chỉ đọc + nút của Account;
 * CONFIRMED → chỉ đọc + link tới CO.
 */
export function CompareBlock({
  rfqId,
  status,
  matrix,
  ai,
  selection,
  canManage,
  canAi,
  canConfirm,
  appliedRevNo,
  projectId,
  locale,
}: {
  rfqId: string;
  status: string;
  matrix: CompareMatrix;
  ai: RfqCompareResult | null;
  selection: RfqSelection | null;
  canManage: boolean;
  canAi: boolean;
  canConfirm: boolean;
  appliedRevNo: number | null;
  projectId: string;
  locale: Locale;
}) {
  const t = useTranslations("purchasing.compare");
  const submitted = matrix.vendors.filter((v) => v.status === "SUBMITTED");
  const [aiState, aiAction, aiPending] = useActionState<CompareState, FormData>(runRfqCompareAi.bind(null, rfqId), {});
  const [saveState, saveAction, savePending] = useActionState<CompareState, FormData>(saveRfqSelection.bind(null, rfqId), {});
  const [submitState, submitAction, submitPending] = useActionState<CompareState, FormData>(submitRfqToAccount.bind(null, rfqId), {});
  const [returnState, returnAction, returnPending] = useActionState<CompareState, FormData>(returnRfqToPur.bind(null, rfqId), {});
  const [confirmState, confirmAction, confirmPending] = useActionState<CompareState, FormData>(confirmRfqIntoCostSheet.bind(null, rfqId), {});
  const editable = canManage && status === "COMPARING";
  const aiShown = aiState.ai ?? ai;
  const [picks, setPicks] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(selection?.picks ?? {}).map(([k, v]) => [k, v.rfqVendorId])));
  const [reasons, setReasons] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(selection?.picks ?? {}).map(([k, v]) => [k, v.reason])));
  const [note, setNote] = useState(selection?.note ?? "");
  const [returnNote, setReturnNote] = useState("");
  const vName = (id: string) => matrix.vendors.find((v) => v.rfqVendorId === id)?.vendorName ?? id;
  const suggestion = (lineId: string) => aiShown?.lineSuggestions.find((s) => s.rfqLineId === lineId) ?? null;
  const liveSel: RfqSelection = { picks: Object.fromEntries(Object.entries(picks).filter(([, v]) => v).map(([k, v]) => [k, { rfqVendorId: v, reason: reasons[k] ?? "" }])), note: null };
  const totals = selectionTotal(matrix, liveSel);
  const applyAi = () => {
    if (!aiShown) return;
    const p = { ...picks };
    const r = { ...reasons };
    for (const s of aiShown.lineSuggestions) {
      if (s.rfqVendorId && matrix.lines.find((l) => l.rfqLineId === s.rfqLineId)?.cells.some((c) => c.rfqVendorId === s.rfqVendorId)) {
        p[s.rfqLineId] = s.rfqVendorId;
        if (!r[s.rfqLineId] && s.reason) r[s.rfqLineId] = s.reason;
      }
    }
    setPicks(p);
    setReasons(r);
  };

  if (submitted.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border-strong bg-surface-2/40 p-4 text-xs text-muted-foreground">
        {t("noQuotesYet")}
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("summaryLine", { ref: formatNumber(matrix.refTotal, locale), best: formatNumber(matrix.bestMixTotal, locale), unquoted: matrix.unquotedLines })}
          </p>
        </div>
        {editable && canAi && (
          <form
            action={aiAction}
            onSubmit={(e) => {
              if (!window.confirm(t("aiConfirm"))) e.preventDefault();
            }}
          >
            <button type="submit" disabled={aiPending} className={btn}>
              <Sparkles className="h-3.5 w-3.5" /> {aiPending ? "..." : t("aiBtn")}
            </button>
          </form>
        )}
      </div>
      {aiState.error && <p className="text-xs text-danger">{aiState.error === "AI_FAILED" ? t("errAi", { code: aiState.errorCode ?? "UNKNOWN" }) : t(ERR_KEY[aiState.error] ?? "errGeneric")}</p>}

      {/* Tổng theo NCC */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {matrix.vendors.map((v) => (
          <div key={v.rfqVendorId} className={cn("rounded-lg border p-2.5 text-xs", v.status === "SUBMITTED" ? "border-border" : "border-dashed border-border opacity-60")}>
            <p className="font-semibold text-foreground">{v.vendorName}</p>
            {v.status === "SUBMITTED" ? (
              <>
                <p className="mt-1 tabular-nums text-foreground">{formatNumber(v.quotedTotal, locale)}</p>
                <p className="text-muted-foreground">
                  {t("coverage", { n: v.linesQuoted, total: matrix.lines.length, pct: v.coveragePct })} · {t("cheapestIn", { n: v.cheapestCount })}
                </p>
                {v.refTotalOnQuoted > 0 && (
                  <p className={cn(v.quotedTotal > v.refTotalOnQuoted ? "text-danger" : "text-success")}>
                    {t("vsCo", { pct: formatNumber(Math.round(((v.quotedTotal - v.refTotalOnQuoted) / v.refTotalOnQuoted) * 1000) / 10, locale) })}
                  </p>
                )}
                {Object.keys(v.terms).length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {Object.entries(v.terms)
                      .slice(0, 3)
                      .map(([k, x]) => `${k}: ${String(x)}`)
                      .join(" · ")}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-muted-foreground">{t(`rv${v.status}`)}</p>
            )}
          </div>
        ))}
      </div>

      {/* Nhận xét AI */}
      {aiShown && (
        <div className="rounded-lg border border-brand-400/40 bg-brand-50 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5" /> {t("aiTitle")}
            </p>
            {editable && (
              <button type="button" onClick={applyAi} className={btn}>
                {t("applyAi")}
              </button>
            )}
          </div>
          {aiShown.summary && <p className="mt-1 text-foreground">{aiShown.summary}</p>}
          {aiShown.termsNotes.filter(Boolean).length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              {aiShown.termsNotes.filter(Boolean).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          {aiShown.risks.filter(Boolean).length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-warning">
              {aiShown.risks.filter(Boolean).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">{t("aiDisclaimer")}</p>
        </div>
      )}

      {/* Ma trận + chọn */}
      <form id="rfq-selection-form" action={editable ? submitAction : undefined} className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                <th className="py-1.5 pr-2">{t("colLine")}</th>
                <th className="py-1.5 pr-2 text-right">{t("colRef")}</th>
                {submitted.map((v) => (
                  <th key={v.rfqVendorId} className="py-1.5 pr-2 text-right">
                    {v.vendorName}
                  </th>
                ))}
                <th className="py-1.5 pr-2">{t("colPick")}</th>
                <th className="py-1.5 pr-2">{t("colReason")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {matrix.lines.map((l) => {
                const sug = suggestion(l.rfqLineId);
                const picked = picks[l.rfqLineId] ?? "";
                return (
                  <tr key={l.rfqLineId} className="align-top">
                    <td className="py-1.5 pr-2">
                      <p className="font-medium text-foreground">{l.itemName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        SL {formatNumber(l.quantity, locale)} {l.unit ?? ""}
                        {l.spreadPct != null && ` · ${t("spread", { pct: formatNumber(l.spreadPct, locale) })}`}
                        {l.overRef && <span className="ml-1 text-danger">· {t("overCo")}</span>}
                      </p>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{l.refAmount == null ? "—" : formatNumber(l.refAmount, locale)}</td>
                    {submitted.map((v) => {
                      const c = l.cells.find((x) => x.rfqVendorId === v.rfqVendorId);
                      const isCheapest = l.cheapestVendorId === v.rfqVendorId;
                      return (
                        <td key={v.rfqVendorId} className={cn("py-1.5 pr-2 text-right tabular-nums", isCheapest && "font-semibold text-success")}>
                          {c ? (
                            <>
                              {formatNumber(c.amount, locale)}
                              <span className="block text-[10px] font-normal text-muted-foreground">
                                {formatNumber(c.unitPrice, locale)}
                                {c.quantity != null && ` × ${formatNumber(c.quantity, locale)}`}
                              </span>
                              {c.note && <span className="block text-[10px] font-normal text-muted-foreground">{c.note}</span>}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-1.5 pr-2">
                      {editable ? (
                        <select name={`pick_${l.rfqLineId}`} value={picked} onChange={(e) => setPicks((s) => ({ ...s, [l.rfqLineId]: e.target.value }))} className={cell + " min-w-[140px]"}>
                          <option value="">{t("keepCo")}</option>
                          {l.cells.map((c) => (
                            <option key={c.rfqVendorId} value={c.rfqVendorId}>
                              {vName(c.rfqVendorId)} — {formatNumber(c.amount, locale)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-foreground">{selection?.picks[l.rfqLineId] ? vName(selection.picks[l.rfqLineId].rfqVendorId) : <span className="text-muted-foreground">{t("keepCo")}</span>}</span>
                      )}
                      {sug?.rfqVendorId && editable && picked !== sug.rfqVendorId && (
                        <button type="button" onClick={() => setPicks((s) => ({ ...s, [l.rfqLineId]: sug.rfqVendorId! }))} className="mt-1 block text-[11px] text-brand-600 hover:underline">
                          {t("aiSuggests", { vendor: vName(sug.rfqVendorId) })}
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      {editable ? (
                        <input name={`reason_${l.rfqLineId}`} value={reasons[l.rfqLineId] ?? ""} onChange={(e) => setReasons((s) => ({ ...s, [l.rfqLineId]: e.target.value }))} className={cell + " min-w-[200px]"} placeholder={sug?.reason ?? t("reasonPlaceholder")} disabled={!picked} />
                      ) : (
                        <span className="text-muted-foreground">{selection?.picks[l.rfqLineId]?.reason ?? ""}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border">
                <td colSpan={2 + submitted.length} className="py-2 pr-2 text-right text-xs font-semibold text-foreground">
                  {t("pickedTotal", { n: totals.picked })}
                </td>
                <td colSpan={2} className="py-2 pr-2 text-sm font-bold tabular-nums text-foreground">
                  {formatNumber(totals.total, locale)}
                  {totals.refTotalOnPicked > 0 && (
                    <span className={cn("ml-2 text-xs font-medium", totals.total > totals.refTotalOnPicked ? "text-danger" : "text-success")}>
                      ({t("vsCoAbs", { delta: formatNumber(totals.total - totals.refTotalOnPicked, locale) })})
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {editable && (
          <>
            <input name="selectionNote" value={note} onChange={(e) => setNote(e.target.value)} className={cell} placeholder={t("notePlaceholder")} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" formAction={saveAction} disabled={savePending} className={btn}>
                {savePending ? "..." : t("saveDraft")}
              </button>
              <button type="submit" disabled={submitPending} className={btnPrimary}>
                <Send className="h-3.5 w-3.5" /> {submitPending ? "..." : t("submitBtn")}
              </button>
              <span className="text-[11px] text-muted-foreground">{t("submitHint")}</span>
              {(saveState.error || submitState.error) && <span className="text-xs text-danger">{t(ERR_KEY[(submitState.error ?? saveState.error) as string] ?? "errGeneric")}</span>}
              {saveState.success && !submitState.success && <span className="text-xs text-success">{t("draftSaved")}</span>}
            </div>
          </>
        )}
      </form>

      {/* Bên Account: đã trình → chốt hoặc trả lại */}
      {status === "SUBMITTED" && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
          <p className="font-semibold text-foreground">{t("submittedTitle")}</p>
          {selection?.note && <p className="mt-1 text-muted-foreground">{selection.note}</p>}
          <p className="mt-1 text-muted-foreground">{t("submittedHint")}</p>
          {canConfirm ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <form
                action={confirmAction}
                onSubmit={(e) => {
                  if (!window.confirm(t("confirmDialog"))) e.preventDefault();
                }}
              >
                <button type="submit" disabled={confirmPending} className={btnPrimary}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> {confirmPending ? "..." : t("confirmBtn")}
                </button>
              </form>
              <form action={returnAction} className="flex items-center gap-1.5">
                <input name="returnNote" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} className={cell + " w-56"} placeholder={t("returnPlaceholder")} />
                <button type="submit" disabled={returnPending} className={btn}>
                  <Undo2 className="h-3.5 w-3.5" /> {t("returnBtn")}
                </button>
              </form>
            </div>
          ) : (
            <div className="mt-2 space-y-1.5">
              <p className="text-[11px] text-muted-foreground">{t("waitAccount")}</p>
              {canManage && (
                <form action={returnAction} className="flex items-center gap-1.5">
                  <input name="returnNote" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} className={cell + " w-56"} placeholder={t("returnPlaceholder")} />
                  <button type="submit" disabled={returnPending} className={btn}>
                    <Undo2 className="h-3.5 w-3.5" /> {t("returnBtn")}
                  </button>
                </form>
              )}
            </div>
          )}
          {confirmState.error && (
            <p className="mt-1 text-danger">
              {confirmState.error === "SAVE_FAILED" ? t("errSaveFailed", { detail: confirmState.errorCode ?? "" }) : t(ERR_KEY[confirmState.error] ?? "errGeneric")}
            </p>
          )}
          {returnState.error && <p className="mt-1 text-danger">{t(ERR_KEY[returnState.error] ?? "errGeneric")}</p>}
        </div>
      )}
      {status === "CONFIRMED" && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("confirmedTitle", { rev: appliedRevNo ?? "?" })}
          </p>
          <p className="mt-1 text-muted-foreground">{t("confirmedHint")}</p>
          <Link href={`/projects/${projectId}/co-ce`} className="mt-1 inline-block text-brand-600 hover:underline">
            {t("openCo")}
          </Link>
          {confirmState.errorCode?.startsWith("MISSING:") && <Badge tone="warning">{t("linesMissing", { n: confirmState.errorCode.slice(8) })}</Badge>}
        </div>
      )}
    </section>
  );
}
