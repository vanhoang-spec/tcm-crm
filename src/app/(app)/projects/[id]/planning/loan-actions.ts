"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission, hasPermission } from "@/lib/permissions";

/*
 * XIN MƯỢN NGƯỜI LÀM PLANNING TỪ TEAM KHÁC (chốt 05/08/2026).
 *
 * Vòng đời: PENDING → APPROVED (kèm tên người cho mượn) | REJECTED (kèm lý do) | CANCELED.
 *
 * ⚠ Ai duyệt: TRƯỞNG TEAM ĐƯỢC MƯỢN. Kiểm bằng dữ liệu (`team.leadStaffId`) chứ không bằng mã quyền
 * riêng — mirror đúng cách `canApproveIssue` của kho dùng PIC/Leader dự án. Người có
 * `settings.teams.manage` (BGĐ + Account Director) vượt được, để team vắng trưởng không kẹt cứng.
 *
 * ⚠ Mọi lệnh đổi trạng thái đều đi qua `updateMany` có status trong `where` + kiểm `count === 0`
 * (khuôn `moveBudget` của overhead) — chống double-click và chống hai trưởng team bấm cùng lúc.
 */

export type LoanState = { error?: string; success?: boolean };

const err = (error: string): LoanState => ({ error });

/** Người đang thao tác có được quyết phiếu của team `toTeamId` không. */
async function canDecide(toTeamId: string, staffId: string | null): Promise<boolean> {
  if (!staffId) return false;
  const team = await prisma.team.findUnique({ where: { id: toTeamId }, select: { leadStaffId: true } });
  if (team?.leadStaffId === staffId) return true;
  return hasPermission("settings.teams.manage");
}

function done(projectId: string) {
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath("/reminders");
}

/** Trưởng team đi mượn lập phiếu. */
export async function createLoanRequest(projectId: string, _prev: LoanState, formData: FormData): Promise<LoanState> {
  await requirePermission("projects.planning.manage");
  const t = await getTranslations("projects.planning.loan");
  const toTeamId = String(formData.get("toTeamId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!toTeamId || !reason) return err(t("errRequired"));

  const [project, staffId] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { code: true, name: true, ownerTeamId: true } }),
    getCurrentStaffId(),
  ]);
  if (!project) return err(t("errNotFound"));
  // Dự án chưa gán team thì không xác định được "team đi mượn" — chặn thay vì đoán.
  if (!project.ownerTeamId) return err(t("errNoOwnerTeam"));
  if (project.ownerTeamId === toTeamId) return err(t("errSameTeam"));

  const toTeam = await prisma.team.findFirst({ where: { id: toTeamId, isActive: true }, select: { id: true, code: true, leadStaffId: true } });
  if (!toTeam) return err(t("errTeamNotFound"));

  // Một dự án chỉ có MỘT phiếu đang chờ — không thì trưởng team kia nhận 5 phiếu giống nhau.
  const pending = await prisma.planningLoanRequest.findFirst({ where: { projectId, status: "PENDING" }, select: { id: true } });
  if (pending) return err(t("errAlreadyPending"));

  await prisma.planningLoanRequest.create({
    data: { projectId, fromTeamId: project.ownerTeamId, toTeamId, reason, requestedById: staffId ?? "", status: "PENDING" },
  });

  if (toTeam.leadStaffId) {
    await prisma.notification.create({
      data: {
        recipientStaffId: toTeam.leadStaffId,
        type: "PLANNING_LOAN_REQUESTED",
        title: `Xin mượn người Planning — dự án ${project.code}`,
        body: reason,
        projectId,
      },
    });
  }
  done(projectId);
  return { success: true };
}

