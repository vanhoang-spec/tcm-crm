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

/** Nhân sự đủ tư cách LÀM việc Planning của một team — dùng cho ô "Giao cho" và cho phép gán. */
export async function planningStaffOfTeam(teamId: string) {
  return prisma.staff.findMany({
    where: { teamId, isActive: true },
    select: { id: true, fullName: true, email: true, isPlanningStaff: true },
    orderBy: [{ isPlanningStaff: "desc" }, { fullName: "asc" }],
  });
}

/**
 * AI NHẬN THÔNG BÁO khi có order Planning cho một dự án — ba tầng, dừng ở tầng đầu tiên có người.
 *
 *   ① Người đã tick "nhân sự Planning" và CÙNG TEAM với dự án
 *        → ngày công ty tuyển được người Planning chuyên trách, chỉ cần tick một ô là tự thu hẹp
 *          về đúng người đó, không phải sửa code.
 *   ② Chưa có ai được tick → TRƯỞNG TEAM của dự án
 *        → chốt 05/08/2026: Leader nhận việc rồi tự gán người trong team mình.
 *   ③ Dự án chưa gán team, hoặc team chưa có trưởng (A2 đang vậy) → mọi người đã tick toàn công ty,
 *      không có nữa thì trưởng của các team còn lại.
 *
 * ⚠ Lớp ③ là CHỐNG CÂM, đừng bỏ: thiếu nó thì dự án chưa gán team sẽ gửi order đi mà không một ai
 * nhận được thông báo — đúng lỗi im lặng đã gặp khi phòng Planning giải thể.
 */
export async function planningRecipientIds(ownerTeamId: string | null): Promise<string[]> {
  const flagged = await prisma.staff.findMany({
    where: { isPlanningStaff: true, isActive: true },
    select: { id: true, teamId: true },
  });

  if (ownerTeamId) {
    const sameTeam = flagged.filter((s) => s.teamId === ownerTeamId);
    if (sameTeam.length > 0) return sameTeam.map((s) => s.id); // ①

    const team = await prisma.team.findUnique({
      where: { id: ownerTeamId },
      select: { lead: { select: { id: true, isActive: true } } },
    });
    if (team?.lead?.isActive) return [team.lead.id]; // ②
  }

  // ③ chống câm
  if (flagged.length > 0) return flagged.map((s) => s.id);
  const leads = await prisma.team.findMany({
    where: { isActive: true, lead: { isActive: true } },
    select: { leadStaffId: true },
  });
  return leads.flatMap((t) => (t.leadStaffId ? [t.leadStaffId] : []));
}

/**
 * Được phép GÁN người này vào khâu Planning của dự án này không?
 *
 * Hai đường hợp lệ, không có đường thứ ba:
 *   ① Người thuộc chính team sở hữu dự án và đang làm việc;
 *   ② Người của team khác NHƯNG đã có phiếu mượn được duyệt cho đúng dự án này và đúng tên người đó.
 *
 * ⚠ Đây là chốt chặn ở SERVER cho quyết định "đóng ô Giao cho". Bỏ hàm này đi thì ô chọn chỉ còn là
 * gợi ý: ai cũng bắn thẳng một `assigneeId` bất kỳ và luồng xin mượn người thành trang trí.
 */
export async function canAssignPlanningStage(projectId: string, assigneeId: string): Promise<boolean> {
  const [project, assignee] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { ownerTeamId: true } }),
    prisma.staff.findUnique({ where: { id: assigneeId }, select: { teamId: true, isActive: true } }),
  ]);
  if (!project || !assignee?.isActive) return false;
  if (project.ownerTeamId && assignee.teamId === project.ownerTeamId) return true; // ①

  const loan = await prisma.planningLoanRequest.findFirst({
    where: { projectId, status: "APPROVED", lentStaffId: assigneeId },
    select: { id: true },
  });
  return loan !== null; // ②
}

/** Người ngoài team đã được duyệt cho mượn — nối thêm vào ô "Giao cho". */
export async function approvedLoanStaff(projectId: string) {
  const loans = await prisma.planningLoanRequest.findMany({
    where: { projectId, status: "APPROVED", lentStaff: { isActive: true } },
    select: { lentStaff: { select: { id: true, fullName: true, team: { select: { code: true } } } } },
  });
  return loans.flatMap((l) => (l.lentStaff ? [{ id: l.lentStaff.id, fullName: l.lentStaff.fullName, teamCode: l.lentStaff.team?.code ?? null }] : []));
}

/**
 * AI NHẬN THÔNG BÁO khi gửi ORDER — một cửa duy nhất cho CẢ HAI đường gửi order
 * (`order-actions.createDepartmentOrder` và `project-orders.dispatchOrder`).
 *
 * PLANNING đi qua ba tầng ở `planningRecipientIds`; các bộ phận còn lại vẫn báo cả bộ phận như cũ.
 * Người VỪA BẤM GỬI bị loại khỏi danh sách — tự báo cho chính mình là thông báo rác.
 */
export async function orderRecipientIds(
  department: string,
  ownerTeamId: string | null,
  senderId: string | null,
): Promise<string[]> {
  const ids =
    department === "PLANNING"
      ? await planningRecipientIds(ownerTeamId)
      : (await prisma.staff.findMany({ where: orderRecipientWhere(department), select: { id: true } })).map((s) => s.id);

  const unique = [...new Set(ids)];
  const withoutSender = unique.filter((id) => id !== senderId);
  // ⚠ Loại người gửi, NHƯNG không để danh sách rỗng. Ca thật: trưởng team A1 tự gửi order Planning
  // cho team mình — anh ấy là người nhận duy nhất, loại đi là không một ai được báo, đúng lỗi câm mà
  // ba tầng ở trên sinh ra để tránh. Việc vẫn là của anh ấy, nên báo cho chính anh ấy mới đúng.
  return withoutSender.length > 0 ? withoutSender : unique;
}

/**
 * Người TỰ NHẬN việc Planning khi order vừa gửi — chỉ trả về khi còn đúng MỘT ứng viên đã được tick
 * "nhân sự Planning". Nhiều hơn một là có lựa chọn thật, máy chọn hộ sẽ giao nhầm người mà không ai
 * biết.
 *
 * ⚠ Từ 05/08/2026 hàm này CỐ Ý không rơi về trưởng team: chủ dự án chốt "Leader tự gán người làm".
 * Chưa tuyển được người Planning chuyên trách thì job sinh ra ở trạng thái CHƯA GÁN và trưởng team
 * là người bấm gán — chứ không phải máy gán bừa cho chính trưởng team rồi coi như xong việc.
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
