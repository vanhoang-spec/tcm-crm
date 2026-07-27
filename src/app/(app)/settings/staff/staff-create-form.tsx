"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { createStaff, type StaffFormState } from "./actions";

const inputClass =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function StaffCreateForm({
  departments,
  teams,
  roles,
}: {
  departments: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  roles: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<StaffFormState, FormData>(createStaff, {});
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTranslations("settings.staff");

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="space-y-3 rounded-xl border border-dashed border-border-strong p-4"
    >
      <p className="text-xs font-medium text-muted-foreground">{t("addStaff")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input name="fullName" placeholder={t("fullNamePlaceholder")} required className={inputClass} />
        {/* type="text": tài khoản vận hành nội bộ gõ tên ngắn không có "@" (xem normalizeLoginId). */}
        <input name="email" type="text" autoCapitalize="none" spellCheck={false} placeholder={t("emailPlaceholder")} required className={inputClass} />
        <input name="title" placeholder={t("titlePlaceholder")} className={inputClass} />
        <input
          name="dateOfBirth"
          placeholder="DD/MM/YYYY"
          required
          pattern="\d{2}/\d{2}/\d{4}"
          title={t("dobHint")}
          className={inputClass}
        />
        <input
          name="firstWorkDate"
          placeholder="DD/MM/YYYY"
          required
          pattern="\d{2}/\d{2}/\d{4}"
          title={t("firstWorkDateHint")}
          className={inputClass}
        />
        <select name="departmentId" defaultValue="" className={inputClass}>
          <option value="">{t("noDepartment")}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select name="teamId" defaultValue="" className={inputClass}>
          <option value="">{t("noTeam")}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>{tm.name}</option>
          ))}
        </select>
        <select name="roleId" defaultValue="" className={inputClass}>
          <option value="">{t("noRole")}</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <label className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="payrollExempt" className="h-4 w-4 rounded border-border-strong" />
          {t("payrollExemptLabel")}
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("loginIdHint")}</p>
      <p className="text-[11px] text-muted-foreground">{t("roleHint")}</p>
      <p className="text-[11px] text-muted-foreground">{t("payrollExemptHint")}</p>
      <p className="text-[11px] text-muted-foreground">{t("dobHint")}</p>
      <p className="text-[11px] text-muted-foreground">{t("firstWorkDateHint")}</p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("addStaff")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
