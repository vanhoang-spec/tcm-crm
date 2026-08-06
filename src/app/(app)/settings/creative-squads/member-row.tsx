"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { setStaffSquad, type SquadFormState } from "./actions";

const field =
  "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export type SquadOption = { id: string; name: string };

/** Một hàng phân người: nhân sự Creative × ô chọn team nhỏ. Mỗi người đúng 1 team (cột FK tự thỏa). */
export function MemberRow({
  staff,
  squads,
}: {
  staff: { id: string; fullName: string; title: string | null; creativeSquadId: string | null };
  squads: SquadOption[];
}) {
  const action = setStaffSquad.bind(null, staff.id);
  const [state, formAction, pending] = useActionState<SquadFormState, FormData>(action, {});
  const t = useTranslations("settings.creativeSquads");

  return (
    <form action={formAction} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_240px_auto] sm:items-center">
      <div>
        <p className="text-sm font-medium text-foreground">{staff.fullName}</p>
        <p className="text-xs text-muted-foreground">
          {staff.title ?? "—"}
          {!staff.creativeSquadId && <span className="ml-2 text-warning">{t("noSquadYet")}</span>}
        </p>
      </div>
      <select name="squadId" defaultValue={staff.creativeSquadId ?? ""} className={field}>
        <option value="">{t("noSquad")}</option>
        {squads.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          {pending ? "..." : t("assign")}
        </button>
        {state.error && <span className="text-xs text-danger">{t("errGeneric")}</span>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}
