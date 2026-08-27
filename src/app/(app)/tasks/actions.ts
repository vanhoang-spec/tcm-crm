"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { notifyStaff } from "@/lib/inventory-notify";
import {
  taskVisibleWhere,
  parseChecklistJson,
  MAX_TASK_FILES_PER_UPLOAD,
  MAX_TASK_UPLOAD_TOTAL_BYTES,
  MAX_TASK_FILE_BYTES,
} from "@/lib/tasks";
import { saveTaskFile, deleteTaskFile, TASK_FILE_MIME_TYPES } from "@/lib/task-storage";

/**
 * MODULE TASKS — giao việc nội bộ TỰ DO (27/08/2026).
 *
 * Cổng module là `tasks.use` (câu đầu MỌI action). "Ai được bấm gì" trên MỘT việc là phép kiểm
 * THEO BẢN GHI (creator/assignee/follower — khuôn assignCreativeTask/canConfirmRfq), KHÔNG có mã
 * quyền riêng cho từng nút. Phạm vi nhìn thấy đi qua `taskVisibleWhere` — MỘT nguồn sự thật.
 *
 * Bất biến đã chốt với chủ dự án:
 * - 2 BƯỚC khi giao người khác (Hoàn thành → người giao xác nhận); việc tự giao đóng 1 bước.
 * - Sub-task ĐÚNG 1 CẤP; task cha chỉ đóng khi mọi sub DONE/CANCELED; huỷ cha ⇒ huỷ sub chưa xong.
 * - Giao N người = 1 task cha (assignee = người giao, vai chủ trì) + N sub-task.
 */

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

function done(taskId?: string) {
  revalidatePath("/tasks");
  revalidatePath("/reminders");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

/**
 * Nạp việc TRONG PHẠM VI người đang thao tác được thấy (taskVisibleWhere ‖ tasks.view_all).
 * Mọi action nhận taskId đều đi qua đây — id đoán mò không mở được việc của người khác.
 */
async function loadVisible(taskId: string, meId: string) {
  const viewAll = await hasPermission("tasks.view_all");
  return prisma.task.findFirst({
    where: viewAll ? { id: taskId } : { id: taskId, ...taskVisibleWhere(meId) },
    include: {
      assignee: { select: { id: true, fullName: true } },
      creator: { select: { id: true, fullName: true } },
      followers: { select: { staffId: true } },
      children: { select: { id: true, status: true, assigneeId: true, title: true } },
    },
  });
}

function participantIds(task: { creatorId: string; assigneeId: string; followers: { staffId: string }[] }): string[] {
  return [task.creatorId, task.assigneeId, ...task.followers.map((f) => f.staffId)];
}

async function audit(taskId: string, action: string, reason: string, staffId: string | null) {
  await prisma.auditLog.create({ data: { entityType: "task", entityId: taskId, field: "*", action, changedBy: staffId, reason } });
}

const TASK_PRIORITY_SET = new Set(["LOW", "NORMAL", "HIGH"]);

export type TaskFormState = { error?: string; ok?: boolean } | null;

/**
 * Tạo việc. NHIỀU người nhận → 1 task cha (assignee = người giao, vai chủ trì) + N sub-task —
 * quyết định chủ dự án: KHÔNG multi-assignee trên một task, mỗi việc một người chịu trách nhiệm.
 * `parentId` (tạo sub lẻ từ trang cha): server chặn sub-dưới-sub và chặn cha đã đóng.
 */
export async function createTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: "NOT_LOGGED_IN" };

  const title = str(formData.get("title"));
  if (!title) return { error: "TITLE_REQUIRED" };
  const assigneeIds = [...new Set(formData.getAll("assigneeIds").map((v) => str(v)).filter(Boolean))];
  if (assigneeIds.length === 0) return { error: "ASSIGNEE_REQUIRED" };

  // Người nhận phải là nhân sự ĐANG hoạt động — server đọc lại, không tin payload.
  const validAssignees = await prisma.staff.findMany({ where: { id: { in: assigneeIds }, isActive: true }, select: { id: true } });
  if (validAssignees.length !== assigneeIds.length) return { error: "ASSIGNEE_INVALID" };

  const description = nullable(formData.get("description"));
  const priorityRaw = str(formData.get("priority")) || "NORMAL";
  const priority = TASK_PRIORITY_SET.has(priorityRaw) ? priorityRaw : "NORMAL";
  const typeId = nullable(formData.get("typeId"));
  const projectId = nullable(formData.get("projectId"));
  const dueDate = dateOrNull(formData.get("dueDate"));
  const parentId = nullable(formData.get("parentId"));

  if (typeId && (await prisma.optionItem.count({ where: { id: typeId, set: { code: "task_type" } } })) === 0) return { error: "TYPE_INVALID" };
  if (projectId && (await prisma.project.count({ where: { id: projectId } })) === 0) return { error: "PROJECT_INVALID" };

  if (parentId) {
    // Sub-task ĐÚNG 1 CẤP + chỉ người thấy được cha mới treo việc con vào nó.
    const parent = await loadVisible(parentId, meId);
    if (!parent) return { error: "PARENT_NOT_FOUND" };
    if (parent.parentId) return { error: "PARENT_IS_SUB" }; // chặn sub-dưới-sub Ở SERVER, không chỉ ẩn nút
    if (parent.status === "DONE" || parent.status === "CANCELED") return { error: "PARENT_CLOSED" };
    if (assigneeIds.length !== 1) return { error: "SUB_ONE_ASSIGNEE" }; // sub lẻ giao đúng một người
  }

  const common = { description, priority, typeId, projectId, dueDate, creatorId: meId };

  if (assigneeIds.length === 1) {
    const task = await prisma.task.create({ data: { ...common, title, assigneeId: assigneeIds[0], parentId } });
    if (assigneeIds[0] !== meId) {
      await notifyStaff([assigneeIds[0]], "TASK_ASSIGNED", `Bạn được giao việc: ${title}`, description, projectId);
    }
    await audit(task.id, "CREATE", parentId ? "tạo việc con" : "tạo việc", meId);
  } else {
    // N người ⇒ cha (tự giao cho người tạo — chủ trì việc tổng, đóng 1 bước khi con xong hết) + N sub.
    const parent = await prisma.task.create({ data: { ...common, title, assigneeId: meId } });
    for (const aid of assigneeIds) {
      await prisma.task.create({ data: { ...common, title, assigneeId: aid, parentId: parent.id } });
    }
    await notifyStaff(assigneeIds.filter((a) => a !== meId), "TASK_ASSIGNED", `Bạn được giao việc: ${title}`, description, projectId);
    await audit(parent.id, "CREATE", `tạo việc giao ${assigneeIds.length} người (tách sub-task)`, meId);
  }
  done();
  return { ok: true };
}

