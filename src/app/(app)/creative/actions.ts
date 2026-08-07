"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { isTaskLocked } from "@/lib/creative";
import { requirePermission, hasPermission } from "@/lib/permissions";

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
    include: { project: { include: { status: true } }, squad: true },
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
  revalidatePath("/creative/my");
  revalidatePath("/reminders");
  if (projectId) revalidatePath(`/projects/${projectId}/orders`);
}

/** Đẩy ProjectOrderItem gốc (nếu task sinh từ Master Timeline) sang DONE — tín hiệu Creative→Timeline đã xong. */
async function markOrderItemDone(orderItemId: string | null) {
  if (!orderItemId) return;
  await prisma.projectOrderItem.update({ where: { id: orderItemId }, data: { status: "DONE" } });
}

/**
 * Người đang thao tác có phải TRƯỞNG TEAM NHỎ của task này không — phép kiểm THEO BẢN GHI
 * (mẫu `Team.leadStaffId` của Planning, xem planning/loan-actions.ts). Trưởng team KHÔNG cần mã
 * quyền `creative.task.assign` — đừng đi tìm requirePermission tương ứng.
 */
function isSquadLeadOf(task: { squad: { leadStaffId: string | null } | null }, staffId: string | null): boolean {
  return !!staffId && !!task.squad?.leadStaffId && task.squad.leadStaffId === staffId;
}

/**
 * CR-1: CD ĐIỀU PHỐI task về một team nhỏ — bước đứng TRƯỚC "giao người". Deadline BẮT BUỘC ở
 * bước này (đây là chỗ chặn tận gốc cảnh 0 task có hạn); loại việc tùy chọn. Trưởng team nhận
 * notification rồi tự giao người trong team.
 */
export async function routeCreativeTask(taskId: string, formData: FormData) {
  await requirePermission("creative.task.assign");
  const task = await loadUnlocked(taskId);
  if (!task || task.status !== "UNASSIGNED") return;

  const squadId = nullable(formData.get("squadId"));
  const deadline = dateOrNull(formData.get("deadline"));
  if (!squadId || !deadline) return;
  const squad = await prisma.creativeSquad.findFirst({
    where: { id: squadId, isActive: true },
    // Nạp kèm trạng thái của trưởng team để biết có gửi thông báo được không — xem ACTIVE_SQUAD_LEAD.
    include: { lead: { select: { isActive: true, department: { select: { code: true } } } } },
  });
  if (!squad) return;

  await prisma.creativeTask.update({
    where: { id: taskId },
    data: {
      squadId,
      deadline,
      taskTypeId: nullable(formData.get("taskTypeId")) ?? task.taskTypeId,
      deadlineReminderSentAt: null, // hạn mới → được nhắc lại nếu quá hạn mới
    },
  });
  // ⚠ Trưởng team đã NGHỈ (hoặc chuyển phòng khác) thì KHÔNG gửi — con trỏ leadStaffId không tự
  // rỗng khi người đó nghỉ, gửi mù là thông báo rơi vào tài khoản không ai đọc. Màn Settings hiện
  // cảnh báo đỏ để admin gán lại người khác.
  if (squad.leadStaffId && squad.lead?.isActive && squad.lead.department?.code === "CREATIVE") {
    await notify(
      squad.leadStaffId,
      "CREATIVE_TASK_ROUTED",
      `Task Creative về team ${squad.name} — dự án ${task.project.code}`,
      task.title,
      task.projectId,
    );
  }
  done(task.projectId);
}

/**
 * Giao task cho 1 nhân sự — chọn loại task + tick "CD không cần duyệt" + deadline + (tùy chọn)
 * danh sách NGƯỜI DUYỆT đích danh (A7 — Master KV cần 3 chữ ký, adapt cần 2).
 *
 * Ai giao được: người có `creative.task.assign` (CD — đường cũ, giao thẳng bất kỳ task nào),
 * HOẶC trưởng team nhỏ của CHÍNH task đã điều phối về team mình (kiểm bản ghi, không mã quyền).
 */
