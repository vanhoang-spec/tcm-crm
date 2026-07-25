import { prisma } from "./prisma";
import { taskPhase, isTaskLocked, finishedGraceDaysLeft, FINISHED_GRACE_DAYS } from "./projects";

// ─────────────────────────────────────────────────────────
// Module Creative — hàm thuần + nghiệp vụ dùng chung (cost-per-task/lương ở đợt sau).
// ─────────────────────────────────────────────────────────

/** Khóa/phase task giờ project-generic ở src/lib/projects.ts (dùng chung với DepartmentTask) —
 * re-export tại đây để KHÔNG đổi call site nào đang import từ "@/lib/creative". */
export { taskPhase, isTaskLocked, finishedGraceDaysLeft, FINISHED_GRACE_DAYS };

export const CREATIVE_TASK_STATUSES = [
  "UNASSIGNED",
  "ASSIGNED",
  "SUBMITTED",
  "REVISION",
  "DELIVERED",
  "CANCELED",
] as const;
export type CreativeTaskStatus = (typeof CREATIVE_TASK_STATUSES)[number];

/** Task "đang làm" = chưa trả và chưa khóa. Kiểu `CreativeTaskStatus[]` để chứng minh compile-time active ⊂ all. */
export const ACTIVE_TASK_STATUSES: readonly CreativeTaskStatus[] = ["UNASSIGNED", "ASSIGNED", "SUBMITTED", "REVISION"];

/**
 * Tự sinh CreativeTask từ 1 Order Creative. Idempotent theo (orderId, sourceItemLabel).
 * Đọc từ 2 nguồn hội tụ vào cùng ProjectOrder:
 *  - `creativeItems` (ProjectOrderCreativeItem): checklist Creative tick tay ở Bidding — sourceItemLabel = it.label.
 *  - `items` (ProjectOrderItem): dòng tự gom từ Master Timeline — sourceItemLabel = "TL:{sourceTimelineItemId|id}".
 * Gọi từ order-actions.createDepartmentOrder & project-orders.dispatchOrder khi department = CREATIVE.
 */
