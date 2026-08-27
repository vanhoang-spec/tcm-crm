import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { getCurrentStaffId } from "@/lib/current-staff";
import { pickLabel } from "@/lib/utils";
import { taskVisibleWhere, taskOverdue } from "@/lib/tasks";
import type { Locale } from "@/i18n/locales";
import { TaskDetail, type TaskDetailData } from "./task-detail";

/**
 * Chi tiết một việc. Phạm vi ở TẦNG TRUY VẤN: ngoài phạm vi (taskVisibleWhere ‖ view_all) là 404
 * — tiêu đề việc không bao giờ vào HTML của người ngoài cuộc (bài học KB-H2).
 */
export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) redirect("/login");
  const { id } = await params;
  const viewAll = await hasPermission("tasks.view_all");

  const [t, locale, task, staff] = await Promise.all([
    getTranslations("tasks"),
    getLocale() as Promise<Locale>,
    prisma.task.findFirst({
      where: viewAll ? { id } : { id, ...taskVisibleWhere(meId) },
      include: {
        assignee: { select: { id: true, fullName: true } },
        creator: { select: { id: true, fullName: true } },
        type: true,
        project: { select: { id: true, code: true, name: true } },
        parent: { select: { id: true, title: true } },
        recurrence: { select: { id: true, title: true } },
        followers: { include: { staff: { select: { id: true, fullName: true } } } },
        checklist: { orderBy: { sort: "asc" } },
        comments: { include: { author: { select: { fullName: true } } }, orderBy: { createdAt: "asc" }, take: 200 },
        files: { include: { uploadedBy: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
        children: {
          include: { assignee: { select: { fullName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, title: true, department: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
  ]);
  if (!task) notFound();

  const data: TaskDetailData = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    typeLabel: task.type ? pickLabel(task.type, locale) : null,
    projectCode: task.project?.code ?? null,
    projectName: task.project?.name ?? null,
    creatorId: task.creatorId,
    creatorName: task.creator.fullName,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee.fullName,
    dueDate: task.dueDate,
    overdueDays: taskOverdue(task.status, task.dueDate),
    returnNote: task.returnNote,
    parentId: task.parent?.id ?? null,
    parentTitle: task.parent?.title ?? null,
    fromRecurrence: task.recurrence?.title ?? null,
    createdAt: task.createdAt,
    followers: task.followers.map((f) => ({ staffId: f.staffId, name: f.staff.fullName })),
    checklist: task.checklist.map((c) => ({ id: c.id, label: c.label, isDone: c.isDone })),
    comments: task.comments.map((c) => ({ id: c.id, author: c.author?.fullName ?? "—", body: c.body, createdAt: c.createdAt })),
    files: task.files.map((f) => ({ id: f.id, fileName: f.fileName, fileSize: f.fileSize, uploadedBy: f.uploadedBy?.fullName ?? "—" })),
    children: task.children.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      assigneeName: c.assignee.fullName,
      dueDate: c.dueDate,
      overdueDays: taskOverdue(c.status, c.dueDate),
    })),
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <Link href="/tasks" className="hover:text-brand-600 hover:underline">
          {t("title")}
        </Link>
        {task.parent && (
          <>
            {" / "}
            <Link href={`/tasks/${task.parent.id}`} className="hover:text-brand-600 hover:underline">
              {task.parent.title}
            </Link>
          </>
        )}
      </div>
      <TaskDetail
        task={data}
        meId={meId}
        staff={staff.map((s) => ({ id: s.id, label: s.fullName, sublabel: [s.title, s.department?.name].filter(Boolean).join(" · ") || undefined }))}
      />
    </div>
  );
}
