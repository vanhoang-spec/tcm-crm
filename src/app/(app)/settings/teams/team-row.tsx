"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateTeam, type SettingsFormState } from "./actions";

export type TeamMember = { id: string; fullName: string };

export function TeamRow({
  team,
  members,
}: {
  team: { id: string; code: string; name: string; isActive: boolean; leadStaffId: string | null };
  /** Nhân sự ĐANG LÀM VIỆC của chính team này — nguồn duy nhất cho ô Trưởng team. */
  members: TeamMember[];
}) {
  const action = updateTeam.bind(null, team.id);
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(action, {});
  const t = useTranslations("settings.teams");
  const tCommon = useTranslations("common");

  const field =
    "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <form action={formAction} className="rounded-lg border border-border p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[100px_1fr_100px_auto] sm:items-center">
        <input name="code" defaultValue={team.code} maxLength={10} className={field + " uppercase"} />
        <input name="name" defaultValue={team.name} className={field} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isActive" defaultChecked={team.isActive} className="h-3.5 w-3.5 rounded border-border-strong" />
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
        </div>
      </div>

      <label className="mt-2 block text-[11px] text-muted-foreground">
        {t("lead")}
        <select name="leadStaffId" defaultValue={team.leadStaffId ?? ""} className={field + " mt-1 w-full sm:max-w-sm"}>
          <option value="">{t("leadNone")}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {members.length === 0 ? t("leadNoMember") : t("leadHint")}
      </p>

      {state.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
    </form>
  );
}
