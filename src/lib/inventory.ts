import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────
// MODULE ⑧ KHO — hằng số + hàm thuần + transaction helpers + IO reads.
// Bất biến: StockBalance/ProjectHolding luôn suy ra được từ sổ cái StockDocument —
// mọi cập nhật số dư phải đi qua debit/credit helpers TRONG cùng transaction với phiếu.
// ─────────────────────────────────────────────────────────

export const DOC_TYPES = ["IMPORT", "ADJUST", "TRANSFER", "ISSUE", "RETURN"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_CODE_PREFIX: Record<DocType, string> = {
  IMPORT: "NK",
  ADJUST: "DC",
  TRANSFER: "CK",
  ISSUE: "XE",
  RETURN: "TH",
};

export const DOC_STATUSES = ["PENDING", "COMPLETED", "CANCELED"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

/** Chỉ item partCount === 1 mang tồn kho (item thường hoặc phần con của bộ). */
export function isStockable(item: { partCount: number }): boolean {
  return item.partCount === 1;
}

/** Mã phần con của bộ tách phần: BOOTH01 → BOOTH01-1, BOOTH01-2... */
export function partItemCode(parentCode: string, partNo: number): string {
  return `${parentCode}-${partNo}`;
}

/** Số bộ đủ = min(tồn từng phần). Mảng rỗng → 0. */
export function completeSets(partQtys: number[]): number {
  return partQtys.length ? Math.min(...partQtys) : 0;
}

export function buildDocCode(type: DocType, date: Date, seq: number): string {
  const ym = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `${DOC_CODE_PREFIX[type]}-${ym}-${String(seq).padStart(3, "0")}`;
}

/** Ném từ debit helpers khi không đủ tồn/holding — action bắt để trả lỗi theo item. */
export class InsufficientStockError extends Error {
  constructor(public readonly itemId: string) {
    super(`Insufficient stock for item ${itemId}`);
    this.name = "InsufficientStockError";
  }
}

type Tx = Prisma.TransactionClient;

/** Mã phiếu kế tiếp trong tháng — count-based, caller phải retry P2002 (code @unique là backstop). */
export async function nextDocCode(tx: Tx, type: DocType, now: Date): Promise<string> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const count = await tx.stockDocument.count({
    where: { type, createdAt: { gte: monthStart, lt: monthEnd } },
  });
  return buildDocCode(type, now, count + 1);
}

/**
 * Trừ tồn kho có guard chống âm — DUY NHẤT đúng dưới concurrency:
 * conditional updateMany, count 0 ⇒ throw ⇒ transaction rollback. KHÔNG read-then-write.
 */
export async function debitBalance(tx: Tx, warehouseId: string, itemId: string, qty: number): Promise<void> {
  const res = await tx.stockBalance.updateMany({
    where: { warehouseId, itemId, quantity: { gte: qty } },
    data: { quantity: { decrement: qty } },
  });
  if (res.count === 0) throw new InsufficientStockError(itemId);
}

export async function creditBalance(tx: Tx, warehouseId: string, itemId: string, qty: number): Promise<void> {
  await tx.stockBalance.upsert({
    where: { warehouseId_itemId: { warehouseId, itemId } },
    update: { quantity: { increment: qty } },
    create: { warehouseId, itemId, quantity: qty },
  });
}

/** Trả đồ về kho: trừ holding của dự án (guard không trả quá số đang giữ). */
export async function debitHolding(tx: Tx, projectId: string, itemId: string, qty: number): Promise<void> {
  const res = await tx.projectHolding.updateMany({
    where: { projectId, itemId, quantity: { gte: qty } },
    data: { quantity: { decrement: qty } },
  });
  if (res.count === 0) throw new InsufficientStockError(itemId);
}

export async function creditHolding(tx: Tx, projectId: string, itemId: string, qty: number): Promise<void> {
  await tx.projectHolding.upsert({
    where: { projectId_itemId: { projectId, itemId } },
    update: { quantity: { increment: qty } },
    create: { projectId, itemId, quantity: qty },
  });
}

// ── IO reads ──────────────────────────────────────────────

export type StockOverviewPart = {
  itemId: string;
  code: string;
  name: string;
  partNo: number | null;
  quantity: number;
};

export type StockOverviewRow = {
  itemId: string;
  code: string;
  name: string;
  unit: string | null;
  isReusable: boolean;
  categoryId: string | null;
  categoryLabelVi: string | null;
  categoryLabelEn: string | null;
  /** Item thường: tổng tồn (theo filter kho). Bộ cha: số bộ đủ = min tồn các phần. */
  quantity: number;
  isSet: boolean;
  parts: StockOverviewPart[];
};

/**
 * Tồn kho theo item (lọc kho/nhóm/từ khóa). Phần con gom dưới bộ cha kèm "số bộ đủ";
 * item thường trả thẳng. Chỉ hiện item active.
 */
export async function getStockOverview(filter: {
  warehouseId?: string;
  categoryId?: string;
  q?: string;
}): Promise<StockOverviewRow[]> {
  const q = filter.q?.trim().toLowerCase();
  const items = await prisma.inventoryItem.findMany({
    where: {
      isActive: true,
      parentItemId: null, // cấp hiển thị: item thường + bộ cha (phần con lấy qua include)
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    },
    include: {
      category: true,
      balances: filter.warehouseId ? { where: { warehouseId: filter.warehouseId } } : true,
      parts: {
        where: { isActive: true },
        orderBy: { partNo: "asc" },
        include: {
          balances: filter.warehouseId ? { where: { warehouseId: filter.warehouseId } } : true,
        },
      },
    },
    orderBy: { code: "asc" },
  });

  const rows: StockOverviewRow[] = items.map((it) => {
    const isSet = it.partCount > 1;
    const parts: StockOverviewPart[] = it.parts.map((p) => ({
      itemId: p.id,
      code: p.code,
      name: p.name,
      partNo: p.partNo,
      quantity: p.balances.reduce((s, b) => s + b.quantity, 0),
    }));
    return {
      itemId: it.id,
      code: it.code,
      name: it.name,
      unit: it.unit,
      isReusable: it.isReusable,
      categoryId: it.categoryId,
      categoryLabelVi: it.category?.labelVi ?? null,
      categoryLabelEn: it.category?.labelEn ?? null,
      quantity: isSet
        ? completeSets(parts.map((p) => p.quantity))
        : it.balances.reduce((s, b) => s + b.quantity, 0),
      isSet,
      parts,
    };
  });

  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.parts.some((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
  );
}

export type ProjectHoldingRow = {
  projectId: string;
  projectCode: string;
  projectName: string;
  items: { itemId: string; code: string; name: string; unit: string | null; quantity: number }[];
};

/** Đồ tái sử dụng đang ở hiện trường, gom theo dự án (chỉ dòng quantity > 0). */
export async function getProjectHoldings(projectId?: string): Promise<ProjectHoldingRow[]> {
  const holdings = await prisma.projectHolding.findMany({
    where: { quantity: { gt: 0 }, ...(projectId ? { projectId } : {}) },
    include: { project: { select: { id: true, code: true, name: true } }, item: true },
    orderBy: [{ projectId: "asc" }, { item: { code: "asc" } }],
  });
  const byProject = new Map<string, ProjectHoldingRow>();
  for (const h of holdings) {
    let row = byProject.get(h.projectId);
    if (!row) {
      row = { projectId: h.projectId, projectCode: h.project.code, projectName: h.project.name, items: [] };
      byProject.set(h.projectId, row);
    }
    row.items.push({ itemId: h.itemId, code: h.item.code, name: h.item.name, unit: h.item.unit, quantity: h.quantity });
  }
  return Array.from(byProject.values());
}

/** Phiếu chuyển kho đang chờ nhận (PENDING) — ghim đầu danh sách + badge mobile. */
export async function getPendingTransfers() {
  return prisma.stockDocument.findMany({
    where: { type: "TRANSFER", status: "PENDING" },
    include: {
      fromWarehouse: true,
      toWarehouse: true,
      lines: { include: { item: true }, orderBy: { sort: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Số lượng đang vận chuyển theo item (từ phiếu TRANSFER PENDING — đã trừ nguồn, chưa vào đích). */
export async function getInTransitQuantities(): Promise<Map<string, number>> {
  const lines = await prisma.stockDocumentLine.findMany({
    where: { document: { type: "TRANSFER", status: "PENDING" } },
    select: { itemId: true, quantity: true },
  });
  const map = new Map<string, number>();
  for (const l of lines) map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.quantity);
  return map;
}
