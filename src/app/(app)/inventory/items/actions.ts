"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { saveChatAttachment } from "@/lib/chat-storage";
import {
  GROUP_CODE_RE,
  ITEM_CONDITION_CODES,
  ITEM_STATUS_CODES,
  buildLotCode,
  buildProductCode,
  creditBalance,
  lotFieldsFromProduct,
  nextDocCode,
  nextLotSeq,
  nextProductSeq,
  partItemCode,
  resolveRootCategory,
  syncLotsFromProduct,
  type ItemConditionCode,
  type ItemStatusCode,
} from "@/lib/inventory";
import { lotKey, parseInventoryCsv, type CsvRowError, type ParsedInventoryRow } from "@/lib/inventory-csv";
import { requirePermission } from "@/lib/permissions";

export type ItemFormState = { error?: string; success?: boolean; createdCode?: string; productCode?: string };
export type ImportFormState = {
  error?: string;
  rowErrors?: CsvRowError[];
  success?: boolean;
  importedProducts?: number;
  importedItems?: number;
  importedDocs?: number;
};

const MAX_CSV_BYTES = 1024 * 1024; // 1MB
const MAX_CSV_ROWS = 500;

async function audit(entityType: "inventory_item" | "inventory_product", entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType, entityId, field: "*", action, changedBy: staffId, reason } });
}

function revalidate() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/documents");
}

/** Thuộc tính TRẠNG THÁI của lô — sáu thứ định nghĩa "một lô" (cùng sản phẩm, khác một trong sáu = lô khác). */
type LotAttrs = {
  statusCode: ItemStatusCode;
  conditionCode: ItemConditionCode;
  ownerClientId: string | null;
  boundProjectId: string | null;
  expiryDate: Date | null;
  clientDocNo: string | null;
};

type ProductLite = { id: string; code: string; name: string; unit: string | null; isReusable: boolean; partCount: number; catNodeId: string };
const productSelect = { id: true, code: true, name: true, unit: true, isReusable: true, partCount: true, catNodeId: true } as const;

/**
 * Tạo lô cha + phần con cho một sản phẩm, TRONG transaction của caller. Mã lô = {mã SP}.{seq 2 số}; phần con
 * mang cùng seq và mọi thuộc tính lô (guard/filter chạy ở cấp stockable). Trả về mã lô cha.
 */
async function createLotTx(tx: Prisma.TransactionClient, product: ProductLite, attrs: LotAttrs, note: string | null): Promise<{ id: string; code: string; stockableIds: string[] }> {
  const seq = await nextLotSeq(tx, product.id);
  const code = buildLotCode(product.code, seq);
  const base = { ...lotFieldsFromProduct(product), ...attrs, productId: product.id, seq };
  const parent = await tx.inventoryItem.create({ data: { code, note, ...base } });
  const stockableIds: string[] = [];
  if (product.partCount > 1) {
    for (let n = 1; n <= product.partCount; n++) {
      const part = await tx.inventoryItem.create({
        data: { ...base, code: partItemCode(code, n), name: `${product.name} — Phần ${n}`, partCount: 1, parentItemId: parent.id, partNo: n },
      });
      stockableIds.push(part.id);
    }
  } else {
    stockableIds.push(parent.id);
  }
  return { id: parent.id, code, stockableIds };
}

/** Lô đã có CÙNG sản phẩm + CÙNG sáu thuộc tính (đang hoạt động) — lô là tổ hợp thuộc tính, không phải đợt nhập. */
async function findExistingLot(db: Prisma.TransactionClient | typeof prisma, productId: string, attrs: LotAttrs) {
  return db.inventoryItem.findFirst({
    where: { productId, parentItemId: null, isActive: true, ...attrs },
    select: { id: true, code: true },
  });
}

/**
 * Tạo LÔ mới — vào sản phẩm CÓ SẴN (productMode=existing) hoặc kèm tạo SẢN PHẨM MỚI (productMode=new).
 * Mã sinh tự động ở cả hai cấp; người dùng KHÔNG tự đặt mã (quyết định Câu 1+2, 27/07; mã lô v3 18/08/2026).
 */
