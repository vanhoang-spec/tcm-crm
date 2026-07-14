import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, Gavel } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { pickLabel } from "@/lib/utils";
import { STATUS_TONE, TEAM_TONE } from "@/lib/bidding-ui";
import type { Locale } from "@/i18n/locales";
import { RolesForm } from "./roles-form";
import { TeamManager, type MemberData } from "./team-manager";
import { TimelineEditor, type TimelineItemData } from "./timeline-editor";
import { GuestInviteManager, type InviteData } from "./guest-invite-manager";

export default async function ProjectWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      ownerTeam: true,
      owner: true,
      leader: true,
      status: true,
      members: { include: { staff: { include: { department: true } } }, orderBy: { createdAt: "asc" } },
      timelineItems: { include: { status: true }, orderBy: { sort: "asc" } },
      guestInvites: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) notFound();

  const [t, tTeam, tTimeline, tGuest, locale, allStaff, departments, statusSet] = await Promise.all([
    getTranslations("projects.detail"),
    getTranslations("projects.team"),
    getTranslations("projects.timeline"),
    getTranslations("projects.guestInvite"),
    getLocale() as Promise<Locale>,
    prisma.staff.findMany({ where: { isActive: true }, include: { department: true }, orderBy: { fullName: "asc" } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.optionSet.findUnique({
      where: { code: "timeline_status" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
  ]);

  const accountStaff = allStaff
    .filter((s) => s.department?.code === "ACCOUNT")
    .map((s) => ({ id: s.id, label: s.fullName }));
  const staffOptions = allStaff.map((s) => ({
    id: s.id,
    label: s.department?.code ? `${s.fullName} · ${s.department.code}` : s.fullName,
  }));
  const statusOptions = (statusSet?.items ?? []).map((it) => ({ id: it.id, label: pickLabel(it, locale) }));
  const departmentOptions = departments.map((d) => ({ code: d.code, name: d.name }));

  const memberData: MemberData[] = project.members.map((m) => ({
    id: m.id,
    staffName: m.staff.fullName,
    title: m.staff.title,
    departmentCode: m.staff.department?.code ?? null,
    roleInProject: m.roleInProject,
  }));

  const timelineData: TimelineItemData[] = project.timelineItems.map((it) => ({
    id: it.id,
    parentId: it.parentId,
    title: it.title,
    startDate: it.startDate,
    endDate: it.endDate,
    ownerStaffId: it.ownerStaffId,
    departmentCode: it.departmentCode,
    statusId: it.statusId,
    isShared: it.isShared,
    externalPublished: it.externalPublished,
    clientEditable: it.clientEditable,
    externalTitle: it.externalTitle,
    externalStartDate: it.externalStartDate,
    externalEndDate: it.externalEndDate,
    clientStatus: it.clientStatus,
    clientNote: it.clientNote,
  }));

  const inviteData: InviteData[] = project.guestInvites.map((iv) => ({
    id: iv.id,
    name: iv.name,
    email: iv.email,
    revokedAt: iv.revokedAt,
    lastAccessAt: iv.lastAccessAt,
  }));

  // Base URL cho link mời guest (copy tuyệt đối).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
        <LinkButton href={`/bidding/${project.id}`} variant="secondary" size="sm">
          <Gavel className="h-3.5 w-3.5" />
          CO/CE
        </LinkButton>
      </div>

      {/* Roles */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("rolesTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("rolesDesc")}</p>
        <RolesForm projectId={project.id} accountStaff={accountStaff} ownerId={project.ownerId} leaderId={project.leaderId} />
      </section>

      {/* Project Team */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{tTeam("title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{tTeam("desc")}</p>
        <div className="mt-3">
          <TeamManager projectId={project.id} members={memberData} allStaff={staffOptions} />
        </div>
      </section>

      <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-3 py-2 text-xs text-muted-foreground sm:hidden">
        {t("mobileFullDetailNote")}
      </p>

      {/* Internal Master Timeline */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{tTimeline("title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{tTimeline("desc")}</p>
        <div className="mt-3">
          <TimelineEditor
            projectId={project.id}
            items={timelineData}
            staff={staffOptions}
            statuses={statusOptions}
            departments={departmentOptions}
          />
        </div>
      </section>

      {/* Guest invites */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{tGuest("title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{tGuest("desc")}</p>
        <div className="mt-3">
          <GuestInviteManager projectId={project.id} invites={inviteData} baseUrl={baseUrl} />
        </div>
      </section>
    </div>
  );
}
