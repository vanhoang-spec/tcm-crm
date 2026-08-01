import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────
// Sub-module PLANNING (module ③) — hàm thuần + spawn job từ Order PLANNING.
//
// Flow từ 01/08/2026 (quyết định chủ dự án): Account gửi ORDER → job sinh ra ĐÃ CÓ NGƯỜI NHẬN và
// order tự chuyển ACCEPTED → người làm bắt tay làm ngay → RESEARCH → DESIGN_BRIEF → PROPOSAL
// (version 1/2/3..., mỗi vòng ghi giờ, bội số 0.25) → confirm FINAL PROPOSAL → trả về Account đã ORDER.
//
// Trước đó có thêm hai cửa chờ ở đầu luồng, nay đã bỏ: phòng Planning bấm "Chấp nhận" order, rồi
// Manager Planning bấm giao từng khâu. Bộ phận Planning độc lập đã giải thể về các team Account nên
// hai cửa đó không còn ai đứng — việc giao là việc NỘI BỘ team, không cần bước xác nhận liên phòng.
// ─────────────────────────────────────────────────────────

/** 3 khâu cố định, tạo sẵn cùng job — thứ tự = sort. */
export const PLANNING_STAGES = ["RESEARCH", "DESIGN_BRIEF", "PROPOSAL"] as const;
export type PlanningStageCode = (typeof PLANNING_STAGES)[number];

export const PROPOSAL_VERSION_STATUSES = ["IN_REVIEW", "NEEDS_REVISION", "FINAL"] as const;

/** Giờ hợp lệ: > 0 và là bội số 0.25 (đơn vị giờ, tối thiểu 0.25h). */
export function isValidHours(hours: number): boolean {
  return Number.isFinite(hours) && hours > 0 && Number.isInteger(hours * 4);
}

type PhaseInput = {
  finalConfirmedAt: Date | null;
  stages: { stage: string; assigneeId: string | null; completedAt: Date | null }[];
};

/**
 * Phase hiển thị của job — suy ra thuần từ dữ liệu, KHÔNG lưu status riêng (tránh drift):
 * FINAL nếu đã confirm · BRIEF nếu chưa giao ai và chưa làm gì (vừa nhận brief) ·
 * ngược lại = khâu đầu tiên chưa hoàn thành (PROPOSAL "hoàn thành" chỉ khi FINAL).
 */
export function planningJobPhase(job: PhaseInput): "BRIEF" | PlanningStageCode | "FINAL" {
  if (job.finalConfirmedAt) return "FINAL";
  const untouched = job.stages.every((s) => !s.assigneeId && !s.completedAt);
  if (untouched) return "BRIEF";
  const byStage = new Map(job.stages.map((s) => [s.stage, s]));
  for (const code of PLANNING_STAGES) {
    const s = byStage.get(code);
    if (!s) return code; // dữ liệu thiếu khâu (không xảy ra với job tạo qua spawn) — coi như đang ở khâu đó
    if (code === "PROPOSAL") return code; // chưa FINAL → luôn dừng ở PROPOSAL
    if (!s.completedAt) return code;
  }
  return "BRIEF";
}

/** Job đã khóa (read-only) khi FINAL đã confirm hoặc dự án THUA/HỦY. */
export function isPlanningJobLocked(projectStatusCode: string, finalConfirmedAt: Date | null): boolean {
  if (finalConfirmedAt) return true;
  return projectStatusCode === "CANCELED" || projectStatusCode === "FAILED";
}

/**
 * Điều kiện Prisma chọn nhân sự NHẬN VIỆC của một bộ phận.
 *
 * ⚠ MỘT NGUỒN SỰ THẬT — dùng lại ở cả 4 chỗ hỏi cùng câu hỏi này: ô "Giao cho" của tab Planning,
 * board task bộ phận (`department-tasks.ts`), và người nhận thông báo ORDER ở CẢ HAI đường gửi order
 * (`order-actions.createDepartmentOrder` + `project-orders.dispatchOrder`).
 *
 * PLANNING đi đường khác: từ 01/08/2026 không còn là phòng ban, người làm Planning nằm rải trong các
 * team Account và đánh dấu bằng `Staff.isPlanningStaff`. Lọc PLANNING theo `department.code` sẽ ra
 * DANH SÁCH RỖNG — hệ quả im lặng là gửi order Planning mà KHÔNG AI nhận được thông báo.
 */
export function orderRecipientWhere(department: string) {
  return department === "PLANNING"
    ? { isPlanningStaff: true, isActive: true }
    : { department: { code: department }, isActive: true };
}

/**
 * Người tự nhận việc Planning của một dự án — ưu tiên người Planning CÙNG TEAM với dự án, không có
 * thì lấy toàn công ty. CHỈ trả về khi còn đúng MỘT ứng viên: nhiều hơn một là có lựa chọn thật sự,
 * máy chọn hộ sẽ giao nhầm người mà không ai biết → để trống cho người giao tay (đường cũ vẫn còn).
 */
async function resolveAutoPlanner(ownerTeamId: string | null): Promise<string | null> {
  const all = await prisma.staff.findMany({
    where: orderRecipientWhere("PLANNING"),
    select: { id: true, teamId: true },
  });
  const sameTeam = ownerTeamId ? all.filter((s) => s.teamId === ownerTeamId) : [];
  const pool = sameTeam.length > 0 ? sameTeam : all;
  return pool.length === 1 ? pool[0].id : null;
}

/**
 * Tự sinh PlanningJob từ 1 Order PLANNING — idempotent theo orderId (@unique trên PlanningJob.orderId).
 * Snapshot brief link + người order; tạo sẵn 3 khâu. Gọi từ order-actions.createDepartmentOrder
 * & project-orders.dispatchOrder khi department = PLANNING (mirror spawnTasksForCreativeOrder).
 *
 * Từ 01/08/2026 hàm này còn làm luôn phần "tiếp nhận": gán sẵn người làm cho cả 3 khâu và đẩy order
 * sang ACCEPTED. `assignedById` = người GỬI ORDER, nên khi người làm nộp version thì thông báo bay
 * thẳng về đúng Account đã đặt việc (`submitProposalVersion` notify theo `assignedById`).
 */
export async function spawnPlanningJobForOrder(orderId: string): Promise<void> {
  const order = await prisma.projectOrder.findUnique({
    where: { id: orderId },
    include: { project: true, planningJob: { select: { id: true } } },
  });
  if (!order || order.department !== "PLANNING" || order.planningJob) return;

  const assignedById = order.sentById ?? order.project.ownerId;
  const assigneeId = await resolveAutoPlanner(order.project.ownerTeamId);
  const now = new Date();

  await prisma.planningJob.create({
    data: {
      projectId: order.projectId,
      orderId: order.id,
      briefLinkUrl: order.briefLinkUrl ?? order.project.briefLinkUrl,
      briefNote: order.extraBriefInfo,
      requestedById: assignedById,
      stages: {
        create: PLANNING_STAGES.map((stage, i) => ({
          stage,
          sort: i,
          ...(assigneeId ? { assigneeId, assignedById, assignedAt: now } : {}),
        })),
      },
    },
  });

  // Bỏ cửa chờ "Chấp nhận": không còn phòng Planning nào đứng ra xác nhận liên phòng. Chỉ đẩy khi
  // order vẫn đang SENT — order đã DONE (gửi lại brief cho job cũ) thì đừng kéo ngược trạng thái.
  if (order.status === "SENT") {
    await prisma.projectOrder.update({
      where: { id: order.id },
      data: { status: "ACCEPTED", acceptedAt: now, acceptedById: assigneeId },
    });
  }
}
