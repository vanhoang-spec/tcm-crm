// Tự động hóa ORDER từ Master Timeline (Module ③).
// syncTimelineOrders: gom item timeline theo bộ phận (resolve từ PIC) → ORDER nháp (isDraft) + reconcile dòng.
// dispatchOrder: Leader duyệt xong → gửi thật (notify bộ phận, Creative spawn task).
// KHÔNG "use server" — đây là lib thuần gọi từ server action (projects/actions.ts).

import { prisma } from "./prisma";
import { ORDERABLE_DEPARTMENTS, cancelTasksForOrderItems } from "./projects";
import { ORDER_DEPARTMENT_LABELS } from "./bidding";
import { spawnTasksForCreativeOrder } from "./creative";
import { spawnPlanningJobForOrder, orderRecipientWhere } from "./planning";
import { spawnTasksForDepartmentOrder, isDepartmentTaskDepartment } from "./department-tasks";

/** Resolve phòng ban của 1 item timeline: ưu tiên department của PIC (ownerStaff), fallback departmentCode. */
function itemDepartment(item: {
  ownerStaff: { department: { code: string } | null } | null;
  departmentCode: string | null;
}): string | null {
  const code = item.ownerStaff?.department?.code ?? item.departmentCode ?? null;
  return code && ORDERABLE_DEPARTMENTS.includes(code) ? code : null;
}

/**
 * Gom mọi item Master Timeline có PIC thuộc bộ phận orderable thành ORDER NHÁP theo từng bộ phận.
 * Idempotent: reconcile ProjectOrderItem theo sourceTimelineItemId (thêm dòng mới, gỡ dòng timeline đã xóa,
 * GIỮ desiredReceiptAt/detail/label Leader đã sửa + GIỮ dòng thêm tay sourceTimelineItemId=null).
 * KHÔNG notify (còn nháp). KHÔNG đổi isDraft của order đã tồn tại (đã gửi thì giữ nguyên).
 */
export async function syncTimelineOrders(projectId: string): Promise<void> {
  // Chỉ gom item/công việc (parentId != null) — bỏ Phase cấp 1 (chỉ là tiêu đề nhóm, không phải deliverable).
  const items = await prisma.timelineItem.findMany({
    where: { projectId, parentId: { not: null } },
    include: { ownerStaff: { include: { department: true } } },
    orderBy: { sort: "asc" },
  });

  // Gom item theo bộ phận.
  const byDept = new Map<string, typeof items>();
  for (const it of items) {
    const dept = itemDepartment(it);
    if (!dept) continue;
    const arr = byDept.get(dept) ?? [];
    arr.push(it);
    byDept.set(dept, arr);
  }

  for (const dept of ORDERABLE_DEPARTMENTS) {
    const deptItems = byDept.get(dept) ?? [];
    const existingOrder = await prisma.projectOrder.findUnique({
      where: { projectId_department: { projectId, department: dept } },
    });

    // Không có item timeline cho bộ phận này:
    if (deptItems.length === 0) {
      // Nếu có order TIMELINE nháp rỗng còn sót → xóa cho sạch. Order MANUAL/đã gửi thì giữ.
      if (existingOrder && existingOrder.origin === "TIMELINE" && existingOrder.isDraft) {
        const manualCount = await prisma.projectOrderItem.count({
          where: { orderId: existingOrder.id, sourceTimelineItemId: null },
        });
        if (manualCount === 0) await prisma.projectOrder.delete({ where: { id: existingOrder.id } });
      }
      continue;
    }

    // Tạo order nháp nếu chưa có.
    const order =
      existingOrder ??
      (await prisma.projectOrder.create({
        data: { projectId, department: dept, origin: "TIMELINE", isDraft: true, status: "SENT" },
      }));

    // Reconcile dòng theo sourceTimelineItemId.
    const existingItems = await prisma.projectOrderItem.findMany({ where: { orderId: order.id } });
    const bySource = new Map(existingItems.filter((r) => r.sourceTimelineItemId).map((r) => [r.sourceTimelineItemId!, r]));
    const wantIds = new Set(deptItems.map((it) => it.id));

    // Thêm dòng cho item timeline chưa có.
    let sortBase = existingItems.length;
    const toCreate = deptItems
      .filter((it) => !bySource.has(it.id))
      .map((it) => ({
        orderId: order.id,
        sourceTimelineItemId: it.id,
        label: it.title,
        detail: null as string | null,
        sort: sortBase++,
      }));
    if (toCreate.length > 0) {
      await prisma.projectOrderItem.createMany({ data: toCreate });
      // Order ĐÃ gửi mà timeline phát sinh dòng mới → spawn task ngay (idempotent) —
      // dispatchOrder chỉ chạy 1 lần lúc còn nháp, chờ nó lần nữa thì dòng này không bao giờ thành task.
      if (!order.isDraft) {
        if (dept === "CREATIVE") await spawnTasksForCreativeOrder(order.id);
        else if (isDepartmentTaskDepartment(dept)) await spawnTasksForDepartmentOrder(order.id);
      }
    }

    // Gỡ dòng timeline-origin mà item timeline đã bị xóa/đổi bộ phận (không đụng dòng thêm tay).
    // Dọn task đã sinh TRƯỚC khi xóa dòng — FK task→dòng là SetNull, xóa trước sẽ để lại task zombie.
    const stale = existingItems.filter((r) => r.sourceTimelineItemId && !wantIds.has(r.sourceTimelineItemId));
    if (stale.length > 0) {
      await cancelTasksForOrderItems(stale.map((r) => r.id));
      await prisma.projectOrderItem.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
    }
  }
}

/**
 * Leader gửi 1 ORDER nháp: bỏ cờ nháp, cập nhật người gửi, notify staff bộ phận. Creative thì spawn task.
 * Trả về { sent, department } — caller dùng department để revalidate /creative đúng lúc (chỉ khi CREATIVE),
 * tránh xóa cache /creative vô cớ ở mọi thao tác dự án. Không notify lại nếu order đã gửi trước đó.
 */
export async function dispatchOrder(
  orderId: string,
  sentById: string | null,
): Promise<{ sent: boolean; department: string | null }> {
  const order = await prisma.projectOrder.findUnique({
    where: { id: orderId },
    include: { project: true },
  });
  if (!order) return { sent: false, department: null };
  if (!order.isDraft) return { sent: false, department: order.department }; // đã gửi rồi

  await prisma.projectOrder.update({
    where: { id: orderId },
    data: {
      isDraft: false,
      status: "SENT",
      sentAt: new Date(),
      sentById: sentById ?? order.sentById,
      briefLinkUrl: order.briefLinkUrl ?? order.project.briefLinkUrl,
    },
  });

  if (order.department === "CREATIVE") await spawnTasksForCreativeOrder(orderId);
  if (order.department === "PLANNING") await spawnPlanningJobForOrder(orderId); // tab Planning nhận brief (luồng Proposal cũ)
  if (isDepartmentTaskDepartment(order.department)) await spawnTasksForDepartmentOrder(orderId); // PLANNING (thêm "Task từ timeline") + PCC/OPE/PRO


  const recipients = await prisma.staff.findMany({ where: orderRecipientWhere(order.department) });
  if (recipients.length > 0) {
    const deptLabel = ORDER_DEPARTMENT_LABELS[order.department] ?? order.department;
    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        recipientStaffId: r.id,
        type: "DEPARTMENT_ORDER_RECEIVED",
        title: `ORDER mới cho ${deptLabel} — dự án ${order.project.code}`,
        body: order.project.name,
        projectId: order.projectId,
      })),
    });
  }
  return { sent: true, department: order.department };
}
