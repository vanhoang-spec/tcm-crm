import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { pickLabel, toNum } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { ProjectForm } from "../../project-form";
import { updateProject } from "../../actions";
import { PENDING_TEAM_ASSIGNMENT } from "@/lib/validators/project";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const [clients, teams, staff, typeSet, complexitySet, channelSet, t, locale] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.staff.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" } }),
    prisma.optionSet.findUnique({ where: { code: "project_type" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
    prisma.optionSet.findUnique({ where: { code: "complexity" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
    prisma.optionSet.findUnique({ where: { code: "channel" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
    getTranslations("bidding.new"),
    getLocale() as Promise<Locale>,
  ]);

  const updateBound = updateProject.bind(null, project.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={`/bidding/${project.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <ProjectForm
          action={updateBound}
          clients={clients.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
          teams={teams.map((tm) => ({ id: tm.id, label: `${tm.code} — ${tm.name}` }))}
          staff={staff.map((s) => ({ id: s.id, label: s.fullName }))}
          projectTypes={(typeSet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))}
          complexities={(complexitySet?.items ?? []).map((i) => ({ id: i.id, code: i.code, label: pickLabel(i, locale) }))}
          channels={(channelSet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))}
          defaultValues={{
            name: project.name,
            clientId: project.clientId,
            ownerTeamId: project.ownerTeamId ?? PENDING_TEAM_ASSIGNMENT,
            ownerId: project.ownerId ?? "",
            briefLinkUrl: project.briefLinkUrl ?? "",
            projectTypeId: project.projectTypeId ?? "",
            complexityId: project.complexityId,
            budget: project.budget != null ? toNum(project.budget) : undefined,
            channelId: project.channelId ?? "",
            scope: project.scope ?? "",
            venue: project.venue ?? "",
          }}
          submitLabel={t("submit")}
        />
      </div>
    </div>
  );
}
