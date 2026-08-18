import "server-only";
import { prisma } from "@/lib/prisma";
import { effectiveApproved, lotOwnerKind, type LotOwnerKind } from "@/lib/inventory-request";
import { loadRequestFormData } from "@/app/(app)/inventory/requests/load";

/**
 * K6-3 — "Vật dụng theo Order" cho bộ phận OPE/PRO: mỗi dòng order (sản phẩm + SL cần) đối chiếu với KHO —
 * tồn khả dụng chia theo CHỦ SỞ HỮU (hàng chung TCM / của dự án này / của dự án khác / hàng khách gửi) và số
 * dự án này đã đề xuất / đã xuất cho sản phẩm đó.
 *
 * ⚠ Khả dụng lấy từ CHÍNH `loadRequestFormData("ISSUE")` (cùng nguồn với picker đề xuất) — để con số bộ phận nhìn ở
 * đây bằng đúng con số họ sẽ thấy khi bấm "Đề xuất". Tự tính lại ở đây là hai nơi hai số.
 */
export type OrderStockLineView = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string | null;
  quantity: number;
  note: string | null;
  /** tồn khả dụng theo chủ sở hữu, cộng qua mọi kho + mọi lô của sản phẩm */
  available: Record<LotOwnerKind, number>;
  /** dự án này đã ĐỀ XUẤT (đang chờ + đã duyệt, theo số duyệt) cho sản phẩm này */
  requested: number;
  /** dự án này đã XUẤT thật (theo số thực xuất) */
  issued: number;
};

export async function getOrderStockLines(orderId: string, projectId: string): Promise<OrderStockLineView[]> {
  const lines = await prisma.projectOrderStockLine.findMany({
    where: { orderId },
    orderBy: { sort: "asc" },
    include: { product: { select: { id: true, code: true, name: true, unit: true } } },
  });
  if (lines.length === 0) return [];
  const productIds = lines.map((l) => l.productId);

  const [{ pickerItems, reservedFree }, reqLines] = await Promise.all([
    loadRequestFormData("ISSUE"),
    prisma.stockRequestLine.findMany({
      where: { item: { productId: { in: productIds } }, request: { type: "ISSUE", projectId, status: { in: ["PROPOSED", "APPROVED", "DONE"] } } },
      select: { quantity: true, approvedQuantity: true, confirmedQuantity: true, item: { select: { productId: true } }, request: { select: { status: true } } },
    }),
  ]);
  // pickerItems chỉ mang mã sản phẩm — nối qua bảng lô để lấy productId
  const byProduct = new Map<string, typeof pickerItems>();
  const lots = await prisma.inventoryItem.findMany({
    where: { productId: { in: productIds }, isActive: true, partCount: 1 },
    select: { id: true, productId: true },
  });
  const productOfLot = new Map(lots.map((l) => [l.id, l.productId!]));
  for (const it of pickerItems) {
    const pid = productOfLot.get(it.id);
    if (!pid) continue;
    byProduct.set(pid, [...(byProduct.get(pid) ?? []), it]);
  }

  return lines.map((l) => {
    const available: Record<LotOwnerKind, number> = { TCM: 0, MINE: 0, OTHER_PROJECT: 0, CLIENT: 0 };
    for (const it of byProduct.get(l.productId) ?? []) {
      const kind = lotOwnerKind(it, projectId);
      // Số hiển thị = khả dụng chung + giữ chỗ CÒN TRỐNG của chính dự án này (cùng phép cộng của form đề xuất).
      let sum = 0;
      for (const [whId, q] of Object.entries(it.available)) sum += q + (reservedFree[`${whId}|${it.id}|${projectId}`] ?? 0);
      available[kind] += sum;
    }
    let requested = 0;
    let issued = 0;
    for (const r of reqLines) {
      if (r.item.productId !== l.productId) continue;
      if (r.request.status === "DONE") issued += r.confirmedQuantity ?? effectiveApproved(r);
      else requested += r.request.status === "APPROVED" ? effectiveApproved(r) : r.quantity;
    }
    return {
      id: l.id,
      productId: l.productId,
      productCode: l.product.code,
      productName: l.product.name,
      unit: l.product.unit,
      quantity: l.quantity,
      note: l.note,
      available,
      requested,
      issued,
    };
  });
}
