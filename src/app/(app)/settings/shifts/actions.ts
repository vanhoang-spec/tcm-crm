"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";

export type ShiftFormState = { error?: string; success?: boolean };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function audit(entityId: string, action: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType: "work_shift", entityId, field: "*", action, changedBy: staffId } });
}

function revalidate() {
  revalidatePath("/settings/shifts");
  revalidatePath("/staff");
}

function parseShiftForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "").trim();
  const endTime = String(formData.get("endTime") ?? "").trim();
  const hours = Number(formData.get("hours") ?? 0);
  const valid = name && TIME_RE.test(startTime) && TIME_RE.test(endTime) && Number.isFinite(hours) && hours > 0 && hours <= 24;
  return { name, startTime, endTime, hours, valid };
}

export async function createShift(_prev: ShiftFormState, formData: FormData): Promise<ShiftFormState> {
  const t = await getTranslations("settings.shifts");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const { name, startTime, endTime, hours, valid } = parseShiftForm(formData);
  if (!code || !valid) return { error: t("errorInvalid") };

  try {
    const maxSort = await prisma.workShift.aggregate({ _max: { sort: true } });
    const created = await prisma.workShift.create({
      data: { code, name, startTime, endTime, hours, sort: (maxSort._max.sort ?? -1) + 1 },
    });
    await audit(created.id, "CREATE");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: t("errorCodeExists") };
    throw e;
  }
  revalidate();
  return { success: true };
}

export async function updateShift(shiftId: string, _prev: ShiftFormState, formData: FormData): Promise<ShiftFormState> {
  const t = await getTranslations("settings.shifts");
  const { name, startTime, endTime, hours, valid } = parseShiftForm(formData);
  const isActive = formData.get("isActive") === "on";
  if (!valid) return { error: t("errorInvalid") };

  await prisma.workShift.update({ where: { id: shiftId }, data: { name, startTime, endTime, hours, isActive } });
  await audit(shiftId, "UPDATE");
  revalidate();
  return { success: true };
}
