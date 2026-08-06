"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { MAX_JD_FIELD_CHARS, isPositionStatus } from "@/lib/recruit";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function textOrNull(v: FormDataEntryValue | null, max = MAX_JD_FIELD_CHARS): string | null {
  const s = str(v);
  return s ? s.slice(0, max) : null;
}
/** Ô chọn để trống gửi lên chuỗi rỗng — phải thành null, không thì FK nổ. */
function idOrNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s || null;
}

function revalidate() {
  revalidatePath("/settings/recruit");
  revalidatePath("/staff/recruit");
}

async function audit(entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType: "job_position", entityId, field: "*", action, changedBy: staffId, reason },
  });
}

export type PositionState = { error?: string; ok?: boolean; positionId?: string };

function jdFrom(formData: FormData) {
  return {
    jdSummary: textOrNull(formData.get("jdSummary")),
    jdResponsibilities: textOrNull(formData.get("jdResponsibilities")),
    jdRequirements: textOrNull(formData.get("jdRequirements")),
    jdBenefits: textOrNull(formData.get("jdBenefits")),
  };
}

export async function createPosition(_prev: PositionState, formData: FormData): Promise<PositionState> {
  await requirePermission("recruit.jd.manage");
  const meId = await getCurrentStaffId();

  const title = str(formData.get("title")).slice(0, 160);
  if (!title) return { error: "NO_TITLE" };

  const jd = jdFrom(formData);
  const hasJd = Object.values(jd).some((v) => v !== null);
  const created = await prisma.jobPosition.create({
    data: {
      title,
      departmentId: idOrNull(formData.get("departmentId")),
      teamId: idOrNull(formData.get("teamId")),
      hiringManagerStaffId: idOrNull(formData.get("hiringManagerStaffId")),
      ...jd,
      jdUpdatedAt: hasJd ? new Date() : null,
      jdUpdatedById: hasJd ? meId : null,
    },
    select: { id: true },
  });
  await audit(created.id, "create");
  revalidate();
  return { ok: true, positionId: created.id };
}

export async function updatePosition(_prev: PositionState, formData: FormData): Promise<PositionState> {
  await requirePermission("recruit.jd.manage");
  const meId = await getCurrentStaffId();

  const id = str(formData.get("positionId"));
  const title = str(formData.get("title")).slice(0, 160);
  if (!title) return { error: "NO_TITLE" };

  const before = await prisma.jobPosition.findUnique({
    where: { id },
    select: { jdSummary: true, jdResponsibilities: true, jdRequirements: true, jdBenefits: true },
  });
  if (!before) return { error: "NOT_FOUND" };

  const jd = jdFrom(formData);
  // Chỉ dời mốc "JD sửa lần cuối" khi NỘI DUNG JD thật sự đổi — sửa mỗi tên người quản lý mà cũng
  // đóng dấu ngày mới thì mốc đó hết ý nghĩa.
  const jdChanged =
    jd.jdSummary !== before.jdSummary ||
    jd.jdResponsibilities !== before.jdResponsibilities ||
    jd.jdRequirements !== before.jdRequirements ||
    jd.jdBenefits !== before.jdBenefits;

  await prisma.jobPosition.update({
    where: { id },
    data: {
      title,
      departmentId: idOrNull(formData.get("departmentId")),
      teamId: idOrNull(formData.get("teamId")),
      hiringManagerStaffId: idOrNull(formData.get("hiringManagerStaffId")),
      ...jd,
      ...(jdChanged ? { jdUpdatedAt: new Date(), jdUpdatedById: meId } : {}),
    },
  });
  await audit(id, "update", jdChanged ? "JD đổi" : undefined);
  revalidate();
  return { ok: true };
}

/**
 * Bật / tạm dừng / đóng vị trí. KHÔNG có đường xoá: xoá một vị trí đang có ứng viên là mất dấu vết
 * cả kho hồ sơ đã ứng tuyển vào đó (mirror ClientGroup / Vendor — HANDOVER 10.12).
 */
export async function setPositionStatus(_prev: PositionState, formData: FormData): Promise<PositionState> {
  await requirePermission("recruit.jd.manage");
  const id = str(formData.get("positionId"));
  const status = str(formData.get("status"));
  if (!isPositionStatus(status)) return { error: "BAD_STATUS" };
  await prisma.jobPosition.update({ where: { id }, data: { status } });
  await audit(id, "status", status);
  revalidate();
  return { ok: true };
}

export type TemplateState = { error?: string; ok?: boolean };

export async function saveJdTemplate(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  await requirePermission("recruit.jd.manage");
  const id = str(formData.get("templateId"));
  const name = str(formData.get("name")).slice(0, 160);
  if (!name) return { error: "NO_NAME" };
  const jd = jdFrom(formData);

  if (id) await prisma.jdTemplate.update({ where: { id }, data: { name, ...jd } });
  else await prisma.jdTemplate.create({ data: { name, ...jd } });

  revalidate();
  return { ok: true };
}

/**
 * Xoá mẫu JD. An toàn vì mẫu chỉ dùng để ĐIỀN SẴN lúc tạo vị trí — điền xong là dữ liệu rời, xoá
 * mẫu không đụng tới JD của vị trí nào.
 */
export async function deleteJdTemplate(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  await requirePermission("recruit.jd.manage");
  const id = str(formData.get("templateId"));
  if (!id) return { error: "NOT_FOUND" };
  await prisma.jdTemplate.delete({ where: { id } });
  revalidate();
  return { ok: true };
}
