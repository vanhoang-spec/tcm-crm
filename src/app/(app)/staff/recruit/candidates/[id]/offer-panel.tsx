"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, Send, FileDown, AlertTriangle, CalendarPlus, Mail, ThumbsUp, ThumbsDown } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { saveOffer, sendOffer, respondOffer, setFirstWorkDate, notifyOnboarding, type OfferState } from "../../offer-actions";

export type OfferPanelView = {
  status: string;
  salaryAmount: number | null;
  allowanceText: string;
  probationMonths: number | null;
  probationPct: number | null;
  startDateIso: string | null;
  extraTerms: string;
  sentAt: string | null;
  respondedAt: string | null;
  declineReason: string;
  firstWorkDate: string | null;
  firstWorkDateIso: string | null;
  onboardingNotifiedAt: string | null;
  letter: string;
  templateApproved: boolean;
  usingFallbackTemplate: boolean;
  missingVars: string[];
  probationBelowLegal: boolean;
};

const input = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400";
const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";
const btnPrimary = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50";

const TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  DRAFT: "neutral",
  SENT: "warning",
  ACCEPTED: "success",
  DECLINED: "danger",
};
const ERR: Record<string, string> = {
  BAD_INPUT: "errGeneric",
  NOT_FOUND: "errGeneric",
  NO_OFFER: "errNoOffer",
  ALREADY_CLOSED: "errOfferClosed",
  NOT_SENT: "errOfferNotSent",
  NEED_REASON: "errNeedReason",
  BAD_DATE: "errBadDate",
  NOT_ACCEPTED: "errNotAccepted",
  NO_FIRST_DATE: "errNoFirstDate",
  ALREADY_NOTIFIED: "errAlreadyNotified",
  MAIL_FAILED: "errMailFailed",
};

/**
 * THƯ MỜI NHẬN VIỆC (TD-2d) — lập → gửi → ứng viên phản hồi → ngày đi làm → báo onboarding.
 *
 * ⚠ Mỗi bước là MỘT form riêng, không lồng nhau (HTML cấm form lồng form — HANDOVER 10.39/10.60).
 * ⚠ Form chặn `reset` (React 19 xoá cả ô chữ lẫn select sau mỗi lần action chạy — HANDOVER 10.37).
 */