export async function spawnTasksForCreativeOrder(orderId: string): Promise<void> {
  const order = await prisma.projectOrder.findUnique({
    where: { id: orderId },
    include: { creativeItems: true, items: true, project: true },
  });
  if (!order || order.department !== "CREATIVE") return;

  const existing = await prisma.creativeTask.findMany({
    where: { orderId },
    select: { sourceItemLabel: true },
  });
  const already = new Set(existing.map((t) => t.sourceItemLabel));
  const orderedById = order.sentById ?? order.project.ownerId ?? null;

  const fromChecklist = order.creativeItems.map((it) => ({
    sourceItemLabel: it.label,
    orderItemId: null as string | null,
    title: it.detail?.trim() ? it.detail.trim() : `Creative: ${it.label}`,
    detail: it.detail ?? null,
  }));
  const fromTimeline = order.items.map((it) => ({
    sourceItemLabel: `TL:${it.sourceTimelineItemId ?? it.id}`,
    orderItemId: it.id, // giữ FK để đẩy ProjectOrderItem.status → DONE khi task DELIVERED (tín hiệu về Timeline)
    title: it.label,
    detail: it.detail ?? null,
  }));

  const toCreate = [...fromChecklist, ...fromTimeline]
    .filter((row) => !already.has(row.sourceItemLabel))
    .map((row) => ({
      projectId: order.projectId,
      orderId: order.id,
      orderItemId: row.orderItemId,
      orderedById,
      sourceItemLabel: row.sourceItemLabel,
      title: row.title,
      detail: row.detail,
      status: "UNASSIGNED",
    }));

  if (toCreate.length > 0) {
    try {
      await prisma.creativeTask.createMany({ data: toCreate });
    } catch (e) {
      // P2002 = dispatch song song, bên kia đã tạo trước — backstop @@unique([orderId, sourceItemLabel]) hoạt động đúng, bỏ qua.
      if (!(e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002")) throw e;
    }
  }
}

/** Khóa mọi task chưa trả (≠ DELIVERED/CANCELED) của 1 dự án → CANCELED. Gọi khi dự án THUA/HỦY. */
export async function lockCreativeTasksForProject(projectId: string): Promise<void> {
  await prisma.creativeTask.updateMany({
    where: { projectId, status: { notIn: ["DELIVERED", "CANCELED"] } },
    data: { status: "CANCELED" },
  });
}

export type CreativeDashboardStats = {
  totalActive: { bidding: number; working: number };
  projectsActive: { bidding: number; working: number };
  staleLocked: number; // task còn trạng thái active nhưng dự án đã khóa (FINISHED hết grace) — KHÔNG tính vào "đang làm"
  byType: { labelVi: string; labelEn: string | null; count: number }[];
  byMember: {
    staffId: string;
    name: string;
    activeBidding: number;
    activeWorking: number;
    delivered: number;
    avgHours: number | null;
    firstTimeRate: number | null; // % task duyệt lần 1 (revisionCount = 0)
  }[];
};

/** Tổng hợp số liệu realtime cho Dashboard Creative (không cost — đợt sau). */
export async function getCreativeDashboardStats(): Promise<CreativeDashboardStats> {
  const [creativeStaff, activeTasksRaw, deliveredTasks] = await Promise.all([
    prisma.staff.findMany({ where: { department: { code: "CREATIVE" }, isActive: true }, orderBy: { fullName: "asc" } }),
    prisma.creativeTask.findMany({
      where: { status: { in: [...ACTIVE_TASK_STATUSES] } },
      include: { project: { include: { status: true } }, taskType: true },
    }),
    prisma.creativeTask.findMany({
      where: { status: "DELIVERED" },
      select: { assigneeId: true, hoursSpent: true, revisionCount: true },
    }),
  ]);

  // Lọc bỏ task của dự án ĐÃ KHÓA (FINISHED hết grace) — không query được ở Prisma vì lock là phép tính
  // thời gian trên finishedAt. Task còn "active" nhưng dự án đóng lâu rồi KHÔNG được tính vào "đang làm".
  const activeTasks = activeTasksRaw.filter((t) => !isTaskLocked(t.project.status.code, t.project.finishedAt));
  const staleLocked = activeTasksRaw.length - activeTasks.length;

  const totalActive = { bidding: 0, working: 0 };
  const projectPhase = new Map<string, "BIDDING" | "WORKING">();
  const typeCount = new Map<string, { labelVi: string; labelEn: string | null; count: number }>();

  for (const t of activeTasks) {
    const phase = taskPhase(t.project.status.code);
    if (phase === "WORKING") totalActive.working++;
    else totalActive.bidding++;
    projectPhase.set(t.projectId, phase);
    if (t.taskType) {
      const key = t.taskType.id;
      const cur = typeCount.get(key) ?? { labelVi: t.taskType.labelVi, labelEn: t.taskType.labelEn, count: 0 };
      cur.count++;
      typeCount.set(key, cur);
    }
  }

  const projectsActive = { bidding: 0, working: 0 };
  for (const phase of projectPhase.values()) {
    if (phase === "WORKING") projectsActive.working++;
    else projectsActive.bidding++;
  }

  const byMember = creativeStaff.map((s) => {
    const mine = activeTasks.filter((t) => t.assigneeId === s.id);
    const activeWorking = mine.filter((t) => taskPhase(t.project.status.code) === "WORKING").length;
    const activeBidding = mine.length - activeWorking;
    const delivered = deliveredTasks.filter((t) => t.assigneeId === s.id);
    const withHours = delivered.filter((t) => t.hoursSpent != null);
    const avgHours =
      withHours.length > 0 ? withHours.reduce((sum, t) => sum + (t.hoursSpent ?? 0), 0) / withHours.length : null;
    const firstTimeRate =
      delivered.length > 0 ? (delivered.filter((t) => t.revisionCount === 0).length / delivered.length) * 100 : null;
    return { staffId: s.id, name: s.fullName, activeBidding, activeWorking, delivered: delivered.length, avgHours, firstTimeRate };
  });

  return {
    totalActive,
    projectsActive,
    staleLocked,
    byType: Array.from(typeCount.values()).sort((a, b) => b.count - a.count),
    byMember,
  };
}
