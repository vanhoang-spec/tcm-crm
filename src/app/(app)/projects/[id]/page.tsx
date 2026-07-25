import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { RolesForm } from "./roles-form";
import { TeamManager, type MemberData } from "./team-manager";
import { GuestInviteManager, type InviteData } from "./guest-invite-manager";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      members: { include: { staff: { include: { department: true } } }, orderBy: { createdAt: "asc" } },
      guestInvites: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) notFound();

  const [t, tTeam, tGuest, allStaff] = await Promise.all([
    getTranslations("projects.detail"),
    getTranslations("projects.team"),
    getTranslations("projects.guestInvite"),
    prisma.staff.findMany({ where: { isActive: true }, include: { department: true }, orderBy: { fullName: "asc" } }),
  ]);

  const accountStaff = allStaff
    .filter((s) => s.department?.code === "ACCOUNT")
    .map((s) => ({ id: s.id, label: s.fullName }));
  const staffOptions = allStaff.map((s) => ({
    id: s.id,
    label: s.department?.code ? `${s.fullName} · ${s.department.code}` : s.fullName,
  }));

  const memberData: MemberData[] = project.members.map((m) => ({
    id: m.id,
    staffName: m.staff.fullName,
    title: m.staff.title,
    departmentCode: m.staff.department?.code ?? null,
    roleInProject: m.roleInProject,
  }));

  const inviteData: InviteData[] = project.guestInvites.map((iv) => ({
    id: iv.id,
    name: iv.name,
    email: iv.email,
    revokedAt: iv.revokedAt,
    lastAccessAt: iv.lastAccessAt,
  }));

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  return (
    <div className="max-w-3xl space-y-6">
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