/** Người nhận bấm Bắt đầu — OPEN → IN_PROGRESS. */
export async function startTask(taskId: string) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const task = await loadVisible(taskId, meId);
  if (!task || task.assigneeId !== meId) return;
  // Guard status trong WHERE (chống double-click / race — khuôn moveBudget).
  await prisma.task.updateMany({ where: { id: taskId, status: "OPEN" }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
  done(taskId);
}

/**
 * Người nhận bấm Hoàn thành. Tự giao ⇒ DONE 1 bước; giao bởi người khác ⇒ AWAIT_CONFIRM chờ
 * người giao xác nhận (quyết định 2-bước của chủ dự án).
 * Task CHA chỉ đóng được khi mọi sub đã DONE/CANCELED — server chặn, báo đích danh.
 */
export async function completeTask(taskId: string): Promise<{ error?: string; openSubs?: number } | undefined> {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const task = await loadVisible(taskId, meId);
  if (!task || task.assigneeId !== meId) return;
  if (task.status !== "OPEN" && task.status !== "IN_PROGRESS") return;

  const openSubs = task.children.filter((c) => c.status !== "DONE" && c.status !== "CANCELED").length;
  if (openSubs > 0) return { error: "SUBS_OPEN", openSubs };

  if (task.creatorId === meId) {
    const res = await prisma.task.updateMany({
      where: { id: taskId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      data: { status: "DONE", completedAt: new Date() },
    });
    if (res.count > 0) await maybeNotifyParentAllDone(task.parentId);
  } else {
    const res = await prisma.task.updateMany({
      where: { id: taskId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      data: { status: "AWAIT_CONFIRM", submittedAt: new Date() },
    });
    if (res.count > 0) {
      await notifyStaff([task.creatorId], "TASK_SUBMITTED", `Chờ xác nhận hoàn thành: ${task.title}`, `Người làm: ${task.assignee.fullName}`, task.projectId);
    }
  }
  done(taskId);
  return undefined;
}

/** Mọi sub của cha đã xong ⇒ nhắc người chủ trì (assignee của cha) vào đóng việc tổng. */
async function maybeNotifyParentAllDone(parentId: string | null) {
  if (!parentId) return;
  const parent = await prisma.task.findUnique({
    where: { id: parentId },
    include: { children: { select: { status: true } } },
  });
  if (!parent) return;
  if (parent.status === "DONE" || parent.status === "CANCELED") return;
  const open = parent.children.filter((c) => c.status !== "DONE" && c.status !== "CANCELED").length;
  if (open === 0) {
    await notifyStaff([parent.assigneeId], "TASK_SUBMITTED", `Mọi việc con đã xong — đóng việc tổng: ${parent.title}`, null, parent.projectId);
  }
}

/** Người giao XÁC NHẬN — AWAIT_CONFIRM → DONE. */
export async function confirmTask(taskId: string) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const task = await loadVisible(taskId, meId);
  if (!task || task.creatorId !== meId) return;
  const res = await prisma.task.updateMany({ where: { id: taskId, status: "AWAIT_CONFIRM" }, data: { status: "DONE", completedAt: new Date() } });
  if (res.count > 0) {
    await notifyStaff([task.assigneeId], "TASK_CONFIRMED", `Việc đã được xác nhận hoàn thành: ${task.title}`, null, task.projectId);
    await maybeNotifyParentAllDone(task.parentId);
  }
  done(taskId);
}

/** Người giao TRẢ LẠI kèm ghi chú — AWAIT_CONFIRM → IN_PROGRESS. */
export async function returnTask(taskId: string, formData: FormData) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const task = await loadVisible(taskId, meId);
  if (!task || task.creatorId !== meId) return;
  const note = nullable(formData.get("returnNote"));
  const res = await prisma.task.updateMany({ where: { id: taskId, status: "AWAIT_CONFIRM" }, data: { status: "IN_PROGRESS", returnNote: note } });
  if (res.count > 0) {
    await notifyStaff([task.assigneeId], "TASK_RETURNED", `Việc bị trả lại: ${task.title}`, note, task.projectId);
  }
  done(taskId);
}

/** Người giao HUỶ. Huỷ cha ⇒ huỷ mọi sub chưa xong + notify từng người nhận sub (không huỷ ngầm). */
export async function cancelTask(taskId: string) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const task = await loadVisible(taskId, meId);
  if (!task || task.creatorId !== meId) return;
  if (task.status === "DONE" || task.status === "CANCELED") return;

  const now = new Date();
  const openSubs = task.children.filter((c) => c.status !== "DONE" && c.status !== "CANCELED");
  await prisma.task.updateMany({
    where: { id: { in: [taskId, ...openSubs.map((c) => c.id)] }, status: { notIn: ["DONE", "CANCELED"] } },
    data: { status: "CANCELED", canceledAt: now },
  });
  await notifyStaff(
    [...new Set([task.assigneeId, ...openSubs.map((c) => c.assigneeId)])].filter((a) => a !== meId),
    "TASK_CANCELED",
    `Việc đã bị huỷ: ${task.title}`,
    openSubs.length > 0 ? `Kèm ${openSubs.length} việc con chưa xong` : null,
    task.projectId,
  );
  await audit(taskId, "UPDATE", `huỷ việc${openSubs.length ? ` + ${openSubs.length} việc con` : ""}`, meId);
  done(taskId);
}

