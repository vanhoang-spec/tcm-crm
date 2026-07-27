"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { NumberField } from "@/components/ui/number-field";
import {
  approveIssueRequest,
  approveReserveRequest,
  approveTransferRequest,
  cancelRequest,
  confirmIntakeRequest,
  confirmIssueRequest,
  confirmTransferRequest,
  rejectIssueRequest,
  rejectReserveRequest,
  rejectTransferRequest,
  type RequestFormState,
} from "./actions";

const input =
  "h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:h-9";

export type ConfirmLine = { id: string; code: string; name: string; unit: string | null; quantity: number };

/** Duyệt / từ chối — chỉ hiện với PIC dự án hoặc người có quyền duyệt mọi dự án (page đã lọc). */
/** Dùng chung cho lệnh XUẤT (PIC dự án duyệt) và GIỮ CHỖ (Kế toán/HR Manager duyệt). */
export function ApproveForm({ requestId, kind = "ISSUE" }: { requestId: string; kind?: "ISSUE" | "RESERVE" | "TRANSFER" }) {
  const t = useTranslations("inventory.requests");
  const approveFn = kind === "RESERVE" ? approveReserveRequest : kind === "TRANSFER" ? approveTransferRequest : approveIssueRequest;
  const rejectFn = kind === "RESERVE" ? rejectReserveRequest : kind === "TRANSFER" ? rejectTransferRequest : rejectIssueRequest;
  const [approveState, approveAction, approving] = useActionState<RequestFormState, FormData>(approveFn.bind(null, requestId), {});
  const [rejectState, rejectAction, rejecting] = useActionState<RequestFormState, FormData>(rejectFn.bind(null, requestId), {});
  const [showReject, setShowReject] = useState(false);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("approveTitle")}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <form action={approveAction}>
          <button
            type="submit"
            disabled={approving}
            className="h-11 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9"
          >
            {approving ? "..." : t("approveBtn")}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setShowReject((v) => !v)}
          className="h-11 rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground hover:bg-surface-2 sm:h-9"
        >
          {t("rejectBtn")}
        </button>
        {approveState.error && <span className="text-xs text-danger">{approveState.error}</span>}
      </div>
      {showReject && (
        <form action={rejectAction} className="flex flex-wrap items-center gap-2">
          <input name="reason" required placeholder={t("rejectReason")} className={input + " flex-1 sm:max-w-md"} />
          <button
            type="submit"
            disabled={rejecting}
            className="h-11 rounded-lg bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50 sm:h-9"
          >
            {rejecting ? "..." : t("rejectSubmit")}
          </button>
          {rejectState.error && <span className="text-xs text-danger">{rejectState.error}</span>}
        </form>
      )}
    </section>
  );
}

/** Thủ kho xác nhận thực xuất / thực nhập — mặc định bằng số đề xuất, sửa xuống được. */
export function ConfirmForm({ requestId, kind, lines }: { requestId: string; kind: "ISSUE" | "INTAKE" | "TRANSFER"; lines: ConfirmLine[] }) {
  const action = kind === "ISSUE" ? confirmIssueRequest : kind === "TRANSFER" ? confirmTransferRequest : confirmIntakeRequest;
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(action.bind(null, requestId), {});
  const t = useTranslations("inventory.requests");
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.id, l.quantity])));

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{kind === "INTAKE" ? t("confirmIntakeTitle") : kind === "TRANSFER" ? t("confirmTransferTitle") : t("confirmIssueTitle")}</h2>
        <p className="text-xs text-muted-foreground">{kind === "INTAKE" ? t("confirmIntakeHint") : kind === "TRANSFER" ? t("confirmTransferHint") : t("confirmIssueHint")}</p>
      </div>
      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{l.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {l.code} · {t("proposedQty", { count: l.quantity })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NumberField
                name={`qty_${l.id}`}
                value={qty[l.id] ?? l.quantity}
                onChange={(v) => setQty((prev) => ({ ...prev, [l.id]: Math.min(v, l.quantity) }))}
                aria-label={t("actualQty")}
                className="h-11 w-24 rounded-lg border border-border-strong bg-surface px-2 text-center text-base font-semibold sm:h-9"
              />
              {l.unit && <span className="text-xs text-muted-foreground">{l.unit}</span>}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9"
        >
          {pending ? "..." : t("confirmBtn")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

export function CancelRequestForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(cancelRequest.bind(null, requestId), {});
  const t = useTranslations("inventory.requests");
  return (
    <form action={formAction} className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg border border-border-strong px-4 text-sm font-medium text-danger hover:bg-surface-2 disabled:opacity-50 sm:h-9"
      >
        {pending ? "..." : t("cancelBtn")}
      </button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
