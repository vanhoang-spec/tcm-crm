"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { isValidMktUrl, MAX_MKT_NOTE } from "@/lib/mkt";

/**
 * MKT-3 — YÊU CẦU THIẾT KẾ: designer nhận việc và nộp file.
 *
 * ⚠ Designer KHÔNG cần mã quyền riêng — cửa vào là `mkt.view` (mọi vai trừ thủ kho/bảo vệ đều có),
 * phạm vi do CÂU TRUY VẤN quyết định: ai cũng nhận được việc chưa có người nhận, còn việc đã có
 * người nhận thì chỉ chính người đó (hoặc người có `mkt.review`) mới nộp/huỷ được. Cùng khuôn
 * "kiểm theo bản ghi" của lịch phỏng vấn TD-1 và trưởng team Creative CR-1.
 */

export type DesignState = { error?: string; success?: boolean };

const str = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

async function audit(orderId: string, action: string, payload: unknown) {
  await prisma.auditLog.create({
    data: { entityType: "mkt_design", entityId: orderId, field: "*", action, newValue: JSON.stringify(payload), changedBy: await getCurrentStaffId() },
  });
}

function done(postId?: string) {
  revalidatePath("/mkt/design");
  revalidatePath("/mkt");
  if (postId) revalidatePath(`/mkt/${postId}`);
}

/** Nhận việc. Guard trong `where` chống hai người cùng bấm — người sau thấy count 0 và rớt. */
export async function acceptDesignOrder(orderId: string, _prev: DesignState, _formData: FormData): Promise<DesignState> {
  await requirePermission("mkt.view");
  const staffId = await getCurrentStaffId();
  if (!staffId) return { error: "NOT_FOUND" };
  const order = await prisma.mktDesignOrder.findUnique({ where: { id: orderId }, select: { postId: true } });
  if (!order) return { error: "NOT_FOUND" };
  const res = await prisma.mktDesignOrder.updateMany({
    where: { id: orderId, status: "NEW", assigneeId: null },
    data: { status: "IN_PROGRESS", assigneeId: staffId, acceptedAt: new Date() },
  });
  if (res.count === 0) return { error: "TAKEN" };
  await audit(orderId, "ACCEPT", { by: staffId });
  done(order.postId);
  return { success: true };
}

/** Nộp file thiết kế. Chỉ người đang nhận việc, hoặc người có quyền duyệt MKT. */
export async function deliverDesignOrder(orderId: string, _prev: DesignState, formData: FormData): Promise<DesignState> {
  await requirePermission("mkt.view");
  const staffId = await getCurrentStaffId();
  const order = await prisma.mktDesignOrder.findUnique({ where: { id: orderId }, select: { postId: true, assigneeId: true, status: true, post: { select: { title: true } } } });
  if (!order) return { error: "NOT_FOUND" };
  if (order.status === "DELIVERED") return { error: "WRONG_STATE" };
  const canReview = await hasPermission("mkt.review");
  if (order.assigneeId && order.assigneeId !== staffId && !canReview) return { error: "NOT_YOURS" };

  const link = str(formData.get("deliverableLinkUrl"), 500);
  if (!link || !isValidMktUrl(link)) return { error: "BAD_URL" };

  await prisma.mktDesignOrder.update({
    where: { id: orderId },
    data: { status: "DELIVERED", deliverableLinkUrl: link, designerNote: str(formData.get("designerNote"), MAX_MKT_NOTE) || null, deliveredAt: new Date(), assigneeId: order.assigneeId ?? staffId },
  });
  await audit(orderId, "DELIVER", { link });

  // Báo người duyệt bài: hình đã có, đăng được rồi.
  const reviewers = await prisma.staff.findMany({
    where: { isActive: true, OR: [{ role: { permissions: { some: { permissionCode: "mkt.review" } } } }, { role: { code: "ADMIN" } }] },
    select: { id: true },
  });
  const others = reviewers.map((r) => r.id).filter((id) => id !== staffId);
  if (others.length)
    await prisma.notification.createMany({
      data: others.map((id) => ({
        recipientStaffId: id,
        type: "MKT_DESIGN_DELIVERED",
        title: `Hình đã xong cho bài "${order.post.title}"`,
        body: link,
      })),
    });
  done(order.postId);
  return { success: true };
}

/** Trả việc (bỏ nhận) — về lại NEW cho người khác lấy. */
export async function releaseDesignOrder(orderId: string): Promise<void> {
  await requirePermission("mkt.view");
  const staffId = await getCurrentStaffId();
  const order = await prisma.mktDesignOrder.findUnique({ where: { id: orderId }, select: { postId: true, assigneeId: true, status: true } });
  if (!order || order.status === "DELIVERED") return;
  const canReview = await hasPermission("mkt.review");
  if (order.assigneeId !== staffId && !canReview) return;
  await prisma.mktDesignOrder.update({ where: { id: orderId }, data: { status: "NEW", assigneeId: null, acceptedAt: null } });
  await audit(orderId, "RELEASE", {});
  done(order.postId);
}

/** Huỷ yêu cầu (bài không cần hình nữa) — chỉ người duyệt MKT. */
export async function cancelDesignOrder(orderId: string): Promise<void> {
  await requirePermission("mkt.review");
  const order = await prisma.mktDesignOrder.findUnique({ where: { id: orderId }, select: { postId: true } });
  if (!order) return;
  await prisma.mktDesignOrder.update({ where: { id: orderId }, data: { status: "CANCELED" } });
  await audit(orderId, "CANCEL", {});
  done(order.postId);
}
