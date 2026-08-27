import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { getCurrentStaffId } from "@/lib/current-staff";
import { pickLabel } from "@/lib/utils";
import {
  isTaskLocked,
  taskPhase,
  finishedGraceDaysLeft,
  taskOverdueDays,
  draftPhase,
  ACTIVE_TASK_STATUSES,
  type CreativeTaskStatus,
} from "@/lib/creative";
import type { Locale } from "@/i18n/locales";
import { TaskBoard, type TaskData } from "../task-board";

/**
 * "Việc của tôi" — màn hình hằng ngày của designer: chỉ task GẮN TÊN MÌNH, trễ hạn nổi lên đầu.
 *
 * Gác `creative.task.submit` (đúng vai người làm việc; CD/BGĐ đều có). Phạm vi dữ liệu do CÂU
 * TRUY VẤN quyết định (`assigneeId = me`), không phải do mã quyền — người khác không thể thấy
 * task của mình qua trang này.
 */
export default async function MyCreativeTasksPage() {
  await requirePermission("creative.task.submit");
  const meId = await getCurrentStaffId();
  if (!meId) redirect("/login");

  const [t, locale, tasks, squads, taskTypeSet] = await Promise.all([
    getTranslations("creative"),
    getLocale() as Promise<Locale>,
    prisma.creativeTask.findMany({
      where: {
        assigneeId: meId,
        // Task đã trả gần đây vẫn hiện để đối chiếu; task huỷ thì không.
        status: { in: [...ACTIVE_TASK_STATUSES, "DELIVERED"] },
      },
      include: {
        project: { include: { status: true, ownerTeam: true } },
        draft: true,
        taskType: true,
        assignee: true,
        orderedBy: true,
        squad: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.creativeSquad.findMany({ where: { isActive: true }, orderBy: { sort: "asc" }, }),
    prisma.optionSet.findUnique({
      where: { code: "creative_task_type" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
  ]);

  const taskData: TaskData[] = tasks.map((task) => {
    // CR-2: task NHÁP không có dự án ⇒ không có trạng thái để khoá; phase lấy từ draft.
    const statusCode = task.project?.status.code ?? null;
    const locked = statusCode ? isTaskLocked(statusCode, task.project!.finishedAt) : false;
    return {
      id: task.id,
      title: task.title,
      detail: task.detail,
      status: task.status as CreativeTaskStatus,
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
      graceDaysLeft: locked || !statusCode ? null : finishedGraceDaysLeft(statusCode, task.project!.finishedAt),
    };
  });

  const overdueCount = taskData.filter((x) => x.overdueDays != null).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("my.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("my.subtitle")}</p>
      </div>

      {overdueCount > 0 && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {t("my.overdueBanner", { count: overdueCount })}
        </p>
      )}

      {taskData.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
          {t("my.empty")}
        </p>
      ) : (
        <section className="rounded-xl border border-border bg-surface p-5">
          <TaskBoard
            tasks={taskData}
            creativeStaff={[]}
            taskTypes={(taskTypeSet?.items ?? []).map((it) => ({ id: it.id, label: pickLabel(it, locale) }))}
            projects={[]}
            teams={[]}
            orderers={[]}
            squads={squads.map((s) => ({ id: s.id, label: s.name }))}
            drafts={[]}
            hideCreate
            hideFilters
          />
        </section>
      )}
    </div>
  );
}
