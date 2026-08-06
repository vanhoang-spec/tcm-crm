"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Ban, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { markClientCancel, markFailed, moveToProcessing, type ProjectFormState } from "./actions";

export function ResultActions({
  projectId,
  failReasons,
}: {
  projectId: string;
  failReasons: { id: string; code: string; label: string }[];
}) {
  const t = useTranslations("bidding.result");
  const moveBound = moveToProcessing.bind(null, projectId);
  const [moveState, moveAction, movePending] = useActionState<ProjectFormState, FormData>(moveBound, {});
  const failBound = markFailed.bind(null, projectId);
  const [failState, failAction, failPending] = useActionState<ProjectFormState, FormData>(failBound, {});
  const cancelAction = markClientCancel.bind(null, projectId);
  const [failReasonId, setFailReasonId] = useState("");

  return (
    <div className="space-y-4">
      {/* Move to processing */}
      <form action={moveAction} className="space-y-2">
        <button
          type="submit"
          disabled={movePending}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-success px-4 text-sm font-medium text-white hover:bg-success/90 disabled:opacity-50"
        >
          <ArrowRight className="h-4 w-4" />
          {t("moveToProcessing")}
        </button>
        {moveState.error && <p className="text-xs text-danger">{moveState.error}</p>}
      </form>

      {/* Mark failed */}
      <form action={failAction} className="space-y-2 border-t border-border pt-3">
        <label className="block text-xs font-medium text-foreground">{t("failReason")}</label>
        <select
          name="failReasonId"
          value={failReasonId}
          onChange={(e) => setFailReasonId(e.target.value)}
          className={cn("h-9 w-full rounded-lg border bg-surface px-2.5 text-sm", failState.fieldErrors?.failReasonId ? "border-danger" : "border-border-strong")}
        >
          <option value="">{t("selectFailReason")}</option>
          {failReasons.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        {failState.fieldErrors?.failReasonId && <p className="text-xs text-danger">{failState.fieldErrors.failReasonId}</p>}
        <input
          name="failReasonNote"
          required
          placeholder={t("failNote")}
          className={cn("h-9 w-full rounded-lg border bg-surface px-2.5 text-sm", failState.fieldErrors?.failReasonNote ? "border-danger" : "border-border-strong")}
        />
        {!failState.fieldErrors?.failReasonNote && (
          <p className="text-xs text-muted-foreground">{t("failNoteRequiredHint")}</p>
        )}
        {failState.fieldErrors?.failReasonNote && <p className="text-xs text-danger">{failState.fieldErrors.failReasonNote}</p>}
        <button
          type="submit"
          disabled={failPending}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-danger/40 text-sm font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
        >
          <XCircle className="h-4 w-4" />
          {t("markFailed")}
        </button>
      </form>

      {/* Client cancel */}
      <form action={cancelAction} className="border-t border-border pt-3">
        <button
          type="submit"
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border-strong text-sm font-medium text-muted-foreground hover:bg-surface-2"
        >
          <Ban className="h-4 w-4" />
          {t("markClientCancel")}
        </button>
      </form>
    </div>
  );
}
