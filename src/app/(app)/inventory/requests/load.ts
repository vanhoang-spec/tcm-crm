import { prisma } from "@/lib/prisma";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import { availableToRequest } from "@/lib/inventory-request";
import type { PoOption, ProjectOption, RequestPickerItem, WarehouseOption } from "./request-form";

/**
 * Data cho 2 form đề xuất. ISSUE: tồn KHẢ DỤNG = tồn − phần đã duyệt chưa xuất (giữ chỗ mềm của
 * chính tầng đề xuất, tránh hai lệnh hứa cùng một lô). Hàng hết hạn không lên danh sách chọn.
 */
export async function loadRequestFormData(kind: "ISSUE" | "INTAKE") {
  const now = new Date();
  const [warehouses, items, reservedLines] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: [{ isMain: "desc" }, { code: "asc" }] }),
    prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        partCount: 1,
        ...(kind === "ISSUE" ? { OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] } : {}),
      },
      include: { balances: true },
      orderBy: { code: "asc" },
    }),
    kind === "ISSUE"
      ? prisma.stockRequestLine.findMany({
          where: { request: { type: "ISSUE", status: "APPROVED" } },
          select: { itemId: true, quantity: true, request: { select: { warehouseId: true } } },
        })
      : Promise.resolve([]),
  ]);

  const reserved = new Map<string, number>(); // key: `${warehouseId}|${itemId}`
  for (const l of reservedLines) {
    const key = `${l.request.warehouseId}|${l.itemId}`;
    reserved.set(key, (reserved.get(key) ?? 0) + l.quantity);
  }

  const warehouseOptions: WarehouseOption[] = warehouses.map((w) => ({ id: w.id, name: w.name }));
  const pickerItems: RequestPickerItem[] = items.map((it) => ({
    id: it.id,
    code: it.code,
    name: it.name,
    unit: it.unit,
    isReusable: it.isReusable,
    available: Object.fromEntries(
      it.balances.map((b) => [b.warehouseId, availableToRequest(b.quantity, reserved.get(`${b.warehouseId}|${it.id}`) ?? 0)])
    ),
  }));

  const projects = await prisma.project.findMany({
    where: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } },
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

  return { warehouseOptions, pickerItems, projectOptions, poOptions };
}
