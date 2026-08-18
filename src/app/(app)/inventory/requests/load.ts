import { prisma } from "@/lib/prisma";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import { availableToRequest, effectiveApproved, remainingReserve } from "@/lib/inventory-request";
import { getCategoryTree } from "@/lib/inventory";
import type { GroupOption, PoOption, ProjectOption, RequestPickerItem, WarehouseOption } from "./request-form";

/** Dự án đã thua thầu / đã huỷ thì không giữ chỗ kho được nữa. */
const RESERVE_EXCLUDED_STATUS = ["LOST", "CANCELED"];

/**
 * Data cho 3 form đề xuất.
 *
 * Tồn KHẢ DỤNG hiển thị = tồn − đã duyệt chưa xuất − giữ chỗ CÒN TRỐNG của dự án KHÁC. Phần giữ
 * chỗ của CHÍNH dự án đang chọn được trả riêng (`reservedFree`) để client cộng lại: hàng đó vẫn
 * dùng được cho dự án đó. Server kiểm lại lần cuối — đây chỉ là con số cho người dùng nhìn.
 */
export async function loadRequestFormData(kind: "ISSUE" | "INTAKE" | "RESERVE" | "TRANSFER" | "DESTROY") {
  const now = new Date();
  const [warehouses, items, approvedIssueLines, reserveLines, usedLines] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: [{ isMain: "desc" }, { code: "asc" }] }),
    prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        partCount: 1,
        // Giữ chỗ chỉ nhận hàng "sẵn sàng dùng" (spec workflow b); xuất kho không lọc trạng thái.
        ...(kind === "RESERVE" ? { statusCode: "R" } : {}),
        // K6: đề xuất HỦY chỉ nhận hàng KHÁCH GỬI và KHÔNG lọc hết hạn — hủy chính là đường ra của hàng hết hạn.
        ...(kind === "DESTROY" ? { ownerClientId: { not: null } } : {}),
        ...(kind !== "INTAKE" && kind !== "DESTROY" ? { OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] } : {}),
      },
      include: {
        balances: true,
        product: { select: { code: true } },
        ownerClient: { select: { code: true } },
        boundProject: { select: { code: true, ownerTeam: { select: { code: true } } } },
      },
      orderBy: { code: "asc" },
    }),
    kind !== "INTAKE"
      ? prisma.stockRequestLine.findMany({
          where: { request: { type: { in: ["ISSUE", "TRANSFER"] }, status: "APPROVED" } },
          select: { itemId: true, quantity: true, approvedQuantity: true, request: { select: { warehouseId: true } } },
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
            approvedQuantity: true,
            confirmedQuantity: true,
            request: { select: { warehouseId: true, projectId: true, status: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const approvedNotIssued = new Map<string, number>(); // `${warehouseId}|${itemId}`
  for (const l of approvedIssueLines) {
    const key = `${l.request.warehouseId}|${l.itemId}`;
    // K6: phần đã hứa = số ĐÃ DUYỆT (duyệt 3/5 chỉ giữ 3) — cùng phép tính với approvedNotIssuedByItem ở server.
    approvedNotIssued.set(key, (approvedNotIssued.get(key) ?? 0) + effectiveApproved(l));
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
    const q = l.request.status === "DONE" ? (l.confirmedQuantity ?? effectiveApproved(l)) : l.request.status === "APPROVED" ? effectiveApproved(l) : l.quantity;
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
  // K6: nhóm gốc của từng lô (mã 2 ký tự) — để lọc trong picker; cây ≤3 cấp, đọc một lần.
  const tree = await getCategoryTree();
  const rootByNode = new Map(tree.map((n) => [n.id, n.rootCode]));
  const groupOptions: GroupOption[] = tree.filter((n) => n.depth === 0 && n.code).map((n) => ({ code: n.code!, name: n.name }));
  const pickerItems: RequestPickerItem[] = items.map((it) => ({
    id: it.id,
    code: it.code,
    name: it.name,
    unit: it.unit,
    isReusable: it.isReusable,
    productCode: it.product?.code ?? null,
    groupCode: (it.catNodeId ? rootByNode.get(it.catNodeId) : null) ?? null,
    statusCode: it.statusCode,
    conditionCode: it.conditionCode,
    ownerClientId: it.ownerClientId,
    ownerClientCode: it.ownerClient?.code ?? null,
    boundProjectId: it.boundProjectId,
    boundProjectCode: it.boundProject?.code ?? null,
    boundTeamCode: it.boundProject?.ownerTeam?.code ?? null,
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

  return { warehouseOptions, pickerItems, projectOptions, poOptions, reservedFree, groupOptions };
}
