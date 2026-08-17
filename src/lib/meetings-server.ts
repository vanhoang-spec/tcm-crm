import "server-only";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { computeMarginPct } from "@/lib/bidding";
import { getCareOverdueClients, getTimelineOverdueItems } from "@/lib/reminders";
import { getArOverdueItems } from "@/lib/finance";
import { formatDate, toNum } from "@/lib/utils";
import { MEETING_PROJECT_STATUS_CODES, carryOverActions, renderWeeklyPackMarkdown, weekKey, type WeeklyPackInput } from "@/lib/meetings";

/**
 * MEET-2 — Dựng "gói họp tuần": mọi thứ người chủ trì cần đọc trước buổi họp, gom thành markdown để dán vào
 * Claude Project. Tái dùng ĐÚNG các nguồn số đang chạy (`getTimelineOverdueItems`, `getArOverdueItems`,
 * `getCareOverdueClients`, CO/CE bản CTRACT mới nhất) nên số ở đây luôn khớp /reminders và /finance.
 *
 * ⚠ MARGIN chỉ đưa vào gói khi người bấm có `bidding.costsheet.view_cost` — gói này được COPY ra ngoài app,
 * không được để lọt số giá vốn cho người không được xem (bài học gate cột ở CE-2, HANDOVER 10.27).
 *
 * File này KHÔNG phải "use server": mọi export của file action là endpoint gọi được từ client (bài học
 * PUR-1a) — đây là lib IO dùng chung cho action và (đợt 2) MCP.
 */
export async function buildWeeklyPackMarkdown(teamId: string, weekStart: Date): Promise<string> {
  const [team, canSeeCost] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId }, select: { id: true, code: true, name: true } }),
    hasPermission("bidding.costsheet.view_cost"),
  ]);
  if (!team) throw new Error("TEAM_NOT_FOUND");

  const prevWeek = new Date(weekStart.getTime() - 7 * 24 * 3600 * 1000);
  const [projects, lastMeeting, openActions, timeline, ar, care] = await Promise.all([
    prisma.project.findMany({
      where: { ownerTeamId: team.id, status: { code: { in: [...MEETING_PROJECT_STATUS_CODES] } } },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        eventStartDate: true,
        eventEndDate: true,
        client: { select: { name: true } },
        status: { select: { labelVi: true } },
        costSheets: { where: { version: "CTRACT" }, orderBy: { updatedAt: "desc" }, take: 1, select: { coTotal: true, ceTotal: true } },
      },
    }),
    prisma.accountMeeting.findUnique({
      where: { teamId_weekStart: { teamId: team.id, weekStart: prevWeek } },
      select: {
        rows: {
          orderBy: { sort: "asc" },
          select: { rag: true, update: true, risks: true, nextSteps: true, client: { select: { name: true } }, project: { select: { code: true } } },
        },
      },
    }),
    prisma.accountMeetingAction.findMany({
      where: { status: "OPEN", meeting: { teamId: team.id, weekStart: { lt: weekStart } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, dueDate: true, status: true, assignee: { select: { fullName: true } }, meeting: { select: { weekStart: true } } },
    }),
    getTimelineOverdueItems(team.code),
    getArOverdueItems(team.code),
    getCareOverdueClients(team.code),
  ]);

  const input: WeeklyPackInput = {
    teamCode: team.code,
    teamName: team.name,
    weekStart,
    generatedAt: new Date(),
    projects: projects.map((p) => {
      const cs = p.costSheets[0];
      const margin = canSeeCost && cs ? computeMarginPct(toNum(cs.ceTotal), toNum(cs.coTotal)) : null;
      const ev = p.eventStartDate ? `${formatDate(p.eventStartDate)}${p.eventEndDate ? ` – ${formatDate(p.eventEndDate)}` : ""}` : null;
      return { code: p.code, name: p.name, clientName: p.client.name, statusLabel: p.status.labelVi, marginPct: margin, eventDates: ev };
    }),
    lastWeekRows: (lastMeeting?.rows ?? []).map((r) => ({
      projectCode: r.project?.code ?? null,
      clientName: r.client.name,
      rag: r.rag,
      update: r.update ?? "",
      risks: r.risks ?? "",
      nextSteps: r.nextSteps ?? "",
    })),
    openActions: carryOverActions(openActions.map((a) => ({ ...a, meetingWeekStart: a.meeting.weekStart })), weekStart).map((a) => ({
      title: a.title,
      assignee: a.assignee?.fullName ?? null,
      dueDate: a.dueDate ? formatDate(a.dueDate) : null,
      fromWeek: formatDate(a.meeting.weekStart),
    })),
    overdueTimeline: timeline.map((t) => ({ projectCode: t.projectCode, title: t.title, dueDate: formatDate(t.endDate), daysLate: t.daysOverdue })),
    overdueAr: ar.map((a) => ({ clientName: a.clientName, projectCode: a.projectCode, amount: a.outstanding, daysLate: a.daysOverdue })),
    careOverdue: care.map((c) => ({ clientName: c.clientName, daysSince: c.daysSince })),
  };
  return renderWeeklyPackMarkdown(input);
}

/** Danh sách dùng để khớp kết quả AI: dự án đang chạy + khách của team + nhân sự đang làm việc. */
export async function loadMatchContext(teamId: string) {
  const [projects, clients, staff] = await Promise.all([
    prisma.project.findMany({
      where: { ownerTeamId: teamId, status: { code: { in: [...MEETING_PROJECT_STATUS_CODES] } } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, ownerTeamId: true, client: { select: { id: true, code: true, name: true } } },
    }),
    prisma.client.findMany({ where: { ownerTeamId: teamId, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.staff.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
  ]);
  return { projects, clients, staff };
}

/** Nhãn tuần cho prompt: "17/08/2026". */
export function weekLabel(weekStart: Date): string {
  return weekKey(weekStart).split("-").reverse().join("/");
}
