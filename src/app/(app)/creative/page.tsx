import { Palette, Briefcase } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDecimal, formatPercent, pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { draftPhase, getCreativeDashboardStats, isTaskLocked, taskPhase, finishedGraceDaysLeft, taskOverdueDays, type CreativeTaskStatus } from "@/lib/creative";
import { TaskBoard, type TaskData } from "./task-board";
import { DraftPanel, type DraftRow } from "./draft-panel";
import { requirePermission, hasPermission } from "@/lib/permissions";

export default async function CreativePage() {
  await requirePermission("creative.view");
  const [t, locale, stats, tasks, creativeStaff, taskTypeSet, projects, teams, squads, draftsRaw, canManage] = await Promise.all([
    getTranslations("creative"),
    getLocale() as Promise<Locale>,
    getCreativeDashboardStats(),
    prisma.creativeTask.findMany({
      include: {
        project: { include: { status: true, ownerTeam: true } },
        draft: true,
        taskType: true,
        assignee: true,
        orderedBy: true,
        squad: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.staff.findMany({ where: { department: { code: "CREATIVE" }, isActive: true }, orderBy: { fullName: "asc" } }),
    prisma.optionSet.findUnique({
      where: { code: "creative_task_type" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
    prisma.project.findMany({
      where: { status: { code: { notIn: ["FAILED", "CANCELED"] } } },
      include: { status: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.team.findMany({ orderBy: { code: "asc" } }),
    prisma.creativeSquad.findMany({
      where: { isActive: true },
      orderBy: { sort: "asc" },
    }),
    // CR-2: chỉ nháp ĐANG MỞ (chưa gán về dự án thật) — nháp đã mapping giữ lại làm dấu vết nhưng ẩn.
    prisma.creativeDraftProject.findMany({
      where: { mappedAt: null },
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: "desc" },
    }),
    hasPermission("creative.task.manage"),
  ]);

  const taskData: TaskData[] = tasks.map((task) => {
    // CR-2: task NHÁP không có dự án ⇒ không có trạng thái để khoá; phase lấy từ draft.
    const statusCode = task.project?.status.code ?? null;
    const locked = statusCode ? isTaskLocked(statusCode, task.project!.finishedAt) : false;
    const graceDaysLeft = locked || !statusCode ? null : finishedGraceDaysLeft(statusCode, task.project!.finishedAt);
    return {
      id: task.id,
      title: task.title,
      detail: task.detail,
      status: task.status as CreativeTaskStatus, // cột DB là String; danh sách trạng thái chuẩn ở CREATIVE_TASK_STATUSES
      projectId: task.projectId,
      projectCode: task.project?.code ?? null,
      projectName: task.project?.name ?? null,
      draftId: task.draftId,
      draftName: task.draft?.name ?? null,
      draftClientName: task.draft?.clientName ?? null,
      teamCode: task.project?.ownerTeam?.code ?? null,
      phase: statusCode ? taskPhase(statusCode) : draftPhase(task.draft?.phase),
      taskTypeId: task.taskTypeId,
      taskTypeCode: task.taskType?.code ?? null,
      taskTypeLabel: task.taskType ? pickLabel(task.taskType, locale) : null,
      squadId: task.squadId,
      squadName: task.squad?.name ?? null,
      assigneeId: task.assigneeId,
      assigneeName: task.assignee?.fullName ?? null,
      ordererId: task.orderedById,
      ordererName: task.orderedBy?.fullName ?? null,
      cdApprovalNotRequired: task.cdApprovalNotRequired,
      deadline: task.deadline,
      overdueDays: taskOverdueDays(task.status, task.deadline, locked),
      deliverableLinkUrl: task.deliverableLinkUrl,
      hoursSpent: task.hoursSpent,
      revisionCount: task.revisionCount,
      deliveredAt: task.deliveredAt,
      locked,
      graceDaysLeft,
    };
  });

  const staffOptions = creativeStaff.map((s) => ({ id: s.id, label: s.fullName, squadId: s.creativeSquadId }));
  const squadOptions = squads.map((s) => ({ id: s.id, label: s.name }));
  const taskTypeOptions = (taskTypeSet?.items ?? []).map((it) => ({ id: it.id, label: pickLabel(it, locale) }));
  // Chỉ cho tạo task lẻ ở dự án CHƯA khóa (loại FAILED/CANCELED ở DB + FINISHED-hết-grace ở JS vì lock là phép tính thời gian).
  const projectOptions = projects
    .filter((p) => !isTaskLocked(p.status.code, p.finishedAt))
    .map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
  const teamOptions = teams.map((tm) => ({ id: tm.code, label: tm.code }));
  const draftRows: DraftRow[] = draftsRaw.map((d) => ({
    id: d.id,
    name: d.name,
    clientName: d.clientName,
    phase: d.phase,
    taskCount: d._count.tasks,
  }));
  const draftOptions = draftRows.map((d) => ({ id: d.id, label: d.clientName ? `${d.name} — ${d.clientName}` : d.name }));
  const ordererOptions = Array.from(
    new Map(tasks.filter((t) => t.orderedBy).map((t) => [t.orderedBy!.id, t.orderedBy!.fullName])).entries(),
  )
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatSplit
          icon={Palette}
          label={t("dashboard.totalActive")}
          bidding={stats.totalActive.bidding}
          working={stats.totalActive.working}
          locale={locale}
          t={t}
        />
        <StatSplit
          icon={Briefcase}
          label={t("dashboard.projectsActive")}
          bidding={stats.projectsActive.bidding}
          working={stats.projectsActive.working}
          locale={locale}
          t={t}
        />
      </div>

      {stats.staleLocked > 0 && (
        <p className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
          {t("dashboard.staleLocked", { count: formatNumber(stats.staleLocked, locale) })}
        </p>
      )}

      {/* By type */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("dashboard.byTypeTitle")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {stats.byType.map((row) => (
            <Badge key={row.labelVi} tone="neutral">
              {locale === "en" ? (row.labelEn ?? row.labelVi) : row.labelVi} · {formatNumber(row.count, locale)}
            </Badge>
          ))}
          {stats.byType.length === 0 && <p className="text-sm text-muted-foreground">{t("dashboard.noType")}</p>}
        </div>
      </section>

      {/* Per member */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("dashboard.perMemberTitle")}</h2>
        <div className="mt-3 overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs font-medium text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">{t("dashboard.colMember")}</th>
                <th className="py-2 pr-3">{t("dashboard.colActive")}</th>
                <th className="py-2 pr-3">{t("dashboard.colDelivered")}</th>
                <th className="py-2 pr-3">{t("dashboard.colAvgHours")}</th>
                <th className="py-2 pr-3">{t("dashboard.colFirstTime")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.byMember.map((m) => (
                <tr key={m.staffId}>
                  <td className="py-2 pr-3 font-medium text-foreground">{m.name}</td>
                  <td className="py-2 pr-3">
                    <span className="text-brand-600">{formatNumber(m.activeBidding, locale)}</span>
                    {" / "}
                    <span className="text-success">{formatNumber(m.activeWorking, locale)}</span>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{formatNumber(m.delivered, locale)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{m.avgHours != null ? `${formatDecimal(m.avgHours, locale)}h` : "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{m.firstTimeRate != null ? `${formatPercent(m.firstTimeRate, locale)}%` : "—"}</td>
                </tr>
              ))}
              {stats.byMember.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.noMembers")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Task board */}
      {/* CR-2: khối dự án nháp chỉ hiện với người điều phối (creative.task.manage) — hàng rào thật
          nằm ở requirePermission trong từng action. */}
      {canManage && <DraftPanel drafts={draftRows} projects={projectOptions} />}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("board.title")}</h2>
        <div className="mt-3">
          <TaskBoard
            tasks={taskData}
            creativeStaff={staffOptions}
            taskTypes={taskTypeOptions}
            projects={projectOptions}
            teams={teamOptions}
            orderers={ordererOptions}
            squads={squadOptions}
            drafts={canManage ? draftOptions : []}
          />
        </div>
      </section>
    </div>
  );
}

function StatSplit({
  icon: Icon,
  label,
  bidding,
  working,
  locale,
  t,
}: {
  icon: typeof Palette;
  label: string;
  bidding: number;
  working: number;
  locale: Locale;
  t: Awaited<ReturnType<typeof getTranslations<"creative">>>;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground">{formatNumber(bidding + working, locale)}</div>
      <div className="mt-1 flex gap-2 text-xs">
        <Badge tone="brand">{t("phaseBIDDING")}: {formatNumber(bidding, locale)}</Badge>
        <Badge tone="success">{t("phaseWORKING")}: {formatNumber(working, locale)}</Badge>
      </div>
    </div>
  );
}
