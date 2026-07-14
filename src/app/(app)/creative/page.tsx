import { Palette, Briefcase } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatPercent, pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { getCreativeDashboardStats, isTaskLocked, taskPhase, finishedGraceDaysLeft } from "@/lib/creative";
import { TaskBoard, type TaskData } from "./task-board";

export default async function CreativePage() {
  const [t, locale, stats, tasks, creativeStaff, taskTypeSet, projects, teams] = await Promise.all([
    getTranslations("creative"),
    getLocale() as Promise<Locale>,
    getCreativeDashboardStats(),
    prisma.creativeTask.findMany({
      include: {
        project: { include: { status: true, ownerTeam: true } },
        taskType: true,
        assignee: true,
        orderedBy: true,
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
  ]);

  const taskData: TaskData[] = tasks.map((task) => {
    const statusCode = task.project.status.code;
    const locked = isTaskLocked(statusCode, task.project.finishedAt);
    const graceDaysLeft = locked ? null : finishedGraceDaysLeft(statusCode, task.project.finishedAt);
    return {
      id: task.id,
      title: task.title,
      detail: task.detail,
      status: task.status,
      projectId: task.projectId,
      projectCode: task.project.code,
      projectName: task.project.name,
      teamCode: task.project.ownerTeam?.code ?? null,
      phase: taskPhase(statusCode),
      taskTypeId: task.taskTypeId,
      taskTypeLabel: task.taskType ? pickLabel(task.taskType, locale) : null,
      assigneeId: task.assigneeId,
      assigneeName: task.assignee?.fullName ?? null,
      ordererId: task.orderedById,
      ordererName: task.orderedBy?.fullName ?? null,
      cdApprovalNotRequired: task.cdApprovalNotRequired,
      deadline: task.deadline,
      deliverableLinkUrl: task.deliverableLinkUrl,
      hoursSpent: task.hoursSpent,
      revisionCount: task.revisionCount,
      deliveredAt: task.deliveredAt,
      locked,
      graceDaysLeft,
    };
  });

  const staffOptions = creativeStaff.map((s) => ({ id: s.id, label: s.fullName }));
  const taskTypeOptions = (taskTypeSet?.items ?? []).map((it) => ({ id: it.id, label: pickLabel(it, locale) }));
  const projectOptions = projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
  const teamOptions = teams.map((tm) => ({ id: tm.code, label: tm.code }));
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
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-border text-left text-xs font-medium text-muted-foreground">
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
                  <td className="py-2 pr-3 text-muted-foreground">{m.avgHours != null ? `${formatPercent(m.avgHours, locale)}h` : "—"}</td>
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
