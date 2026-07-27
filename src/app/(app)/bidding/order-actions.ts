"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { ORDER_DEPARTMENT_LABELS } from "@/lib/bidding";
import { spawnTasksForCreativeOrder } from "@/lib/creative";
import { spawnPlanningJobForOrder } from "@/lib/planning";
import { spawnTasksForDepartmentOrder, isDepartmentTaskDepartment } from "@/lib/department-tasks";

function toNullable(v: string) {
  return v.trim() === "" ? null : v.trim();
}

const CREATIVE_OUTPUT_LABELS = ["KEY_VISUAL", "DESIGN_2D", "DESIGN_3D", "SET_DESIGN", "VIDEO", "OTHER"] as const;

/** Route tab workspace dự án tương ứng mỗi bộ phận có DepartmentTask board — dùng để revalidatePath đúng chỗ. */
const DEPARTMENT_TAB_SEG: Record<string, string> = {
  PLANNING: "planning",
  PCC: "purchasing",
  OPE: "operations",
  PRO: "production",
};

/** Đặt lịch họp Brainstorm — mời nhiều người, gửi notification NGAY, không có bước Accept. */
export async function createBrainstormOrder(projectId: string, formData: FormData) {
  await requirePermission("projects.order.dispatch");
  const meetingAtRaw = String(formData.get("meetingAt") ?? "").trim();
  if (!meetingAtRaw) return;
  const meetingLocation = toNullable(String(formData.get("meetingLocation") ?? ""));
  const meetingFormat = String(formData.get("meetingFormat") ?? "OFFLINE");
  const attendeeIds = formData.getAll("attendeeIds").map(String).filter(Boolean);
  if (attendeeIds.length === 0) return;

  const [staffId, project] = await Promise.all([
    getCurrentStaffId(),
    prisma.project.findUnique({ where: { id: projectId } }),
  ]);
  if (!project) return;

  await prisma.projectOrder.upsert({
    where: { projectId_department: { projectId, department: "BRAINSTORM" } },
    update: {
      meetingAt: new Date(meetingAtRaw),
      meetingLocation,
      meetingFormat,
      sentAt: new Date(),
      sentById: staffId,
      attendees: { deleteMany: {}, create: attendeeIds.map((id) => ({ staffId: id })) },
    },
    create: {
      projectId,
      department: "BRAINSTORM",
      status: "SENT",
      meetingAt: new Date(meetingAtRaw),
      meetingLocation,
      meetingFormat,
      sentById: staffId,
      attendees: { create: attendeeIds.map((id) => ({ staffId: id })) },
    },
  });

  await prisma.notification.createMany({
    data: attendeeIds.map((recipientStaffId) => ({
      recipientStaffId,
      type: "BRAINSTORM_MEETING_INVITE",
      title: `Mời họp brainstorm — dự án ${project.code}`,
      body: `${project.name} · ${new Date(meetingAtRaw).toLocaleString("vi-VN")}${meetingLocation ? ` · ${meetingLocation}` : ""}`,
      projectId,
    })),
  });

  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/reminders");
}

