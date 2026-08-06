import { prisma } from "./prisma";
import { ACTIVE_TASK_STATUSES, isTaskLocked } from "./creative";

// ─────────────────────────────────────────────────────────
// Nhắc việc — bản mini CHỈ có một loại: task Creative quá hạn.
//
// Bản TCM đầy đủ còn nhắc chăm sóc khách, hạn thầu, duyệt CO/CE, timeline, kho, công nợ… — tất cả
// đã cắt cùng các module tương ứng. Giữ đúng một hàm quét + một hàm đọc cho màn hình nhắc việc.
// ─────────────────────────────────────────────────────────

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export type CreativeOverdueTask = {
  taskId: string;
  title: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  squadName: string | null;
  deadline: Date;
  daysOverdue: number;
};

/** Task Creative đã quá hạn mà chưa trả (còn active) và dự án chưa khóa — thuần đọc cho /reminders. */
export async function getCreativeOverdueTasks(): Promise<CreativeOverdueTask[]> {
  const now = new Date();
  const tasks = await prisma.creativeTask.findMany({
    where: { deadline: { lt: now }, status: { in: [...ACTIVE_TASK_STATUSES] } },
    include: { project: { include: { status: true } }, squad: { select: { name: true } } },
  });

  return tasks
    .filter((t) => !isTaskLocked(t.project.status.code, t.project.finishedAt)) // lock là phép tính thời gian → lọc ở JS
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      projectId: t.projectId,
      projectCode: t.project.code,
      projectName: t.project.name,
      squadName: t.squad?.name ?? null,
      deadline: t.deadline as Date,
      daysOverdue: daysBetween(t.deadline as Date, now),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/**
 * Chạy bởi bộ hẹn giờ 5 phút/lần (`src/instrumentation.ts`); layout render là lưới an toàn.
 * Task Creative quá hạn mà chưa trả → nhắc MỘT lần cho người làm + người giao + trưởng team nhỏ.
 * Idempotent qua `deadlineReminderSentAt` (reset khi đổi hạn ở bước điều phối / giao việc).
 *
 * ⚠ Trưởng team nhỏ là BẮT BUỘC trong danh sách nhận: task đã điều phối về team nhưng CHƯA giao
 * người thì `assigneeId`/`assignedById` đều null → thiếu trưởng team là không gửi cho ai VÀ không
 * set cờ, nên vòng quét 5 phút lôi lại task đó vĩnh viễn.
 */
export async function checkCreativeTaskDeadlineReminders(): Promise<void> {
  const overdue = await prisma.creativeTask.findMany({
    where: {
      deadline: { lte: new Date() },
      status: { in: [...ACTIVE_TASK_STATUSES] },
      deadlineReminderSentAt: null,
    },
    include: { project: { include: { status: true } }, squad: { select: { leadStaffId: true } } },
  });
  const actionable = overdue.filter((t) => !isTaskLocked(t.project.status.code, t.project.finishedAt));
  if (actionable.length === 0) return;

  for (const task of actionable) {
    const recipientIds = new Set<string>();
    if (task.assigneeId) recipientIds.add(task.assigneeId);
    if (task.assignedById) recipientIds.add(task.assignedById);
    if (task.squad?.leadStaffId) recipientIds.add(task.squad.leadStaffId);

    if (recipientIds.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(recipientIds).map((recipientStaffId) => ({
          recipientStaffId,
          type: "CREATIVE_TASK_DEADLINE_REMINDER",
          title: `Quá hạn task Creative — dự án ${task.project.code}`,
          body: task.title,
          projectId: task.projectId,
        })),
      });
      await prisma.creativeTask.update({ where: { id: task.id }, data: { deadlineReminderSentAt: new Date() } });
    }
  }
}
