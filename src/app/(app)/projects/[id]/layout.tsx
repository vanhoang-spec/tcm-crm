import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { pickLabel } from "@/lib/utils";
import { STATUS_TONE, TEAM_TONE } from "@/lib/bidding-ui";
import type { Locale } from "@/i18n/locales";
import { hasPermission } from "@/lib/permissions";
import { WorkspaceNav } from "./workspace-nav";

export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project, t, tNav, locale] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: { client: true, ownerTeam: true, owner: true, leader: true, status: true },
    }),
    getTranslations("projects.detail"),
    getTranslations("projects.nav"),
    getLocale() as Promise<Locale>,
  ]);
  if (!project) notFound();

  const labels = {
    overview: tNav("overview"),
    pnl: tNav("pnl"),
    timeline: tNav("timeline"),
    orders: tNav("orders"),
    coce: tNav("coce"),
    planning: tNav("planning"),
    operations: tNav("operations"),
    production: tNav("production"),
    purchasing: tNav("purchasing"),
    liquidation: tNav("liquidation"),
  };

  return (
    <div className="space-y-4">
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>
          <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
          <Badge tone={STATUS_TONE[project.status.code] ?? "neutral"}>{pickLabel(project.status, locale)}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {project.ownerTeam && <Badge tone={TEAM_TONE[project.ownerTeam.code] ?? "neutral"}>{project.ownerTeam.code}</Badge>}
          <span>{t("clientLabel")}: {project.client.name}</span>
          <span>· {t("ownerLabel")}: {project.owner?.fullName ?? t("ownerUnassigned")}</span>
          <span>· {t("leaderLabel")}: {project.leader?.fullName ?? t("leaderUnassigned")}</span>
        </div>
      </div>

      {/* Sub-module nav nằm ngang trên đầu (thay left-rail) để nhường chiều ngang cho nội dung (Master Timeline). */}
      <WorkspaceNav projectId={id} labels={labels} showPnl={await hasPermission("projects.pnl.view")} />

      <div className="min-w-0">{children}</div>
    </div>
  );
}
