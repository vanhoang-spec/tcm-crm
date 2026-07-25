"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { addDays, parseDateKey, weekStartOf } from "@/lib/timekeeping";
import { formatDate } from "@/lib/utils";
import { requirePermission } from "@/lib/permissions";

export type ScheduleActionState = { error?: string; success?: boolean; notified?: number };

async function audit(entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType: "schedule_week", entityId, field: "*", action, changedBy: staffId, reason } });
}

function revalidate() {
  revalidatePath("/staff");
  revalidatePath("/staff/timesheet");
  revalidatePath("/staff/leave");
}

/** Đánh dấu tuần CONFIRMED đã bị sửa (updatedAt > confirmedAt ⇒ UI nhắc confirm lại). */
async function touchWeekIfConfirmed(weekId: string) {
  await prisma.scheduleWeek.updateMany({ where: { id: weekId, status: "CONFIRMED" }, data: { status: "CONFIRMED" } });
}

/** Bấm chip ca: chưa có → thêm; có rồi → gỡ. Tự tạo ScheduleWeek (DRAFT) lần đầu. */
export async function toggleAssignment(
  departmentId: string,
  weekStartISO: string,
  staffId: string,
  dateISO: string,
  shiftId: string
): Promise<ScheduleActionState> {
  await requirePermission("staff.timesheet.edit");
  const t = await getTranslations("staff.schedule");
  const weekStartRaw = parseDateKey(weekStartISO);
  const date = parseDateKey(dateISO);
  if (!weekStartRaw || !date) return { error: t("errorInvalid") };
  const weekStart = weekStartOf(weekStartRaw);
  const inWeek = date.getTime() >= weekStart.getTime() && date.getTime() < addDays(weekStart, 7).getTime();
  const [staff, shift] = await Promise.all([
    prisma.staff.findUnique({ where: { id: staffId }, select: { departmentId: true, isActive: true } }),
    prisma.workShift.findUnique({ where: { id: shiftId }, select: { isActive: true } }),
  ]);
  if (!inWeek || !staff?.isActive || staff.departmentId !== departmentId || !shift?.isActive) {
    return { error: t("errorInvalid") };
  }

  const existing = await prisma.shiftAssignment.findUnique({
    where: { staffId_date_shiftId: { staffId, date, shiftId } },
  });
  if (existing) {
    await prisma.shiftAssignment.delete({ where: { id: existing.id } });
    await touchWeekIfConfirmed(existing.weekId);
  } else {
    const week = await prisma.scheduleWeek.upsert({
      where: { departmentId_weekStart: { departmentId, weekStart } },
      update: {},
      create: { departmentId, weekStart },
    });
    await prisma.shiftAssignment.create({ data: { weekId: week.id, staffId, date, shiftId } });
    await touchWeekIfConfirmed(week.id);
  }
  revalidate();
  return { success: true };
}

/** Đặt/bỏ loại nghỉ cho 1 ca — OTHER bắt buộc note. */
export async function setAssignmentLeave(
  assignmentId: string,
  leaveTypeId: string | null,
  note: string
): Promise<ScheduleActionState> {
  await requirePermission("staff.timesheet.edit");
  const t = await getTranslations("staff.schedule");
  const assignment = await prisma.shiftAssignment.findUnique({ where: { id: assignmentId }, select: { weekId: true } });
  if (!assignment) return { error: t("errorInvalid") };
  if (leaveTypeId) {
    const leaveType = await prisma.optionItem.findFirst({
      where: { id: leaveTypeId, set: { code: "leave_type" }, isActive: true },
    });
    if (!leaveType) return { error: t("errorInvalid") };
    if (leaveType.code === "OTHER" && !note.trim()) return { error: t("errorNoteRequired") };
  }
  await prisma.shiftAssignment.update({
    where: { id: assignmentId },
    data: { leaveTypeId, note: note.trim() || null },
  });
  await touchWeekIfConfirmed(assignment.weekId);
  revalidate();
  return { success: true };
}

/** Confirm tuần → notify từng NV có ca (lần đầu SCHEDULE_CONFIRMED, các lần sau SCHEDULE_UPDATED). */
export async function confirmWeek(weekId: string): Promise<ScheduleActionState> {
  await requirePermission("staff.week.confirm");
  const t = await getTranslations("staff.schedule");
  const week = await prisma.scheduleWeek.findUnique({
    where: { id: weekId },
    include: { assignments: { select: { staffId: true } } },
  });
  if (!week) return { error: t("errorInvalid") };
  if (week.assignments.length === 0) return { error: t("errorEmptyWeek") };

  const staffId = await getCurrentStaffId();
  const isUpdate = week.confirmedAt !== null;
  await prisma.scheduleWeek.update({
    where: { id: weekId },
    data: { status: "CONFIRMED", confirmedById: staffId, confirmedAt: new Date() },
  });

  const counts = new Map<string, number>();
  for (const a of week.assignments) counts.set(a.staffId, (counts.get(a.staffId) ?? 0) + 1);
  const from = formatDate(week.weekStart);
  const to = formatDate(addDays(week.weekStart, 6));
  await prisma.notification.createMany({
    data: Array.from(counts.entries()).map(([recipientStaffId, shiftCount]) => ({
      recipientStaffId,
      type: isUpdate ? "SCHEDULE_UPDATED" : "SCHEDULE_CONFIRMED",
      title: isUpdate
        ? `Lịch làm việc tuần ${from} – ${to} đã được CẬP NHẬT`
        : `Lịch làm việc tuần ${from} – ${to} đã được xếp`,
      body: `Bạn có ${shiftCount} ca trong tuần. Xem chi tiết tại Nhân sự → Lịch làm việc.`,
    })),
  });
  await audit(weekId, "UPDATE", isUpdate ? "re-confirm week" : "confirm week");
  revalidate();
  return { success: true, notified: counts.size };
}
