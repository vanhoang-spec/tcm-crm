"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { isPlanningJobLocked, isValidHours, canAssignPlanningStage } from "@/lib/planning";
import { ORDER_DEPARTMENT_LABELS } from "@/lib/bidding";
import { requirePermission } from "@/lib/permissions";

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

async function loadUnlockedJob(jobId: string) {
  const job = await prisma.planningJob.findUnique({
    where: { id: jobId },
    include: { project: { include: { status: true } }, order: true, stages: true },
  });
  if (!job) return null;
  if (isPlanningJobLocked(job.project.status.code, job.finalConfirmedAt)) return null;
  return job;
}

/** Bỏ qua khi người nhận chính là người đang thao tác (Manager tự giao/tự làm) — tránh tự-notify nhiễu. */
async function notify(recipientStaffId: string, type: string, title: string, body: string | null, projectId: string) {
  const actorId = await getCurrentStaffId();
  if (recipientStaffId === actorId) return;
  await prisma.notification.create({ data: { recipientStaffId, type, title, body, projectId } });
}

function done(projectId: string) {
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath("/reminders");
}

/**
 * Manager giao 1 khâu (hoặc, nếu tick applyToRemaining, giao luôn cho cùng người mọi khâu CHƯA giao/CHƯA
 * xong khác — tóm gọn flow khi cùng 1 người làm hết) — chọn người + timeline expect nhận lại kết quả.
 */
export async function assignPlanningStage(jobId: string, stageId: string, formData: FormData) {
  await requirePermission("projects.planning.manage");
  const job = await loadUnlockedJob(jobId);
  if (!job) return;
  const assigneeId = nullable(formData.get("assigneeId"));
  if (!assigneeId) return;

  // ⚠ Chặn ở SERVER, không chỉ ở ô chọn: đóng dropdown mà để action nhận id tuỳ ý thì ai cũng bắn
  // thẳng một assigneeId của team khác và luồng xin mượn người thành trang trí.
  if (!(await canAssignPlanningStage(job.projectId, assigneeId))) return;

  const dueAt = dateOrNull(formData.get("dueAt"));
  const applyToRemaining = formData.get("applyToRemaining") === "on";
  const staffId = await getCurrentStaffId();

  const targetIds = applyToRemaining
    ? job.stages.filter((s) => !s.completedAt).map((s) => s.id)
    : [stageId];

  await prisma.planningStage.updateMany({
    where: { id: { in: targetIds } },
    data: { assigneeId, assignedById: staffId, assignedAt: new Date() },
  });
  // dueAt riêng cho khâu vừa thao tác — không ép cùng hạn cho các khâu gộp theo (mỗi khâu tự chỉnh lại được).
  await prisma.planningStage.update({ where: { id: stageId }, data: { dueAt } });

  await notify(
    assigneeId,
    "PLANNING_STAGE_ASSIGNED",
    `Bạn được giao ${targetIds.length > 1 ? "các khâu Planning" : "1 khâu Planning"} — dự án ${job.project.code}`,
    job.project.name,
    job.projectId,
  );
  done(job.projectId);
}

/** Nhân sự hoàn thành khâu RESEARCH/DESIGN_BRIEF — nhập link kết quả + số giờ (bội 0.25). */
export async function completePlanningStage(jobId: string, stageId: string, formData: FormData) {
  await requirePermission("projects.planning.manage");
  const job = await loadUnlockedJob(jobId);
  if (!job) return;
  const stage = job.stages.find((s) => s.id === stageId);
  if (!stage || stage.stage === "PROPOSAL") return; // Proposal đi qua version, không complete trực tiếp
  const link = str(formData.get("resultLinkUrl"));
  const hours = Number(formData.get("hoursSpent"));
  if (!link || !isValidHours(hours)) return;

  await prisma.planningStage.update({
    where: { id: stageId },
    data: { resultLinkUrl: link, hoursSpent: hours, completedAt: new Date(), note: nullable(formData.get("note")) },
  });

  if (stage.assignedById) {
    await notify(
      stage.assignedById,
      "PLANNING_RESULT_SUBMITTED",
      `Đã hoàn thành khâu ${stage.stage === "RESEARCH" ? "Research" : "Design brief"} — dự án ${job.project.code}`,
      link,
      job.projectId,
    );
  }
  done(job.projectId);
}

