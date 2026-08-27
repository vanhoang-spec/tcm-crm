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
    include: { project: { include: { status: true } }, draft: true, squad: true },
  });
  if (!task) return null;
  // CR-2: task NHÁP (chưa gắn dự án thật) KHÔNG có trạng thái dự án để kéo theo ⇒ không bao giờ khoá.
  if (task.project && isTaskLocked(task.project.status.code, task.project.finishedAt)) return null;
  return task;
}

async function notify(recipientStaffId: string, type: string, title: string, body: string | null, projectId: string | null) {
  await prisma.notification.create({ data: { recipientStaffId, type, title, body, projectId } });
}

/** CR-2: nhãn "thuộc về đâu" của task — dự án thật, hoặc tên dự án NHÁP. Dùng cho MỌI tiêu đề thông báo. */
function taskOwnerLabel(task: { project: { code: string } | null; draft: { name: string } | null }): string {
  return task.project ? `dự án ${task.project.code}` : `nháp ${task.draft?.name ?? "—"}`;
}

/** Revalidate /creative + /reminders, và (nếu biết dự án) tab ORDER — nơi hiện tín hiệu DONE của dòng timeline. */
function done(projectId?: string | null) {
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
      `Task Creative về team ${squad.name} — ${taskOwnerLabel(task)}`,
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

  await notify(assigneeId, "CREATIVE_TASK_ASSIGNED", `Bạn được giao task Creative — ${taskOwnerLabel(task)}`, task.title, task.projectId);
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
    if (task.orderedById) await notify(task.orderedById, "CREATIVE_TASK_DELIVERED", `Thành phẩm Creative đã gửi — ${taskOwnerLabel(task)}`, link, task.projectId);
  } else if (task.assignedById) {
    await notify(task.assignedById, "CREATIVE_TASK_NEEDS_APPROVAL", `Task Creative chờ duyệt — ${taskOwnerLabel(task)}`, task.title, task.projectId);
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
  if (task.orderedById) await notify(task.orderedById, "CREATIVE_TASK_DELIVERED", `Thành phẩm Creative đã gửi — ${taskOwnerLabel(task)}`, task.deliverableLinkUrl, task.projectId);
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
  if (task.assigneeId) await notify(task.assigneeId, "CREATIVE_TASK_REVISION", `Task Creative cần sửa lại — ${taskOwnerLabel(task)}`, note ?? task.title, task.projectId);
  done(task.projectId);
}

/**
 * CD tạo task lẻ (ngoài checklist) — treo vào dự án THẬT hoặc (CR-2) một DỰ ÁN NHÁP khi Account
 * chưa kịp nhập dự án vào app. Task idea đi đường này.
 * ⚠ BẤT BIẾN XOR: đúng MỘT trong (projectId, draftId). SQLite không ép được, ép ở đây.
 */
export async function createCreativeTask(formData: FormData) {
  await requirePermission("creative.task.manage");
  const meId = await getCurrentStaffId();
  const projectId = nullable(formData.get("projectId"));
  const draftId = nullable(formData.get("draftId"));
  const title = str(formData.get("title"));
  if (!title) return;
  if (!projectId === !draftId) return; // thiếu cả hai, hoặc khai cả hai → từ chối

  let orderedById: string | null = null;
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { status: true } });
    if (!project) return;
    if (isTaskLocked(project.status.code, project.finishedAt)) return; // không thêm task vào dự án đã khóa (hủy/thua/hết grace)
    orderedById = project.ownerId;
  } else {
    // Nháp phải đang MỞ (chưa mapping) — nháp đã gán về dự án thật thì không nhận task mới nữa.
    const draft = await prisma.creativeDraftProject.findFirst({ where: { id: draftId!, mappedAt: null }, select: { id: true } });
    if (!draft) return;
    // ⚠ Task nháp KHÔNG có project.ownerId để suy người nhận thành phẩm ⇒ lấy NGƯỜI TẠO. Thiếu
    // bước này thì submit/approve (`if (task.orderedById)`) không báo cho ai — im lặng.
    orderedById = meId;
  }

  await prisma.creativeTask.create({
    data: {
      projectId,
      draftId,
      title,
      detail: nullable(formData.get("detail")),
      taskTypeId: nullable(formData.get("taskTypeId")),
      deadline: dateOrNull(formData.get("deadline")),
      orderedById,
      status: "UNASSIGNED",
    },
  });
  done(projectId);
}

