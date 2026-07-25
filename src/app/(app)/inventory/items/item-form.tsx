"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createItem, updateItem, type ItemFormState } from "./actions";

const input =
  "h-11 sm:h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export type CategoryOption = { id: string; label: string };

export function ItemForm({
  categories,
  item,
}: {
  categories: CategoryOption[];
  item?: {
    id: string;
    code: string;
    name: string;
    categoryId: string | null;
    unit: string | null;
    isReusable: boolean;
    partCount: number;
    isActive: boolean;
    note: string | null;
  };
}) {
  const action = item ? updateItem.bind(null, item.id) : createItem;
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(action, {});
  const t = useTranslations("inventory.items");
  const [code, setCode] = useState(item?.code ?? "");

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{item ? t("edit") : t("newItem")}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formCode")}
          <input
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={input + " w-full font-mono"}
            required
            disabled={!!item}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formName")}
          <input name="name" defaultValue={item?.name ?? ""} className={input + " w-full"} required />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formCategory")}
          <select name="categoryId" defaultValue={item?.categoryId ?? ""} className={input + " w-full"}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formUnit")}
          <input name="unit" defaultValue={item?.unit ?? ""} className={input + " w-full"} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          {t("formPartCount")}
          <select
            name="partCount"
            defaultValue={String(item?.partCount ?? 1)}
            className={input + " w-full"}
            disabled={!!item}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="block text-[11px] leading-snug text-muted-foreground">
            {t("formPartCountHint", { code: code || "CODE" })}
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isReusable" defaultChecked={item?.isReusable ?? true} className="h-4 w-4 rounded border-border-strong" />
          {t("formReusable")}
        </label>
        {item && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="isActive" defaultChecked={item.isActive} className="h-4 w-4 rounded border-border-strong" />
            {t("active")}
          </label>
        )}
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          {t("formNote")}
          <input name="note" defaultValue={item?.note ?? ""} className={input + " w-full"} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9"
        >
          {pending ? "..." : item ? t("save") : t("create")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{item ? t("saved") : t("created")}</span>}
      </div>
    </form>
  );
}
