"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";

export type GroupFormState = { error?: string; success?: boolean };

const CODE_REGEX = /^[A-Z0-9]{2,10}$/;

async function audit(entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType: "client_group", entityId, field: "*", action, changedBy: staffId, reason },
  });
}

function revalidate() {
  revalidatePath("/clients");
  revalidatePath("/clients/groups");
}

/**
 * Mã nhóm 2–10 ký tự — CỐ Ý khác ràng buộc 3 ký tự của Client.code để không ai nhầm nó dùng được
 * vào mã lô kho / mã dự án. Nhóm chỉ là nhãn gom.
 */
async function parse(formData: FormData, t: (k: string) => string) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!CODE_REGEX.test(code)) return { error: t("errorCode") };
  if (name.length < 2) return { error: t("errorName") };
  return { data: { code, name, note } };
}

export async function createClientGroup(_prev: GroupFormState, formData: FormData): Promise<GroupFormState> {
  await requirePermission("clients.manage");
  const t = await getTranslations("clients.groups");
  const parsed = await parse(formData, t);
  if (parsed.error) return { error: parsed.error };
  try {
    const g = await prisma.clientGroup.create({ data: parsed.data! });
    await audit(g.id, "CREATE");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: t("errorCodeExists") };
    throw e;
  }
  revalidate();
  return { success: true };
}

export async function updateClientGroup(groupId: string, _prev: GroupFormState, formData: FormData): Promise<GroupFormState> {
  await requirePermission("clients.manage");
  const t = await getTranslations("clients.groups");
  const parsed = await parse(formData, t);
  if (parsed.error) return { error: parsed.error };
  try {
    await prisma.clientGroup.update({ where: { id: groupId }, data: parsed.data! });
    await audit(groupId, "UPDATE");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: t("errorCodeExists") };
    throw e;
  }
  revalidate();
  return { success: true };
}

/**
 * Bật/tắt nhóm. KHÔNG có đường xoá: nhóm đang được khách trỏ vào mà xoá thì mất dấu vết gom.
 * Tắt = ẩn khỏi ô chọn khi gán mới; khách đã thuộc nhóm giữ nguyên (mirror cách Vendor làm).
 */
export async function toggleClientGroup(groupId: string, _prev: GroupFormState, _formData: FormData): Promise<GroupFormState> {
  await requirePermission("clients.manage");
  const g = await prisma.clientGroup.findUnique({ where: { id: groupId }, select: { isActive: true } });
  const t = await getTranslations("clients.groups");
  if (!g) return { error: t("errorNotFound") };
  await prisma.clientGroup.update({ where: { id: groupId }, data: { isActive: !g.isActive } });
  await audit(groupId, "UPDATE", g.isActive ? "deactivate" : "activate");
  revalidate();
  return { success: true };
}