export async function createItem(_prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  await requirePermission("inventory.item.manage");
  const t = await getTranslations("inventory.items");
  const productMode = String(formData.get("productMode") ?? "new");
  const productId = String(formData.get("productId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const catNodeId = String(formData.get("catNodeId") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const isReusable = formData.get("isReusable") === "on";
  const partCount = Number(formData.get("partCount") ?? 1);
  const statusCode = String(formData.get("statusCode") ?? "").trim().toUpperCase();
  const conditionCode = String(formData.get("conditionCode") ?? "").trim().toUpperCase();
  const ownerClientId = String(formData.get("ownerClientId") ?? "").trim() || null;
  const boundProjectId = String(formData.get("boundProjectId") ?? "").trim() || null;
  const expiryRaw = String(formData.get("expiryDate") ?? "").trim();
  const clientDocNo = String(formData.get("clientDocNo") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!(ITEM_STATUS_CODES as readonly string[]).includes(statusCode) || !(ITEM_CONDITION_CODES as readonly string[]).includes(conditionCode)) {
    return { error: t("errorInvalid") };
  }
  const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
  if (expiryDate && Number.isNaN(expiryDate.getTime())) return { error: t("errorInvalid") };

  // ── Sản phẩm: có sẵn hoặc mới ──
  let existing: ProductLite | null = null;
  let newProduct: Omit<ProductLite, "id" | "code"> | null = null;
  let rootCode = "";
  let rootClientOwned = false;
  if (productMode === "existing") {
    const p = await prisma.inventoryProduct.findUnique({ where: { id: productId }, select: { ...productSelect, isActive: true } });
    if (!p?.isActive) return { error: t("errorInvalid") };
    const root = await resolveRootCategory(p.catNodeId);
    if (!root?.code) return { error: t("errorRootNoCode") };
    existing = p;
    rootCode = root.code;
    rootClientOwned = root.isClientOwned;
  } else {
    if (!name || !catNodeId || !Number.isInteger(partCount) || partCount < 1 || partCount > 4) return { error: t("errorInvalid") };
    const node = await prisma.inventoryCategory.findUnique({ where: { id: catNodeId }, select: { isActive: true } });
    if (!node?.isActive) return { error: t("errorInvalid") };
    const root = await resolveRootCategory(catNodeId);
    // Nhóm gốc phải có mã ĐÚNG 2 ký tự (mã lô v3) — nhóm cũ 1 ký tự chưa đổi thì báo về Settings.
    if (!root?.code || !GROUP_CODE_RE.test(root.code)) return { error: t("errorRootNoCode") };
    newProduct = { name, unit, isReusable, partCount, catNodeId };
    rootCode = root.code;
    rootClientOwned = root.isClientOwned;
  }

  // ── Ràng buộc lô ──
  // K6: boundProjectId = DỰ ÁN SỞ HỮU cho MỌI lô (mua từ chi phí dự án / khách gửi cho dự án) — quyết định team
  // Account nào duyệt việc dùng. Bắt buộc với hàng khách gửi (nhóm isClientOwned), trạng thái P (độc quyền) và C;
  // để trống = "Hàng chung TCM" (mua từ chi phí công ty) — người nhập phải CHỌN tường minh trên form.
  if (statusCode === "C" && !ownerClientId) return { error: t("errorClientRequired") };
  if ((rootClientOwned || statusCode === "P" || statusCode === "C") && !boundProjectId) return { error: t("errorBoundProjectRequired") };
  let resolvedOwnerClientId = ownerClientId;
  if (boundProjectId) {
    const project = await prisma.project.findUnique({ where: { id: boundProjectId }, select: { id: true, clientId: true } });
    if (!project) return { error: t("errorInvalid") };
    // Hàng khách gửi: khách = khách của dự án sở hữu (chọn dự án là hiển nhiên ra khách) — không cho khai lệch.
    if (rootClientOwned) resolvedOwnerClientId = project.clientId;
    else if (ownerClientId && ownerClientId !== project.clientId) return { error: t("errorProjectClientMismatch") };
  }
  if (rootClientOwned && !resolvedOwnerClientId) return { error: t("errorClientRequired") };
  if (resolvedOwnerClientId && !(await prisma.client.findUnique({ where: { id: resolvedOwnerClientId }, select: { id: true } }))) return { error: t("errorInvalid") };

  const attrs: LotAttrs = {
    statusCode: statusCode as ItemStatusCode,
    conditionCode: conditionCode as ItemConditionCode,
    ownerClientId: resolvedOwnerClientId,
    boundProjectId,
    expiryDate,
    clientDocNo,
  };
  // Lô là TỔ HỢP THUỘC TÍNH, không phải đợt nhập: sản phẩm này đã có lô y hệt thì không đẻ lô thứ hai —
  // nhập thêm tồn bằng phiếu NK vào lô sẵn có (resolveTargetLot của phiếu CD/TH cũng gộp đúng như vậy).
  if (existing) {
    const dup = await findExistingLot(prisma, existing.id, attrs);
    if (dup) return { error: t("errorLotExists", { code: dup.code }) };
  }

  let createdCode = "";
  let productCode = existing?.code ?? "";
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await prisma.$transaction(async (tx) => {
          let product: ProductLite;
          if (existing) {
            product = existing;
          } else {
            const seq = await nextProductSeq(tx, rootCode);
            const code = buildProductCode(rootCode, seq);
            const created = await tx.inventoryProduct.create({ data: { code, seq, ...newProduct! }, select: productSelect });
            product = created;
            productCode = created.code;
            await tx.auditLog.create({ data: { entityType: "inventory_product", entityId: created.id, field: "*", action: "CREATE", changedBy: await getCurrentStaffId() } });
          }
          const lot = await createLotTx(tx, product, attrs, note);
          createdCode = lot.code;
          await tx.auditLog.create({ data: { entityType: "inventory_item", entityId: lot.id, field: "*", action: "CREATE", changedBy: await getCurrentStaffId() } });
        });
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message === "SEQ_FULL") return { error: t("errorSeqFull") };
    throw e;
  }
  revalidate();
  return { success: true, createdCode, productCode };
}

