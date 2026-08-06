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
 * CR-1: số ngày ĐÃ TRỄ của một task — null nếu chưa trễ / không hạn / đã trả / đã khoá.
 * THUẦN, nhận `now` từ ngoài được để test; mặc định đồng hồ thật (chỉ gọi ở server lúc render).
 */
export function taskOverdueDays(
  status: string,
  deadline: Date | null,
  locked: boolean,
  now: Date = new Date(),
): number | null {
  if (locked || !deadline) return null;
  if (!(ACTIVE_TASK_STATUSES as readonly string[]).includes(status)) return null;
  const ms = now.getTime() - new Date(deadline).getTime();
  if (ms <= 0) return null;
  return Math.max(1, Math.floor(ms / 86_400_000));
}

/**
 * CR-1: nhãn checklist Order → team nhỏ MẶC ĐỊNH nhận việc. Chỉ là GỢI Ý lúc spawn — CD điều phối
 * lại được trên board. OTHER không map (CD tự quyết); dòng từ Master Timeline (TL:*) cũng vậy.
 *
 * ⚠ Danh sách nhãn sống ở HAI nơi khác: `bidding/order-panel.tsx` (UI) và `bidding/order-actions.ts`
 * (server) — thêm nhãn mới ở đó thì cân nhắc thêm dòng map ở đây, thiếu thì task chỉ không được
 * gợi ý team (vô hại).
 */
export const SQUAD_CODE_BY_ORDER_LABEL: Record<string, string> = {
  KEY_VISUAL: "GRAPHIC_2D",
  DESIGN_2D: "GRAPHIC_2D",
  DESIGN_3D: "MULTIMEDIA",
  SET_DESIGN: "MULTIMEDIA",
  VIDEO: "MULTIMEDIA",
};

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

  // CR-1: gợi ý team nhỏ theo nhãn checklist. Squad tắt/chưa seed ⇒ null, KHÔNG chặn spawn.
  const squads = await prisma.creativeSquad.findMany({ where: { isActive: true }, select: { id: true, code: true } });
  const squadIdByCode = new Map(squads.map((s) => [s.code, s.id]));

  const fromChecklist = order.creativeItems.map((it) => ({
    sourceItemLabel: it.label,
    orderItemId: null as string | null,
    title: it.detail?.trim() ? it.detail.trim() : `Creative: ${it.label}`,
    detail: it.detail ?? null,
    squadId: squadIdByCode.get(SQUAD_CODE_BY_ORDER_LABEL[it.label] ?? "") ?? null,
  }));
  const fromTimeline = order.items.map((it) => ({
    sourceItemLabel: `TL:${it.sourceTimelineItemId ?? it.id}`,
    orderItemId: it.id, // giữ FK để đẩy ProjectOrderItem.status → DONE khi task DELIVERED (tín hiệu về Timeline)
    title: it.label,
    detail: it.detail ?? null,
    squadId: null as string | null, // dòng Timeline không đoán được loại việc — CD điều phối tay
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
      // CR-1 fix gốc "0 task có deadline": hạn task mặc định = hạn mong muốn trên Order. Trước đây
      // cột này bị bỏ trống lúc spawn nên bộ nhắc quá hạn không bao giờ chạy (đo được 0/5 task).
      deadline: order.desiredTimeline,
      squadId: row.squadId,
    }));

  if (toCreate.length > 0) {
    try {
      await prisma.creativeTask.createMany({ data: toCreate });
    } catch (e) {
      // P2002 = dispatch song song, bên kia đã tạo trước — backstop @@unique([orderId, sourceItemLabel]) hoạt động đúng, bỏ qua.
      if (!(e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002")) throw e;
    }

    // Báo trưởng team nhỏ có việc mới về team — SAU khi ghi task (SQLite single-writer, không gói
    // transaction). Gom MỘT tin mỗi team mỗi order. Task chưa có team (OTHER/TL) thì CD tự thấy
    // trên board ở nhóm "chờ điều phối".
    const bySquad = new Map<string, number>();
    for (const row of toCreate) if (row.squadId) bySquad.set(row.squadId, (bySquad.get(row.squadId) ?? 0) + 1);
    if (bySquad.size > 0) {
      const leads = await prisma.creativeSquad.findMany({
        where: { id: { in: [...bySquad.keys()] }, leadStaffId: { not: null } },
        select: { id: true, name: true, leadStaffId: true },
      });
      if (leads.length > 0) {
        await prisma.notification.createMany({
          data: leads.map((s) => ({
            recipientStaffId: s.leadStaffId!,
            type: "CREATIVE_TASK_ROUTED",
            title: `${bySquad.get(s.id)} task Creative mới về team ${s.name}`,
            body: `Dự án ${order.project.code} — vào Creative để giao người trong team.`,
            projectId: order.projectId,
          })),
        });
      }
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
