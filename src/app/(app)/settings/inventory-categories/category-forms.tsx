"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createCategory, updateCategory, type CategoryFormState } from "./actions";

const input =
  "h-11 sm:h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export type ParentOption = { id: string; label: string };

export function CategoryCreateForm({ parents }: { parents: ParentOption[] }) {
  const [state, formAction, pending] = useActionState<CategoryFormState, FormData>(createCategory, {});
  const t = useTranslations("settings.inventoryCategories");
  const [parentId, setParentId] = useState("");

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("newNode")}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formParent")}
          <select name="parentId" value={parentId} onChange={(e) => setParentId(e.target.value)} className={input + " w-full"}>
            <option value="">{t("rootOption")}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formName")}
          <input name="name" className={input + " w-full"} required />
        </label>
        {parentId === "" && (
          <>
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("formCode")}
              <input name="code" maxLength={1} className={input + " w-full font-mono uppercase"} required placeholder="P" />
              <span className="block text-[11px] leading-snug">{t("formCodeHint")}</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="isClientOwned" className="h-4 w-4 rounded border-border-strong" />
              {t("formClientOwned")}
            </label>
          </>
        )}
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formSort")}
          <input name="sort" type="number" defaultValue={0} className={input + " w-full"} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9"
        >
          {pending ? "..." : t("create")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{t("created")}</span>}
      </div>
    </form>
  );
}

export function CategoryEditForm({
  node,
}: {
  node: { id: string; name: string; sort: number; isActive: boolean };
}) {
  const [state, formAction, pending] = useActionState<CategoryFormState, FormData>(updateCategory.bind(null, node.id), {});
  const t = useTranslations("settings.inventoryCategories");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-2.5">
      <label className="space-y-1 text-xs text-muted-foreground">
        {t("formName")}
        <input name="name" defaultValue={node.name} className={input + " w-56"} required />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        {t("formSort")}
        <input name="sort" type="number" defaultValue={node.sort} className={input + " w-20"} />
      </label>
      <label className="flex h-11 items-center gap-2 text-xs text-muted-foreground sm:h-9">
        <input type="checkbox" name="isActive" defaultChecked={node.isActive} className="h-4 w-4 rounded border-border-strong" />
        {t("active")}
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9"
      >
        {pending ? "..." : t("save")}
      </button>
      {state.error && <span className="pb-2 text-xs text-danger">{state.error}</span>}
      {state.success && <span className="pb-2 text-xs text-success">{t("saved")}</span>}
    </form>
  );
}
