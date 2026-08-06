"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateCreativeSquad, type SquadFormState } from "./actions";

const field =
  "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export type CreativeStaffOption = { id: string; label: string };

/** Một hàng team nhỏ: tên · trưởng team (chọn từ nhân sự Creative) · bật/tắt. Mirror settings/teams. */
export function SquadRow({
  squad,
  staffOptions,
}: {
  squad: { id: string; code: string; name: string; isActive: boolean; leadStaffId: string | null };
  staffOptions: CreativeStaffOption[];
}) {
  const action = updateCreativeSquad.bind(null, squad.id);
  const [state, formAction, pending] = useActionState<SquadFormState, FormData>(action, {});
  const t = useTranslations("settings.creativeSquads");
  const tCommon = useTranslations("common");

  return (
    <form action={formAction} className="rounded-lg border border-border p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[130px_1fr_auto] sm:items-center">
        <span className="font-mono text-xs font-semibold text-muted-foreground">{squad.code}</span>
        <input name="name" defaultValue={squad.name} maxLength={120} className={field} required />
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          {pending ? "..." : tCommon("save")}
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block text-[11px] text-muted-foreground">
          {t("lead")}
          <select name="leadStaffId" defaultValue={squad.leadStaffId ?? ""} className={field + " mt-1 w-full sm:max-w-sm"}>
            <option value="">{t("leadNone")}</option>
            {staffOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isActive" defaultChecked={squad.isActive} className="h-3.5 w-3.5 rounded border-border-strong" />
          {t("active")}
        </label>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t("leadHint")}</p>

      {state.error && <p className="mt-2 text-xs text-danger">{t("errGeneric")}</p>}
      {state.success && <p className="mt-2 text-xs text-success">{t("saved")}</p>}
    </form>
  );
}
