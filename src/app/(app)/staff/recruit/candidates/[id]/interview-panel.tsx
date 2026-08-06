"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus, Download, Check, X } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { INTERVIEW_ROUNDS, RECOMMENDATIONS, MIN_SCORE, MAX_SCORE, averageScore, nextRound } from "@/lib/recruit";
import {
  scheduleInterview,
  respondInterview,
  cancelInterview,
  saveInterviewResult,
  type InterviewState,
} from "../../actions";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const area =
  "w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

const IV_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  DECLINED: "danger",
  DONE: "neutral",
  CANCELLED: "neutral",
};

const ERR_KEY: Record<string, string> = {
  NO_INTERVIEWER: "errNoInterviewer",
  BAD_ROUND: "errBadRound",
  BAD_DURATION: "errBadDuration",
  BAD_TIME: "errBadTime",
  NOT_FOUND: "errNotFound",
  ALREADY_DECIDED: "errAlreadyDecided",
  DUPLICATE: "errDuplicateInterview",
  NO_REASON: "errNoReason",
  NOT_YOURS: "errNotYours",
  ALREADY_RESPONDED: "errAlreadyResponded",
  ALREADY_DONE: "errAlreadyDone",
  NO_RECOMMENDATION: "errNoRecommendation",
  CANCELLED: "errCancelled",
  NO_AUTH: "errGeneric",
};

export type InterviewData = {
  id: string;
  round: number;
  scheduledAtIso: string;
  durationMin: number;
  location: string;
  status: string;
  declineReason: string;
  recommendation: string;
  strengths: string;
  concerns: string;
  note: string;
  interviewerStaffId: string;
  interviewerName: string;
  scores: { criterionCode: string; score: number; note: string }[];
};

export type Criterion = { code: string; label: string };

/** Ô đặt lịch một vòng phỏng vấn mới. */
function ScheduleForm({
  candidateId,
  staff,
  suggestedRound,
}: {
  candidateId: string;
  staff: { id: string; label: string }[];
  suggestedRound: number;
}) {
  const t = useTranslations("recruit");
  const [state, formAction, pending] = useActionState<InterviewState, FormData>(scheduleInterview, {});
  const [interviewer, setInterviewer] = useState("");
  const [location, setLocation] = useState("");

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <input type="hidden" name="candidateId" value={candidateId} />
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <CalendarPlus className="h-4 w-4" />
        {t("scheduleTitle")}
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("round")}</span>
          <select name="round" defaultValue={String(suggestedRound)} className={input}>
            {INTERVIEW_ROUNDS.map((r) => (
              <option key={r} value={r}>
                {t("roundN", { n: r })}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("interviewer")}</span>
          <select name="interviewerStaffId" value={interviewer} onChange={(e) => setInterviewer(e.target.value)} className={input} required>
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("date")}</span>
          <DateField name="date" required className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("time")}</span>
          {/* Ô giờ native chỉ có HH:mm — không có phần ngày nên không dính bẫy mm/dd/yyyy. */}
          <input type="time" name="time" required defaultValue="09:00" className={input} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("duration")}</span>
          <input type="number" name="durationMin" defaultValue={60} min={15} max={480} step={15} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("location")}</span>
          <input name="location" value={location} onChange={(e) => setLocation(e.target.value)} className={input} placeholder={t("locationPlaceholder")} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : t("sendRequest")}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{t("scheduleHint")}</p>
      {state.error && <p className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</p>}
      {state.ok && <p className="text-xs text-success">{t("requestSent")}</p>}
    </form>
  );
}

/** Người phỏng vấn xác nhận hoặc báo bận. */
export function RespondForm({ interviewId }: { interviewId: string }) {
  const t = useTranslations("recruit");
  const [state, formAction, pending] = useActionState<InterviewState, FormData>(respondInterview, {});
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
      <input type="hidden" name="interviewId" value={interviewId} />
      <input type="hidden" name="accept" value={declining ? "0" : "1"} />
      <p className="text-xs font-medium text-foreground">{t("respondPrompt")}</p>
      {declining && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("declineReason")}</span>
          <input name="declineReason" value={reason} onChange={(e) => setReason(e.target.value)} className={input} required />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {!declining && (
          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-success px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            {pending ? "..." : t("acceptSlot")}
          </button>
        )}
        {declining ? (
          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-danger px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            {pending ? "..." : t("confirmDecline")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setDeclining(true)}
            className="h-9 rounded-lg border border-border-strong px-3 text-xs font-semibold text-foreground hover:bg-surface"
          >
            {t("declineSlot")}
          </button>
        )}
      </div>
      {state.error && <p className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</p>}
    </form>
  );
}

