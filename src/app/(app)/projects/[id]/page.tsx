import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { RolesForm } from "./roles-form";
import { TeamManager, type MemberData } from "./team-manager";
import { GuestInviteManager, type InviteData } from "./guest-invite-manager";
import { KbComplianceCard } from "./kb-compliance-card";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { assignProjectGroup } from "../groups/actions";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.view");
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      members: { include: { staff: { include: { department: true } } }, orderBy: { createdAt: "asc" } },
      guestInvites: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) notFound();

  const [t, tTeam, tGuest, tGroups, allStaff, canManageProject, groupOptions] = await Promise.all([
    getTranslations("projects.detail"),
    getTranslations("projects.team"),
    getTranslations("projects.guestInvite"),
    getTranslations("projects.groups"),
    prisma.staff.findMany({ where: { isActive: true }, include: { department: true }, orderBy: { fullName: "asc" } }),
    hasPermission("bidding.project.manage"),
    // Nhóm đã TẮT vẫn phải nằm trong ô chọn nếu dự án này đang thuộc nó — không thì bấm Lưu là gỡ
    // nhóm trong im lặng (đúng cách ô chọn nhóm khách hàng đang làm).
    prisma.projectGroup.findMany({
      where: { OR: [{ isActive: true }, ...(project.groupId ? [{ id: project.groupId }] : [])] },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
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

      {/* Nhóm chiến dịch — action HẸP, không đi qua form sửa dự án (xem assignProjectGroup). */}
      {canManageProject && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">{tGroups("assignTitle")}</h2>
            <Link href="/projects/groups" className="text-xs text-brand-600 hover:underline">
              {tGroups("manageLink")}
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{tGroups("assignDesc")}</p>
          <form action={assignProjectGroup.bind(null, project.id)} className="mt-3 flex flex-wrap items-center gap-2">
            <select
              name="groupId"
              defaultValue={project.groupId ?? ""}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400"
            >
              <option value="">{tGroups("assignNone")}</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} — {g.name}
                </option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
              {tGroups("assignBtn")}
            </button>
          </form>
        </section>
      )}

      {/* Kho kiến thức khách — cảnh báo mềm, tự ẩn khi khách chưa có chủ đề nào "phải đạt" */}
      <KbComplianceCard projectId={project.id} />

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
