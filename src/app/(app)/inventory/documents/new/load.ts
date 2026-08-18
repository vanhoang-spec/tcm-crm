import { prisma } from "@/lib/prisma";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import type { HoldingItem, PickerItem, ProjectOption, WarehouseOption } from "../doc-form";

/** Data dùng chung cho các form tạo phiếu — item stockable + tồn theo kho, kho active, dự án đang thực thi, holdings. */
export async function loadDocFormData() {
  const [warehouses, items, projects, holdings] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: [{ isMain: "desc" }, { code: "asc" }] }),
    prisma.inventoryItem.findMany({
      where: { isActive: true, partCount: 1 },
      include: { balances: true },
      orderBy: { code: "asc" },
    }),
    prisma.project.findMany({
      where: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.projectHolding.findMany({
      where: { quantity: { gt: 0 } },
      include: { item: { include: { product: { select: { code: true } } } } },
    }),
  ]);

  const warehouseOptions: WarehouseOption[] = warehouses.map((w) => ({ id: w.id, name: w.name }));
  const pickerItems: PickerItem[] = items.map((it) => ({
    id: it.id,
    code: it.code,
    name: it.name,
    unit: it.unit,
    isReusable: it.isReusable,
    balances: Object.fromEntries(it.balances.map((b) => [b.warehouseId, b.quantity])),
  }));
  const projectOptions: ProjectOption[] = projects;
  // K5 + mã lô v3: lô đích nằm CÙNG SẢN PHẨM với lô nguồn — gửi mã sản phẩm để form xem trước "PO-0042.__"
  // (số lô chỉ biết lúc server tìm-hoặc-tạo).
  const holdingsByProject: Record<string, HoldingItem[]> = {};
  for (const h of holdings) {
    (holdingsByProject[h.projectId] ??= []).push({
      itemId: h.itemId,
      code: h.item.code,
      name: h.item.name,
      unit: h.item.unit,
      quantity: h.quantity,
      statusCode: h.item.statusCode,
      conditionCode: h.item.conditionCode,
      isPart: h.item.parentItemId !== null,
      productCode: h.item.product?.code ?? null,
    });
  }
  // RETURN chỉ hiện dự án còn đồ ở hiện trường
  const projectsWithHoldings = projectOptions.filter((p) => holdingsByProject[p.id]?.length);

  return { warehouseOptions, pickerItems, projectOptions, holdingsByProject, projectsWithHoldings };
}
