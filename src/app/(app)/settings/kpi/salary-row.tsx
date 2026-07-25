"use client";

import { useActionState, useTransition } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { saveKpiPositionSalary, copyKpiSalariesFromPeriod, type KpiSettingsState } from "./actions";

const input = "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function KpiSalaryRow({
  positionTitle,
  departmentCode,
  periodCode,
  monthlySalary,
  note,
}: {
  positionTitle: string;
  departmentCode: string;
  periodCode: string;
  monthlySalary: number | null;
  note: string;
}) {
  const t = useTranslations("settings.kpi");
  const tCommon = useTranslations("common");
  const action = saveKpiPositionSalary.bind(null, positionTitle, departmentCode, periodCode);
  const [state, formAction, pending] = useActionState<KpiSettingsState, FormData>(action, {});

  return (
    <form action={formAction} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-border p-3 sm:grid-cols-[110px_150px_1fr_1fr_auto]">
      <span className="text-xs font-medium text-muted-foreground">{departmentCode}</span>
      <span className="text-sm font-medium text-foreground">{positionTitle}</span>
      <NumberField
        name="monthlySalary"
        defaultValue={monthlySalary ?? ""}
        placeholder={t("colSalaryInput")}
        className={input + " w-full"}
        aria-label={t("colSalaryInput")}
      />
      <input name="note" defaultValue={note} placeholder={t("colNote")} className={input + " w-full"} aria-label={t("colNote")} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50">
          {pending ? "..." : tCommon("save")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">✓</span>}
      </div>
    </form>
  );
}

export function CopySalariesButton({ fromPeriod, toPeriod, label }: { fromPeriod: string; toPeriod: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => copyKpiSalariesFromPeriod(fromPeriod, toPeriod))}
      className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}