export function OfferPanel({ candidateId, offer, canDecide }: { candidateId: string; offer: OfferPanelView | null; canDecide: boolean }) {
  const t = useTranslations("recruit.offer");
  const [saveState, saveAction, saving] = useActionState<OfferState, FormData>(saveOffer, {});
  const [sendState, sendAction, sending] = useActionState<OfferState, FormData>(sendOffer, {});
  const [respState, respAction, responding] = useActionState<OfferState, FormData>(respondOffer, {});
  const [dateState, dateAction, savingDate] = useActionState<OfferState, FormData>(setFirstWorkDate, {});
  const [notifyState, notifyAction, notifying] = useActionState<OfferState, FormData>(notifyOnboarding, {});

  // Ô CHỮ controlled — xem chú thích requestFormReset ở đầu component.
  const [allowance, setAllowance] = useState(offer?.allowanceText ?? "");
  const [extra, setExtra] = useState(offer?.extraTerms ?? "");
  const [decline, setDecline] = useState("");
  const [showLetter, setShowLetter] = useState(false);

  if (!canDecide) return null;

  const err = (s: OfferState) => (s.error ? t(ERR[s.error] ?? "errGeneric") : null);
  const st = offer?.status ?? "NONE";
  const closed = st === "ACCEPTED" || st === "DECLINED";

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <BadgeCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
        {offer && <Badge tone={TONE[st] ?? "neutral"}>{t(`st${st}` as "stDRAFT")}</Badge>}
        {offer?.sentAt && <span className="text-[11px] text-muted-foreground">{t("sentAt", { at: offer.sentAt })}</span>}
      </div>

      {offer?.usingFallbackTemplate && <p className="text-[11px] text-muted-foreground">{t("usingFallback")}</p>}
      {offer && !offer.templateApproved && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("tplNotApproved")}
        </p>
      )}

      {/* ── 1. Số liệu offer ─────────────────────────────────────── */}
      <form action={saveAction} onReset={(e) => e.preventDefault()} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input type="hidden" name="candidateId" value={candidateId} />
        <label className="text-[11px] text-muted-foreground">
          {t("fSalary")}
          <NumberField name="salaryAmount" defaultValue={offer?.salaryAmount ?? undefined} className={input + " mt-1"} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("fStartDate")}
          <DateField name="startDate" defaultValue={offer?.startDateIso ?? ""} className={input + " mt-1"} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("fProbationMonths")}
          <NumberField name="probationMonths" defaultValue={offer?.probationMonths ?? undefined} className={input + " mt-1"} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("fProbationPct")}
          <NumberField name="probationPct" defaultValue={offer?.probationPct ?? undefined} className={input + " mt-1"} />
          {offer?.probationBelowLegal && <span className="mt-0.5 block text-[11px] text-warning">{t("probationBelowLegal")}</span>}
        </label>
        <label className="text-[11px] text-muted-foreground sm:col-span-2">
          {t("fAllowance")}
          <input name="allowanceText" value={allowance} onChange={(e) => setAllowance(e.target.value)} className={input + " mt-1"} />
        </label>
        <label className="text-[11px] text-muted-foreground sm:col-span-2">
          {t("fExtraTerms")}
          <textarea
            name="extraTerms"
            rows={3}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm outline-none focus:border-brand-400"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" disabled={saving || closed} className={btn}>
            {saving ? "…" : offer ? t("saveOffer") : t("createOffer")}
          </button>
          {offer && (
            <>
              <button type="button" onClick={() => setShowLetter((v) => !v)} className={btn}>
                {showLetter ? t("hideLetter") : t("showLetter")}
              </button>
              <a href={`/api/recruit-offer/${candidateId}`} className={btn}>
                <FileDown className="h-3.5 w-3.5" /> {t("downloadDocx")}
              </a>
            </>
          )}
        </div>
      </form>
      {err(saveState) && <p className="text-xs text-danger">{err(saveState)}</p>}

      {showLetter && offer && (
        <div className="space-y-1">
          {offer.missingVars.length > 0 && (
            <p className="text-xs text-danger">{t("missingVars", { vars: offer.missingVars.join(", ") })}</p>
          )}
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed text-foreground">
            {offer.letter}
          </pre>
        </div>
      )}

      {/* ── 2. Gửi offer ─────────────────────────────────────────── */}
      {offer && !closed && (
        <form action={sendAction} className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <input type="hidden" name="candidateId" value={candidateId} />
          <input type="hidden" name="startDateText" value={offer.startDateIso ?? ""} />
          <button type="submit" name="alsoEmail" value="0" disabled={sending} className={btn}>
            <Send className="h-3.5 w-3.5" /> {t("markSent")}
          </button>
          <button
            type="submit"
            name="alsoEmail"
            value="1"
            disabled={sending}
            className={btnPrimary}
            onClick={(e) => {
              if (!window.confirm(t("confirmSendEmail"))) e.preventDefault();
            }}
          >
            <Mail className="h-3.5 w-3.5" /> {t("sendWithEmail")}
          </button>
          <span className="text-[11px] text-muted-foreground">{t("sendHint")}</span>
        </form>
      )}
      {err(sendState) && (
        <p className="text-xs text-danger">
          {err(sendState)}
          {sendState.detail && <span className="ml-1 text-muted-foreground">({sendState.detail})</span>}
        </p>
      )}

      {/* ── 3. Ứng viên phản hồi ─────────────────────────────────── */}
      {offer && st === "SENT" && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-[11px] font-medium text-muted-foreground">{t("responseTitle")}</p>
          <form action={respAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="candidateId" value={candidateId} />
            <input type="hidden" name="declineReason" value={decline} />
            <button
              type="submit"
              name="accepted"
              value="1"
              disabled={responding}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-success px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              <ThumbsUp className="h-3.5 w-3.5" /> {t("accepted")}
            </button>
            <input
              value={decline}
              onChange={(e) => setDecline(e.target.value)}
              className={input + " max-w-xs"}
              placeholder={t("declineReasonPh")}
            />
            <button
              type="submit"
              name="accepted"
              value="0"
              disabled={responding}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-danger/40 px-3 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
            >
              <ThumbsDown className="h-3.5 w-3.5" /> {t("declined")}
            </button>
          </form>
          {err(respState) && <p className="text-xs text-danger">{err(respState)}</p>}
        </div>
      )}

      {offer && st === "DECLINED" && offer.declineReason && (
        <p className="border-t border-border pt-3 text-xs text-danger">{t("declinedWith", { reason: offer.declineReason })}</p>
      )}

      {/* ── 4. Ngày đi làm + báo onboarding ──────────────────────── */}
      {offer && st === "ACCEPTED" && (
        <div className="space-y-2 border-t border-border pt-3">
          <form action={dateAction} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="candidateId" value={candidateId} />
            <label className="text-[11px] text-muted-foreground">
              {t("fFirstWorkDate")}
              <DateField name="firstWorkDate" defaultValue={offer.firstWorkDateIso ?? ""} className={input + " mt-1"} />
            </label>
            <button type="submit" disabled={savingDate} className={btn}>
              <CalendarPlus className="h-3.5 w-3.5" /> {savingDate ? "…" : t("saveFirstWorkDate")}
            </button>
          </form>
          {err(dateState) && <p className="text-xs text-danger">{err(dateState)}</p>}

          {offer.onboardingNotifiedAt ? (
            <p className="text-xs text-success">{t("onboardingNotified", { at: offer.onboardingNotifiedAt })}</p>
          ) : (
            <form action={notifyAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="candidateId" value={candidateId} />
              <button type="submit" disabled={notifying || !offer.firstWorkDate} className={btnPrimary}>
                <Mail className="h-3.5 w-3.5" /> {notifying ? "…" : t("notifyOnboarding")}
              </button>
              <span className="text-[11px] text-muted-foreground">{t("notifyHint")}</span>
            </form>
          )}
          {err(notifyState) && (
            <p className="text-xs text-danger">
              {err(notifyState)}
              {notifyState.detail && <span className="ml-1 text-muted-foreground">({notifyState.detail})</span>}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
