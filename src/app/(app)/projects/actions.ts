"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit } from "@/lib/utils";
import { hashGuestToken } from "@/lib/guest-session";

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

async function audit(entityType: string, entityId: string, action: string, payload: unknown) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType, entityId, field: "*", newValue: stringifyAudit(payload), action, changedBy: staffId },
  });
}

// ── Phân vai: Owner + Leader ──
export async function assignProjectRoles(projectId: string, formData: FormData) {
  const ownerId = nullable(formData.get("ownerId"));
  const leaderId = nullable(formData.get("leaderId"));
  await prisma.project.update({ where: { id: projectId }, data: { ownerId, leaderId } });
  await audit("project", projectId, "UPDATE", { ownerId, leaderId });
  revalidatePath(`/projects/${projectId}`);
}

// ── Project Team ──
export async function addProjectMember(projectId: string, formData: FormData) {
  const staffId = str(formData.get("staffId"));
  const roleInProject = str(formData.get("roleInProject")) || "CORE";
  if (!staffId) return;
  await prisma.projectMember.upsert({
    where: { projectId_staffId: { projectId, staffId } },
    update: { roleInProject },
    create: { projectId, staffId, roleInProject },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function removeProjectMember(projectId: string, memberId: string) {
  await prisma.projectMember.delete({ where: { id: memberId } });
  revalidatePath(`/projects/${projectId}`);
}

// ── Master Timeline (Internal) ──
export async function createTimelineItem(projectId: string, formData: FormData) {
  const title = str(formData.get("title"));
  if (!title) return;
  const parentId = nullable(formData.get("parentId"));
  const count = await prisma.timelineItem.count({ where: { projectId, parentId } });
  await prisma.timelineItem.create({
    data: {
      projectId,
      parentId,
      title,
      startDate: dateOrNull(formData.get("startDate")),
      endDate: dateOrNull(formData.get("endDate")),
      ownerStaffId: nullable(formData.get("ownerStaffId")),
      departmentCode: nullable(formData.get("departmentCode")),
      statusId: nullable(formData.get("statusId")),
      sort: count,
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateTimelineItem(projectId: string, itemId: string, formData: FormData) {
  const title = str(formData.get("title"));
  if (!title) return;
  const isShared = formData.get("isShared") === "on";
  const clientEditable = formData.get("clientEditable") === "on";
  await prisma.timelineItem.update({
    where: { id: itemId },
    data: {
      title,
      startDate: dateOrNull(formData.get("startDate")),
      endDate: dateOrNull(formData.get("endDate")),
      ownerStaffId: nullable(formData.get("ownerStaffId")),
      departmentCode: nullable(formData.get("departmentCode")),
      statusId: nullable(formData.get("statusId")),
      isShared,
      clientEditable,
      externalTitle: nullable(formData.get("externalTitle")),
      externalStartDate: dateOrNull(formData.get("externalStartDate")),
      externalEndDate: dateOrNull(formData.get("externalEndDate")),
      // Un-share → tự động ẩn khỏi khách (rút publish).
      ...(isShared ? {} : { externalPublished: false }),
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteTimelineItem(projectId: string, itemId: string) {
  await prisma.timelineItem.delete({ where: { id: itemId } });
  revalidatePath(`/projects/${projectId}`);
}

/** Đổi thứ tự trong cùng 1 cấp (cùng parentId) — swap sort với item liền kề. */
export async function moveTimelineItem(projectId: string, itemId: string, direction: "up" | "down") {
  const item = await prisma.timelineItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  const siblings = await prisma.timelineItem.findMany({
    where: { projectId, parentId: item.parentId },
    orderBy: { sort: "asc" },
  });
  const idx = siblings.findIndex((s) => s.id === itemId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;
  const other = siblings[swapIdx];
  await prisma.$transaction([
    prisma.timelineItem.update({ where: { id: item.id }, data: { sort: other.sort } }),
    prisma.timelineItem.update({ where: { id: other.id }, data: { sort: item.sort } }),
  ]);
  revalidatePath(`/projects/${projectId}`);
}

/** Owner duyệt & lộ 1 item ra khách (chỉ khi đã isShared). */
export async function publishTimelineItem(projectId: string, itemId: string) {
  const item = await prisma.timelineItem.findUnique({ where: { id: itemId } });
  if (!item || !item.isShared) return;
  await prisma.timelineItem.update({ where: { id: itemId }, data: { externalPublished: true } });
  await audit("timeline_item", itemId, "PUBLISH", { externalPublished: true });
  revalidatePath(`/projects/${projectId}`);
}

export async function unpublishTimelineItem(projectId: string, itemId: string) {
  await prisma.timelineItem.update({ where: { id: itemId }, data: { externalPublished: false } });
  await audit("timeline_item", itemId, "UNPUBLISH", { externalPublished: false });
  revalidatePath(`/projects/${projectId}`);
}

// ── Guest invite (magic-link) ──
export type GuestInviteState = { error?: string; link?: string };

/** Tạo lời mời guest → sinh token thô (hiện 1 lần cho Account copy), lưu HASH. */
export async function createGuestInvite(
  projectId: string,
  _prev: GuestInviteState,
  formData: FormData,
): Promise<GuestInviteState> {
  const name = str(formData.get("name"));
  const email = str(formData.get("email"));
  if (!name || !email) return { error: "required" };

  const token = randomBytes(32).toString("base64url");
  const staffId = await getCurrentStaffId();
  await prisma.guestInvite.create({
    data: { projectId, name, email, tokenHash: hashGuestToken(token), createdById: staffId },
  });
  await audit("guest_invite", projectId, "CREATE", { name, email });
  revalidatePath(`/projects/${projectId}`);
  // Trả token thô 1 lần để client dựng link — KHÔNG lưu lại đâu khác.
  // Link trỏ route handler /portal/enter: verify token → set cookie phiên → redirect /portal.
  return { link: `/portal/enter?token=${token}` };
}

export async function revokeGuestInvite(projectId: string, inviteId: string) {
  await prisma.guestInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
  await audit("guest_invite", inviteId, "REVOKE", { revokedAt: new Date().toISOString() });
  revalidatePath(`/projects/${projectId}`);
}