// ── CR-2: DỰ ÁN NHÁP — tạo / sửa / gán về dự án thật ────────────────────────────────────────

/** Tạo dự án nháp. Giai đoạn (BIDDING|WORKING) do người tạo chọn — quyết định chủ dự án 27/08/2026. */
export async function createDraftProject(formData: FormData) {
  await requirePermission("creative.task.manage");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const name = str(formData.get("name"));
  if (!name) return;
  await prisma.creativeDraftProject.create({
    data: {
      name: name.slice(0, 200),
      clientName: nullable(formData.get("clientName")),
      phase: str(formData.get("phase")) === "WORKING" ? "WORKING" : "BIDDING",
      createdById: meId,
    },
  });
  done();
}

/** Sửa nháp (nháp thắng thầu thì đổi giai đoạn sang Đang thực hiện). Nháp đã mapping thì khoá. */
export async function updateDraftProject(draftId: string, formData: FormData) {
  await requirePermission("creative.task.manage");
  const draft = await prisma.creativeDraftProject.findUnique({ where: { id: draftId }, select: { mappedAt: true } });
  if (!draft || draft.mappedAt) return;
  const name = str(formData.get("name"));
  if (!name) return;
  await prisma.creativeDraftProject.update({
    where: { id: draftId },
    data: {
      name: name.slice(0, 200),
      clientName: nullable(formData.get("clientName")),
      phase: str(formData.get("phase")) === "WORKING" ? "WORKING" : "BIDDING",
    },
  });
  done();
}

/**
 * GÁN nháp về dự án THẬT — chuyển mọi task của nháp sang projectId thật trong MỘT transaction.
 * ⚠ Bản ghi nháp GIỮ LẠI (mappedToProjectId + mappedAt) làm dấu vết và để ẩn khỏi ô chọn — KHÔNG
 * xoá, đúng khuôn ClientGroup. Sau bước này task tự thừa hưởng khoá/phase/thống kê theo dự án
 * thật, không phải sửa gì thêm.
 */
export async function applyDraftMapping(draftId: string, formData: FormData) {
  await requirePermission("creative.task.manage");
  const meId = await getCurrentStaffId();
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;

  const [draft, project] = await Promise.all([
    prisma.creativeDraftProject.findUnique({ where: { id: draftId }, select: { id: true, name: true, mappedAt: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, ownerId: true } }),
  ]);
  if (!draft || draft.mappedAt || !project) return;

  const moved = await prisma.$transaction(async (tx) => {
    const res = await tx.creativeTask.updateMany({
      where: { draftId },
      // Task nháp chưa có người đặt thật; sau mapping thì người nhận thành phẩm là PIC dự án —
      // chỉ điền khi dự án có PIC, không ghi đè người tạo bằng null.
      data: { projectId, draftId: null, ...(project.ownerId ? { orderedById: project.ownerId } : {}) },
    });
    await tx.creativeDraftProject.update({ where: { id: draftId }, data: { mappedToProjectId: projectId, mappedAt: new Date() } });
    return res.count;
  });

  await prisma.auditLog.create({
    data: {
      entityType: "creative_draft_project",
      entityId: draftId,
      field: "*",
      action: "UPDATE",
      changedBy: meId,
      reason: `Gán nháp "${draft.name}" về dự án ${project.code} — chuyển ${moved} task`,
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
