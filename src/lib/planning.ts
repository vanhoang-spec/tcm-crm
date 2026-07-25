import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────
// Sub-module PLANNING (module ③) — hàm thuần + spawn job từ Order PLANNING.
// Flow: Brief → Manager giao → RESEARCH → DESIGN_BRIEF → PROPOSAL (version 1/2/3...,
// Manager review nội bộ) → confirm FINAL PROPOSAL → trả về Account đã ORDER.
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
 * Tự sinh PlanningJob từ 1 Order PLANNING — idempotent theo orderId (@unique trên PlanningJob.orderId).
 * Snapshot brief link + người order; tạo sẵn 3 khâu. Gọi từ order-actions.createDepartmentOrder
 * & project-orders.dispatchOrder khi department = PLANNING (mirror spawnTasksForCreativeOrder).
 */
export async function spawnPlanningJobForOrder(orderId: string): Promise<void> {
  const order = await prisma.projectOrder.findUnique({
    where: { id: orderId },
    include: { project: true, planningJob: { select: { id: true } } },
  });
  if (!order || order.department !== "PLANNING" || order.planningJob) return;

  await prisma.planningJob.create({
    data: {
      projectId: order.projectId,
      orderId: order.id,
      briefLinkUrl: order.briefLinkUrl ?? order.project.briefLinkUrl,
      briefNote: order.extraBriefInfo,
      requestedById: order.sentById ?? order.project.ownerId,
      stages: { create: PLANNING_STAGES.map((stage, i) => ({ stage, sort: i })) },
    },
  });
}

/** Manager Planning = trưởng bộ phận PLANNING (Department.leadStaffId) — quyền danh nghĩa (chưa có RBAC thật). */
export async function getPlanningManagerId(): Promise<string | null> {
  const dept = await prisma.department.findUnique({ where: { code: "PLANNING" }, select: { leadStaffId: true } });
  return dept?.leadStaffId ?? null;
}
