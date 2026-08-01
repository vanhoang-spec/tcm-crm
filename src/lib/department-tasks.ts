import { prisma } from "./prisma";
import { isTaskLocked, finishedGraceDaysLeft } from "./projects";
import { orderRecipientWhere } from "./planning";

// ─────────────────────────────────────────────────────────
// Task nội bộ theo bộ phận — PLANNING | PCC | OPE | PRO (Creative dùng CreativeTask riêng, xem
// src/lib/creative.ts — KHÔNG đụng). Mirror đúng pattern spawn/lock của Creative.
// ─────────────────────────────────────────────────────────

export const DEPARTMENT_TASK_STATUSES = ["UNASSIGNED", "ASSIGNED", "SUBMITTED", "REVISION", "DELIVERED", "CANCELED"] as const;
export type DepartmentTaskStatus = (typeof DEPARTMENT_TASK_STATUSES)[number];

/** Task "đang làm" = chưa trả và chưa khóa. */
export const ACTIVE_DEPARTMENT_TASK_STATUSES: readonly DepartmentTaskStatus[] = [
  "UNASSIGNED",
  "ASSIGNED",
  "SUBMITTED",
  "REVISION",
];

/** 4 bộ phận có board task nội bộ (Creative tách riêng ở /creative). */
export const DEPARTMENT_TASK_DEPARTMENTS = ["PLANNING", "PCC", "OPE", "PRO"] as const;
export type DepartmentTaskDepartment = (typeof DEPARTMENT_TASK_DEPARTMENTS)[number];

export function isDepartmentTaskDepartment(code: string): code is DepartmentTaskDepartment {
  return (DEPARTMENT_TASK_DEPARTMENTS as readonly string[]).includes(code);
}

/**
 * Tự sinh DepartmentTask từ 1 Order đã dispatch (department ∈ DEPARTMENT_TASK_DEPARTMENTS).
 * Idempotent theo (orderId, sourceKey). Đọc `items` (ProjectOrderItem — dòng tự gom từ Master
 * Timeline, sourceKey = "TL:{sourceTimelineItemId|id}"); nếu order không có dòng nào (Account
 * nhập tay chỉ outputRequest/extraBriefInfo) → tạo 1 task duy nhất sourceKey = "ORDER:{orderId}".
 * Gọi từ order-actions.createDepartmentOrder, project-orders.dispatchOrder, projects/actions.addProjectOrderItem.
 */
