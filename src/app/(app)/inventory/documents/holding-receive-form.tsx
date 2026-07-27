"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { cancelHoldingTransfer, confirmHoldingReceive, type DocFormState } from "./actions";

/** Bên NHẬN chốt: nhận ĐỦ hoặc huỷ. Không có ô số lượng — phần hụt phải đi qua phiếu BM của bên gửi. */
export function HoldingReceiveForm({
  docId,
  lines,
}: {
  docId: string;
  lines: { id: string; code: string; name: string; unit: string | null; quantity: number }[];
}) {
  const [state, formAction, pending] = useActionState<DocFormState, FormData>(confirmHoldingReceive.bind(null, docId), {});
  const [cancelState, cancelFormAction, cancelPending] = useActionState<DocFormState, FormData>(cancelHoldingTransfer.bind(null, docId), {});
  const t = useTranslations("inventory.documents");

  return (
    <div className="space-y-3 rounded-xl border border-warning/40 bg-warning-bg/40 p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("confirmHoldingReceive")}</h2>
        <p className="text-xs text-muted-foreground">{t("holdingReceiveHint")}</p>
      </div>
      <ul className="space-y-1">
        {lines.map((l) => (
          <li key={l.id} className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">{l.name}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {l.code} · {t("colQtySent")}: {l.quantity}
              {l.unit ? ` ${l.unit}` : ""}
            </p>
          </li>
        ))}
      </ul>
      <form action={formAction} className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-12 flex-1 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-10 sm:max-w-xs"
        >
          {pending ? "..." : t("submitReceive")}
        </button>
        {state.error && <span className="text-xs font-medium text-danger">{state.error}</span>}
        {state.success && <span className="text-xs font-medium text-success">{t("received")}</span>}
      </form>
      <form action={cancelFormAction} className="flex items-center gap-3">
        <button
          type="submit"
          disabled={cancelPending}
          className="h-9 rounded-lg border border-danger/40 px-3 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
        >
          {cancelPending ? "..." : t("cancelTransfer")}
        </button>
        {cancelState.error && <span className="text-xs text-danger">{cancelState.error}</span>}
        {cancelState.success && <span className="text-xs text-success">{t("canceled")}</span>}
      </form>
    </div>
  );
}
