import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { LOT_SEQ_MAX, PRODUCT_SEQ_MAX, productCodePrefix, utcDayDiff } from "./inventory-lot";

// ─────────────────────────────────────────────────────────
// MODULE ⑧ KHO — hằng số + hàm thuần + transaction helpers + IO reads.
// Bất biến: StockBalance/ProjectHolding luôn suy ra được từ sổ cái StockDocument —
// mọi cập nhật số dư phải đi qua debit/credit helpers TRONG cùng transaction với phiếu.
// ─────────────────────────────────────────────────────────

export const DOC_TYPES = ["IMPORT", "ADJUST", "TRANSFER", "ISSUE", "RETURN", "CONVERT", "DESTROY", "HOLDING", "LOSS"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_CODE_PREFIX: Record<DocType, string> = {
  IMPORT: "NK",
  ADJUST: "DC",
  TRANSFER: "CK",
  ISSUE: "XE",
  RETURN: "TH",
  CONVERT: "CD",
  DESTROY: "XH",
  HOLDING: "CH", // chuyển đồ hiện trường giữa 2 dự án (không qua kho)
  LOSS: "BM",    // báo mất/hỏng ở hiện trường — trừ holding, KHÔNG cộng lại kho
};

// ── Kho v2 — phần thuần của mô hình lô nằm ở inventory-lot.ts, re-export để giữ một điểm import ──
export * from "./inventory-lot";

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

/**
 * Seq SẢN PHẨM kế tiếp trong một nhóm gốc = max đang có + 1 (đọc cột seq theo tiền tố mã; caller retry P2002
 * — code @unique là backstop). Quá 9999 → throw SEQ_FULL.
 */
export async function nextProductSeq(tx: Tx, groupCode: string): Promise<number> {
  const last = await tx.inventoryProduct.findFirst({
    where: { code: { startsWith: productCodePrefix(groupCode) } },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  const seq = (last?.seq ?? 0) + 1;
  if (seq > PRODUCT_SEQ_MAX) throw new Error("SEQ_FULL");
  return seq;
}

/**
 * Seq LÔ kế tiếp trong một sản phẩm = max đang có + 1 (chỉ đếm lô CHA — phần con mang cùng seq với cha).
 * ⚠ Không tái sử dụng số của lô đã về 0 / đã tắt: phiếu kho cũ còn phải tra ngược được. Quá 99 → SEQ_FULL.
 */
export async function nextLotSeq(tx: Tx, productId: string): Promise<number> {
  const last = await tx.inventoryItem.findFirst({
    where: { productId, parentItemId: null },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  const seq = (last?.seq ?? 0) + 1;
  if (seq > LOT_SEQ_MAX) throw new Error("SEQ_FULL");
  return seq;
}

/**
 * Trường lô CHÉP TỪ SẢN PHẨM — sản phẩm là NGUỒN SỰ THẬT của name/unit/isReusable/partCount/catNodeId, lô
 * giữ bản sao để 24 chỗ đọc `item.name` sẵn có không phải đổi (một đường ghi, nhiều nơi đọc — cùng khuôn
 * liên hệ NCC ở PUR-2). Đổi ở sản phẩm thì `syncLotsFromProduct` lan xuống mọi lô.
 */
export function lotFieldsFromProduct(p: { name: string; unit: string | null; isReusable: boolean; partCount: number; catNodeId: string }) {
  return { name: p.name, unit: p.unit, isReusable: p.isReusable, partCount: p.partCount, catNodeId: p.catNodeId };
}

/** Lan name/unit/isReusable từ sản phẩm xuống mọi lô + phần con (tên phần giữ hậu tố " — Phần N"). */
export async function syncLotsFromProduct(tx: Tx, productId: string, p: { name: string; unit: string | null; isReusable: boolean }): Promise<void> {
  await tx.inventoryItem.updateMany({ where: { productId, parentItemId: null }, data: { name: p.name, unit: p.unit, isReusable: p.isReusable } });
  const parts = await tx.inventoryItem.findMany({ where: { productId, parentItemId: { not: null } }, select: { id: true, partNo: true } });
  for (const part of parts) {
    await tx.inventoryItem.update({ where: { id: part.id }, data: { name: `${p.name} — Phần ${part.partNo}`, unit: p.unit, isReusable: p.isReusable } });
  }
}

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

/**
 * Hôm nay theo quy ước UTC-midnight của app (HANDOVER §4.3).
 *
 * Lấy NGÀY ĐỊA PHƯƠNG rồi mới dựng UTC-midnight — giống hệt dateOrNull() parse chuỗi "YYYY-MM-DD"
 * người dùng gõ. Dùng getUTCDate() thì từ 0h đến 7h sáng giờ Sài Gòn sẽ đóng dấu ngày HÔM QUA.
 */
export function utcMidnightToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Đóng KỲ CHIẾN DỊCH khi dự án không còn giữ đồ nào ở hiện trường (K4).
 *
 * Gọi ở cuối MỌI transaction làm giảm holding: trả về kho, chuyển sang dự án khác, báo mất. Không
 * đóng thì guard 15 ngày sẽ khoá dự án vĩnh viễn dù hàng đã về hết.
 */
export async function closeCampaignIfSettled(tx: Tx, projectId: string): Promise<void> {
  const left = await tx.projectHolding.count({ where: { projectId, quantity: { gt: 0 } } });
  if (left === 0) {
    await tx.project.updateMany({ where: { id: projectId }, data: { stockCampaignOpenedAt: null } });
  }
}

// ── IO reads ──────────────────────────────────────────────

/** Node gốc (cấp 1) của một node cây danh mục — mang code 1 ký tự + isClientOwned. Cây ≤3 cấp. */
export async function resolveRootCategory(
  catNodeId: string
): Promise<{ id: string; code: string | null; isClientOwned: boolean; name: string } | null> {
  let node = await prisma.inventoryCategory.findUnique({
    where: { id: catNodeId },
    select: { id: true, code: true, parentId: true, isClientOwned: true, name: true },
  });
  for (let hop = 0; node && node.parentId && hop < 4; hop++) {
    node = await prisma.inventoryCategory.findUnique({
      where: { id: node.parentId },
      select: { id: true, code: true, parentId: true, isClientOwned: true, name: true },
    });
  }
  return node ? { id: node.id, code: node.code, isClientOwned: node.isClientOwned, name: node.name } : null;
}

export type CategoryTreeNode = {
  id: string;
  parentId: string | null;
  name: string;
  code: string | null;
  depth: number; // 0 = nhóm gốc
  sort: number;
  isActive: boolean;
  isClientOwned: boolean; // giá trị của node GỐC (kế thừa xuống con/cháu)
  rootCode: string | null; // ký tự nhóm của gốc — dùng sinh mã + preview
};

/** Cây danh mục phẳng hoá theo thứ tự hiển thị (DFS, indent bằng depth). Node cha inactive → ẩn cả nhánh khi lọc. */
export async function getCategoryTree(includeInactive = false): Promise<CategoryTreeNode[]> {
  const all = await prisma.inventoryCategory.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }] });
  const byParent = new Map<string | null, typeof all>();
  for (const n of all) {
    const key = n.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(n);
    byParent.set(key, list);
  }
  const out: CategoryTreeNode[] = [];
  const walk = (parentId: string | null, depth: number, rootCode: string | null, rootClientOwned: boolean) => {
    for (const n of byParent.get(parentId) ?? []) {
      if (!includeInactive && !n.isActive) continue;
      const rc = depth === 0 ? n.code : rootCode;
      const rco = depth === 0 ? n.isClientOwned : rootClientOwned;
      out.push({
        id: n.id,
        parentId: n.parentId,
        name: n.name,
        code: n.code,
        depth,
        sort: n.sort,
        isActive: n.isActive,
        isClientOwned: rco,
        rootCode: rc,
      });
      if (depth < 2) walk(n.id, depth + 1, rc, rco);
    }
  };
  walk(null, 0, null, false);
  return out;
}

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
  catNodeName: string | null;
  statusCode: string | null;
  conditionCode: string | null;
  clientCode: string | null; // null = hàng TCM
  expiryDate: Date | null;
  /** Item thường: tổng tồn (theo filter kho). Bộ cha: số bộ đủ = min tồn các phần. */
  quantity: number;
  isSet: boolean;
  parts: StockOverviewPart[];
};

