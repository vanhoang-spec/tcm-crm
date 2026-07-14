"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateOptionItem, type SettingsFormState } from "./actions";

export function OptionItemRow({
  item,
  setCode,
}: {
  item: { id: string; code: string; labelVi: string; labelEn: string | null; isActive: boolean };
  setCode: string;
}) {
  const action = updateOptionItem.bind(null, item.id, setCode);
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(action, {});
  const t = useTranslations("settings.options");
  const tCommon = useTranslations("common");

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[90px_1fr_1fr_110px_auto] sm:items-center"
    >
      <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
      <input
        name="labelVi"
        defaultValue={item.labelVi}
        placeholder={t("labelVi")}
        className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <input
        name="labelEn"
        defaultValue={item.labelEn ?? ""}
        placeholder={t("labelEn")}
        className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="isActive" defaultChecked={item.isActive} className="h-3.5 w-3.5 rounded border-border-strong" />
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