/** Order gửi 1 trong 5 phòng ban — cần phòng ban bấm "Chấp nhận" mới coi là đã nhận task. */
export async function createDepartmentOrder(projectId: string, department: string, formData: FormData) {
  await requirePermission("projects.order.dispatch");
  if (!(department in ORDER_DEPARTMENT_LABELS)) return;

  const extraBriefInfo = toNullable(String(formData.get("extraBriefInfo") ?? ""));
  const desiredTimelineRaw = String(formData.get("desiredTimeline") ?? "").trim();
  const desiredTimeline = desiredTimelineRaw ? new Date(desiredTimelineRaw) : null;

  const [staffId, project] = await Promise.all([
    getCurrentStaffId(),
    prisma.project.findUnique({ where: { id: projectId } }),
  ]);
  if (!project) return;

  const isCreative = department === "CREATIVE";
  const outputRequest = isCreative ? null : toNullable(String(formData.get("outputRequest") ?? ""));
  const creativeItems = isCreative
    ? CREATIVE_OUTPUT_LABELS.filter((label) => formData.get(`creative_item_${label}`) === "on").map((label) => ({
        label,
        detail: toNullable(String(formData.get(`creative_detail_${label}`) ?? "")),
      }))
    : [];

  const baseData = {
    briefLinkUrl: project.briefLinkUrl,
    extraBriefInfo,
    outputRequest,
    desiredTimeline,
    sentAt: new Date(),
    sentById: staffId,
    status: "SENT",
    acceptedAt: null,
    acceptedById: null,
    // Timeline mong muốn có thể vừa được dời — reset cờ để checkOrderDeadlineReminders nhắc lại
    // theo hạn MỚI (nếu không, order đã nhắc 1 lần sẽ không bao giờ được nhắc nữa).
    deadlineReminderSentAt: null,
  };

  const orderId = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectOrder.findUnique({ where: { projectId_department: { projectId, department } } });
    let created;
    if (existing) {
      await tx.projectOrderCreativeItem.deleteMany({ where: { orderId: existing.id } });
      created = await tx.projectOrder.update({ where: { id: existing.id }, data: baseData });
    } else {
      created = await tx.projectOrder.create({ data: { projectId, department, ...baseData } });
    }
    if (creativeItems.length > 0) {
      await tx.projectOrderCreativeItem.createMany({
        data: creativeItems.map((item) => ({ orderId: created.id, label: item.label, detail: item.detail })),
      });
    }
    return created.id;
  });

  // Order Creative → tự sinh CreativeTask từ checklist (idempotent) cho module Creative.
  if (isCreative) await spawnTasksForCreativeOrder(orderId);
  // Order Planning → tự sinh PlanningJob (idempotent theo orderId) cho tab Planning trong workspace dự án.
  if (department === "PLANNING") await spawnPlanningJobForOrder(orderId);
  // Order PLANNING/PCC/OPE/PRO → tự sinh DepartmentTask (board "Task từ timeline"/task nội bộ bộ phận).
  if (isDepartmentTaskDepartment(department)) await spawnTasksForDepartmentOrder(orderId);

  const recipients = await prisma.staff.findMany({ where: { department: { code: department }, isActive: true } });
  if (recipients.length > 0) {
    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        recipientStaffId: r.id,
        type: "DEPARTMENT_ORDER_RECEIVED",
        title: `Order ${ORDER_DEPARTMENT_LABELS[department]} — dự án ${project.code}`,
        body: project.name,
        projectId,
      })),
    });
  }

  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/reminders");
  if (isCreative) revalidatePath("/creative");
  if (isDepartmentTaskDepartment(department)) revalidatePath(`/projects/${projectId}/${DEPARTMENT_TAB_SEG[department]}`);
}

/** Phòng ban bấm "Chấp nhận" — xác nhận đã nhận task và sẽ trả output đúng timeline. */
export async function acceptOrder(projectId: string, orderId: string) {
  await requirePermission("projects.order.respond");
  const staffId = await getCurrentStaffId();
  await prisma.projectOrder.update({
    where: { id: orderId },
    data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedById: staffId },
  });
  revalidatePath(`/bidding/${projectId}`);
}

/** Phòng ban hoàn thành task → gửi link kết quả (Drive/OneDrive), báo ngay cho Account đã Order. */
export async function submitOrderResult(projectId: string, orderId: string, formData: FormData) {
  await requirePermission("projects.order.respond");
  const resultLinkUrl = String(formData.get("resultLinkUrl") ?? "").trim();
  if (!resultLinkUrl) return;

  const staffId = await getCurrentStaffId();
  const order = await prisma.projectOrder.update({
    where: { id: orderId },
    data: { status: "DONE", resultLinkUrl, resultSentAt: new Date(), resultSentById: staffId },
  });

  if (order.sentById) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    await prisma.notification.create({
      data: {
        recipientStaffId: order.sentById,
        type: "ORDER_RESULT_RECEIVED",
        title: `${ORDER_DEPARTMENT_LABELS[order.department] ?? order.department} đã gửi kết quả — dự án ${project?.code ?? ""}`,
        body: resultLinkUrl,
        projectId,
      },
    });
  }

  revalidatePath(`/bidding/${projectId}`);
  revalidatePath("/reminders");
}
