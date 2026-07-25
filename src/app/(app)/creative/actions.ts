"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { isTaskLocked } from "@/lib/creative";

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function dateOrNull(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  return s === "" ? null : new Date(s);
}

/** Nạp task + project (kèm status/finishedAt). Trả null nếu không tồn tại HOẶC đang bị khóa theo project. */
async function loadUnlocked(taskId: string) {
  const task = await prisma.creativeTask.findUnique({
    where: { id: taskId },
    include: { project: { include: { status: true } } },
  });
  if (!task) return null;
  if (isTaskLocked(task.project.status.code, task.project.finishedAt)) return null;
  return task;
}

async function notify(recipientStaffId: string, type: string, title: string, body: string | null, projectId: string) {
  await prisma.notification.create({ data: { recipientStaffId, type, title, body, projectId } });
}

/** Revalidate /creative + /reminders, và (nếu biết dự án) tab ORDER — nơi hiện tín hiệu DONE của dòng timeline. */
function done(projectId?: string) {
  revalidatePath("/creative");
  revalidatePath("/reminders");
  if (projectId) revalidatePath(`/projects/${projectId}/orders`);
}

/** Đẩy ProjectOrderItem gốc (nếu task sinh từ Master Timeline) sang DONE — tín hiệu Creative→Timeline đã xong. */
async function markOrderItemDone(orderItemId: string | null) {
  if (!orderItemId) return;
  await prisma.projectOrderItem.update({ where: { id: orderItemId }, data: { status: "DONE" } });
}

/** CD giao task cho 1 nhân sự — chọn loại task + tick "CD không cần duyệt" + deadline. */
export async function assignCreativeTask(taskId: string, formData: FormData) {
  const task = await loadUnlocked(taskId);
  if (!task) return;
  const assigneeId = nullable(formData.get("assigneeId"));
  if (!assigneeId) return;
  const staffId = await getCurrentStaffId();

  await prisma.creativeTask.update({
    where: { id: taskId },
    data: {
      assigneeId,
      taskTypeId: nullable(formData.get("taskTypeId")),
      cdApprovalNotRequired: formData.get("cdApprovalNotRequired") === "on",
      deadline: dateOrNull(formData.get("deadline")),
      deadlineReminderSentAt: null, // đổi/đặt deadline → reset cờ để được nhắc lại nếu quá hạn mới
      assignedById: staffId,
      assignedAt: new Date(),
      status: "ASSIGNED",
    },
  });
  await notify(assigneeId, "CREATIVE_TASK_ASSIGNED", `Bạn được giao task Creative — dự án ${task.project.code}`, task.title, task.projectId);
  done(task.projectId);
}

/** Nhân sự bấm GỬI — nhập link thành phẩm + số giờ (bội số 0.25). Định tuyến theo cờ CD-không-cần-duyệt. */
export async function submitCreativeTask(taskId: string, formData: FormData) {
  const task = await loadUnlocked(taskId);
  if (!task) return;
  const link = str(formData.get("deliverableLinkUrl"));
  const hours = Number(formData.get("hoursSpent"));
  if (!link) return;
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isInteger(hours * 4)) return; // bội số 0.25

  const deliverStraight = task.cdApprovalNotRequired;

  await prisma.creativeTask.update({
    where: { id: taskId },
    data: {
      deliverableLinkUrl: link,
      hoursSpent: hours,
      submittedAt: new Date(),
      status: deliverStraight ? "DELIVERED" : "SUBMITTED",
      ...(deliverStraight ? { deliveredAt: new Date() } : {}),
    },
  });

  if (deliverStraight) {
    await markOrderItemDone(task.orderItemId); // trả thẳng → đóng dòng timeline gốc
    if (task.orderedById) await notify(task.orderedById, "CREATIVE_TASK_DELIVERED", `Thành phẩm Creative đã gửi — dự án ${task.project.code}`, link, task.projectId);
  } else if (task.assignedById) {
    await notify(task.assignedById, "CREATIVE_TASK_NEEDS_APPROVAL", `Task Creative chờ CD duyệt — dự án ${task.project.code}`, task.title, task.projectId);
  }
  done(task.projectId);
}

/** CD duyệt task SUBMITTED → trả thành phẩm cho người ORDER. */
export async function approveCreativeTask(taskId: string) {
  const task = await loadUnlocked(taskId);
  if (!task || task.status !== "SUBMITTED") return;
  const staffId = await getCurrentStaffId();
  await prisma.creativeTask.update({
    where: { id: taskId },
    data: { status: "DELIVERED", reviewedById: staffId, reviewedAt: new Date(), deliveredAt: new Date() },
  });
  await markOrderItemDone(task.orderItemId); // CD duyệt → đóng dòng timeline gốc
  if (task.orderedById) await notify(task.orderedById, "CREATIVE_TASK_DELIVERED", `Thành phẩm Creative đã gửi — dự án ${task.project.code}`, task.deliverableLinkUrl, task.projectId);
  done(task.projectId);
}

/** CD trả lại task để sửa → REVISION, tăng revisionCount, báo nhân sự. */
export async function rejectCreativeTask(taskId: string, formData: FormData) {
  const task = await loadUnlocked(taskId);
  if (!task || task.status !== "SUBMITTED") return;
  const staffId = await getCurrentStaffId();
  const note = nullable(formData.get("rejectNote"));
  await prisma.creativeTask.update({
    where: { id: taskId },
    data: { status: "REVISION", revisionCount: { increment: 1 }, reviewedById: staffId, reviewedAt: new Date() },
  });
  if (task.assigneeId) await notify(task.assigneeId, "CREATIVE_TASK_REVISION", `Task Creative cần sửa lại — dự án ${task.project.code}`, note ?? task.title, task.projectId);
  done(task.projectId);
}

/** CD tạo task lẻ (ngoài checklist) — chọn dự án + loại task + tên. */
export async function createCreativeTask(formData: FormData) {
  const projectId = nullable(formData.get("projectId"));
  const title = str(formData.get("title"));
  if (!projectId || !title) return;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { status: true } });
  if (!project) return;
  if (isTaskLocked(project.status.code, project.finishedAt)) return; // không thêm task vào dự án đã khóa (hủy/thua/hết grace)
  await prisma.creativeTask.create({
    data: {
      projectId,
      title,
      detail: nullable(formData.get("detail")),
      taskTypeId: nullable(formData.get("taskTypeId")),
      orderedById: project.ownerId,
      status: "UNASSIGNED",
    },
  });
  done(projectId);
}

/** Xóa task chưa giao (và dự án chưa bị khóa). */
export async function deleteCreativeTask(taskId: string) {
  const task = await loadUnlocked(taskId);
  if (!task || task.status !== "UNASSIGNED") return;
  await prisma.creativeTask.delete({ where: { id: taskId } });
  done(task.projectId);
}
