"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/ui/date-field";
import { updateExpectedReturn, type DocFormState } from "./actions";

export function ExpectedReturnForm({ docId, current }: { docId: string; current: string | null }) {
  const action = updateExpectedReturn.bind(null, docId);
  const [state, formAction, pending] = useActionState<DocFormState, FormData>(action, {});
  const t = useTranslations("inventory.documents");

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-muted-foreground" htmlFor="expectedReturnAt">
        {t("updateExpectedReturn")}
      </label>
      <DateField
        id="expectedReturnAt"
        name="expectedReturnAt"
        defaultValue={current ?? ""}
        className="h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9"
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50 sm:h-9"
      >
        {pending ? "..." : t("updateExpectedReturn")}
      </button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
      {state.success && <span className="text-xs text-success">{t("expectedReturnSaved")}</span>}
    </form>
  );
}
