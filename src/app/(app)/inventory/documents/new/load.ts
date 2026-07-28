import { prisma } from "@/lib/prisma";
import { TCM_OWNER_SEG, getCategoryTree } from "@/lib/inventory";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import type { HoldingItem, PickerItem, ProjectOption, WarehouseOption } from "../doc-form";

/** Data dùng chung cho các form tạo phiếu — item stockable + tồn theo kho, kho active, dự án đang thực thi, holdings. */
export async function loadDocFormData() {
  const [warehouses, items, projects, holdings, tree] = await Promise.all([
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
      include: { item: { include: { ownerClient: { select: { code: true } } } } },
    }),
    getCategoryTree(true),
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
  // K5: mã lô đích được suy từ (nhóm gốc, trạng thái, tình trạng, khối khách) — ba thứ đầu biết được
  // ở client, nên gửi kèm tiền tố để form xem trước "O.R.S.TCM.###" mà không phải hỏi server.
  const rootByNode = new Map(tree.map((n) => [n.id, n.rootCode]));
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
      rootCode: (h.item.catNodeId ? rootByNode.get(h.item.catNodeId) : null) ?? null,
      clientSeg: h.item.ownerClient?.code ?? TCM_OWNER_SEG,
    });
  }
  // RETURN chỉ hiện dự án còn đồ ở hiện trường
  const projectsWithHoldings = projectOptions.filter((p) => holdingsByProject[p.id]?.length);

  return { warehouseOptions, pickerItems, projectOptions, holdingsByProject, projectsWithHoldings };
}
