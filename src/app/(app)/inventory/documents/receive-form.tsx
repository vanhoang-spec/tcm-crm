"use client";

import { useActionState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { cancelTransfer, confirmTransferReceive, type DocFormState } from "./actions";

export function ReceiveForm({
  docId,
  lines,
}: {
  docId: string;
  lines: { id: string; code: string; name: string; unit: string | null; quantity: number }[];
}) {
  const receiveAction = confirmTransferReceive.bind(null, docId);
  const cancelAction = cancelTransfer.bind(null, docId);
  const [state, formAction, pending] = useActionState<DocFormState, FormData>(receiveAction, {});
  const [cancelState, cancelFormAction, cancelPending] = useActionState<DocFormState, FormData>(cancelAction, {});
  const t = useTranslations("inventory.documents");

  return (
    <div className="space-y-3 rounded-xl border border-warning/40 bg-warning-bg/40 p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("confirmReceive")}</h2>
        <p className="text-xs text-muted-foreground">{t("receiveHint")}</p>
      </div>
      <form action={formAction} className="space-y-2">
        {lines.map((l) => (
          <div key={l.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{l.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {l.code} · {t("colQtySent")}: {l.quantity}
                {l.unit ? ` ${l.unit}` : ""}
              </p>
            </div>
            <NumberField
              inputMode="numeric"
              name={`received_${l.id}`}
              defaultValue={l.quantity}
              aria-label={t("colQtyReceived")}
              className="h-11 w-24 rounded-lg border border-border-strong bg-surface text-center text-base font-semibold"
            />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="h-12 flex-1 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-10 sm:max-w-xs"
          >
            {pending ? "..." : t("submitReceive")}
          </button>
          {state.error && <span className="text-xs font-medium text-danger">{state.error}</span>}
          {state.success && <span className="text-xs font-medium text-success">{t("received")}</span>}
        </div>
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