/**
 * Sửa SẢN PHẨM: tên / ĐVT / tái sử dụng / ghi chú / active — sản phẩm là nguồn sự thật, lan xuống mọi lô
 * (syncLotsFromProduct). Nhóm + số phần BẤT BIẾN (đã đi vào mã / cấu trúc bộ).
 */
export async function updateProduct(productId: string, _prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  await requirePermission("inventory.item.manage");
  const t = await getTranslations("inventory.items");
  const name = String(formData.get("name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const isReusable = formData.get("isReusable") === "on";
  const isActive = formData.get("isActive") === "on";
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!name) return { error: t("errorInvalid") };

  const product = await prisma.inventoryProduct.findUnique({ where: { id: productId }, include: { lots: { select: { id: true } } } });
  if (!product) return { error: t("errorInvalid") };
  const lotIds = product.lots.map((l) => l.id);

  // Lật isReusable khi còn đồ ở hiện trường làm holding mất nghĩa; ngưng dùng khi còn tồn cũng vậy → chặn.
  if (isReusable !== product.isReusable && lotIds.length) {
    const holding = await prisma.projectHolding.count({ where: { itemId: { in: lotIds }, quantity: { gt: 0 } } });
    if (holding > 0) return { error: t("errorInUse") };
  }
  if (!isActive && product.isActive && lotIds.length) {
    const [stock, holding] = await Promise.all([
      prisma.stockBalance.count({ where: { itemId: { in: lotIds }, quantity: { gt: 0 } } }),
      prisma.projectHolding.count({ where: { itemId: { in: lotIds }, quantity: { gt: 0 } } }),
    ]);
    if (stock > 0 || holding > 0) return { error: t("errorInUse") };
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventoryProduct.update({ where: { id: productId }, data: { name, unit, isReusable, isActive, note } });
    await syncLotsFromProduct(tx, productId, { name, unit, isReusable });
    // Ngưng dùng sản phẩm = ngưng mọi lô của nó (kể cả phần con). Bật lại thì KHÔNG bật lại lô — admin
    // bật từng lô, để không đè lên lô đã cố ý tắt riêng.
    if (!isActive && product.isActive) await tx.inventoryItem.updateMany({ where: { productId }, data: { isActive: false } });
  });
  await audit("inventory_product", productId, "UPDATE");
  revalidate();
  return { success: true };
}

