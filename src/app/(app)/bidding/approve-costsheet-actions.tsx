"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { approveCostSheet, rejectCostSheet, type ProjectFormState } from "./actions";

export function ApproveCostSheetActions({
  projectId,
  costSheetId,
  latestRevNo,
  belowMinMargin = false,
}: {
  projectId: string;
  costSheetId: string;
  /**
   * FIN-B — revNo của bản người duyệt ĐANG NHÌN (bản mới nhất lúc render). Server đối chiếu lại:
   * Account lưu thêm bản trong lúc người duyệt đang đọc thì từ chối, bắt xem bản mới rồi duyệt.
   * Duyệt xong trần chi ở module ④ mới đồng bộ theo bản này.
   */
  latestRevNo: number;
  /** Bảng dưới ngưỡng margin → duyệt tức là override, phải kèm lý do (xem approveCostSheet). */
  belowMinMargin?: boolean;
}) {
  const t = useTranslations("bidding.costsheet");
  const approveBound = approveCostSheet.bind(null, projectId, costSheetId);
  const rejectBound = rejectCostSheet.bind(null, projectId, costSheetId);
  const [approveState, approveAction, approvePending] = useActionState<ProjectFormState, FormData>(approveBound, {});
  const [rejectState, rejectAction, rejectPending] = useActionState<ProjectFormState, FormData>(rejectBound, {});
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="space-y-2">
      <span className="inline-flex items-center rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
        {t("pendingApproval")}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <form action={approveAction} className="space-y-1.5">
          <input type="hidden" name="revNo" value={latestRevNo} />
          {belowMinMargin && (
            <input
              name="overrideNote"
              placeholder={t("overrideNotePlaceholder")}
              className="h-9 w-full min-w-56 rounded-lg border border-border-strong bg-surface px-2.5 text-sm"
            />
          )}
          <button
            type="submit"
            disabled={approvePending}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("approveRev", { rev: latestRevNo })}
          </button>
          {(approveState.fieldErrors?.overrideNote || approveState.error) && (
            <p className="text-xs text-danger" role="alert">
              {approveState.fieldErrors?.overrideNote ?? approveState.error}
            </p>
          )}
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