/** Người giao sửa việc (hạn / ưu tiên / mô tả / người nhận). Đổi người nhận → notify cả cũ lẫn mới. */
export async function updateTask(taskId: string, formData: FormData) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const task = await loadVisible(taskId, meId);
  if (!task || task.creatorId !== meId) return;
  if (task.status === "DONE" || task.status === "CANCELED") return;

  const newAssignee = str(formData.get("assigneeId")) || task.assigneeId;
  if (newAssignee !== task.assigneeId) {
    if ((await prisma.staff.count({ where: { id: newAssignee, isActive: true } })) === 0) return;
  }
  const priorityRaw = str(formData.get("priority"));
  const newDue = dateOrNull(formData.get("dueDate"));
  await prisma.task.update({
    where: { id: taskId },
    data: {
      assigneeId: newAssignee,
      priority: TASK_PRIORITY_SET.has(priorityRaw) ? priorityRaw : task.priority,
      dueDate: newDue,
      description: nullable(formData.get("description")) ?? task.description,
      // Đổi hạn ⇒ RESET cờ nhắc để chu kỳ nhắc chạy lại theo hạn mới (khuôn CreativeTask).
      ...(newDue?.getTime() !== task.dueDate?.getTime() ? { deadlineReminderSentAt: null } : {}),
    },
  });
  if (newAssignee !== task.assigneeId) {
    await notifyStaff([newAssignee], "TASK_ASSIGNED", `Bạn được giao việc: ${task.title}`, null, task.projectId);
    await notifyStaff([task.assigneeId], "TASK_REASSIGNED", `Việc đã chuyển cho người khác: ${task.title}`, null, task.projectId);
    await audit(taskId, "UPDATE", `đổi người nhận`, meId);
  }
  done(taskId);
}

