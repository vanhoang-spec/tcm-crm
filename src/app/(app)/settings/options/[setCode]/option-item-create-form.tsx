"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { createOptionItem, type SettingsFormState } from "./actions";

export function OptionItemCreateForm({ setCode }: { setCode: string }) {
  const action = createOptionItem.bind(null, setCode);
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTranslations("settings.options");

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="grid grid-cols-1 gap-2 rounded-lg border border-dashed border-border-strong p-3 sm:grid-cols-[90px_1fr_1fr_auto] sm:items-center"
    >
      <input
        name="code"
        placeholder={t("code")}
        required
        maxLength={20}
        className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm uppercase outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <input
        name="labelVi"
        placeholder={t("labelVi")}
        required
        className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <input
        name="labelEn"
        placeholder={t("labelEn")}
        className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("addItem")}
      </button>
      {state.error && <span className="text-xs text-danger sm:col-span-4">{state.error}</span>}
    </form>
  );
}