/**
 * Sửa LÔ: CHỈ trường trạng thái không đi qua phiếu (active, hạn dùng, số phiếu KH, ghi chú). Tên/ĐVT/tái sử
 * dụng sửa ở SẢN PHẨM; trạng thái/tình trạng đổi qua phiếu CHUYỂN ĐỔI LÔ; chủ sở hữu/dự án cố định theo lô.
 */
export async function updateItem(itemId: string, _prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  await requirePermission("inventory.item.manage");
  const t = await getTranslations("inventory.items");
  const isActive = formData.get("isActive") === "on";
  const expiryRaw = String(formData.get("expiryDate") ?? "").trim();
  const clientDocNo = String(formData.get("clientDocNo") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
  if (expiryDate && Number.isNaN(expiryDate.getTime())) return { error: t("errorInvalid") };

  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, include: { parts: { select: { id: true } } } });
  if (!item || item.parentItemId) return { error: t("errorInvalid") };

  const affectedIds = [itemId, ...item.parts.map((p) => p.id)];
  if (!isActive && item.isActive) {
    const [stock, holding] = await Promise.all([
      prisma.stockBalance.count({ where: { itemId: { in: affectedIds }, quantity: { gt: 0 } } }),
      prisma.projectHolding.count({ where: { itemId: { in: affectedIds }, quantity: { gt: 0 } } }),
    ]);
    if (stock > 0 || holding > 0) return { error: t("errorInUse") };
  }

  // K4: đổi hạn dùng thì XOÁ mốc đã cảnh báo — không xoá thì lô lùi hạn (nhập lại date xa hơn) vẫn
  // mang mốc cũ và thang cảnh báo sẽ câm cho tới khi vượt mức đã bắn.
  const expiryChanged = (item.expiryDate?.getTime() ?? null) !== (expiryDate?.getTime() ?? null);
  const data = { isActive, expiryDate, clientDocNo, ...(expiryChanged ? { expiryReminderLevel: null } : {}) };
  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({ where: { id: itemId }, data: { ...data, note } });
    if (item.parts.length > 0) await tx.inventoryItem.updateMany({ where: { parentItemId: itemId }, data });
  });
  await audit("inventory_item", itemId, "UPDATE");
  revalidate();
  return { success: true };
}

/**
 * Import CSV kiểm kê (mã lô v3): mỗi dòng = (lô × kho). Sản phẩm: cột "Mã SP" trỏ sản phẩm có sẵn, hoặc để
 * trống → tìm theo (nhóm gốc, tên) rồi tạo mới nếu chưa có. Các dòng cùng (sản phẩm + tổ hợp thuộc tính)
 * gom thành MỘT lô; lô y hệt đã có trong DB thì cộng tồn vào lô đó (kiểm kê ghi số đếm, không đẻ lô trùng).
 * Mỗi kho một phiếu NK. All-or-nothing như cũ.
 */
