"use client";

import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  const options = accountStaff.map((s) => ({ value: s.id, label: s.label }));

  return (
    <form action={assignProjectRoles.bind(null, projectId)} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-foreground">
        {t("ownerLabel")}
        <div className="mt-1">
          <SearchableSelect name="ownerId" defaultValue={ownerId ?? ""} placeholder={t("selectOwner")} options={options} />
        </div>
      </label>
      <label className="text-xs font-medium text-foreground">
        {t("leaderLabel")}
        <div className="mt-1">
          <SearchableSelect name="leaderId" defaultValue={leaderId ?? ""} placeholder={t("selectLeader")} options={options} />
        </div>
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
          {t("saveRoles")}
        </button>
      </div>
    </form>
  );
}