/** Thêm/gỡ người theo dõi — người tham gia nào cũng thêm được; chỉ tự gỡ chính mình hoặc người giao gỡ. */
export async function addFollower(taskId: string, formData: FormData) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const task = await loadVisible(taskId, meId);
  if (!task) return;
  const staffId = str(formData.get("staffId"));
  if (!staffId || (await prisma.staff.count({ where: { id: staffId, isActive: true } })) === 0) return;
  await prisma.taskFollower.upsert({
    where: { taskId_staffId: { taskId, staffId } },
    update: {},
    create: { taskId, staffId },
  });
  done(taskId);
}

export async function removeFollower(taskId: string, formData: FormData) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const task = await loadVisible(taskId, meId);
  if (!task) return;
  const staffId = str(formData.get("staffId"));
  if (staffId !== meId && task.creatorId !== meId) return;
  await prisma.taskFollower.deleteMany({ where: { taskId, staffId } });
  done(taskId);
}

// ── Checklist phẳng ─────────────────────────────────────────────────────────

export async function addChecklistItem(taskId: string, formData: FormData) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const task = await loadVisible(taskId, meId);
  if (!task || task.status === "DONE" || task.status === "CANCELED") return;
  const label = str(formData.get("label"));
  if (!label) return;
  const max = await prisma.taskChecklistItem.aggregate({ where: { taskId }, _max: { sort: true } });
  await prisma.taskChecklistItem.create({ data: { taskId, label: label.slice(0, 300), sort: (max._max.sort ?? 0) + 1 } });
  done(taskId);
}

export async function toggleChecklistItem(itemId: string) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId }, select: { taskId: true, isDone: true } });
  if (!item) return;
  if (!(await loadVisible(item.taskId, meId))) return; // kiểm belongs-to + phạm vi
  await prisma.taskChecklistItem.update({ where: { id: itemId }, data: { isDone: !item.isDone } });
  done(item.taskId);
}

export async function deleteChecklistItem(itemId: string) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId }, select: { taskId: true } });
  if (!item) return;
  const task = await loadVisible(item.taskId, meId);
  if (!task || (task.creatorId !== meId && task.assigneeId !== meId)) return;
  await prisma.taskChecklistItem.delete({ where: { id: itemId } });
  done(item.taskId);
}

// ── Bình luận ───────────────────────────────────────────────────────────────

export async function addTaskComment(taskId: string, formData: FormData) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const task = await loadVisible(taskId, meId);
  if (!task) return;
  const body = str(formData.get("body"));
  if (!body) return;
  await prisma.taskComment.create({ data: { taskId, authorStaffId: meId, body: body.slice(0, 4000) } });
  // Notify người tham gia TRỪ người viết — fan-out sau ghi (SQLite single-writer).
  await notifyStaff(participantIds(task).filter((p) => p !== meId), "TASK_COMMENT", `Bình luận mới ở việc: ${task.title}`, body.slice(0, 200), task.projectId);
  done(taskId);
}

// ── File đính kèm ───────────────────────────────────────────────────────────

export async function uploadTaskFiles(taskId: string, formData: FormData): Promise<{ error?: string } | undefined> {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const task = await loadVisible(taskId, meId);
  if (!task) return;

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "NO_FILE" };
  if (files.length > MAX_TASK_FILES_PER_UPLOAD) return { error: "TOO_MANY" };
  const total = files.reduce((s, f) => s + f.size, 0);
  // ⚠ Trần TỔNG phải nhỏ hơn serverActions.bodySizeLimit 30MB — vượt là Next ném 413 TRƯỚC khi
  // action chạy và người dùng thấy trang vỡ (HANDOVER 10.13). Chặn ở đây là chỗ báo lỗi tử tế.
  if (total > MAX_TASK_UPLOAD_TOTAL_BYTES) return { error: "TOO_LARGE" };
  for (const f of files) {
    if (f.size > MAX_TASK_FILE_BYTES) return { error: "FILE_TOO_LARGE" };
    if (!TASK_FILE_MIME_TYPES.includes(f.type)) return { error: "BAD_TYPE" };
  }

  // Lưu file TRƯỚC, ghi DB SAU — không mở transaction quanh IO đĩa (SQLite single-writer).
  for (const f of files) {
    const key = await saveTaskFile(Buffer.from(await f.arrayBuffer()), f.type);
    await prisma.taskFile.create({ data: { taskId, fileKey: key, fileMime: f.type, fileName: f.name, fileSize: f.size, uploadedById: meId } });
  }
  done(taskId);
  return undefined;
}

