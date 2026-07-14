"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { CORE_DEPARTMENTS, SUPPORT_DEPARTMENTS } from "@/lib/projects";
import { addProjectMember, removeProjectMember } from "../actions";

export type MemberData = {
  id: string;
  staffName: string;
  title: string | null;
  departmentCode: string | null;
  roleInProject: string;
};
type StaffOpt = { id: string; label: string };

export function TeamManager({
  projectId,
  members,
  allStaff,
}: {
  projectId: string;
  members: MemberData[];
  allStaff: StaffOpt[];
}) {
  const t = useTranslations("projects.team");
  const input =
    "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  const groups: { key: string; label: string; codes: string[] | null }[] = [
    { key: "core", label: t("coreGroup"), codes: CORE_DEPARTMENTS },
    { key: "support", label: t("supportGroup"), codes: SUPPORT_DEPARTMENTS },
    { key: "other", label: t("otherGroup"), codes: null },
  ];

  function membersFor(codes: string[] | null): MemberData[] {
    if (codes) return members.filter((m) => m.departmentCode && codes.includes(m.departmentCode));
    return members.filter((m) => !m.departmentCode || (!CORE_DEPARTMENTS.includes(m.departmentCode) && !SUPPORT_DEPARTMENTS.includes(m.departmentCode)));
  }

  return (
    <div className="space-y-3">
      {members.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}

      {groups.map((g) => {
        const list = membersFor(g.codes);
        if (list.length === 0) return null;
        return (
          <div key={g.key}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
            <ul className="space-y-1">
              {list.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{m.staffName}</span>
                    {m.title && <span className="text-xs text-muted-foreground">{m.title}</span>}
                    {m.departmentCode && <Badge tone="neutral">{m.departmentCode}</Badge>}
                    <Badge tone={m.roleInProject === "LEADER" ? "brand" : m.roleInProject === "CORE" ? "success" : "neutral"}>
                      {t(`role${m.roleInProject}`)}
                    </Badge>
                  </span>
                  <form action={removeProjectMember.bind(null, projectId, m.id)}>
                    <button type="submit" className="rounded-lg border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger-bg">
                      {t("remove")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <form action={addProjectMember.bind(null, projectId)} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <select name="staffId" className={input + " min-w-[180px] flex-1"} required>
          <option value="">{t("selectStaff")}</option>
          {allStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="roleInProject" defaultValue="CORE" className={input}>
          <option value="LEADER">{t("roleLEADER")}</option>
          <option value="CORE">{t("roleCORE")}</option>
          <option value="SUPPORT">{t("roleSUPPORT")}</option>
        </select>
        <button type="submit" className="h-9 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600">
          {t("addMember")}
        </button>
      </form>
    </div>
  );
}
