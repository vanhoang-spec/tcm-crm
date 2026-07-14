import { Users, Gavel, Briefcase, Warehouse } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";

export default async function DashboardPage() {
  const [clientCount, teamCount, t, tNav, locale] = await Promise.all([
    prisma.client.count({ where: { isActive: true } }),
    prisma.team.count(),
    getTranslations("dashboard"),
    getTranslations("nav"),
    getLocale() as Promise<Locale>,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label={t("clientsManaged")}
          value={formatNumber(clientCount, locale)}
          sub={t("acrossTeams", { count: formatNumber(teamCount, locale) })}
        />
        <StatCard icon={Gavel} label={tNav("bidding")} value="—" sub={t("moduleComingSoon")} muted />
        <StatCard icon={Briefcase} label={t("runningProjects")} value="—" sub={t("moduleComingSoon")} muted />
        <StatCard icon={Warehouse} label={tNav("inventory")} value="—" sub={t("moduleComingSoon")} muted />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("roadmapTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("roadmapDesc")}</p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  muted,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-bold ${muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