/**
 * Tồn kho theo item (lọc kho / nhánh cây danh mục / trạng thái / tình trạng / từ khóa).
 * Phần con gom dưới bộ cha kèm "số bộ đủ"; item thường trả thẳng. Chỉ hiện item active.
 */
export async function getStockOverview(filter: {
  warehouseId?: string;
  /** Danh sách node đã giải ra CẢ NHÁNH con — page tự tính từ getCategoryTree. */
  catNodeIds?: string[];
  statusCode?: string;
  conditionCode?: string;
  q?: string;
}): Promise<StockOverviewRow[]> {
  const q = filter.q?.trim().toLowerCase();
  const items = await prisma.inventoryItem.findMany({
    where: {
      isActive: true,
      parentItemId: null, // cấp hiển thị: item thường + bộ cha (phần con lấy qua include)
      ...(filter.catNodeIds ? { catNodeId: { in: filter.catNodeIds } } : {}),
      ...(filter.statusCode ? { statusCode: filter.statusCode } : {}),
      ...(filter.conditionCode ? { conditionCode: filter.conditionCode } : {}),
    },
    include: {
      catNode: { select: { name: true } },
      ownerClient: { select: { code: true } },
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
      catNodeName: it.catNode?.name ?? null,
      statusCode: it.statusCode,
      conditionCode: it.conditionCode,
      clientCode: it.ownerClient?.code ?? null,
      expiryDate: it.expiryDate,
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
  /** K4: số ngày kỳ chiến dịch đã mở; null = chưa mở kỳ (hàng dùng một lần thì không mở). */
  campaignDays: number | null;
};

/** Đồ tái sử dụng đang ở hiện trường, gom theo dự án (chỉ dòng quantity > 0). */
export async function getProjectHoldings(projectId?: string): Promise<ProjectHoldingRow[]> {
  const holdings = await prisma.projectHolding.findMany({
    where: { quantity: { gt: 0 }, ...(projectId ? { projectId } : {}) },
    include: { project: { select: { id: true, code: true, name: true, stockCampaignOpenedAt: true } }, item: true },
    orderBy: [{ projectId: "asc" }, { item: { code: "asc" } }],
  });
  const byProject = new Map<string, ProjectHoldingRow>();
  for (const h of holdings) {
    let row = byProject.get(h.projectId);
    if (!row) {
      row = {
        projectId: h.projectId,
        projectCode: h.project.code,
        projectName: h.project.name,
        items: [],
        campaignDays: h.project.stockCampaignOpenedAt ? utcDayDiff(h.project.stockCampaignOpenedAt, new Date()) : null,
      };
      byProject.set(h.projectId, row);
    }
    row.items.push({ itemId: h.itemId, code: h.item.code, name: h.item.name, unit: h.item.unit, quantity: h.quantity });
  }
  return Array.from(byProject.values());
}

export type ConsumptionRow = {
  itemId: string;
  code: string;
  name: string;
  unit: string | null;
  delivered: number; // đã giao ra hiện trường (xuất kho + nhận từ dự án khác)
  returned: number; // đã trả về kho
  movedOut: number; // chuyển sang dự án khác
  lost: number; // báo mất / hỏng
  onSite: number; // còn ở hiện trường (đối chiếu chéo với ProjectHolding)
  consumed: number; // TIÊU HAO THẬT = giao − trả − chuyển đi − mất − còn ở site
};

/**
 * Tiêu hao của một dự án, tính LẠI TỪ SỔ CÁI (K4) — không đọc ProjectHolding, vì bảng đó không có
 * chiều thời gian và bỏ sót toàn bộ hàng dùng một lần (loại không bao giờ có phiếu trả).
 *
 * TIÊU HAO THẬT = (ISSUE + CH nhận) − RETURN − CH gửi − BM mất − còn ở hiện trường.
 * Trừ cả "mất" và "còn ở site" là CỐ Ý: hai khoản đó có cột riêng, gộp vào tiêu hao thì hàng tái sử
 * dụng đang nằm ngoài site sẽ hiện như đã dùng hết. Hàng dùng một lần không có holding nên hai
 * khoản đó = 0 và công thức rút về (giao − trả − chuyển đi) đúng như trực giác.
 *
 * Chỉ đếm phiếu COMPLETED. Cộng cả đời dự án: kỳ đóng thì holding = 0 nên tổng cả đời CHÍNH LÀ
 * tiêu hao thật — cắt theo cửa sổ ngày chỉ thêm biến số chứ không thêm sự thật.
 */
export async function getProjectConsumption(projectId: string): Promise<ConsumptionRow[]> {
  const lines = await prisma.stockDocumentLine.findMany({
    where: {
      document: {
        status: "COMPLETED",
        OR: [
          { projectId, type: { in: ["ISSUE", "RETURN", "LOSS", "HOLDING"] } },
          { fromProjectId: projectId, type: "HOLDING" },
        ],
      },
    },
    include: {
      item: { select: { id: true, code: true, name: true, unit: true } },
      document: { select: { type: true, projectId: true } },
    },
  });

  const rows = new Map<string, ConsumptionRow>();
  const row = (it: { id: string; code: string; name: string; unit: string | null }) => {
    let r = rows.get(it.id);
    if (!r) {
      r = { itemId: it.id, code: it.code, name: it.name, unit: it.unit, delivered: 0, returned: 0, movedOut: 0, lost: 0, onSite: 0, consumed: 0 };
      rows.set(it.id, r);
    }
    return r;
  };
  for (const l of lines) {
    const r = row(l.item);
    const isIncoming = l.document.projectId === projectId;
    if (l.document.type === "ISSUE") r.delivered += l.quantity;
    else if (l.document.type === "RETURN") r.returned += l.quantity;
    else if (l.document.type === "LOSS") r.lost += l.quantity;
    else if (l.document.type === "HOLDING") {
      // Cùng loại phiếu, hai chiều: dự án này là bên nhận thì cộng vào "đã giao", là bên gửi thì
      // cộng vào "chuyển đi". Chỉ phiếu COMPLETED nên phần đang treo không bị tính hai lần.
      if (isIncoming) r.delivered += l.quantity;
      else r.movedOut += l.quantity;
    }
  }

  const holdings = await prisma.projectHolding.findMany({ where: { projectId }, select: { itemId: true, quantity: true } });
  const onSiteBy = new Map(holdings.map((h) => [h.itemId, h.quantity]));
  for (const r of rows.values()) {
    r.onSite = onSiteBy.get(r.itemId) ?? 0;
    r.consumed = r.delivered - r.returned - r.movedOut - r.lost - r.onSite;
  }
  return Array.from(rows.values()).sort((a, b) => a.code.localeCompare(b.code));
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
