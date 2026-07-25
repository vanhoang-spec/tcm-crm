"use client";

import { useActionState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { updateShift, createShift, type ShiftFormState } from "./actions";

const input =
  "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function ShiftRow({
  shift,
}: {
  shift: { id: string; code: string; name: string; startTime: string; endTime: string; hours: number; isActive: boolean };
}) {
  const action = updateShift.bind(null, shift.id);
  const [state, formAction, pending] = useActionState<ShiftFormState, FormData>(action, {});
  const t = useTranslations("settings.shifts");

  return (
    <form
      action={formAction}
      className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[80px_1fr_110px_110px_80px_110px_auto] sm:items-center"
    >
      <span className="font-mono text-xs text-muted-foreground">{shift.code}</span>
      <input name="name" defaultValue={shift.name} placeholder={t("formName")} className={input} />
      <input name="startTime" defaultValue={shift.startTime} placeholder="08:00" aria-label={t("formStart")} className={input + " font-mono"} />
      <input name="endTime" defaultValue={shift.endTime} placeholder="12:00" aria-label={t("formEnd")} className={input + " font-mono"} />
      <NumberField decimals={2} name="hours" defaultValue={shift.hours} aria-label={t("formHours")} className={input} />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="isActive" defaultChecked={shift.isActive} className="h-3.5 w-3.5 rounded border-border-strong" />
        {t("active")}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          {pending ? "..." : t("save")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

export function ShiftCreateForm() {
  const [state, formAction, pending] = useActionState<ShiftFormState, FormData>(createShift, {});
  const t = useTranslations("settings.shifts");

  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("newTitle")}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[110px_1fr_110px_110px_80px_auto] sm:items-center">
        <input name="code" placeholder={t("formCode")} className={input + " font-mono uppercase"} required />
        <input name="name" placeholder={t("formName")} className={input} required />
        <input name="startTime" placeholder="08:00" aria-label={t("formStart")} className={input + " font-mono"} required />
        <input name="endTime" placeholder="12:00" aria-label={t("formEnd")} className={input + " font-mono"} required />
        <NumberField decimals={2} name="hours" defaultValue={4} aria-label={t("formHours")} className={input} />
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
