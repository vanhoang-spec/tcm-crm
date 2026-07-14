"use client";

import { useTranslations } from "next-intl";
import { assignProjectRoles } from "../actions";

type Opt = { id: string; label: string };

/** Gán Project Owner (Account cấp trên) + Project Leader (Account chạy timeline). */
export function RolesForm({
  projectId,
  accountStaff,
  ownerId,
  leaderId,
}: {
  projectId: string;
  accountStaff: Opt[];
  ownerId: string | null;
  leaderId: string | null;
}) {
  const t = useTranslations("projects.detail");
  const input =
    "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <form action={assignProjectRoles.bind(null, projectId)} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-foreground">
        {t("ownerLabel")}
        <select name="ownerId" defaultValue={ownerId ?? ""} className={input + " mt-1"}>
          <option value="">{t("selectOwner")}</option>
          {accountStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-foreground">
        {t("leaderLabel")}
        <select name="leaderId" defaultValue={leaderId ?? ""} className={input + " mt-1"}>
          <option value="">{t("selectLeader")}</option>
          {accountStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
          {t("saveRoles")}
        </button>
      </div>
    </form>
  );
}
