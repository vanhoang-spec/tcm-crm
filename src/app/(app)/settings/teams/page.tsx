import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { TeamRow } from "./team-row";
import { TeamCreateForm } from "./team-create-form";
import { requirePermission } from "@/lib/permissions";

export default async function SettingsTeamsPage() {
  await requirePermission("settings.teams.manage");
  const [teams, t] = await Promise.all([
    prisma.team.findMany({
      orderBy: { code: "asc" },
      include: { staff: { where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } } },
    }),
    getTranslations("settings.teams"),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <div className="space-y-3">
        {teams.map((tm) => (
          <TeamRow key={tm.id} team={tm} members={tm.staff} />
        ))}
        <TeamCreateForm />
      </div>
    </div>
  );
}
