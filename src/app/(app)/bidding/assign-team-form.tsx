"use client";

import { useTranslations } from "next-intl";
import { assignProjectTeam } from "./actions";

export function AssignTeamForm({ projectId, teams }: { projectId: string; teams: { id: string; label: string }[] }) {
  const t = useTranslations("bidding.detail");
  const bound = assignProjectTeam.bind(null, projectId);

  return (
    <section className="rounded-xl border border-warning/30 bg-warning/10 p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("assignTeamTitle")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("assignTeamDesc")}</p>
      <form action={bound} className="mt-3 flex flex-wrap items-center gap-2">
        <select
          name="teamId"
          required
          className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        >
          <option value="">{t("selectTeamToAssign")}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.label}
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
          {t("assignTeamSubmit")}
        </button>
      </form>
    </section>
  );
}