/** Phiếu chấm điểm — điểm 1..5 mỗi tiêu chí + đề xuất + nhận xét. */
function ScoreForm({ interview, criteria }: { interview: InterviewData; criteria: Criterion[] }) {
  const t = useTranslations("recruit");
  const [state, formAction, pending] = useActionState<InterviewState, FormData>(saveInterviewResult, {});
  const byCode = new Map(interview.scores.map((s) => [s.criterionCode, s]));

  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(criteria.map((c) => [c.code, byCode.get(c.code)?.score?.toString() ?? ""])),
  );
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(criteria.map((c) => [c.code, byCode.get(c.code)?.note ?? ""])),
  );
  const [recommendation, setRecommendation] = useState(interview.recommendation);
  const [strengths, setStrengths] = useState(interview.strengths);
  const [concerns, setConcerns] = useState(interview.concerns);
  const [note, setNote] = useState(interview.note);

  const given = Object.values(scores)
    .filter((v) => v !== "")
    .map((v) => ({ score: Number(v) }));
  const avg = averageScore(given);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
      <input type="hidden" name="interviewId" value={interview.id} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{t("scoreTitle")}</h4>
        <span className="text-xs text-muted-foreground">
          {avg == null ? t("noScoreYet") : t("averageScore", { avg, max: MAX_SCORE })}
        </span>
      </div>

      {criteria.length === 0 && <p className="text-xs text-muted-foreground">{t("noCriteria")}</p>}
      <div className="space-y-2">
        {criteria.map((c) => (
          <div key={c.code} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_1fr] sm:items-center">
            <span className="text-xs font-medium text-foreground">{c.label}</span>
            <select
              name={`score__${c.code}`}
              value={scores[c.code] ?? ""}
              onChange={(e) => setScores({ ...scores, [c.code]: e.target.value })}
              className={input}
            >
              <option value="">—</option>
              {Array.from({ length: MAX_SCORE - MIN_SCORE + 1 }, (_, i) => MIN_SCORE + i).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input
              name={`note__${c.code}`}
              value={notes[c.code] ?? ""}
              onChange={(e) => setNotes({ ...notes, [c.code]: e.target.value })}
              className={input}
              placeholder={t("criterionNote")}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("recommendation")}</span>
          <select
            name="recommendation"
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
            className={input}
            required
          >
            <option value="">—</option>
            {RECOMMENDATIONS.map((r) => (
              <option key={r} value={r}>
                {t(`rec${r}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("strengths")}</span>
          <input name="strengths" value={strengths} onChange={(e) => setStrengths(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("concerns")}</span>
          <input name="concerns" value={concerns} onChange={(e) => setConcerns(e.target.value)} className={input} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("interviewNote")}</span>
        <textarea name="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={area} />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : t("saveResult")}
        </button>
        {state.error && <span className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</span>}
        {state.ok && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

function CancelButton({ interviewId }: { interviewId: string }) {
  const t = useTranslations("recruit");
  const [, formAction, pending] = useActionState<InterviewState, FormData>(cancelInterview, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(t("confirmCancelInterview"))) e.preventDefault();
      }}
    >
      <input type="hidden" name="interviewId" value={interviewId} />
      <button
        type="submit"
        disabled={pending}
        className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground hover:border-danger hover:text-danger disabled:opacity-50"
      >
        {t("cancelInterview")}
      </button>
    </form>
  );
}

export function InterviewPanel({
  candidateId,
  meId,
  canSchedule,
  criteria,
  staff,
  interviews,
}: {
  candidateId: string;
  meId: string;
  canSchedule: boolean;
  criteria: Criterion[];
  staff: { id: string; label: string }[];
  interviews: InterviewData[];
}) {
  const t = useTranslations("recruit");
  const suggested = nextRound(interviews.filter((i) => i.status !== "CANCELLED").map((i) => i.round)) ?? 3;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("interviewsTitle")}</h2>

      {interviews.length === 0 && <p className="text-sm text-muted-foreground">{t("noInterviewYet")}</p>}

      {interviews.map((iv) => {
        const mine = iv.interviewerStaffId === meId;
        const canScore = (mine || canSchedule) && iv.status !== "CANCELLED" && iv.status !== "DECLINED";
        const hasCalendar = iv.status === "CONFIRMED" || iv.status === "DONE";
        return (
          <div key={iv.id} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{t("roundN", { n: iv.round })}</span>
              <Badge tone={IV_TONE[iv.status] ?? "neutral"}>{t(`ivStatus${iv.status}`)}</Badge>
              <span className="text-xs text-muted-foreground">
                {iv.interviewerName} · {formatDateTime(new Date(iv.scheduledAtIso))} · {t("minutes", { n: iv.durationMin })}
                {iv.location ? ` · ${iv.location}` : ""}
              </span>
              <span className="ml-auto flex items-center gap-2">
                {hasCalendar && (
                  <a
                    href={`/api/interview-ics/${iv.id}`}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-xs font-semibold text-foreground hover:bg-surface-2"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t("addToCalendar")}
                  </a>
                )}
                {canSchedule && iv.status !== "DONE" && iv.status !== "CANCELLED" && <CancelButton interviewId={iv.id} />}
              </span>
            </div>

            {iv.status === "DECLINED" && iv.declineReason && (
              <p className="text-xs text-danger">{t("declinedBecause", { reason: iv.declineReason })}</p>
            )}

            {iv.status === "PENDING" && mine && <RespondForm interviewId={iv.id} />}
            {iv.status === "PENDING" && !mine && <p className="text-xs text-muted-foreground">{t("waitingConfirm")}</p>}

            {canScore && <ScoreForm interview={iv} criteria={criteria} />}
          </div>
        );
      })}

      {canSchedule && <ScheduleForm candidateId={candidateId} staff={staff} suggestedRound={suggested} />}
    </section>
  );
}