export async function spawnTasksForDepartmentOrder(orderId: string): Promise<void> {
  const order = await prisma.projectOrder.findUnique({
    where: { id: orderId },
    include: { items: true, project: true },
  });
  if (!order || !isDepartmentTaskDepartment(order.department)) return;

  const existing = await prisma.departmentTask.findMany({ where: { orderId }, select: { sourceKey: true } });
  const already = new Set(existing.map((t) => t.sourceKey));
  const orderedById = order.sentById ?? order.project.ownerId ?? null;

  const fromTimeline = order.items.map((it) => ({
    sourceKey: `TL:${it.sourceTimelineItemId ?? it.id}`,
    orderItemId: it.id as string | null,
    title: it.label,
    detail: it.detail ?? null,
    deadline: it.desiredReceiptAt ?? null,
  }));

  const rows =
    fromTimeline.length > 0
      ? fromTimeline
      : [
          {
            sourceKey: `ORDER:${order.id}`,
            orderItemId: null,
            title: order.outputRequest?.trim() ? order.outputRequest.trim() : order.extraBriefInfo?.trim() || "Yêu cầu từ Account",
            detail: order.extraBriefInfo ?? null,
            deadline: order.desiredTimeline ?? null,
          },
        ];

  // Order từng chỉ có yêu cầu chữ (task fallback "ORDER:{id}") mà giờ đã có dòng thật →
  // dọn task fallback còn UNASSIGNED để không đếm trùng với task theo dòng.
  if (fromTimeline.length > 0 && already.has(`ORDER:${order.id}`)) {
    await prisma.departmentTask.deleteMany({
      where: { orderId, sourceKey: `ORDER:${order.id}`, status: "UNASSIGNED" },
    });
  }

  const toCreate = rows
    .filter((row) => !already.has(row.sourceKey))
    .map((row) => ({
      projectId: order.projectId,
      department: order.department,
      orderId: order.id,
      orderItemId: row.orderItemId,
      orderedById,
      sourceKey: row.sourceKey,
      title: row.title,
      detail: row.detail,
      deadline: row.deadline,
      status: "UNASSIGNED",
    }));

  if (toCreate.length > 0) {
    try {
      await prisma.departmentTask.createMany({ data: toCreate });
    } catch (e) {
      // P2002 = dispatch song song, bên kia đã tạo trước — backstop @@unique([orderId, sourceKey]) hoạt động đúng, bỏ qua.
      if (!(e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002")) throw e;
    }
  }
}

/** Khóa mọi task chưa trả (≠ DELIVERED/CANCELED) của 1 dự án → CANCELED. Gọi khi dự án THUA/HỦY. */
export async function lockDepartmentTasksForProject(projectId: string): Promise<void> {
  await prisma.departmentTask.updateMany({
    where: { projectId, status: { notIn: ["DELIVERED", "CANCELED"] } },
    data: { status: "CANCELED" },
  });
}

/** Board data cho 1 tab bộ phận trong workspace dự án. */
export async function getDepartmentTasks(projectId: string, department: DepartmentTaskDepartment) {
  return prisma.departmentTask.findMany({
    where: { projectId, department },
    include: { assignee: true, assignedBy: true, orderedBy: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Nhân sự active nhận được việc của 1 bộ phận — dùng cho select "Giao cho" (hiện Tên — email).
 *
 * ⚠ PLANNING đi đường KHÁC ba bộ phận còn lại: từ 01/08/2026 Planning không còn là phòng ban độc lập,
 * người làm Planning nằm rải trong các team Account và được đánh dấu bằng cờ `Staff.isPlanningStaff`
 * (xem chú thích cột trong schema.prisma). Lọc PLANNING theo `department.code` như cũ sẽ ra DANH SÁCH
 * RỖNG và không giao được việc cho ai.
 *
 * Nhãn kèm mã team khi có, để người giao biết mình đang mượn người của team khác — cố ý KHÔNG chặn
 * cứng theo team (hiện chỉ 1 người Planning cho 2 team).
 */
export async function getDepartmentStaffOptions(department: DepartmentTaskDepartment) {
  const staff = await prisma.staff.findMany({
    where: orderRecipientWhere(department),
    include: { team: { select: { code: true } } },
    orderBy: { fullName: "asc" },
  });
  return staff.map((s) => ({
    id: s.id,
    label: s.team ? `${s.fullName} — ${s.email} (${s.team.code})` : `${s.fullName} — ${s.email}`,
  }));
}

type DepartmentTaskRow = Awaited<ReturnType<typeof getDepartmentTasks>>[number];

/** Chuyển 1 row Prisma DepartmentTask → shape hiển thị cho DepartmentTaskBoard (tính lock/grace theo project). */
export function toDepartmentTaskBoardData(
  task: DepartmentTaskRow,
  projectStatusCode: string,
  finishedAt: Date | null,
) {
  return {
    id: task.id,
    title: task.title,
    detail: task.detail,
    status: task.status as DepartmentTaskStatus,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.fullName ?? null,
    ordererId: task.orderedById,
    ordererName: task.orderedBy?.fullName ?? null,
    leadApprovalNotRequired: task.leadApprovalNotRequired,
    deadline: task.deadline,
    deliverableLinkUrl: task.deliverableLinkUrl,
    hoursSpent: task.hoursSpent,
    revisionCount: task.revisionCount,
    deliveredAt: task.deliveredAt,
    locked: isTaskLocked(projectStatusCode, finishedAt),
    graceDaysLeft: finishedGraceDaysLeft(projectStatusCode, finishedAt),
  };
}
