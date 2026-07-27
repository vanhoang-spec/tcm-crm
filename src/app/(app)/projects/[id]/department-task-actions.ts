"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { isTaskLocked, markOrderItemDone } from "@/lib/projects";

// Mirror src/app/(app)/creative/actions.ts — bản tổng quát cho DepartmentTask (PLANNING/PCC/OPE/PRO).
// Creative giữ nguyên actions.ts riêng (không đụng).

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

const DEPARTMENT_TAB_SEG: Record<string, string> = {
  PLANNING: "planning",
  PCC: "purchasing",
  OPE: "operations",
  PRO: "production",
};

/** Nạp task + project (kèm status/finishedAt). Trả null nếu không tồn tại HOẶC đang bị khóa theo project. */
async function loadUnlocked(taskId: string) {
  const task = await prisma.departmentTask.findUnique({
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

/** Revalidate đúng tab bộ phận + /reminders, và (nếu biết dự án) tab ORDER — nơi hiện tín hiệu DONE của dòng timeline. */
function done(department: string, projectId?: string) {
  const seg = DEPARTMENT_TAB_SEG[department];
  if (seg && projectId) revalidatePath(`/projects/${projectId}/${seg}`);
  revalidatePath("/reminders");
  if (projectId) revalidatePath(`/projects/${projectId}/orders`);
}

/** Lead giao task cho 1 nhân sự — chọn deadline + tick "không cần lead duyệt". */
export async function assignDepartmentTask(taskId: string, formData: FormData) {
  await requirePermission("projects.task.manage");
  const task = await loadUnlocked(taskId);
  if (!task) return;
  const assigneeId = nullable(formData.get("assigneeId"));
  if (!assigneeId) return;
  const staffId = await getCurrentStaffId();

  await prisma.departmentTask.update({
    where: { id: taskId },
    data: {
      assigneeId,
      leadApprovalNotRequired: formData.get("leadApprovalNotRequired") === "on",
      deadline: dateOrNull(formData.get("deadline")),
      deadlineReminderSentAt: null, // đổi/đặt deadline → reset cờ để được nhắc lại nếu quá hạn mới
      assignedById: staffId,
      assignedAt: new Date(),
      status: "ASSIGNED",
    },
  });
  await notify(assigneeId, "DEPT_TASK_ASSIGNED", `Bạn được giao task — dự án ${task.project.code}`, task.title, task.projectId);
  done(task.department, task.projectId);
}

/** Nhân sự bấm GỬI — nhập link kết quả + số giờ (bội số 0.25). Định tuyến theo cờ lead-không-cần-duyệt. */
export async function submitDepartmentTask(taskId: string, formData: FormData) {
  await requirePermission("projects.task.submit");
  const task = await loadUnlocked(taskId);
  if (!task) return;
  const link = str(formData.get("deliverableLinkUrl"));
  const hours = Number(formData.get("hoursSpent"));
  if (!link) return;
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isInteger(hours * 4)) return; // bội số 0.25

  const deliverStraight = task.leadApprovalNotRequired;

  await prisma.departmentTask.update({
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
    await markOrderItemDone(task.orderItemId);
    if (task.orderedById) await notify(task.orderedById, "DEPT_TASK_DELIVERED", `Kết quả đã gửi — dự án ${task.project.code}`, link, task.projectId);
  } else if (task.assignedById) {
    await notify(task.assignedById, "DEPT_TASK_NEEDS_APPROVAL", `Task chờ duyệt — dự án ${task.project.code}`, task.title, task.projectId);
  }
  done(task.department, task.projectId);
}

/** Lead duyệt task SUBMITTED → trả kết quả cho người ORDER. */
export async function approveDepartmentTask(taskId: string) {
  await requirePermission("projects.task.approve");
  const task = await loadUnlocked(taskId);
  if (!task || task.status !== "SUBMITTED") return;
  const staffId = await getCurrentStaffId();
  await prisma.departmentTask.update({
    where: { id: taskId },
    data: { status: "DELIVERED", reviewedById: staffId, reviewedAt: new Date(), deliveredAt: new Date() },
  });
  await markOrderItemDone(task.orderItemId);
  if (task.orderedById) await notify(task.orderedById, "DEPT_TASK_DELIVERED", `Kết quả đã gửi — dự án ${task.project.code}`, task.deliverableLinkUrl, task.projectId);
  done(task.department, task.projectId);
}

/** Lead trả lại task để sửa → REVISION, tăng revisionCount, báo nhân sự. */
export async function rejectDepartmentTask(taskId: string, formData: FormData) {
  await requirePermission("projects.task.approve");
  const task = await loadUnlocked(taskId);
  if (!task || task.status !== "SUBMITTED") return;
  const staffId = await getCurrentStaffId();
  const note = nullable(formData.get("rejectNote"));
  await prisma.departmentTask.update({
    where: { id: taskId },
    data: { status: "REVISION", revisionCount: { increment: 1 }, reviewedById: staffId, reviewedAt: new Date() },
  });
  if (task.assigneeId) await notify(task.assigneeId, "DEPT_TASK_REVISION", `Task cần sửa lại — dự án ${task.project.code}`, note ?? task.title, task.projectId);
  done(task.department, task.projectId);
}

/** Lead tạo task lẻ (ngoài luồng tự sinh) — trong tab bộ phận đang mở. */
export async function createDepartmentTask(projectId: string, department: string, formData: FormData) {
  await requirePermission("projects.task.manage");
  const title = str(formData.get("title"));
  if (!title) return;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { status: true } });
  if (!project) return;
  if (isTaskLocked(project.status.code, project.finishedAt)) return; // không thêm task vào dự án đã khóa
  await prisma.departmentTask.create({
    data: {
      projectId,
      department,
      title,
      detail: nullable(formData.get("detail")),
      orderedById: project.ownerId,
      status: "UNASSIGNED",
    },
  });
  done(department, projectId);
}

/** Xóa task chưa giao (và dự án chưa bị khóa). */
export async function deleteDepartmentTask(taskId: string) {
  await requirePermission("projects.task.manage");
  const task = await loadUnlocked(taskId);
  if (!task || task.status !== "UNASSIGNED") return;
  await prisma.departmentTask.delete({ where: { id: taskId } });
  done(task.department, task.projectId);
}