export async function assignCreativeTask(taskId: string, formData: FormData) {
  const staffId = await getCurrentStaffId();
  const task = await loadUnlocked(taskId);
  if (!task) return;

  const canAssignAll = await hasPermission("creative.task.assign");
  const squadLead = isSquadLeadOf(task, staffId);
  if (!canAssignAll && !squadLead) return;

  const assigneeId = nullable(formData.get("assigneeId"));
  if (!assigneeId) return;

  // Vá lỗ cũ: assignee phải là nhân sự CREATIVE đang hoạt động — trước đây server nhận mọi staffId.
  const assignee = await prisma.staff.findFirst({
    where: { id: assigneeId, isActive: true, department: { code: "CREATIVE" } },
    select: { id: true, creativeSquadId: true },
  });
  if (!assignee) return;
  // Trưởng team (không có mã quyền) chỉ giao được NGƯỜI TRONG TEAM MÌNH cho TASK CỦA TEAM MÌNH.
  if (!canAssignAll && squadLead && assignee.creativeSquadId !== task.squadId) return;

  // Vá lỗ cũ: form bỏ trống deadline thì GIỮ hạn đã điều phối, không ghi đè thành null.
  const newDeadline = dateOrNull(formData.get("deadline"));
  const deadlineChanged = newDeadline != null && newDeadline.getTime() !== task.deadline?.getTime();

  await prisma.creativeTask.update({
    where: { id: taskId },
    data: {
      assigneeId,
      taskTypeId: nullable(formData.get("taskTypeId")) ?? task.taskTypeId,
      cdApprovalNotRequired: formData.get("cdApprovalNotRequired") === "on",
      ...(newDeadline ? { deadline: newDeadline } : {}),
      ...(deadlineChanged ? { deadlineReminderSentAt: null } : {}),
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
  await requirePermission("creative.task.submit");
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
    await notify(task.assignedById, "CREATIVE_TASK_NEEDS_APPROVAL", `Task Creative chờ duyệt — dự án ${task.project.code}`, task.title, task.projectId);
  }
  done(task.projectId);
}

/**
 * Duyệt task SUBMITTED → trả thành phẩm cho người ORDER (Account đặt việc).
 *
 * ⚠ MỘT người duyệt là xong — CR-1b (flow v2, 07/08/2026) đã GỠ cơ chế duyệt nhiều bên: job của
 * TCM thiên về thực thi, vai CD giảm, và khâu làm việc với khách thuộc về Account chứ không phải
 * kéo thêm chữ ký trong nội bộ Creative. (Bản `creative-mini` VẪN giữ duyệt nhiều bên — sản phẩm
 * riêng, quyết định riêng; đừng đồng bộ hai bên.)
 */
export async function approveCreativeTask(taskId: string) {
  await requirePermission("creative.task.approve");
  const staffId = await getCurrentStaffId();
  const task = await loadUnlocked(taskId);
  if (!task || task.status !== "SUBMITTED") return;

  await prisma.creativeTask.update({
    where: { id: taskId },
    data: { status: "DELIVERED", reviewedById: staffId, reviewedAt: new Date(), deliveredAt: new Date() },
  });
  await markOrderItemDone(task.orderItemId); // duyệt → đóng dòng timeline gốc
  if (task.orderedById) await notify(task.orderedById, "CREATIVE_TASK_DELIVERED", `Thành phẩm Creative đã gửi — dự án ${task.project.code}`, task.deliverableLinkUrl, task.projectId);
  done(task.projectId);
}

/** Trả lại task để sửa → REVISION, tăng revisionCount, báo nhân sự. */
export async function rejectCreativeTask(taskId: string, formData: FormData) {
  await requirePermission("creative.task.approve");
  const staffId = await getCurrentStaffId();
  const task = await loadUnlocked(taskId);
  if (!task || task.status !== "SUBMITTED") return;

  const note = nullable(formData.get("rejectNote"));
  await prisma.creativeTask.update({
    where: { id: taskId },
    data: { status: "REVISION", revisionCount: { increment: 1 }, reviewedById: staffId, reviewedAt: new Date() },
  });
  if (task.assigneeId) await notify(task.assigneeId, "CREATIVE_TASK_REVISION", `Task Creative cần sửa lại — dự án ${task.project.code}`, note ?? task.title, task.projectId);
  done(task.projectId);
}

/** CD tạo task lẻ (ngoài checklist) — chọn dự án + loại task + tên. Task idea đi đường này. */
export async function createCreativeTask(formData: FormData) {
  await requirePermission("creative.task.manage");
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
  await requirePermission("creative.task.manage");
  const task = await loadUnlocked(taskId);
  if (!task || task.status !== "UNASSIGNED") return;
  await prisma.creativeTask.delete({ where: { id: taskId } });
  done(task.projectId);
}
