"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateWarehouse, type WarehouseFormState } from "./actions";

const input =
  "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function WarehouseRow({
  warehouse,
}: {
  warehouse: { id: string; code: string; name: string; location: string | null; isMain: boolean; isActive: boolean };
}) {
  const action = updateWarehouse.bind(null, warehouse.id);
  const [state, formAction, pending] = useActionState<WarehouseFormState, FormData>(action, {});
  const t = useTranslations("settings.warehouses");
  const tCommon = useTranslations("common");

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[80px_1fr_1fr_110px_110px_auto] sm:items-center"
    >
      <span className="font-mono text-xs text-muted-foreground">{warehouse.code}</span>
      <input name="name" defaultValue={warehouse.name} placeholder={t("formName")} className={input} />
      <input name="location" defaultValue={warehouse.location ?? ""} placeholder={t("formLocation")} className={input} />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="isMain" defaultChecked={warehouse.isMain} className="h-3.5 w-3.5 rounded border-border-strong" />
        {t("mainBadge")}
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="isActive" defaultChecked={warehouse.isActive} className="h-3.5 w-3.5 rounded border-border-strong" />
        {t("active")}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          {pending ? "..." : tCommon("save")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
