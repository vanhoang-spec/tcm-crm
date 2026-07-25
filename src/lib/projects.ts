// Hằng số + helper dùng chung cho Module ③ Quản lý dự án (UI + server action).

import { prisma } from "./prisma";

/** Trạng thái dự án "đang thực thi" — /projects chỉ hiển thị các dự án đã qua bidding. */
export const EXECUTION_STATUS_CODES = ["PROCESSING", "LIQUIDATION", "HANDOVER", "FINISHED"] as const;

/** Vai trò trong dự án. */
export const PROJECT_ROLES = ["LEADER", "CORE", "SUPPORT"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** Phòng ban core (sát Account) vs support — chỉ để phân nhóm hiển thị Project Team. */
export const CORE_DEPARTMENTS = ["CREATIVE", "PRO", "OPE", "PCC"];
export const SUPPORT_DEPARTMENTS = ["PLANNING", "HR", "IT"];

/** Phòng ban có thể nhận ORDER tự gom từ Master Timeline (bỏ ACCOUNT/CEO/FIN — Account tự chạy). */
export const ORDERABLE_DEPARTMENTS = ["PLANNING", "CREATIVE", "PCC", "OPE", "PRO", "HR", "IT"];

/** Trạng thái xác nhận phía khách trên item External Timeline (guest ghi được). */
export const CLIENT_TIMELINE_STATUSES = ["PENDING", "CONFIRMED", "NEEDS_DISCUSSION"] as const;
export type ClientTimelineStatus = (typeof CLIENT_TIMELINE_STATUSES)[number];

// ─────────────────────────────────────────────────────────
// Khóa task theo trạng thái dự án — dùng chung cho CreativeTask (src/lib/creative.ts re-export,
// KHÔNG đổi hành vi) và DepartmentTask (src/lib/department-tasks.ts).
// ─────────────────────────────────────────────────────────

/** Số ngày team được giữ task để lưu về local server sau khi dự án FINISHED. */
export const FINISHED_GRACE_DAYS = 7;

/** Phase của task suy ra realtime từ trạng thái dự án. WORKING = đang thực thi; BIDDING = còn đấu thầu. */
export function taskPhase(projectStatusCode: string): "BIDDING" | "WORKING" {
  return (EXECUTION_STATUS_CODES as readonly string[]).includes(projectStatusCode) ? "WORKING" : "BIDDING";
}

/**
 * Task có bị khóa cứng không (không cho sửa):
 * - Dự án CANCELED/FAILED → khóa ngay (cascade đã set task sang CANCELED).
 * - Dự án FINISHED → cho 7 ngày grace kể từ finishedAt để lưu về local server, sau đó khóa.
 */
export function isTaskLocked(projectStatusCode: string, finishedAt: Date | null): boolean {
  if (projectStatusCode === "CANCELED" || projectStatusCode === "FAILED") return true;
  if (projectStatusCode === "FINISHED" && finishedAt) {
    const graceEnd = finishedAt.getTime() + FINISHED_GRACE_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() > graceEnd;
  }
  return false;
}

/** Số ngày grace còn lại (dự án FINISHED) — null nếu không phải FINISHED hoặc đã hết grace (đã khóa). */
export function finishedGraceDaysLeft(projectStatusCode: string, finishedAt: Date | null): number | null {
  if (projectStatusCode !== "FINISHED" || !finishedAt) return null;
  const end = finishedAt.getTime() + FINISHED_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const left = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
  return left > 0 ? left : null;
}

/** Đẩy ProjectOrderItem gốc (nếu task sinh từ Master Timeline) sang DONE — tín hiệu bộ phận→Timeline đã xong. */
export async function markOrderItemDone(orderItemId: string | null): Promise<void> {
  if (!orderItemId) return;
  await prisma.projectOrderItem.update({ where: { id: orderItemId }, data: { status: "DONE" } });
}

/**
 * Dọn task đã sinh từ các dòng order (ProjectOrderItem) sắp bị gỡ — PHẢI gọi TRƯỚC khi xóa dòng,
 * vì FK task→dòng là SetNull: xóa dòng trước sẽ mất liên kết và để lại task "zombie" vẫn active.
 * - Task chưa ai nhận (UNASSIGNED) → xóa hẳn.
 * - Task đang làm → CANCELED + giải phóng khóa dedupe (sourceKey/sourceItemLabel) để nếu dòng
 *   được đưa lại order sau này (cùng timeline item) thì spawn vẫn tạo được task mới.
 * - Task DELIVERED giữ nguyên (kết quả đã trả).
 */
export async function cancelTasksForOrderItems(orderItemIds: string[]): Promise<void> {
  if (orderItemIds.length === 0) return;
  await prisma.$transaction([
    prisma.creativeTask.deleteMany({ where: { orderItemId: { in: orderItemIds }, status: "UNASSIGNED" } }),
    prisma.creativeTask.updateMany({
      where: { orderItemId: { in: orderItemIds }, status: { notIn: ["DELIVERED", "CANCELED"] } },
      data: { status: "CANCELED", sourceItemLabel: null },
    }),
    prisma.departmentTask.deleteMany({ where: { orderItemId: { in: orderItemIds }, status: "UNASSIGNED" } }),
    prisma.departmentTask.updateMany({
      where: { orderItemId: { in: orderItemIds }, status: { notIn: ["DELIVERED", "CANCELED"] } },
      data: { status: "CANCELED", sourceKey: null },
    }),
  ]);
}

/**
 * Đồng bộ nội dung dòng order → task đã sinh (khi Leader sửa dòng SAU khi order đã gửi).
 * Chỉ cập nhật task chưa kết thúc; deadline chỉ đồng bộ khi task còn UNASSIGNED
 * (lead đã giao thì deadline là của lead đặt — không ghi đè).
 */
export async function syncTasksWithOrderItem(item: {
  id: string;
  label: string;
  detail: string | null;
  desiredReceiptAt: Date | null;
}): Promise<void> {
  await prisma.$transaction([
    prisma.creativeTask.updateMany({
      where: { orderItemId: item.id, status: { notIn: ["DELIVERED", "CANCELED"] } },
      data: { title: item.label, detail: item.detail },
    }),
    prisma.departmentTask.updateMany({
      where: { orderItemId: item.id, status: { notIn: ["DELIVERED", "CANCELED"] } },
      data: { title: item.label, detail: item.detail },
    }),
    prisma.departmentTask.updateMany({
      where: { orderItemId: item.id, status: "UNASSIGNED" },
      data: { deadline: item.desiredReceiptAt, deadlineReminderSentAt: null },
    }),
  ]);
}
