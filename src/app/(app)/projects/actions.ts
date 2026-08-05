"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit, toNum } from "@/lib/utils";
import { clientBillableTotal } from "@/lib/bidding";
import { arDefaultDueDate } from "@/lib/ar";
import { hashGuestToken } from "@/lib/guest-session";
import { syncTimelineOrders, dispatchOrder } from "@/lib/project-orders";
import { spawnTasksForCreativeOrder } from "@/lib/creative";
import { spawnTasksForDepartmentOrder, isDepartmentTaskDepartment } from "@/lib/department-tasks";
import { cancelTasksForOrderItems, syncTasksWithOrderItem } from "@/lib/projects";
import { requirePermission } from "@/lib/permissions";

/** Route tab workspace dự án tương ứng mỗi bộ phận có DepartmentTask board. */
const DEPARTMENT_TAB_SEG: Record<string, string> = {
  PLANNING: "planning",
  PCC: "purchasing",
  OPE: "operations",
  PRO: "production",
};

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
function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Revalidate mọi sub-route của 1 dự án (workspace nhiều tab, gồm cả 4 board bộ phận). */
function revalidateProject(projectId: string) {
  for (const seg of ["", "/timeline", "/orders", "/co-ce", "/planning", "/operations", "/production", "/purchasing", "/liquidation"]) {
    revalidatePath(`/projects/${projectId}${seg}`);
  }
  revalidatePath("/reminders");
}

async function audit(entityType: string, entityId: string, action: string, payload: unknown) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType, entityId, field: "*", newValue: stringifyAudit(payload), action, changedBy: staffId },
  });
}

// ── Phân vai: Owner + Leader ──
export async function assignProjectRoles(projectId: string, formData: FormData) {
  await requirePermission("projects.team.manage");
  const ownerId = nullable(formData.get("ownerId"));
  const leaderId = nullable(formData.get("leaderId"));
  await prisma.project.update({ where: { id: projectId }, data: { ownerId, leaderId } });
  await audit("project", projectId, "UPDATE", { ownerId, leaderId });
  revalidatePath(`/projects/${projectId}`);
}

// ── Project Team ──
export async function addProjectMember(projectId: string, formData: FormData) {
  await requirePermission("projects.team.manage");
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
  await requirePermission("projects.team.manage");
  await prisma.projectMember.delete({ where: { id: memberId } });
  revalidatePath(`/projects/${projectId}`);
}

// ── Master Timeline (Internal) ──
export async function createTimelineItem(projectId: string, formData: FormData) {
  await requirePermission("projects.timeline.edit");
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
      secondaryOwnerStaffId: nullable(formData.get("secondaryOwnerStaffId")),
      departmentCode: nullable(formData.get("departmentCode")),
      accountableParty: nullable(formData.get("accountableParty")),
      quantity: numOrNull(formData.get("quantity")),
      unit: nullable(formData.get("unit")),
      statusId: nullable(formData.get("statusId")),
      sort: count,
    },
  });
  await syncTimelineOrders(projectId);
  revalidateProject(projectId);
}

export async function updateTimelineItem(projectId: string, itemId: string, formData: FormData) {
  await requirePermission("projects.timeline.edit");
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
      secondaryOwnerStaffId: nullable(formData.get("secondaryOwnerStaffId")),
      departmentCode: nullable(formData.get("departmentCode")),
      accountableParty: nullable(formData.get("accountableParty")),
      quantity: numOrNull(formData.get("quantity")),
      unit: nullable(formData.get("unit")),
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
  await syncTimelineOrders(projectId);
  revalidateProject(projectId);
}