/** Nhân sự nộp 1 version Proposal (link + giờ) — chỉ khi chưa có version nào đang chờ review. */
export async function submitProposalVersion(jobId: string, formData: FormData) {
  await requirePermission("projects.proposal.submit");
  const job = await prisma.planningJob.findUnique({
    where: { id: jobId },
    include: { project: { include: { status: true } }, stages: true, versions: { orderBy: { versionNo: "desc" }, take: 1 } },
  });
  if (!job || isPlanningJobLocked(job.project.status.code, job.finalConfirmedAt)) return;
  const proposalStage = job.stages.find((s) => s.stage === "PROPOSAL");
  if (!proposalStage?.assigneeId) return; // chưa giao khâu Proposal cho ai
  const latest = job.versions[0];
  if (latest && latest.status === "IN_REVIEW") return; // đang chờ Manager review, không nộp chồng

  const link = str(formData.get("resultLinkUrl"));
  const hours = nullable(formData.get("hoursSpent"));
  if (!link) return;
  // Giờ làm BẮT BUỘC từ 01/08/2026 (quyết định chủ dự án: "trả bài content và note thời gian đã làm,
  // 0.25h là mốc tối thiểu"). Trước đó tuỳ chọn — lệch với khâu stage và board task vốn đã bắt buộc.
  if (hours === null || !isValidHours(Number(hours))) return;

  const staffId = await getCurrentStaffId();
  try {
    await prisma.planningProposalVersion.create({
      data: {
        jobId,
        versionNo: (latest?.versionNo ?? 0) + 1,
        resultLinkUrl: link,
        hoursSpent: Number(hours),
        submittedById: staffId,
      },
    });
  } catch (e) {
    // Double-submit đồng thời → 2 bản cùng versionNo đụng @@unique([jobId, versionNo]) (P2002):
    // coi lần sau là duplicate, bỏ qua im lặng thay vì ném 500.
    if ((e as { code?: string }).code === "P2002") return;
    throw e;
  }

  if (proposalStage.assignedById) {
    await notify(
      proposalStage.assignedById,
      "PLANNING_RESULT_SUBMITTED",
      `Proposal version mới chờ review — dự án ${job.project.code}`,
      link,
      job.projectId,
    );
  }
  done(job.projectId);
}

/** Manager yêu cầu sửa lại 1 version — bắt buộc feedback, mở đường cho version kế tiếp. */
export async function requestProposalRevision(versionId: string, formData: FormData) {
  await requirePermission("projects.proposal.approve");
  const version = await prisma.planningProposalVersion.findUnique({
    where: { id: versionId },
    include: { job: { include: { project: { include: { status: true } }, stages: true } } },
  });
  if (!version || version.status !== "IN_REVIEW") return;
  // Job khóa (đã FINAL hoặc dự án THUA/HỦY) → không review nữa — cùng guard với các action khác.
  if (isPlanningJobLocked(version.job.project.status.code, version.job.finalConfirmedAt)) return;
  const note = str(formData.get("reviewNote"));
  if (!note) return;
  const staffId = await getCurrentStaffId();

  await prisma.planningProposalVersion.update({
    where: { id: versionId },
    data: { status: "NEEDS_REVISION", reviewNote: note, reviewedById: staffId, reviewedAt: new Date() },
  });

  const proposalStage = version.job.stages.find((s) => s.stage === "PROPOSAL");
  if (proposalStage?.assigneeId) {
    await notify(
      proposalStage.assigneeId,
      "PLANNING_REVISION_REQUESTED",
      `Proposal v${version.versionNo} cần sửa lại — dự án ${version.job.project.code}`,
      note,
      version.job.projectId,
    );
  }
  done(version.job.projectId);
}

/**
 * Manager confirm FINAL PROPOSAL: chốt version, khóa job, tự chuyển link version cuối về Account đã ORDER
 * (mirror submitOrderResult — cùng field resultLinkUrl/resultSentAt/resultSentById + status DONE) + notify.
 */
export async function confirmFinalProposal(versionId: string) {
  await requirePermission("projects.proposal.approve");
  const version = await prisma.planningProposalVersion.findUnique({
    where: { id: versionId },
    include: { job: { include: { project: { include: { status: true } }, order: true, stages: true } } },
  });
  if (!version || version.status !== "IN_REVIEW") return;
  // Job khóa (đã FINAL hoặc dự án THUA/HỦY) → không cho chốt FINAL trên dự án đã chết.
  if (isPlanningJobLocked(version.job.project.status.code, version.job.finalConfirmedAt)) return;
  const staffId = await getCurrentStaffId();
  const now = new Date();

  const proposalStage = version.job.stages.find((s) => s.stage === "PROPOSAL");

  await prisma.$transaction(async (tx) => {
    await tx.planningProposalVersion.update({
      where: { id: versionId },
      data: { status: "FINAL", reviewedById: staffId, reviewedAt: now },
    });
    await tx.planningJob.update({
      where: { id: version.jobId },
      data: { finalConfirmedById: staffId, finalConfirmedAt: now },
    });
    if (proposalStage) {
      await tx.planningStage.update({
        where: { id: proposalStage.id },
        data: { resultLinkUrl: version.resultLinkUrl, completedAt: now },
      });
    }
    if (version.job.order) {
      await tx.projectOrder.update({
        where: { id: version.job.order.id },
        data: { status: "DONE", resultLinkUrl: version.resultLinkUrl, resultSentAt: now, resultSentById: staffId },
      });
    }
  });

  const recipientId = version.job.requestedById ?? version.job.order?.sentById ?? version.job.project.ownerId;
  if (recipientId) {
    await notify(
      recipientId,
      "PLANNING_FINAL_CONFIRMED",
      `${ORDER_DEPARTMENT_LABELS.PLANNING ?? "Planning"} đã chốt FINAL PROPOSAL — dự án ${version.job.project.code}`,
      version.resultLinkUrl,
      version.job.projectId,
    );
  }
  done(version.job.projectId);
}