export async function importItemsCsv(_prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  await requirePermission("inventory.import_csv");
  const t = await getTranslations("inventory.items");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_CSV_BYTES) return { error: t("errorInvalid") };

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows, errors } = parseInventoryCsv(buffer);
  if (rows.length > MAX_CSV_ROWS) return { error: t("errorInvalid") };

  const rowErrors: CsvRowError[] = [...errors];
  type ResolvedRow = ParsedInventoryRow & {
    /** id sản phẩm có sẵn, hoặc "new:{rootId}‖{tên thường}" cho sản phẩm sẽ tạo */
    productKey: string;
    existingProduct: ProductLite | null;
    catNodeId: string;
    rootCode: string;
    rootClientOwned: boolean;
    clientId: string | null;
    /** K6: dự án sở hữu (null = hàng chung TCM) */
    projectId: string | null;
  };
  const resolved: ResolvedRow[] = [];
  if (rows.length > 0) {
    const [nodes, clients, warehouses, products, projects] = await Promise.all([
      prisma.inventoryCategory.findMany({ where: { isActive: true } }),
      prisma.client.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
      prisma.warehouse.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
      prisma.inventoryProduct.findMany({ where: { isActive: true }, select: productSelect }),
      prisma.project.findMany({ select: { id: true, code: true, clientId: true } }),
    ]);
    const projectByCode = new Map(projects.map((pr) => [pr.code.toUpperCase(), pr]));
    const roots = new Map(nodes.filter((n) => !n.parentId && n.code).map((n) => [n.code!.toUpperCase(), n]));
    const byName = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const key = n.name.toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(n);
      byName.set(key, list);
    }
    const parentById = new Map(nodes.map((n) => [n.id, n.parentId] as const));
    const rootOf = (id: string): (typeof nodes)[number] | null => {
      let cur: string | null = id;
      for (let hop = 0; cur && hop < 4; hop++) {
        const parent: string | null = parentById.get(cur) ?? null;
        if (!parent) return nodes.find((n) => n.id === cur) ?? null;
        cur = parent;
      }
      return null;
    };
    const clientByCode = new Map(clients.map((c) => [c.code.toUpperCase(), c.id]));
    const whByCode = new Map(warehouses.map((w) => [w.code, w.id]));
    const productByCode = new Map(products.map((p) => [p.code.toUpperCase(), p]));
    // Tìm sản phẩm có sẵn theo (nhóm GỐC, tên thường) — nhập tồn đầu kỳ chưa có mã, tên là khoá thực tế duy nhất.
    const productByRootName = new Map<string, ProductLite>();
    for (const p of products) {
      const r = rootOf(p.catNodeId);
      if (r) productByRootName.set(`${r.id}‖${p.name.trim().toLowerCase()}`, p);
    }

    for (const r of rows) {
      let existingProduct: ProductLite | null = null;
      let node: (typeof nodes)[number] | null = null;
      if (r.productCode) {
        existingProduct = productByCode.get(r.productCode) ?? null;
        if (!existingProduct) {
          rowErrors.push({ line: r.line, message: "UNKNOWN_PRODUCT" });
          continue;
        }
        node = nodes.find((n) => n.id === existingProduct!.catNodeId) ?? null;
      } else {
        // Nhóm: khớp code node gốc trước, sau đó tên node bất kỳ (trùng tên → bắt ghi rõ hơn)
        node = roots.get(r.categoryRef.toUpperCase()) ?? null;
        if (!node) {
          const matches = byName.get(r.categoryRef.toLowerCase()) ?? [];
          if (matches.length > 1) {
            rowErrors.push({ line: r.line, message: "AMBIGUOUS_CATEGORY" });
            continue;
          }
          node = matches[0] ?? null;
        }
      }
      if (!node) {
        rowErrors.push({ line: r.line, message: "UNKNOWN_CATEGORY" });
        continue;
      }
      const root = rootOf(node.id);
      if (!root?.code || !GROUP_CODE_RE.test(root.code)) {
        rowErrors.push({ line: r.line, message: "UNKNOWN_CATEGORY" });
        continue;
      }
      if (!existingProduct) existingProduct = productByRootName.get(`${root.id}‖${r.name.trim().toLowerCase()}`) ?? null;
      // K6: dự án sở hữu — bắt buộc với hàng khách gửi + trạng thái P/C; trống = hàng chung TCM.
      let projectId: string | null = null;
      let projectClientId: string | null = null;
      if (r.projectCode) {
        const pr = projectByCode.get(r.projectCode);
        if (!pr) {
          rowErrors.push({ line: r.line, message: "UNKNOWN_PROJECT" });
          continue;
        }
        projectId = pr.id;
        projectClientId = pr.clientId;
      } else if (root.isClientOwned || r.statusCode === "P" || r.statusCode === "C") {
        rowErrors.push({ line: r.line, message: "MISSING_PROJECT" });
        continue;
      }
      let clientId: string | null = null;
      if (r.clientCode) {
        clientId = clientByCode.get(r.clientCode) ?? null;
        if (!clientId) {
          rowErrors.push({ line: r.line, message: "UNKNOWN_CLIENT" });
          continue;
        }
        // Khách khai tay phải là khách của dự án sở hữu — không cho hàng của khách này gắn dự án của khách khác.
        if (projectClientId && clientId !== projectClientId) {
          rowErrors.push({ line: r.line, message: "PROJECT_CLIENT_MISMATCH" });
          continue;
        }
      } else if (root.isClientOwned) {
        clientId = projectClientId; // hàng khách gửi: khách suy từ dự án
      } else if (r.statusCode === "C") {
        rowErrors.push({ line: r.line, message: "MISSING_CLIENT" });
        continue;
      }
      if (!whByCode.has(r.warehouseCode)) {
        rowErrors.push({ line: r.line, message: "UNKNOWN_WAREHOUSE" });
        continue;
      }
      const productKey = existingProduct ? existingProduct.id : `new:${root.id}‖${r.name.trim().toLowerCase()}`;
      resolved.push({ ...r, productKey, existingProduct, catNodeId: existingProduct?.catNodeId ?? node.id, rootCode: root.code, rootClientOwned: root.isClientOwned, clientId, projectId });
    }

    // Nhất quán trong cùng SẢN PHẨM (ĐVT / tái sử dụng / số phần / node) + không trùng (lô, kho)
    const byProduct = new Map<string, ResolvedRow[]>();
    for (const r of resolved) byProduct.set(r.productKey, [...(byProduct.get(r.productKey) ?? []), r]);
    for (const list of byProduct.values()) {
      // Sản phẩm CÓ SẴN là nguồn sự thật: dòng khai ĐVT/tái sử dụng/số phần khác nó thì phải sửa dòng.
      const ref = list[0].existingProduct
        ? { unit: list[0].existingProduct.unit ?? "", isReusable: list[0].existingProduct.isReusable, partCount: list[0].existingProduct.partCount, catNodeId: list[0].existingProduct.catNodeId }
        : { unit: list[0].unit, isReusable: list[0].isReusable, partCount: list[0].partCount, catNodeId: list[0].catNodeId };
      const seenLotWh = new Set<string>();
      for (const r of list) {
        const declared = !!r.productCode; // có Mã SP → 4 cột kia bị bỏ qua, không so
        if (!declared && ((r.unit || "") !== (ref.unit || "") || r.isReusable !== ref.isReusable || r.partCount !== ref.partCount || r.catNodeId !== ref.catNodeId)) {
          rowErrors.push({ line: r.line, message: "INCONSISTENT_PRODUCT" });
          continue;
        }
        const k = `${lotKey(r.productKey, r)}‖${r.warehouseCode}`;
        if (seenLotWh.has(k)) rowErrors.push({ line: r.line, message: "DUPLICATE_ROW" });
        seenLotWh.add(k);
      }
    }
  }
  if (rowErrors.length > 0 || resolved.length === 0) {
    return { rowErrors: rowErrors.sort((a, b) => a.line - b.line) };
  }

  const warehouses = await prisma.warehouse.findMany({ where: { isActive: true }, select: { id: true, code: true } });
  const whByCode = new Map(warehouses.map((w) => [w.code, w.id]));
  const staffId = await getCurrentStaffId();
  const sourceFileKey = await saveChatAttachment(buffer, "text/csv");
  const now = new Date();

  const byProduct = new Map<string, ResolvedRow[]>();
  for (const r of resolved) byProduct.set(r.productKey, [...(byProduct.get(r.productKey) ?? []), r]);

  let importedDocs = 0;
  let importedProducts = 0;
  let importedLots = 0;
  // Retry P2002 (max 3): nextDocCode count-based + nextProductSeq/nextLotSeq đều có race với request khác — retry tính lại.
  const runImport = async () => await prisma.$transaction(async (tx) => {
    importedDocs = 0;
    importedProducts = 0;
    importedLots = 0;
    const byWarehouse = new Map<string, { itemId: string; quantity: number }[]>();
    for (const list of byProduct.values()) {
      const g = list[0];
      let product: ProductLite;
      if (g.existingProduct) {
        product = g.existingProduct;
      } else {
        const seq = await nextProductSeq(tx, g.rootCode);
        product = await tx.inventoryProduct.create({
          data: { code: buildProductCode(g.rootCode, seq), seq, name: g.name.trim(), catNodeId: g.catNodeId, unit: g.unit || null, isReusable: g.isReusable, partCount: g.partCount, note: g.note || null },
          select: productSelect,
        });
        importedProducts++;
      }
      // Gom lô trong sản phẩm này
      const lots = new Map<string, ResolvedRow[]>();
      for (const r of list) {
        const k = lotKey(r.productKey, r);
        lots.set(k, [...(lots.get(k) ?? []), r]);
      }
      for (const rowsOfLot of lots.values()) {
        const l = rowsOfLot[0];
        const attrs: LotAttrs = {
          statusCode: l.statusCode as ItemStatusCode,
          conditionCode: l.conditionCode as ItemConditionCode,
          ownerClientId: l.clientId,
          boundProjectId: l.projectId,
          expiryDate: l.expiryRaw ? new Date(l.expiryRaw) : null,
          clientDocNo: l.clientDocNo || null,
        };
        let stockables: string[];
        const dup = await findExistingLot(tx, product.id, attrs);
        if (dup) {
          const parts = await tx.inventoryItem.findMany({ where: { parentItemId: dup.id }, select: { id: true } });
          stockables = parts.length ? parts.map((p) => p.id) : [dup.id];
        } else {
          const created = await createLotTx(tx, product, attrs, l.note || null);
          stockables = created.stockableIds;
          importedLots++;
        }
        for (const r of rowsOfLot) {
          if (r.quantity <= 0) continue;
          const whId = whByCode.get(r.warehouseCode)!;
          const linesForWh = byWarehouse.get(whId) ?? [];
          // Dòng bộ: Số lượng = số BỘ đủ → credit số đó cho TỪNG phần
          for (const itemId of stockables) linesForWh.push({ itemId, quantity: r.quantity });
          byWarehouse.set(whId, linesForWh);
        }
      }
    }
    for (const [warehouseId, docLines] of byWarehouse.entries()) {
      const code = await nextDocCode(tx, "IMPORT", now);
      await tx.stockDocument.create({
        data: {
          code,
          type: "IMPORT",
          status: "COMPLETED",
          toWarehouseId: warehouseId,
          note: `Import CSV: ${file.name}`,
          createdById: staffId,
          lines: { create: docLines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, sort: i })) },
        },
      });
      for (const l of docLines) await creditBalance(tx, warehouseId, l.itemId, l.quantity);
      importedDocs++;
    }
  });
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await runImport();
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message === "SEQ_FULL") return { error: t("errorSeqFull") };
    throw e;
  }

  await prisma.auditLog.create({
    data: {
      entityType: "inventory_import",
      entityId: sourceFileKey,
      field: "*",
      action: "CREATE",
      changedBy: staffId,
      newValue: JSON.stringify({ file: file.name, products: importedProducts, lots: importedLots, docs: importedDocs }),
    },
  });
  revalidate();
  return { success: true, importedProducts, importedItems: importedLots, importedDocs };
}