/** Trưởng team được mượn ĐỒNG Ý — bắt buộc chọn đích danh người cho mượn. */
export async function approveLoanRequest(projectId: string, requestId: string, _prev: LoanState, formData: FormData): Promise<LoanState> {
  await requirePermission("projects.planning.manage");
  const t = await getTranslations("projects.planning.loan");
  const lentStaffId = String(formData.get("lentStaffId") ?? "").trim();
  if (!lentStaffId) return err(t("errPickPerson"));

  const req = await prisma.planningLoanRequest.findUnique({
    where: { id: requestId },
    select: { id: true, projectId: true, toTeamId: true, status: true, requestedById: true },
  });
  if (!req || req.projectId !== projectId) return err(t("errNotFound"));
  if (req.status !== "PENDING") return err(t("errNotPending"));

  const staffId = await getCurrentStaffId();
  if (!(await canDecide(req.toTeamId, staffId))) return err(t("errNotLead"));

  // Người cho mượn phải ĐANG LÀM VIỆC và thuộc ĐÚNG team được hỏi — không thì trưởng team A "cho
  // mượn" một người của team C mà mình không quản.
  const lent = await prisma.staff.findFirst({
    where: { id: lentStaffId, teamId: req.toTeamId, isActive: true },
    select: { id: true, fullName: true },
  });
  if (!lent) return err(t("errPersonNotInTeam"));

  const { count } = await prisma.planningLoanRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "APPROVED", lentStaffId: lent.id, decidedById: staffId, decidedAt: new Date() },
  });
  if (count === 0) return err(t("errNotPending"));

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { code: true, name: true } });
  await prisma.notification.createMany({
    data: [req.requestedById, lent.id].filter(Boolean).map((rid) => ({
      recipientStaffId: rid,
      type: "PLANNING_LOAN_APPROVED",
      title: `Đồng ý cho mượn ${lent.fullName} — dự án ${project?.code ?? ""}`,
      body: project?.name ?? "",
      projectId,
    })),
  });
  done(projectId);
  return { success: true };
}

/** Trưởng team được mượn TỪ CHỐI — bắt buộc lý do. */
export async function rejectLoanRequest(projectId: string, requestId: string, _prev: LoanState, formData: FormData): Promise<LoanState> {
  await requirePermission("projects.planning.manage");
  const t = await getTranslations("projects.planning.loan");
  const note = String(formData.get("decisionNote") ?? "").trim();
  if (!note) return err(t("errRejectNote"));

  const req = await prisma.planningLoanRequest.findUnique({
    where: { id: requestId },
    select: { id: true, projectId: true, toTeamId: true, status: true, requestedById: true },
  });
  if (!req || req.projectId !== projectId) return err(t("errNotFound"));
  if (req.status !== "PENDING") return err(t("errNotPending"));

  const staffId = await getCurrentStaffId();
  if (!(await canDecide(req.toTeamId, staffId))) return err(t("errNotLead"));

  const { count } = await prisma.planningLoanRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "REJECTED", decisionNote: note, decidedById: staffId, decidedAt: new Date() },
  });
  if (count === 0) return err(t("errNotPending"));

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { code: true } });
  if (req.requestedById) {
    await prisma.notification.create({
      data: {
        recipientStaffId: req.requestedById,
        type: "PLANNING_LOAN_REJECTED",
        title: `Từ chối cho mượn người — dự án ${project?.code ?? ""}`,
        body: note,
        projectId,
      },
    });
  }
  done(projectId);
  return { success: true };
}

/** Người lập phiếu tự huỷ khi chưa ai quyết. */
export async function cancelLoanRequest(projectId: string, requestId: string): Promise<LoanState> {
  await requirePermission("projects.planning.manage");
  const t = await getTranslations("projects.planning.loan");
  const staffId = await getCurrentStaffId();
  const req = await prisma.planningLoanRequest.findUnique({
    where: { id: requestId },
    select: { projectId: true, status: true, requestedById: true },
  });
  if (!req || req.projectId !== projectId) return err(t("errNotFound"));
  if (req.status !== "PENDING") return err(t("errNotPending"));
  if (req.requestedById !== staffId && !(await hasPermission("settings.teams.manage"))) return err(t("errNotOwner"));

  const { count } = await prisma.planningLoanRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "CANCELED", decidedById: staffId, decidedAt: new Date() },
  });
  if (count === 0) return err(t("errNotPending"));
  done(projectId);
  return { success: true };
}
