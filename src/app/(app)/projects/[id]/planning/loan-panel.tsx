"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { HandHelping, Check, X } from "lucide-react";
import { createLoanRequest, approveLoanRequest, rejectLoanRequest, cancelLoanRequest, type LoanState } from "./loan-actions";

export type LoanTeamOption = { id: string; code: string; name: string };
export type LoanPersonOption = { id: string; fullName: string };
export type LoanRow = {
  id: string;
  status: string;
  reason: string;
  toTeamCode: string;
  fromTeamCode: string;
  requestedByName: string | null;
  lentStaffName: string | null;
  decisionNote: string | null;
};

const field =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const area =
  "mt-1 w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function LoanPanel({
  projectId,
  pending,
  history,
  teams,
  lenderMembers,
  canDecidePending,
  canCancelPending,
  canRequest,
}: {
  projectId: string;
  pending: LoanRow | null;
  history: LoanRow[];
  /** Các team khác đang bật — nguồn cho ô chọn team muốn mượn. */
  teams: LoanTeamOption[];
  /** Nhân sự của team ĐƯỢC MƯỢN — chỉ dùng khi người đang xem là trưởng team đó. */
  lenderMembers: LoanPersonOption[];
  canDecidePending: boolean;
  canCancelPending: boolean;
  canRequest: boolean;
}) {
  const t = useTranslations("projects.planning.loan");

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <HandHelping className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("subtitle")}</p>

      {pending ? (
        <PendingBlock
          projectId={projectId}
          row={pending}
          members={lenderMembers}
          canDecide={canDecidePending}
          canCancel={canCancelPending}
        />
      ) : canRequest ? (
        <RequestForm projectId={projectId} teams={teams} />
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{t("noPending")}</p>
      )}

      {history.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("history")}</p>
          <ul className="mt-2 space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-foreground">
                <StatusBadge status={h.status} />
                <span className="ml-2">
                  {t("historyLine", { from: h.fromTeamCode, to: h.toTeamCode })}
                  {h.lentStaffName && ` · ${h.lentStaffName}`}
                </span>
                {h.decisionNote && <span className="text-muted-foreground"> — {h.decisionNote}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("projects.planning.loan");
  const tone =
    status === "APPROVED"
      ? "bg-success-bg text-success"
      : status === "REJECTED"
        ? "bg-danger-bg text-danger"
        : status === "CANCELED"
          ? "bg-surface-2 text-muted-foreground"
          : "bg-warning-bg text-warning";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{t(`status${status}` as "statusPENDING")}</span>;
}

function RequestForm({ projectId, teams }: { projectId: string; teams: LoanTeamOption[] }) {
  const t = useTranslations("projects.planning.loan");
  const [state, formAction, busy] = useActionState<LoanState, FormData>(createLoanRequest.bind(null, projectId), {});
  // Ô chữ controlled — React 19 gọi requestFormReset sau MỌI lần chạy action, kể cả khi trả lỗi.
  const [reason, setReason] = useState("");
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.success) setReason("");
  }

  if (teams.length === 0) return <p className="mt-3 text-xs text-muted-foreground">{t("noOtherTeam")}</p>;

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <label className="block text-[11px] text-muted-foreground">
        {t("toTeam")}
        <select name="toTeamId" className={field + " mt-1"} defaultValue="">
          <option value="" disabled>
            {t("pickTeam")}
          </option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.code} — {tm.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[11px] text-muted-foreground">
        {t("reason")}
        <textarea name="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={area} />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? "..." : t("send")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

function PendingBlock({
  projectId,
  row,
  members,
  canDecide,
  canCancel,
}: {
  projectId: string;
  row: LoanRow;
  members: LoanPersonOption[];
  canDecide: boolean;
  canCancel: boolean;
}) {
  const t = useTranslations("projects.planning.loan");
  const [okState, okAction, okBusy] = useActionState<LoanState, FormData>(approveLoanRequest.bind(null, projectId, row.id), {});
  const [noState, noAction, noBusy] = useActionState<LoanState, FormData>(rejectLoanRequest.bind(null, projectId, row.id), {});
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"none" | "reject">("none");

  return (
    <div className="mt-3 rounded-lg border border-warning/40 bg-warning-bg p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} />
        <span className="text-xs font-semibold text-foreground">{t("historyLine", { from: row.fromTeamCode, to: row.toTeamCode })}</span>
      </div>
      <p className="mt-1.5 text-xs text-foreground">{row.reason}</p>
      {row.requestedByName && <p className="mt-0.5 text-[11px] text-muted-foreground">{t("requestedBy", { name: row.requestedByName })}</p>}

      {canDecide && (
        <div className="mt-3 space-y-2 border-t border-warning/30 pt-2.5">
          {mode === "none" ? (
            <form action={okAction} className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                {t("pickPerson")}
                <select name="lentStaffId" className={field + " mt-1"} defaultValue="">
                  <option value="" disabled>
                    {t("pickPersonPlaceholder")}
                  </option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={okBusy || members.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-success px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {okBusy ? "..." : t("approve")}
              </button>
              <button
                type="button"
                onClick={() => setMode("reject")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-danger/40 px-3 text-xs font-semibold text-danger hover:bg-danger-bg"
              >
                <X className="h-3.5 w-3.5" />
                {t("reject")}
              </button>
              {okState.error && <span className="text-xs text-danger">{okState.error}</span>}
            </form>
          ) : (
            <form action={noAction} className="space-y-2">
              <label className="block text-[11px] text-muted-foreground">
                {t("rejectNote")}
                <textarea rows={2} name="decisionNote" value={note} onChange={(e) => setNote(e.target.value)} className={area} />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={noBusy}
                  className="h-9 rounded-lg border border-danger/40 px-3 text-xs font-semibold text-danger hover:bg-danger-bg disabled:opacity-50"
                >
                  {noBusy ? "..." : t("confirmReject")}
                </button>
                <button type="button" onClick={() => setMode("none")} className="h-9 rounded-lg border border-border-strong px-3 text-xs">
                  {t("back")}
                </button>
                {noState.error && <span className="text-xs text-danger">{noState.error}</span>}
              </div>
            </form>
          )}
          {members.length === 0 && <p className="text-[11px] text-warning">{t("lenderNoMember")}</p>}
        </div>
      )}

      {canCancel && !canDecide && <CancelButton projectId={projectId} requestId={row.id} />}
    </div>
  );
}

function CancelButton({ projectId, requestId }: { projectId: string; requestId: string }) {
  const t = useTranslations("projects.planning.loan");
  const [state, action, busy] = useActionState<LoanState, FormData>(async () => cancelLoanRequest(projectId, requestId), {});
  return (
    <form action={action} className="mt-2.5">
      <button type="submit" disabled={busy} className="h-8 rounded-lg border border-border-strong px-3 text-xs hover:bg-surface-2 disabled:opacity-50">
        {busy ? "..." : t("cancel")}
      </button>
      {state.error && <span className="ml-2 text-xs text-danger">{state.error}</span>}
    </form>
  );
}
