"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { approveCostSheet, rejectCostSheet, type ProjectFormState } from "./actions";

export function ApproveCostSheetActions({ projectId, costSheetId }: { projectId: string; costSheetId: string }) {
  const t = useTranslations("bidding.costsheet");
  const approveBound = approveCostSheet.bind(null, projectId, costSheetId);
  const rejectBound = rejectCostSheet.bind(null, projectId, costSheetId);
  const [rejectState, rejectAction, rejectPending] = useActionState<ProjectFormState, FormData>(rejectBound, {});
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="space-y-2">
      <span className="inline-flex items-center rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
        {t("pendingApproval")}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <form action={approveBound}>
          <button
            type="submit"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-xs font-medium text-white hover:bg-success/90"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("approve")}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setShowReject((v) => !v)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/40 px-3 text-xs font-medium text-danger hover:bg-danger-bg"
        >
          <XCircle className="h-3.5 w-3.5" />
          {t("reject")}
        </button>
      </div>
      {showReject && (
        <form action={rejectAction} className="space-y-1.5">
          <input
            name="rejectNote"
            placeholder={t("rejectNotePlaceholder")}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm"
          />
          {rejectState.fieldErrors?.rejectNote && <p className="text-xs text-danger">{rejectState.fieldErrors.rejectNote}</p>}
          <button
            type="submit"
            disabled={rejectPending}
            className="h-8 rounded-lg border border-danger/40 px-3 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
          >
            {t("reject")}
          </button>
        </form>
      )}
    </div>
  );
}
