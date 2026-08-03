"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";

export type ProjectGroupFormState = { error?: string; success?: boolean };

const CODE_REGEX = /^[A-Z0-9]{2,10}$/;

async function audit(entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType: "project_group", entityId, field: "*", action, changedBy: staffId, reason },
  });
}

function revalidate() {
  revalidatePath("/projects");
  revalidatePath("/projects/groups");
}

/**
 * Mã nhóm 2–10 ký tự. ⚠ Mã này KHÔNG đi vào bất kỳ mã sinh nào (khác `Client.code` 3 ký tự — mã đó
 * nằm trong mã lô kho và mã dự án). Đổi mã nhóm không hỏng dữ liệu cũ.
 */
function parse(formData: FormData, t: (k: string) => string) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!CODE_REGEX.test(code)) return { error: t("errorCode") };
  if (name.length < 2) return { error: t("errorName") };
  return { data: { code, name, note } };
}

export async function createProjectGroup(_prev: ProjectGroupFormState, formData: FormData): Promise<ProjectGroupFormState> {
  await requirePermission("bidding.project.manage");
  const t = await getTranslations("projects.groups");
  const parsed = parse(formData, t);
  if (parsed.error) return { error: parsed.error };
  try {
    const g = await prisma.projectGroup.create({ data: parsed.data! });
    await audit(g.id, "CREATE");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: t("errorCodeExists") };
    throw e;
  }
  revalidate();
  return { success: true };
}

export async function updateProjectGroup(groupId: string, _prev: ProjectGroupFormState, formData: FormData): Promise<ProjectGroupFormState> {
  await requirePermission("bidding.project.manage");
  const t = await getTranslations("projects.groups");
  const parsed = parse(formData, t);
  if (parsed.error) return { error: parsed.error };
  try {
    await prisma.projectGroup.update({ where: { id: groupId }, data: parsed.data! });
    await audit(groupId, "UPDATE");
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: t("errorCodeExists") };
    throw e;
  }
  revalidate();
  return { success: true };
}

/**
 * Bật/tắt nhóm. KHÔNG có đường xoá — xoá nhóm đang được dự án trỏ vào là mất dấu vết gom.
 * Tắt = ẩn khỏi ô chọn khi gán mới; dự án đã thuộc nhóm giữ nguyên (mirror ClientGroup).
 */
export async function toggleProjectGroup(groupId: string, _prev: ProjectGroupFormState, _formData: FormData): Promise<ProjectGroupFormState> {
  await requirePermission("bidding.project.manage");
  const t = await getTranslations("projects.groups");
  const g = await prisma.projectGroup.findUnique({ where: { id: groupId }, select: { isActive: true } });
  if (!g) return { error: t("errorNotFound") };
  await prisma.projectGroup.update({ where: { id: groupId }, data: { isActive: !g.isActive } });
  await audit(groupId, "UPDATE", g.isActive ? "deactivate" : "activate");
  revalidate();
  return { success: true };
}

/**
 * Gán / gỡ nhóm cho MỘT dự án — action HẸP, đặt ngay trên trang chi tiết dự án.
 *
 * CỐ Ý không nhét vào form sửa dự án: form đó bắt hàng loạt trường bắt buộc (brief, loại hình, độ
 * phức tạp…) mà nhiều dự án cũ đang thiếu — đúng bài học `assignClientGroup` ở KH-H1, nơi 64/68
 * khách không qua nổi form đầy đủ.
 */
export async function assignProjectGroup(projectId: string, formData: FormData) {
  await requirePermission("bidding.project.manage");
  const raw = String(formData.get("groupId") ?? "").trim();
  const groupId = raw === "" ? null : raw;
  if (groupId) {
    const g = await prisma.projectGroup.findUnique({ where: { id: groupId }, select: { id: true } });
    if (!g) return;
  }
  await prisma.project.update({ where: { id: projectId }, data: { groupId } });
  await audit(`project:${projectId}`, "UPDATE", groupId ? "assign group" : "clear group");
  revalidate();
  revalidatePath(`/projects/${projectId}`);
}
