"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { NumberField } from "@/components/ui/number-field";
import {
  approveDestroyRequest,
  approveIssueRequest,
  approveReserveRequest,
  approveTransferRequest,
  cancelRequest,
  confirmDestroyRequest,
  confirmIntakeRequest,
  confirmIssueRequest,
  confirmTransferRequest,
  rejectDestroyRequest,
  rejectIssueRequest,
  rejectReserveRequest,
  rejectTransferRequest,
  type RequestFormState,
} from "./actions";

const input =
  "h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:h-9";

/** `quantity` = số đề xuất; `approvedQuantity` = số đã duyệt (K6, null với phiếu cũ = duyệt đủ). */
export type ConfirmLine = { id: string; code: string; name: string; unit: string | null; quantity: number; approvedQuantity?: number | null };

/**
 * Duyệt / từ chối — chỉ hiện với người được duyệt (page đã lọc theo dự án CHỦ HÀNG). Dùng chung cho lệnh XUẤT, ĐỀ XUẤT
 * HỦY (K6: duyệt TỪNG DÒNG 0..n — 0 = từ chối dòng, dưới đề xuất = một phần, bắt buộc lý do), GIỮ CHỖ và ĐIỀU CHUYỂN
 * (cả phiếu như cũ). ⚠ Ô số + lý do là ô uncontrolled/controlled trộn: form chặn reset để không mất sau action lỗi.
 */
export function ApproveForm({ requestId, kind = "ISSUE", lines = [] }: { requestId: string; kind?: "ISSUE" | "RESERVE" | "TRANSFER" | "DESTROY"; lines?: ConfirmLine[] }) {
  const t = useTranslations("inventory.requests");
  const approveFn = kind === "RESERVE" ? approveReserveRequest : kind === "TRANSFER" ? approveTransferRequest : kind === "DESTROY" ? approveDestroyRequest : approveIssueRequest;
  const rejectFn = kind === "RESERVE" ? rejectReserveRequest : kind === "TRANSFER" ? rejectTransferRequest : kind === "DESTROY" ? rejectDestroyRequest : rejectIssueRequest;
  const [approveState, approveAction, approving] = useActionState<RequestFormState, FormData>(approveFn.bind(null, requestId), {});
  const [rejectState, rejectAction, rejecting] = useActionState<RequestFormState, FormData>(rejectFn.bind(null, requestId), {});
  const [showReject, setShowReject] = useState(false);
  const perLine = (kind === "ISSUE" || kind === "DESTROY") && lines.length > 0;
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.id, l.quantity])));
  const [reason, setReason] = useState("");
  const anyBelow = perLine && lines.some((l) => (qty[l.id] ?? l.quantity) < l.quantity);
  const allZero = perLine && lines.every((l) => (qty[l.id] ?? l.quantity) === 0);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("approveTitle")}</h2>
      {perLine && <p className="text-xs text-muted-foreground">{t("approvePerLineHint")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <form action={approveAction} onReset={(e) => e.preventDefault()} className="w-full space-y-2">
          {perLine && (
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
                      onChange={(v) => setQty((prev) => ({ ...prev, [l.id]: Math.max(0, Math.min(v, l.quantity)) }))}
                      aria-label={t("approvedQty")}
                      className="h-11 w-24 rounded-lg border border-border-strong bg-surface px-2 text-center text-base font-semibold sm:h-9"
                    />
                    <span className="text-xs text-muted-foreground">/ {l.quantity}{l.unit ? ` ${l.unit}` : ""}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {perLine && (anyBelow || allZero) && (
            <input
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder={allZero ? t("rejectReason") : t("partialReason")}
              className={input + " w-full sm:max-w-md"}
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={approving}
              className={"h-11 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50 sm:h-9 " + (allZero ? "bg-danger" : "bg-brand-600 hover:bg-brand-700")}
            >
              {approving ? "..." : allZero ? t("rejectSubmit") : anyBelow ? t("approvePartialBtn") : t("approveBtn")}
            </button>
            {approveState.error && <span className="text-xs text-danger">{approveState.error}</span>}
          </div>
        </form>
        <button
          type="button"
          onClick={() => setShowReject((v) => !v)}
          className="h-11 rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground hover:bg-surface-2 sm:h-9"
        >
          {t("rejectBtn")}
        </button>
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
export function ConfirmForm({ requestId, kind, lines }: { requestId: string; kind: "ISSUE" | "INTAKE" | "TRANSFER" | "DESTROY"; lines: ConfirmLine[] }) {
  const action = kind === "ISSUE" ? confirmIssueRequest : kind === "TRANSFER" ? confirmTransferRequest : kind === "DESTROY" ? confirmDestroyRequest : confirmIntakeRequest;
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(action.bind(null, requestId), {});
  const t = useTranslations("inventory.requests");
  // K6: trần thực xuất/hủy = số Account ĐÃ DUYỆT (null = phiếu cũ → số đề xuất).
  const capOf = (l: ConfirmLine) => l.approvedQuantity ?? l.quantity;
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.id, capOf(l)])));
  // K7: DN nhập 0 hết = "hàng không về" → phiếu từ chối, bắt buộc lý do (server kiểm lại).
  const intakeNothing = kind === "INTAKE" && lines.every((l) => (qty[l.id] ?? capOf(l)) === 0);
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} onReset={(e) => e.preventDefault()} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{kind === "INTAKE" ? t("confirmIntakeTitle") : kind === "TRANSFER" ? t("confirmTransferTitle") : kind === "DESTROY" ? t("confirmDestroyTitle") : t("confirmIssueTitle")}</h2>
        <p className="text-xs text-muted-foreground">{kind === "INTAKE" ? t("confirmIntakeHint") : kind === "TRANSFER" ? t("confirmTransferHint") : kind === "DESTROY" ? t("confirmDestroyHint") : t("confirmIssueHint")}</p>
      </div>
      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{l.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {l.code} · {t("proposedQty", { count: l.quantity })}
                {l.approvedQuantity !== null && l.approvedQuantity !== undefined && l.approvedQuantity !== l.quantity ? ` · ${t("approvedQtyShort", { count: l.approvedQuantity })}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NumberField
                name={`qty_${l.id}`}
                value={qty[l.id] ?? capOf(l)}
                onChange={(v) => setQty((prev) => ({ ...prev, [l.id]: Math.min(v, capOf(l)) }))}
                aria-label={t("actualQty")}
                className="h-11 w-24 rounded-lg border border-border-strong bg-surface px-2 text-center text-base font-semibold sm:h-9"
              />
              {l.unit && <span className="text-xs text-muted-foreground">{l.unit}</span>}
            </div>
          </li>
        ))}
      </ul>
      {intakeNothing && (
        <label className="block space-y-1 text-xs text-muted-foreground">
          {t("intakeNothingReason")}
          <input name="reason" value={reason} onChange={(e) => setReason(e.target.value)} required className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm sm:h-9" />
          <span className="block text-[11px] leading-snug">{t("intakeNothingHint")}</span>
        </label>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`h-11 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50 sm:h-9 ${intakeNothing ? "bg-danger" : "bg-brand-600 hover:bg-brand-700"}`}
        >
          {pending ? "..." : intakeNothing ? t("intakeNothingBtn") : t("confirmBtn")}
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
