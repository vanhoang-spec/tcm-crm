import { prisma } from "./prisma";
import { EXECUTION_STATUS_CODES } from "./projects";

// ─────────────────────────────────────────────────────────
// Module Creative — hàm thuần + nghiệp vụ dùng chung (cost-per-task/lương ở đợt sau).
// ─────────────────────────────────────────────────────────

export const CREATIVE_TASK_STATUSES = [
  "UNASSIGNED",
  "ASSIGNED",
  "SUBMITTED",
  "REVISION",
  "DELIVERED",
  "CANCELED",
] as const;
export type CreativeTaskStatus = (typeof CREATIVE_TASK_STATUSES)[number];

/** Task "đang làm" = chưa trả và chưa khóa. */
export const ACTIVE_TASK_STATUSES = ["UNASSIGNED", "ASSIGNED", "SUBMITTED", "REVISION"] as const;

/** Số ngày Creative được giữ task để lưu về local server sau khi dự án FINISHED. */
export const FINISHED_GRACE_DAYS = 7;

/** Phase của task suy ra realtime từ trạng thái dự án. WORKING = đang thực thi; BIDDING = còn đấu thầu. */
export function taskPhase(projectStatusCode: string): "BIDDING" | "WORKING" {
  return (EXECUTION_STATUS_CODES as readonly string[]).includes(projectStatusCode) ? "WORKING" : "BIDDING";
}

/**
 * Task có bị khóa cứng không (không cho sửa ở module Creative):
 * - Dự án CANCELED/FAILED → khóa ngay (cascade đã set task sang CANCELED).
 * - Dự án FINISHED → cho 7 ngày grace kể từ finishedAt để lưu về local server, sau đó khóa.
 */
export function isTaskLocked(projectStatusCode: string, finishedAt: Date | null): boolean {
  if (projectStatusCode === "CANCELED" || projectStatusCode === "FAILED") return true;
  if (projectStatusCode === "FINISHED" && finishedAt) {
    const graceEnd = finishedAt.getTime() + FINISHED_GRACE_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() > graceEnd;
  }
  return false;
}

/** Số ngày grace còn lại (dự án FINISHED) — null nếu không phải FINISHED hoặc đã hết grace (đã khóa). */
export function finishedGraceDaysLeft(projectStatusCode: string, finishedAt: Date | null): number | null {
  if (projectStatusCode !== "FINISHED" || !finishedAt) return null;
  const end = finishedAt.getTime() + FINISHED_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const left = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
  return left > 0 ? left : null;
}

/**
 * Tự sinh CreativeTask từ checklist của 1 Order Creative. Idempotent theo (orderId, sourceItemLabel):
 * mỗi ProjectOrderCreativeItem chưa có task tương ứng thì tạo 1 task UNASSIGNED.
 * Gọi từ order-actions.createDepartmentOrder khi department = CREATIVE.
 */
export async function spawnTasksForCreativeOrder(orderId: string): Promise<void> {
  const order = await prisma.projectOrder.findUnique({
    where: { id: orderId },
    include: { creativeItems: true, project: true },
  });
  if (!order || order.department !== "CREATIVE") return;

  const existing = await prisma.creativeTask.findMany({
    where: { orderId },
    select: { sourceItemLabel: true },
  });
  const already = new Set(existing.map((t) => t.sourceItemLabel));
  const orderedById = order.sentById ?? order.project.ownerId ?? null;

  const toCreate = order.creativeItems
    .filter((it) => !already.has(it.label))
    .map((it) => ({
      projectId: order.projectId,
      orderId: order.id,
      orderedById,
      sourceItemLabel: it.label,
      title: it.detail?.trim() ? it.detail.trim() : `Creative: ${it.label}`,
      detail: it.detail ?? null,
      status: "UNASSIGNED",
    }));

  if (toCreate.length > 0) await prisma.creativeTask.createMany({ data: toCreate });
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
  const [creativeStaff, activeTasks, deliveredTasks] = await Promise.all([
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
    byType: Array.from(typeCount.values()).sort((a, b) => b.count - a.count),
    byMember,
  };
}