export async function deleteTaskFileAction(fileId: string) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const file = await prisma.taskFile.findUnique({ where: { id: fileId }, select: { taskId: true, fileKey: true, uploadedById: true } });
  if (!file) return;
  const task = await loadVisible(file.taskId, meId);
  if (!task || (file.uploadedById !== meId && task.creatorId !== meId)) return;
  await prisma.taskFile.delete({ where: { id: fileId } });
  await deleteTaskFile(file.fileKey); // xoá bản ghi trước, file sau — hỏng giữa chừng chỉ để lại file mồ côi vô hại
  done(file.taskId);
}

// ── Lịch lặp ────────────────────────────────────────────────────────────────

const RECUR_FREQ_SET = new Set(["DAILY", "WEEKLY", "MONTHLY"]);

/** Tạo/sửa lịch lặp. `recurrenceId` rỗng = tạo mới. Chỉ NGƯỜI TẠO rule sửa được rule của mình. */
export async function saveRecurrence(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: "NOT_LOGGED_IN" };

  const id = nullable(formData.get("recurrenceId"));
  const title = str(formData.get("title"));
  if (!title) return { error: "TITLE_REQUIRED" };
  const assigneeId = str(formData.get("assigneeId"));
  if (!assigneeId || (await prisma.staff.count({ where: { id: assigneeId, isActive: true } })) === 0) return { error: "ASSIGNEE_INVALID" };

  const freq = str(formData.get("freq"));
  if (!RECUR_FREQ_SET.has(freq)) return { error: "FREQ_INVALID" };
  const dayOfWeek = freq === "WEEKLY" ? Number(str(formData.get("dayOfWeek"))) : null;
  if (freq === "WEEKLY" && (dayOfWeek == null || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) return { error: "DAY_INVALID" };
  const dayOfMonth = freq === "MONTHLY" ? Number(str(formData.get("dayOfMonth"))) : null;
  if (freq === "MONTHLY" && (dayOfMonth == null || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)) return { error: "DAY_INVALID" };
  const dueOffsetRaw = Number(str(formData.get("dueOffsetDays")) || "0");
  const dueOffsetDays = Number.isInteger(dueOffsetRaw) && dueOffsetRaw >= 0 && dueOffsetRaw <= 60 ? dueOffsetRaw : 0;

  const typeId = nullable(formData.get("typeId"));
  const projectId = nullable(formData.get("projectId"));
  if (typeId && (await prisma.optionItem.count({ where: { id: typeId, set: { code: "task_type" } } })) === 0) return { error: "TYPE_INVALID" };
  if (projectId && (await prisma.project.count({ where: { id: projectId } })) === 0) return { error: "PROJECT_INVALID" };

  // checklist: mỗi dòng một mục — lưu JSON đã LỌC qua parseChecklistJson để đường ghi và đường
  // đọc (job sinh việc) cùng một luật.
  const checklistLines = str(formData.get("checklist"))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 50);
  const checklistJson = checklistLines.length > 0 ? JSON.stringify(checklistLines) : null;
  if (checklistJson && parseChecklistJson(checklistJson).length !== checklistLines.length) return { error: "CHECKLIST_INVALID" };

  const priorityRaw = str(formData.get("priority")) || "NORMAL";
  const data = {
    title,
    description: nullable(formData.get("description")),
    priority: TASK_PRIORITY_SET.has(priorityRaw) ? priorityRaw : "NORMAL",
    typeId,
    projectId,
    assigneeId,
    freq,
    dayOfWeek,
    dayOfMonth,
    dueOffsetDays,
    checklistJson,
  };

  if (id) {
    const existing = await prisma.taskRecurrence.findUnique({ where: { id }, select: { creatorId: true } });
    if (!existing || existing.creatorId !== meId) return { error: "NOT_OWNER" };
    await prisma.taskRecurrence.update({ where: { id }, data });
  } else {
    await prisma.taskRecurrence.create({ data: { ...data, creatorId: meId } });
  }
  revalidatePath("/tasks/recurring");
  return { ok: true };
}

/** Bật/tắt lịch lặp — TẮT chứ không xoá (khuôn ClientGroup/VendorFieldDef). */
export async function toggleRecurrence(recurrenceId: string) {
  await requirePermission("tasks.use");
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const rule = await prisma.taskRecurrence.findUnique({ where: { id: recurrenceId }, select: { creatorId: true, isActive: true } });
  if (!rule || rule.creatorId !== meId) return;
  await prisma.taskRecurrence.update({ where: { id: recurrenceId }, data: { isActive: !rule.isActive } });
  revalidatePath("/tasks/recurring");
}
