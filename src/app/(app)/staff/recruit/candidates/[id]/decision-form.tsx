"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { decideCandidate, reopenCandidate, type DecideState } from "../../actions";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

const ERR_KEY: Record<string, string> = {
  BAD_OUTCOME: "errGeneric",
  NO_REASON: "errNoDecisionReason",
  ALREADY_DECIDED: "errAlreadyDecided",
  NOT_DECIDED: "errGeneric",
};

/**
 * Chốt kết quả tuyển: Thành công / Từ chối.
 *
 * "Từ chối" KHÔNG xoá gì — hồ sơ chuyển sang Kho hồ sơ, vẫn giữ nguyên vị trí đã ứng tuyển nên
 * sau này tìm lại được theo phòng ban / vị trí. Vì vậy LÝ DO là bắt buộc: một năm sau mở lại mà
 * chỉ thấy "đã từ chối" thì kho hồ sơ vô dụng.
 */
export function DecisionForm({
  candidateId,
  status,
  decisionNote,
  decidedBy,
  decidedAt,
}: {
  candidateId: string;
  status: string;
  decisionNote: string;
  decidedBy: string | null;
  decidedAt: string | null;
}) {
  const t = useTranslations("recruit");
  const [state, formAction, pending] = useActionState<DecideState, FormData>(decideCandidate, {});
  const [reopenState, reopenAction, reopening] = useActionState<DecideState, FormData>(reopenCandidate, {});
  const [outcome, setOutcome] = useState<"HIRED" | "REJECTED" | "">("");
  const [note, setNote] = useState("");

  const decided = status === "HIRED" || status === "REJECTED";

  if (decided) {
    return (
      <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("decisionTitle")}</h2>
        <p className="text-sm text-foreground">
          {t(`decided${status}`)}
          {decidedBy ? ` · ${decidedBy}` : ""}
          {decidedAt ? ` · ${decidedAt}` : ""}
        </p>
        {decisionNote && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{decisionNote}</p>}
        <form action={reopenAction}>
          <input type="hidden" name="candidateId" value={candidateId} />
          <button
            type="submit"
            disabled={reopening}
            className="h-9 rounded-lg border border-border-strong px-3 text-xs font-semibold text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            {reopening ? "..." : t("reopen")}
          </button>
        </form>
        {/* Lỗi của thao tác mở lại hiện RIÊNG — không gộp với lỗi của thao tác chốt (HANDOVER 10.21). */}
        {reopenState.error && <p className="text-xs text-danger">{t(ERR_KEY[reopenState.error] ?? "errGeneric")}</p>}
      </section>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <input type="hidden" name="candidateId" value={candidateId} />
      <input type="hidden" name="outcome" value={outcome} />
      <h2 className="text-sm font-semibold text-foreground">{t("decisionTitle")}</h2>

      {outcome === "" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOutcome("HIRED")}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-success px-4 text-xs font-semibold text-white hover:opacity-90"
          >
            <Check className="h-3.5 w-3.5" />
            {t("outcomeHired")}
          </button>
          <button
            type="button"
            onClick={() => setOutcome("REJECTED")}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-danger px-4 text-xs font-semibold text-white hover:opacity-90"
          >
            <X className="h-3.5 w-3.5" />
            {t("outcomeRejected")}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-foreground">{t(outcome === "HIRED" ? "confirmHired" : "confirmRejected")}</p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {outcome === "REJECTED" ? t("rejectReason") : t("decisionNote")}
            </span>
            <input
              name="decisionNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={input}
              required={outcome === "REJECTED"}
              placeholder={outcome === "REJECTED" ? t("rejectReasonPlaceholder") : ""}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className={
                "h-9 rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-50 " +
                (outcome === "HIRED" ? "bg-success hover:opacity-90" : "bg-danger hover:opacity-90")
              }
            >
              {pending ? "..." : t("confirmDecision")}
            </button>
            <button
              type="button"
              onClick={() => setOutcome("")}
              className="h-9 rounded-lg border border-border-strong px-3 text-xs font-semibold text-foreground hover:bg-surface-2"
            >
              {t("back")}
            </button>
            {state.error && <span className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</span>}
          </div>
        </div>
      )}
    </form>
  );
}