export async function deleteTimelineItem(projectId: string, itemId: string) {
  await requirePermission("projects.timeline.edit");
  // Dọn TRƯỚC khi xóa: FK ProjectOrderItem.sourceTimelineItemId là SetNull — nếu xóa timeline item
  // trước, dòng order mất liên kết nguồn nên syncTimelineOrders không nhận ra là stale nữa
  // (bị coi như dòng thêm tay, giữ lại vĩnh viễn) và task đã sinh thành zombie.
  // Gom CẢ HẬU DUỆ (xóa Phase → DB cascade xóa item con, bỏ qua cleanup app nếu chỉ xét chính nó).
  const ids = [itemId];
  let frontier = [itemId];
  while (frontier.length > 0) {
    const children = await prisma.timelineItem.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }
  const orderItems = await prisma.projectOrderItem.findMany({
    where: { sourceTimelineItemId: { in: ids } },
    select: { id: true },
  });
  if (orderItems.length > 0) {
    const ids = orderItems.map((r) => r.id);
    await cancelTasksForOrderItems(ids);
    await prisma.projectOrderItem.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.timelineItem.delete({ where: { id: itemId } });
  await syncTimelineOrders(projectId);
  revalidateProject(projectId);
  revalidatePath("/creative");
}

/** Đổi thứ tự trong cùng 1 cấp (cùng parentId) — swap sort với item liền kề. */
export async function moveTimelineItem(projectId: string, itemId: string, direction: "up" | "down") {
  await requirePermission("projects.timeline.edit");
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
  revalidateProject(projectId);
}

/** Owner duyệt & lộ 1 item ra khách (chỉ khi đã isShared). */
export async function publishTimelineItem(projectId: string, itemId: string) {
  await requirePermission("projects.timeline.publish");
  const item = await prisma.timelineItem.findUnique({ where: { id: itemId } });
  if (!item || !item.isShared) return;
  await prisma.timelineItem.update({ where: { id: itemId }, data: { externalPublished: true } });
  await audit("timeline_item", itemId, "PUBLISH", { externalPublished: true });
  revalidateProject(projectId);
}

export async function unpublishTimelineItem(projectId: string, itemId: string) {
  await requirePermission("projects.timeline.publish");
  await prisma.timelineItem.update({ where: { id: itemId }, data: { externalPublished: false } });
  await audit("timeline_item", itemId, "UNPUBLISH", { externalPublished: false });
  revalidateProject(projectId);
}

// ── Áp dụng mẫu Master Timeline: vật hóa template (Section→Item→Sub-task) thành TimelineItem ──
export async function applyTimelineTemplate(projectId: string, formData: FormData) {
  await requirePermission("projects.timeline.edit");
  const templateId = str(formData.get("templateId"));
  if (!templateId) return;
  const template = await prisma.timelineTemplate.findUnique({
    where: { id: templateId },
    include: { sections: { orderBy: { sort: "asc" }, include: { items: { orderBy: { sort: "asc" } } } } },
  });
  if (!template) return;

  // Nối tiếp sort sau các Phase hiện có.
  const existingPhases = await prisma.timelineItem.count({ where: { projectId, parentId: null } });
  let phaseSort = existingPhases;

  for (const section of template.sections) {
    const phase = await prisma.timelineItem.create({
      data: { projectId, title: section.nameVi, departmentCode: null, sort: phaseSort++ },
    });
    // Item cấp 1 (parentLabel rỗng) tạo trước để lấy id cho sub-task.
    const topItems = section.items.filter((it) => !it.parentLabel);
    const itemIdByTitle = new Map<string, string>();
    let itemSort = 0;
    for (const it of topItems) {
      const created = await prisma.timelineItem.create({
        data: {
          projectId,
          parentId: phase.id,
          title: it.title,
          departmentCode: it.defaultDepartmentCode,
          unit: it.defaultUnit,
          quantity: it.defaultQty,
          templateItemId: it.id,
          sort: itemSort++,
        },
      });
      itemIdByTitle.set(it.title, created.id);
    }
    // Sub-task (parentLabel khớp title Item cha).
    const subItems = section.items.filter((it) => it.parentLabel);
    const subSortByParent = new Map<string, number>();
    for (const it of subItems) {
      const parentId = itemIdByTitle.get(it.parentLabel!);
      if (!parentId) continue;
      const s = subSortByParent.get(parentId) ?? 0;
      subSortByParent.set(parentId, s + 1);
      await prisma.timelineItem.create({
        data: {
          projectId,
          parentId,
          title: it.title,
          departmentCode: it.defaultDepartmentCode,
          unit: it.defaultUnit,
          quantity: it.defaultQty,
          templateItemId: it.id,
          sort: s,
        },
      });
    }
  }
  await audit("project", projectId, "APPLY_TIMELINE_TEMPLATE", { templateId, name: template.name });
  revalidateProject(projectId);
}

// ── Ma trận nhân sự (KUN) ──
export async function addStaffingCell(projectId: string, formData: FormData) {
  await requirePermission("projects.staffing.edit");
  const roleLabel = str(formData.get("roleLabel"));
  const zoneLabel = str(formData.get("zoneLabel"));
  const headcount = numOrNull(formData.get("headcount")) ?? 0;
  if (!roleLabel || !zoneLabel) return;
  const count = await prisma.projectStaffing.count({ where: { projectId } });
  await prisma.projectStaffing.create({
    data: { projectId, roleLabel, zoneLabel, headcount: Math.round(headcount), sort: count },
  });
  revalidateProject(projectId);
}

export async function updateStaffingCell(projectId: string, cellId: string, formData: FormData) {
  await requirePermission("projects.staffing.edit");
  const headcount = numOrNull(formData.get("headcount")) ?? 0;
  await prisma.projectStaffing.update({ where: { id: cellId }, data: { headcount: Math.round(headcount) } });
  revalidateProject(projectId);
}

export async function removeStaffingCell(projectId: string, cellId: string) {
  await requirePermission("projects.staffing.edit");
  await prisma.projectStaffing.delete({ where: { id: cellId } });
  revalidateProject(projectId);
}

// ── ORDER tự sinh từ Timeline: sync / dispatch / sửa dòng ──
export async function syncProjectOrders(projectId: string) {
  await requirePermission("projects.order.manage");
  await syncTimelineOrders(projectId);
  revalidateProject(projectId);
}

export async function dispatchProjectOrder(projectId: string, orderId: string) {
  await requirePermission("projects.order.dispatch");
  const staffId = await getCurrentStaffId();
  const { department } = await dispatchOrder(orderId, staffId);
  revalidateProject(projectId);
  // Order Creative sinh CreativeTask → refresh board /creative đúng như nhánh /bidding (order-actions.ts).
  if (department === "CREATIVE") revalidatePath("/creative");
  if (department && isDepartmentTaskDepartment(department)) revalidatePath(`/projects/${projectId}/${DEPARTMENT_TAB_SEG[department]}`);
}

export async function updateProjectOrderItem(projectId: string, itemId: string, formData: FormData) {
  await requirePermission("projects.order.manage");
  const updated = await prisma.projectOrderItem.update({
    where: { id: itemId },
    data: {
      label: str(formData.get("label")) || undefined,
      detail: nullable(formData.get("detail")),
      desiredReceiptAt: dateOrNull(formData.get("desiredReceiptAt")),
    },
    include: { order: { select: { department: true, isDraft: true } } },
  });
  // Order đã gửi → task đã sinh từ dòng này phải nhận nội dung mới (title/detail; deadline chỉ khi
  // task còn UNASSIGNED — lead đã giao thì deadline do lead đặt, không ghi đè).
  if (!updated.order.isDraft) {
    await syncTasksWithOrderItem({
      id: updated.id,
      label: updated.label,
      detail: updated.detail,
      desiredReceiptAt: updated.desiredReceiptAt,
    });
    if (updated.order.department === "CREATIVE") revalidatePath("/creative");
  }
  revalidateProject(projectId);
}

export async function addProjectOrderItem(projectId: string, orderId: string, formData: FormData) {
  await requirePermission("projects.order.manage");
  const label = str(formData.get("label"));
  if (!label) return;
  const count = await prisma.projectOrderItem.count({ where: { orderId } });
  await prisma.projectOrderItem.create({
    data: {
      orderId,
      label,
      detail: nullable(formData.get("detail")),
      desiredReceiptAt: dateOrNull(formData.get("desiredReceiptAt")),
      sort: count,
    },
  });
  // Nếu thêm dòng vào Order ĐÃ gửi (dispatch) → spawn task cho dòng mới (idempotent theo sourceKey/sourceItemLabel),
  // nếu không dòng thêm sau khi gửi sẽ không bao giờ thành task.
  const order = await prisma.projectOrder.findUnique({ where: { id: orderId }, select: { department: true, isDraft: true } });
  if (order && !order.isDraft) {
    if (order.department === "CREATIVE") {
      await spawnTasksForCreativeOrder(orderId);
      revalidatePath("/creative");
    } else if (isDepartmentTaskDepartment(order.department)) {
      await spawnTasksForDepartmentOrder(orderId);
      revalidatePath(`/projects/${projectId}/${DEPARTMENT_TAB_SEG[order.department]}`);
    }
  }
  revalidateProject(projectId);
}

export async function removeProjectOrderItem(projectId: string, itemId: string) {
  await requirePermission("projects.order.manage");
  // Dọn task đã sinh TRƯỚC khi xóa dòng (FK SetNull — xóa trước sẽ để lại task zombie active).
  const item = await prisma.projectOrderItem.findUnique({
    where: { id: itemId },
    include: { order: { select: { department: true } } },
  });
  if (!item) return;
  await cancelTasksForOrderItems([itemId]);
  await prisma.projectOrderItem.delete({ where: { id: itemId } });
  revalidateProject(projectId);
  if (item.order.department === "CREATIVE") revalidatePath("/creative");
}

// ── Guest invite (magic-link) ──
export type GuestInviteState = { error?: string; link?: string };

/** Tạo lời mời guest → sinh token thô (hiện 1 lần cho Account copy), lưu HASH. */
export async function createGuestInvite(
  projectId: string,
  _prev: GuestInviteState,
  formData: FormData,
): Promise<GuestInviteState> {
  await requirePermission("projects.guest.manage");
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
  await requirePermission("projects.guest.manage");
  await prisma.guestInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
  await audit("guest_invite", inviteId, "REVOKE", { revokedAt: new Date().toISOString() });
  revalidatePath(`/projects/${projectId}`);
}

// ── CO/CE → Nghiệm thu (tab Liquidation) ──

/**
 * Project Leader/Owner bấm "Chuyển sang Nghiệm thu": trỏ CostSheet tới bản snapshot (revision) mới
 * nhất hiện tại. Không đổi trạng thái dự án (state machine PROCESSING→LIQUIDATION vẫn do kế toán
 * xác nhận riêng ở /bidding). Nếu sau đó CO/CE còn sửa tiếp, tab Nghiệm thu vẫn hiện bản đã chuyển
 * cho tới khi bấm nút này lại — cho phép "sửa lần cuối trước khi khách ký" mà không ảnh hưởng ngay.
 */
export async function sendCostSheetToLiquidation(projectId: string) {
  await requirePermission("projects.liquidation.send");
  const sheet = await prisma.costSheet.findFirst({
    where: { projectId, version: "CTRACT" },
    orderBy: { createdAt: "desc" },
  });
  if (!sheet) return;
  // CE-5 — chốt bản ĐÃ GẮN NHÃN NGHIỆM THU, không phải "bản mới nhất".
  //
  // ⚠ Trước CE-5 hàm này luôn lấy revNo lớn nhất, trong khi bộ xuất đối chiếu HĐ↔NT
  // (`api/acceptance-export`) lại chọn theo `kind`. Hai cơ chế chốt bản chạy song song và không nói
  // chuyện với nhau: người dùng gắn nhãn Nghiệm thu cho v5 rồi lỡ lưu v6 là mốc thanh lý âm thầm
  // nhảy sang v6, còn file đối chiếu vẫn in v5.
  const acceptanceRev = await prisma.costSheetRevision.findFirst({
    where: { costSheetId: sheet.id, kind: "ACCEPTANCE" },
    orderBy: { revNo: "desc" },
  });
  // Chưa chốt bản nghiệm thu → KHÔNG tự đoán. Trang hiện hướng dẫn gắn nhãn trước.
  if (!acceptanceRev) return;

  const staffId = await getCurrentStaffId();
  await prisma.costSheet.update({
    where: { id: sheet.id },
    data: { sentToLiquidationRevisionId: acceptanceRev.id, sentToLiquidationAt: new Date(), sentToLiquidationById: staffId },
  });
  await audit("cost_sheet", sheet.id, "SEND_TO_LIQUIDATION", { revNo: acceptanceRev.revNo });
  revalidateProject(projectId);
}

/** Project Leader/Owner tick "Khách hàng xác nhận nghiệm thu" sau khi khách đã ký. */
export async function confirmClientAcceptance(projectId: string) {
  await requirePermission("projects.acceptance.confirm");
  const staffId = await getCurrentStaffId();
  await prisma.contract.upsert({
    where: { projectId },
    update: { clientAcceptanceConfirmedAt: new Date(), clientAcceptanceConfirmedById: staffId },
    create: { projectId, clientAcceptanceConfirmedAt: new Date(), clientAcceptanceConfirmedById: staffId },
  });
  await audit("contract", projectId, "CLIENT_ACCEPTANCE_CONFIRMED", { confirmedAt: new Date().toISOString() });
  revalidateProject(projectId);
}

/** Đặt/sửa mốc "Ngày dự kiến khách hàng ký nghiệm thu" — cũng là mốc trigger reminder hệ thống. */
export async function setExpectedAcceptanceSignDate(projectId: string, formData: FormData) {
  await requirePermission("projects.acceptance.confirm");
  const date = dateOrNull(formData.get("expectedAcceptanceSignDate"));
  await prisma.contract.upsert({
    where: { projectId },
    // Đổi mốc → reset cờ đã nhắc để reminder tính lại theo mốc mới.
    update: { expectedAcceptanceSignDate: date, acceptanceReminderSentAt: null },
    create: { projectId, expectedAcceptanceSignDate: date },
  });
  await audit("contract", projectId, "SET_EXPECTED_ACCEPTANCE_SIGN_DATE", { date: date?.toISOString() ?? null });
  revalidateProject(projectId);
}

export type LiquidationInvoiceState = { error?: string; success?: boolean };

// ── C5: Kế hoạch thu theo đợt ────────────────────────────
// Đợt = % trên TỔNG THANH TOÁN (billable của bảng CO/CE sống) — % ĐỘNG, không lưu tiền cứng
// (bất biến #3). Gác bằng bidding.contract.manage: kế hoạch thu là điều khoản thoả thuận với
// khách lúc ký hợp đồng, cùng người nhập hợp đồng.

export type MilestoneFormState = { error?: string; success?: boolean };

export async function saveCollectionMilestone(
  projectId: string,
  _prev: MilestoneFormState,
  formData: FormData,
): Promise<MilestoneFormState> {
  await requirePermission("bidding.contract.manage");
  const t = await getTranslations("projects.liquidation");
  const name = str(formData.get("name"));
  const pct = Number(str(formData.get("pct")));
  if (!name || !Number.isFinite(pct) || pct <= 0 || pct > 100) return { error: t("msErrRequired") };
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { error: t("msErrRequired") };
  const count = await prisma.collectionMilestone.count({ where: { projectId } });
  await prisma.collectionMilestone.create({
    data: {
      projectId,
      name,
      pct,
      dueDate: dateOrNull(formData.get("dueDate")),
      note: nullable(formData.get("note")),
      sort: count + 1,
    },
  });
  revalidateProject(projectId);
  revalidatePath("/finance/debt");
  return { success: true };
}

export async function deleteCollectionMilestone(
  milestoneId: string,
  _prev: MilestoneFormState,
  _formData: FormData,
): Promise<MilestoneFormState> {
  await requirePermission("bidding.contract.manage");
  const t = await getTranslations("projects.liquidation");
  const ms = await prisma.collectionMilestone.findUnique({
    where: { id: milestoneId },
    select: { projectId: true, _count: { select: { invoices: { where: { voidedAt: null } } } } },
  });
  if (!ms) return { error: t("msErrRequired") };
  // Đợt đã có hóa đơn phát hành thì không xoá — xoá là mất dấu "hóa đơn này thuộc đợt nào".
  if (ms._count.invoices > 0) return { error: t("msErrHasInvoices") };
  await prisma.collectionMilestone.delete({ where: { id: milestoneId } });
  revalidateProject(ms.projectId);
  revalidatePath("/finance/debt");
  return { success: true };
}

/**
 * Kế toán phát hành hóa đơn khách NGAY tại tab Nghiệm thu → tạo ClientInvoice THẬT (module ④).
 *
 * Thay cho cặp ô Contract.invoiceNo/invoiceDate cũ: hai chỗ đó ghi số hóa đơn mà KHÔNG có số tiền
 * và không liên kết gì với bảng công nợ, nên kế toán điền xong vẫn tưởng đã xuất hóa đơn trong khi
 * công nợ trống trơn. Nay chỉ còn MỘT nguồn sự thật là ClientInvoice.
 *
 * Trần = CE + Chi hộ của ĐÚNG revision đã chuyển nghiệm thu, tính lại ở server (không tin số từ
 * client). Cho xuất nhiều đợt nhưng tổng không vượt trần.
 */
export async function createLiquidationInvoice(
  projectId: string,
  _prev: LiquidationInvoiceState,
  formData: FormData,
): Promise<LiquidationInvoiceState> {
  await requirePermission("finance.invoice.manage");
  const t = await getTranslations("projects.liquidation");

  const invoiceNo = nullable(formData.get("invoiceNo"));
  const amount = Math.round(Number(str(formData.get("amount"))) || 0);
  if (!invoiceNo || amount <= 0) return { error: t("errRequired") };

  const [project, sheet, contract] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { clientId: true, client: { select: { paymentTermDays: true } } },
    }),
    prisma.costSheet.findFirst({
      where: { projectId, version: "CTRACT" },
      orderBy: { createdAt: "desc" },
      include: { sentToLiquidationRevision: true },
    }),
    prisma.contract.findUnique({ where: { projectId }, select: { paymentTermDays: true } }),
  ]);
  const rev = sheet?.sentToLiquidationRevision ?? null;
  if (!project || !rev) return { error: t("errNoSentRev") };

  // Đợt thu (C5) — tuỳ chọn; có thì phải thuộc ĐÚNG dự án (không tin id từ client).
  const milestoneId = nullable(formData.get("milestoneId"));
  if (milestoneId) {
    const ms = await prisma.collectionMilestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } });
    if (!ms || ms.projectId !== projectId) return { error: t("msErrRequired") };
  }

  const billable = clientBillableTotal(toNum(rev.ceTotal), toNum(rev.chiHo));
  const issuedAgg = await prisma.clientInvoice.aggregate({ where: { projectId, voidedAt: null }, _sum: { amount: true } });
  const remaining = billable - toNum(issuedAgg._sum.amount ?? BigInt(0));
  if (amount > remaining) return { error: t("errExceedBillable", { rev: rev.revNo, remaining }) };

  const staffId = await getCurrentStaffId();
  const invoiceDate = dateOrNull(formData.get("invoiceDate")) ?? new Date();
  const created = await prisma.clientInvoice.create({
    data: {
      projectId,
      clientId: project.clientId,
      invoiceNo,
      invoiceDate,
      amount: BigInt(amount),
      // Bỏ trống hạn = ngày hóa đơn + điều khoản hợp đồng/khách hàng — dueDate null làm hóa đơn
      // "quá hạn" ngay hôm sau (arDueBase rơi về ngày hóa đơn) và chuông nhắc nợ kêu bậy.
      dueDate:
        dateOrNull(formData.get("dueDate")) ??
        arDefaultDueDate(invoiceDate, contract?.paymentTermDays ?? project.client.paymentTermDays),
      note: nullable(formData.get("note")),
      milestoneId,
      createdById: staffId,
    },
  });
  await audit("client_invoice", created.id, "CREATE", { projectId, invoiceNo, amount, fromRevNo: rev.revNo });
  revalidateProject(projectId);
  revalidatePath("/finance/debt");
  revalidatePath("/reminders");
  return { success: true };
}
