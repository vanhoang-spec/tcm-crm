import { prisma } from "@/lib/prisma";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import { availableToRequest, remainingReserve } from "@/lib/inventory-request";
import type { PoOption, ProjectOption, RequestPickerItem, WarehouseOption } from "./request-form";

/** Dự án đã thua thầu / đã huỷ thì không giữ chỗ kho được nữa. */
const RESERVE_EXCLUDED_STATUS = ["LOST", "CANCELED"];

/**
 * Data cho 3 form đề xuất.
 *
 * Tồn KHẢ DỤNG hiển thị = tồn − đã duyệt chưa xuất − giữ chỗ CÒN TRỐNG của dự án KHÁC. Phần giữ
 * chỗ của CHÍNH dự án đang chọn được trả riêng (`reservedFree`) để client cộng lại: hàng đó vẫn
 * dùng được cho dự án đó. Server kiểm lại lần cuối — đây chỉ là con số cho người dùng nhìn.
 */
export async function loadRequestFormData(kind: "ISSUE" | "INTAKE" | "RESERVE" | "TRANSFER") {
  const now = new Date();
  const [warehouses, items, approvedIssueLines, reserveLines, usedLines] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: [{ isMain: "desc" }, { code: "asc" }] }),
    prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        partCount: 1,
        // Giữ chỗ chỉ nhận hàng "sẵn sàng dùng" (spec workflow b); xuất kho không lọc trạng thái.
        ...(kind === "RESERVE" ? { statusCode: "R" } : {}),
        ...(kind !== "INTAKE" ? { OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] } : {}),
      },
      include: { balances: true },
      orderBy: { code: "asc" },
    }),
    kind !== "INTAKE"
      ? prisma.stockRequestLine.findMany({
          where: { request: { type: { in: ["ISSUE", "TRANSFER"] }, status: "APPROVED" } },
          select: { itemId: true, quantity: true, request: { select: { warehouseId: true } } },
        })
      : Promise.resolve([]),
    kind !== "INTAKE"
      ? prisma.stockRequestLine.findMany({
          where: { request: { type: "RESERVE", status: "APPROVED" } },
          select: { itemId: true, quantity: true, request: { select: { warehouseId: true, projectId: true } } },
        })
      : Promise.resolve([]),
    kind !== "INTAKE"
      ? prisma.stockRequestLine.findMany({
          where: { request: { type: "ISSUE", status: { in: ["PROPOSED", "APPROVED", "DONE"] } } },
          select: {
            itemId: true,
            quantity: true,
            confirmedQuantity: true,
            request: { select: { warehouseId: true, projectId: true, status: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const approvedNotIssued = new Map<string, number>(); // `${warehouseId}|${itemId}`
  for (const l of approvedIssueLines) {
    const key = `${l.request.warehouseId}|${l.itemId}`;
    approvedNotIssued.set(key, (approvedNotIssued.get(key) ?? 0) + l.quantity);
  }

  // Giữ chỗ đã duyệt và phần dự án đó đã đòi qua lệnh xuất — cùng khoá (kho|item|dự án).
  const reservedBy = new Map<string, number>();
  for (const l of reserveLines) {
    const key = `${l.request.warehouseId}|${l.itemId}|${l.request.projectId ?? ""}`;
    reservedBy.set(key, (reservedBy.get(key) ?? 0) + l.quantity);
  }
  const usedBy = new Map<string, number>();
  for (const l of usedLines) {
    const key = `${l.request.warehouseId}|${l.itemId}|${l.request.projectId ?? ""}`;
    const q = l.request.status === "DONE" ? (l.confirmedQuantity ?? l.quantity) : l.quantity;
    usedBy.set(key, (usedBy.get(key) ?? 0) + q);
  }
  // `reservedFree[kho|item|dự án]` = giữ chỗ còn trống; `freeTotal[kho|item]` = tổng mọi dự án.
  const reservedFree: Record<string, number> = {};
  const freeTotal = new Map<string, number>();
  for (const [key, qty] of reservedBy) {
    const free = remainingReserve(qty, usedBy.get(key) ?? 0);
    if (free <= 0) continue;
    reservedFree[key] = free;
    const whItem = key.split("|").slice(0, 2).join("|");
    freeTotal.set(whItem, (freeTotal.get(whItem) ?? 0) + free);
  }

  const warehouseOptions: WarehouseOption[] = warehouses.map((w) => ({ id: w.id, name: w.name }));
  const pickerItems: RequestPickerItem[] = items.map((it) => ({
    id: it.id,
    code: it.code,
    name: it.name,
    unit: it.unit,
    isReusable: it.isReusable,
    available: Object.fromEntries(
      it.balances.map((b) => [
        b.warehouseId,
        availableToRequest(
          b.quantity,
          approvedNotIssued.get(`${b.warehouseId}|${it.id}`) ?? 0,
          freeTotal.get(`${b.warehouseId}|${it.id}`) ?? 0
        ),
      ])
    ),
  }));

  const projects = await prisma.project.findMany({
    where:
      kind === "RESERVE"
        ? { status: { code: { notIn: RESERVE_EXCLUDED_STATUS } } }
        : { status: { code: { in: [...EXECUTION_STATUS_CODES] } } },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const projectOptions: ProjectOption[] = projects;

  const pos = await prisma.purchaseOrder.findMany({
    where: { status: "OPEN", project: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } } },
    select: { id: true, code: true, vendor: { select: { name: true } } },
    orderBy: { orderedAt: "desc" },
  });
  const poOptions: PoOption[] = pos.map((p) => ({ id: p.id, label: `${p.code} — ${p.vendor.name}` }));

  return { warehouseOptions, pickerItems, projectOptions, poOptions, reservedFree };
}
