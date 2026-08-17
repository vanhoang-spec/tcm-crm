import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { MEETING_PROJECT_STATUS_CODES, addWeeks, carryOverActions, mergeRowsWithProjects, parseWeekKey, weekKey, weekStartUtc } from "@/lib/meetings";
import { requireMeetingAccess, canAccessTeam } from "./access";
import { MeetingForm, type MeetingFormData } from "./meeting-form";
import { CarryOverList } from "./carry-over-list";
import { FinalizeControls } from "./finalize-controls";

/**
 * MEET-1 — Họp Account team hằng tuần. Sub-view theo team (tab) + tuần (‹ ›). Cửa: BGĐ (mã meetings.*)
 * hoặc trưởng team (kiểm theo bản ghi) — xem ./access.ts. Mọi số liệu đọc realtime, không cache.
 */
export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ team?: string; week?: string }> }) {
  const access = await requireMeetingAccess();
  const { team: teamParam, week: weekParam } = await searchParams;
  const [t, locale, teams] = await Promise.all([
    getTranslations("meetings"),
    getLocale() as Promise<Locale>,
    prisma.team.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, leadStaffId: true, lead: { select: { fullName: true } } } }),
  ]);
  const visibleTeams = teams.filter((tm) => canAccessTeam(access, tm.id, false));
  if (visibleTeams.length === 0) redirect("/no-access");
  const team = visibleTeams.find((tm) => tm.code === teamParam) ?? visibleTeams[0];
  if (teamParam && team.code !== teamParam) redirect(`/meetings?team=${team.code}`);
  const thisWeek = weekStartUtc(new Date());
  const weekStart = parseWeekKey(weekParam) ?? thisWeek;
  if (weekParam && weekKey(weekStart) !== weekParam) redirect(`/meetings?team=${team.code}&week=${weekKey(thisWeek)}`);
  const canWrite = canAccessTeam(access, team.id, true);

  const [meeting, running, teamClients, prevOpenActions, staff] = await Promise.all([
    prisma.accountMeeting.findUnique({
      where: { teamId_weekStart: { teamId: team.id, weekStart } },
      include: {
        rows: { orderBy: { sort: "asc" }, include: { client: { select: { id: true, code: true, name: true } }, project: { select: { id: true, code: true, name: true, ownerTeamId: true } } } },
        actions: { orderBy: { createdAt: "asc" }, include: { assignee: { select: { id: true, fullName: true } } } },
        finalizedBy: { select: { fullName: true } },
      },
    }),
    prisma.project.findMany({
      where: { ownerTeamId: team.id, status: { code: { in: [...MEETING_PROJECT_STATUS_CODES] } } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, ownerTeamId: true, client: { select: { id: true, code: true, name: true } }, status: { select: { labelVi: true, labelEn: true } } },
    }),
    prisma.client.findMany({ where: { ownerTeamId: team.id, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.accountMeetingAction.findMany({
      where: { status: "OPEN", meeting: { teamId: team.id, weekStart: { lt: weekStart } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: { assignee: { select: { fullName: true } }, meeting: { select: { weekStart: true } }, row: { select: { project: { select: { code: true } }, client: { select: { name: true } } } } },
    }),
    prisma.staff.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, team: { select: { code: true } }, department: { select: { code: true } } } }),
  ]);

  const rows = mergeRowsWithProjects(meeting?.rows ?? [], running, team.id);
  const statusLabelByProject = new Map(running.map((p) => [p.id, pickLabel(p.status, locale)]));
  const carry = carryOverActions(prevOpenActions.map((a) => ({ ...a, meetingWeekStart: a.meeting.weekStart })), weekStart);

  const formData: MeetingFormData = {
    teamId: team.id,
    teamCode: team.code,
    weekKey: weekKey(weekStart),
    meetingId: meeting?.id ?? null,
    finalized: !!meeting?.finalizedAt,
    note: meeting?.note ?? "",
    rawMinutes: meeting?.rawMinutes ?? null,
    rows: rows.map((r) => ({ ...r, statusLabel: r.projectId ? (statusLabelByProject.get(r.projectId) ?? "") : "" })),
    actions: (meeting?.actions ?? []).map((a) => ({ id: a.id, title: a.title, assigneeStaffId: a.assigneeStaffId ?? "", assigneeName: a.assignee?.fullName ?? "", dueDate: a.dueDate ? weekKey(a.dueDate) : "", status: a.status as "OPEN" | "DONE", rowId: a.rowId })),
    clientOptions: teamClients.map((c) => ({ id: c.id, code: c.code, name: c.name })),
    staffOptions: staff.map((s) => ({ value: s.id, label: `${s.fullName}${s.team?.code ? ` · ${s.team.code}` : s.department?.code ? ` · ${s.department.code}` : ""}` })),
    canWrite,
    canAi: access.canAi,
  };

  const prevKey = weekKey(addWeeks(weekStart, -1));
  const nextKey = weekKey(addWeeks(weekStart, 1));
  const tabCls = (active: boolean) => "rounded-md px-3 py-1.5 text-xs font-medium " + (active ? "bg-surface text-brand-700 shadow-sm" : "text-muted-foreground hover:text-foreground");
  const wkLabel = weekKey(weekStart).split("-").reverse().join("/");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
            {visibleTeams.map((tm) => (
              <Link key={tm.id} href={`/meetings?team=${tm.code}&week=${weekKey(weekStart)}`} className={tabCls(tm.id === team.id)}>
                {tm.code}
              </Link>
            ))}
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-1 py-1 text-xs">
            <Link href={`/meetings?team=${team.code}&week=${prevKey}`} className="rounded px-2 py-1 hover:bg-surface-2" aria-label={t("prevWeek")}>‹</Link>
            <span className="px-1 font-medium tabular-nums text-foreground">{t("weekOf", { date: wkLabel })}</span>
            <Link href={`/meetings?team=${team.code}&week=${nextKey}`} className="rounded px-2 py-1 hover:bg-surface-2" aria-label={t("nextWeek")}>›</Link>
            {weekKey(weekStart) !== weekKey(thisWeek) && (
              <Link href={`/meetings?team=${team.code}`} className="ml-1 rounded px-2 py-1 text-brand-600 hover:underline">{t("thisWeek")}</Link>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        <span className="font-semibold text-foreground">{team.code} — {team.name}</span>
        <span className="text-muted-foreground">{t("lead")}: {team.lead?.fullName ?? t("noLead")}</span>
        <span className="text-muted-foreground">·</span>
        {meeting?.finalizedAt ? (
          <span className="rounded bg-success-bg px-2 py-0.5 text-xs font-medium text-success">{t("statusFinalized", { by: meeting.finalizedBy?.fullName ?? "" })}</span>
        ) : meeting ? (
          <span className="rounded bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">{t("statusDraft")}</span>
        ) : (
          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">{t("statusNone")}</span>
        )}
        {canWrite && meeting && <FinalizeControls meetingId={meeting.id} finalized={!!meeting.finalizedAt} />}
      </div>

      <CarryOverList
        items={carry.map((a) => ({ id: a.id, title: a.title, assignee: a.assignee?.fullName ?? null, dueDate: a.dueDate ? weekKey(a.dueDate).split("-").reverse().join("/") : null, fromWeek: weekKey(a.meeting.weekStart).split("-").reverse().join("/"), ref: a.row?.project?.code ?? a.row?.client?.name ?? null }))}
        viewMeetingId={meeting?.id ?? null}
        canWrite={canWrite}
      />

      <MeetingForm key={`${team.id}:${weekKey(weekStart)}:${meeting?.updatedAt?.toISOString() ?? "new"}`} data={formData} />
    </div>
  );
}
