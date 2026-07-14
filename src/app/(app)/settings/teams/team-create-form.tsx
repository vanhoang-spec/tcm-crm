"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { createTeam, type SettingsFormState } from "./actions";

export function TeamCreateForm() {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(createTeam, {});
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTranslations("settings.teams");

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-2 rounded-lg border border-dashed border-border-strong p-3 sm:flex-row sm:items-center"
    >
      <input
        name="code"
        placeholder={t("codePlaceholder")}
        required
        maxLength={10}
        className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm uppercase outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:w-28"
      />
      <input
        name="name"
        placeholder={t("namePlaceholder")}
        required
        className="h-9 w-full flex-1 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("addTeam")}
      </button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
