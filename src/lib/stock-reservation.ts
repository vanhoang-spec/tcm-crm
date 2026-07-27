import "server-only";
import { prisma } from "./prisma";

/**
 * Các mục GIỮ CHỖ KHO đã duyệt của một dự án (K3) — nguồn cho panel "Kho đã duyệt" trong builder
 * CO/CE. Chỉ trả đề xuất APPROVED: đề xuất còn treo chưa phải là hàng được hứa.
 */
export async function getApprovedReservations(projectId: string) {
  const lines = await prisma.stockRequestLine.findMany({
    where: { request: { type: "RESERVE", status: "APPROVED", projectId } },
    include: {
      item: { select: { code: true, name: true, unit: true } },
      request: { select: { code: true, warehouse: { select: { name: true } } } },
    },
    orderBy: [{ request: { createdAt: "asc" } }, { sort: "asc" }],
  });
  return lines.map((l) => ({
    resvLineId: l.id,
    requestCode: l.request.code,
    itemCode: l.item.code,
    itemName: l.item.name,
    unit: l.item.unit,
    approvedQty: l.quantity,
    warehouseName: l.request.warehouse.name,
  }));
}
