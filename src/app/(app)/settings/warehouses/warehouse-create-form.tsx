"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createWarehouse, type WarehouseFormState } from "./actions";

const input =
  "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function WarehouseCreateForm() {
  const [state, formAction, pending] = useActionState<WarehouseFormState, FormData>(createWarehouse, {});
  const t = useTranslations("settings.warehouses");

  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("newTitle")}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_1fr_140px_auto] sm:items-center">
        <input name="code" placeholder={t("formCode")} className={input} required />
        <input name="name" placeholder={t("formName")} className={input} required />
        <input name="location" placeholder={t("formLocation")} className={input} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isMain" className="h-3.5 w-3.5 rounded border-border-strong" />
          {t("formIsMain")}
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : t("create")}
        </button>
      </div>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      {state.success && <p className="text-xs text-success">{t("created")}</p>}
    </form>
  );
}
