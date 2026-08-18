"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import {
  ITEM_CONDITION_CODES,
  ITEM_STATUS_CODES,
  InsufficientStockError,
  closeCampaignIfSettled,
  utcMidnightToday,
  buildLotCode,
  creditBalance,
  creditHolding,
  debitBalance,
  debitHolding,
  expiryLevel,
  lotFieldsFromProduct,
  nextDocCode,
  nextLotSeq,
  partItemCode,
  type DocType,
  type ItemConditionCode,
  type ItemStatusCode,
} from "@/lib/inventory";
import { hasPermission, requirePermission } from "@/lib/permissions";

export type DocFormState = { error?: string; success?: boolean };

type LineInput = {
  itemId: string;
  quantity: number;
  note?: string;
  /** K5 — phiếu trả về kho: trạng thái/tình trạng THỰC TẾ lúc hàng về, khác nguồn thì sinh lô đích. */
  toStatus?: ItemStatusCode;
  toCond?: ItemConditionCode;
};

async function audit(entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType: "stock_document", entityId, field: "*", action, changedBy: staffId, reason } });
}

function revalidate() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/documents");
  revalidatePath("/reminders");
}

/** Parse + validate dòng hàng chung: item tồn tại, active, stockable, không trùng; qty nguyên ≠ 0 (âm chỉ cho ADJUST). */
async function parseLines(
  formData: FormData,
  opts: { allowNegative: boolean; allowRedeclare?: boolean }
): Promise<{ lines: LineInput[]; error?: string }> {
  const t = await getTranslations("inventory.documents");
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("linesJson") ?? "[]"));
  } catch {
    return { lines: [], error: t("errorInvalid") };
  }
  if (!Array.isArray(raw) || raw.length === 0) return { lines: [], error: t("errorNoLines") };

  const lines: LineInput[] = [];
  const seen = new Set<string>();
  for (const l of raw) {
    const itemId = typeof l?.itemId === "string" ? l.itemId : "";
    const quantity = Number(l?.quantity);
    const note = typeof l?.note === "string" && l.note.trim() !== "" ? l.note.trim() : undefined;
    // K5: phiếu trả cho phép MỘT lô nguồn về thành NHIỀU tình trạng, nên khoá chống trùng là CẶP
    // (item, trạng thái đích, tình trạng đích). Phiếu khác giữ nguyên khoá theo item như trước.
    const toStatus = opts.allowRedeclare && typeof l?.toStatus === "string" ? l.toStatus : "";
    const toCond = opts.allowRedeclare && typeof l?.toCond === "string" ? l.toCond : "";
    if (toStatus !== "" || toCond !== "") {
      if (!(ITEM_STATUS_CODES as readonly string[]).includes(toStatus) || !(ITEM_CONDITION_CODES as readonly string[]).includes(toCond)) {
        return { lines: [], error: t("errorInvalid") };
      }
    }
    const key = opts.allowRedeclare ? `${itemId}|${toStatus}|${toCond}` : itemId;
    if (!itemId || seen.has(key) || !Number.isInteger(quantity) || quantity === 0 || (!opts.allowNegative && quantity < 0)) {
      return { lines: [], error: t("errorInvalid") };
    }
    seen.add(key);
    lines.push({
      itemId,
      quantity,
      note,
      ...(toStatus ? { toStatus: toStatus as ItemStatusCode, toCond: toCond as ItemConditionCode } : {}),
    });
  }
  // Đếm theo item PHÂN BIỆT: cùng một lô có thể xuất hiện trên nhiều dòng (K5, mỗi dòng một tình trạng đích).
  const distinctIds = [...new Set(lines.map((l) => l.itemId))];
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: distinctIds } },
    select: { id: true, isActive: true, partCount: true },
  });
  if (items.length !== distinctIds.length || items.some((i) => !i.isActive || i.partCount !== 1)) {
    return { lines: [], error: t("errorInvalid") };
  }
  return { lines };
}

/** Tạo phiếu với retry mã trùng (count-based nextDocCode có race — P2002 tối đa 3 lần). */
async function createDocWithRetry<T>(fn: (attempt: number) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
}

async function insufficientMessage(itemId: string): Promise<string> {
  const t = await getTranslations("inventory.documents");
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { code: true, name: true } });
  return t("errorInsufficient", { item: item ? `${item.name} (${item.code})` : itemId });
}

// ── NHẬP KHO / ĐIỀU CHỈNH — COMPLETED ngay ───────────────

async function createInboundDoc(type: DocType, _prev: DocFormState, formData: FormData): Promise<DocFormState> {
  const t = await getTranslations("inventory.documents");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!warehouseId) return { error: t("errorInvalid") };
  const { lines, error } = await parseLines(formData, { allowNegative: type === "ADJUST" });
  if (error) return { error };

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await createDocWithRetry(() =>
      prisma.$transaction(async (tx) => {
        const code = await nextDocCode(tx, type, new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type,
            status: "COMPLETED",
            toWarehouseId: warehouseId,
            note,
            createdById: staffId,
            lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
          },
        });
        for (const l of lines) {
          if (l.quantity > 0) await creditBalance(tx, warehouseId, l.itemId, l.quantity);
          else await debitBalance(tx, warehouseId, l.itemId, -l.quantity);
        }
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof InsufficientStockError) return { error: await insufficientMessage(e.itemId) };
    throw e;
  }
  await audit(docId, "CREATE");
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

/** Nhập kho TRỰC TIẾP (kiểm kê, tồn đầu kỳ) — thủ kho tự làm; hàng có người báo về đi qua đề xuất DN. */
export async function createImportDoc(prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.intake.confirm");
  return createInboundDoc("IMPORT", prev, formData);
}
export async function createAdjustDoc(prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.doc.create");
  return createInboundDoc("ADJUST", prev, formData);
}

// ── CHUYỂN KHO — nhận / huỷ phiếu CK ─────────────────────
// Phiếu do THỦ KHO sinh ra khi chốt lệnh điều chuyển đã duyệt (inventory/requests, K4); ở đây chỉ
// còn hai đầu kia của vòng đời: kho đích nhận đủ/thiếu, hoặc huỷ hoàn tồn về kho nguồn.

export async function confirmTransferReceive(docId: string, _prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.transfer.confirm");
  const t = await getTranslations("inventory.documents");
  const doc = await prisma.stockDocument.findUnique({ where: { id: docId }, include: { lines: true } });
  if (!doc || doc.type !== "TRANSFER" || !doc.toWarehouseId) return { error: t("errorInvalid") };

  // Số thực nhận từng dòng: mặc định = SL gửi; 0 ≤ nhận ≤ gửi
  const received = new Map<string, number>();
  for (const l of doc.lines) {
    const raw = formData.get(`received_${l.id}`);
    const r = raw === null || String(raw).trim() === "" ? l.quantity : Number(raw);
    if (!Number.isInteger(r) || r < 0 || r > l.quantity) return { error: t("errorInvalid") };
    received.set(l.id, r);
  }

  const staffId = await getCurrentStaffId();
  const done = await prisma.$transaction(async (tx) => {
    // Guard idempotent: chỉ 1 request thắng khi double-submit (2 tab cùng bấm)
    const res = await tx.stockDocument.updateMany({
      where: { id: docId, status: "PENDING" },
      data: { status: "COMPLETED", confirmedById: staffId, confirmedAt: new Date() },
    });
    if (res.count === 0) return false;
    for (const l of doc.lines) {
      const r = received.get(l.id)!;
      await tx.stockDocumentLine.update({ where: { id: l.id }, data: { receivedQuantity: r } });
      if (r > 0) await creditBalance(tx, doc.toWarehouseId!, l.itemId, r);
    }
    return true;
  });
  if (!done) return { error: t("errorAlreadyProcessed") };
  await audit(docId, "UPDATE", "confirm receive");
  revalidate();
  return { success: true };
}

export async function cancelTransfer(docId: string, _prev: DocFormState, _formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.transfer.cancel");
  const t = await getTranslations("inventory.documents");
  const doc = await prisma.stockDocument.findUnique({ where: { id: docId }, include: { lines: true } });
  if (!doc || doc.type !== "TRANSFER" || !doc.fromWarehouseId) return { error: t("errorInvalid") };

  const staffId = await getCurrentStaffId();
  const done = await prisma.$transaction(async (tx) => {
    const res = await tx.stockDocument.updateMany({
      where: { id: docId, status: "PENDING" },
      data: { status: "CANCELED", canceledById: staffId, canceledAt: new Date() },
    });
    if (res.count === 0) return false;
    for (const l of doc.lines) await creditBalance(tx, doc.fromWarehouseId!, l.itemId, l.quantity);
    return true;
  });
  if (!done) return { error: t("errorAlreadyProcessed") };
  await audit(docId, "UPDATE", "cancel transfer");
  revalidate();
  return { success: true };
}

// ── TRẢ VỀ KHO — 1 bước, gắn dự án ───────────────────────
// XUẤT KHO nay đi qua tầng đề xuất (K2): inventory/requests — thủ kho xác nhận mới sinh phiếu XE.
//
// K5 — KHAI LẠI TRẠNG THÁI/TÌNH TRẠNG LÚC VỀ (quyết định Câu 6): hàng ra hiện trường xong hiếm khi
// về nguyên như lúc đi. Mỗi dòng khai được trạng thái + tình trạng THỰC TẾ; khác nguồn thì số lượng
// chạy sang LÔ ĐÍCH (mã mới) thay vì quay lại mã cũ — đúng nguyên tắc Câu 2 "mã luôn nói đúng sự
// thật về hàng", không sửa trạng thái tại chỗ.
//
// ⚠ BẤT BIẾN KHÔNG ĐƯỢC PHÁ: `line.itemId` LUÔN là lô NGUỒN, lô đích ghi ở `convertToItemId`.
// Ba hệ thống hạ nguồn khoá cứng vào đó và sẽ sai THẦM LẶNG nếu đảo hai vế:
//   · nhả trần giữ chỗ K3 (reserveFreeByItem, requests/actions.ts) khoá theo (dự án, itemId)
//   · cột "đã trả kho" của bảng tiêu hao K4 (getProjectConsumption) gom theo itemId
//   · debitHolding khoá theo (dự án, itemId) — truyền lô đích là ném InsufficientStockError
//
// Ai được khai lại: giữ `inventory.doc.create` ở đầu để đường TRẢ NGUYÊN LÔ vẫn mở cho mọi vai —
// đó là lối thoát kỳ chiến dịch 15 ngày, người bị nhắc quá hạn phải tự bấm được. Riêng phần ĐỔI LÔ
// đòi thêm `inventory.lot.convert` kiểm bằng hasPermission BÊN TRONG action (mirror mẫu
// finance.vendor_payment.over_cap, HANDOVER mục 10.1) — không thì đặc quyền phân loại lại của thủ
// kho bị nới ngầm từ 2 vai lên 21 vai và phiếu chuyển đổi thành trang trí.

export async function createReturnDoc(_prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.doc.create");
  const t = await getTranslations("inventory.documents");
  const toWarehouseId = String(formData.get("toWarehouseId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!toWarehouseId || !projectId) return { error: t("errorInvalid") };
  const { lines, error } = await parseLines(formData, { allowNegative: false, allowRedeclare: true });
  if (error) return { error };

  // Dòng nào thật sự ĐỔI lô? (khai trùng trạng thái+tình trạng nguồn = trả nguyên lô, không đổi gì)
  const sources = await prisma.inventoryItem.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.itemId))] } },
    include: { parts: { orderBy: { partNo: "asc" } }, ownerClient: { select: { code: true } } },
  });
  const srcById = new Map(sources.map((s) => [s.id, s]));
  const redeclared = lines.filter((l) => {
    const src = srcById.get(l.itemId);
    return !!l.toStatus && !!src && (src.statusCode !== l.toStatus || src.conditionCode !== l.toCond);
  });

  if (redeclared.length > 0) {
    if (!(await hasPermission("inventory.lot.convert"))) return { error: t("errorRedeclareForbidden") };
    for (const l of redeclared) {
      const src = srcById.get(l.itemId)!;
      // Phần con của bộ tách phần: khai lại phải chạy cả bộ, không lẻ từng phần (guard giống phiếu CD)
      if (src.parentItemId) return { error: t("errorConvertPart", { item: src.code }) };
      if (!src.productId || !src.statusCode || !src.conditionCode) return { error: t("errorConvertLegacy", { item: src.code }) };
    }
  }
  const redeclaredSet = new Set(redeclared);

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await createDocWithRetry(() =>
      prisma.$transaction(async (tx) => {
        // Lô đích giải trước, để dòng phiếu ghi được convertToItemId ngay lúc tạo
        const ledger: { itemId: string; convertToItemId: string | null; quantity: number; note?: string }[] = [];
        for (const l of lines) {
          if (!redeclaredSet.has(l)) {
            ledger.push({ itemId: l.itemId, convertToItemId: null, quantity: l.quantity, note: l.note });
            continue;
          }
          const src = srcById.get(l.itemId)!;
          const target = await resolveTargetLot(tx, src, l.toStatus!, l.toCond!);
          ledger.push({ itemId: l.itemId, convertToItemId: target.id, quantity: l.quantity, note: l.note });
        }

        const code = await nextDocCode(tx, "RETURN", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "RETURN",
            status: "COMPLETED",
            toWarehouseId,
            projectId,
            note,
            createdById: staffId,
            lines: { create: ledger.map((l, i) => ({ ...l, sort: i })) },
          },
        });
        for (const l of ledger) {
          await debitHolding(tx, projectId, l.itemId, l.quantity); // guard: không trả quá số đang giữ
          await creditBalance(tx, toWarehouseId, l.convertToItemId ?? l.itemId, l.quantity);
        }
        await closeCampaignIfSettled(tx, projectId); // K4 — hàng về hết thì kỳ chiến dịch đóng
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof InsufficientStockError) return { error: await insufficientMessage(e.itemId) };
    if (e instanceof Error && e.message === "SEQ_FULL") return { error: t("errorSeqFull") };
    throw e;
  }
  await audit(docId, "CREATE");
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

// ── K4: BÁO MẤT / HỎNG Ở HIỆN TRƯỜNG (LOSS) ──────────────
// Trừ holding NHƯNG KHÔNG cộng lại kho — hàng không còn nữa. Đây là LỐI THOÁT bắt buộc của kỳ
// chiến dịch: guard chống âm khiến đồ mất không trả về được, không có phiếu này thì holding kẹt
// vĩnh viễn và dự án bị khoá khỏi mọi lệnh xuất mới sau 15 ngày.

export async function createLossDoc(_prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.destroy"); // cùng nghĩa "ghi giảm tài sản" với xuất hủy
  const t = await getTranslations("inventory.documents");
  const projectId = String(formData.get("projectId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!projectId) return { error: t("errorInvalid") };
  if (!note) return { error: t("errorReasonRequired") };
  const { lines, error } = await parseLines(formData, { allowNegative: false });
  if (error) return { error };

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await createDocWithRetry(() =>
      prisma.$transaction(async (tx) => {
        const code = await nextDocCode(tx, "LOSS", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "LOSS",
            status: "COMPLETED",
            projectId,
            note,
            createdById: staffId,
            lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
          },
        });
        for (const l of lines) await debitHolding(tx, projectId, l.itemId, l.quantity);
        await closeCampaignIfSettled(tx, projectId);
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof InsufficientStockError) return { error: await insufficientMessage(e.itemId) };
    throw e;
  }
  await audit(docId, "CREATE", note);
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

// ── K4: CHUYỂN ĐỒ HIỆN TRƯỜNG GIỮA 2 DỰ ÁN (HOLDING) ─────
// Hàng đang ở site dự án A chuyển thẳng sang dự án B, KHÔNG quay về kho (quyết định Câu 7).
// 2 bước như chuyển kho: gửi trừ holding A ngay, bên B xác nhận mới cộng. Tồn kho KHÔNG đổi.
// CỐ Ý không cho nhận thiếu: phần hụt là mất mát phải có chứng từ → phiếu BM của bên A.

export async function createHoldingTransfer(_prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.documents");
  const fromProjectId = String(formData.get("fromProjectId") ?? "");
  const projectId = String(formData.get("projectId") ?? ""); // dự án NHẬN
  const expectedReturnRaw = String(formData.get("expectedReturnAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!fromProjectId || !projectId) return { error: t("errorInvalid") };
  if (fromProjectId === projectId) return { error: t("errorSameProject") };
  const { lines, error } = await parseLines(formData, { allowNegative: false });
  if (error) return { error };

  const [target, items] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { status: true } }),
    prisma.inventoryItem.findMany({
      where: { id: { in: lines.map((l) => l.itemId) } },
      select: { id: true, code: true, expiryDate: true, ownerClientId: true, boundProjectId: true },
    }),
  ]);
  if (!target || !(EXECUTION_STATUS_CODES as readonly string[]).includes(target.status.code)) return { error: t("errorProjectRequired") };

  const expired = items.filter((i) => expiryLevel(i.expiryDate, new Date()) === "EXPIRED");
  if (expired.length > 0) return { error: t("errorExpired", { items: expired.map((i) => i.code).join(", ") }) };
  const wrongProject = items.filter((i) => i.boundProjectId && i.boundProjectId !== projectId);
  if (wrongProject.length > 0) return { error: t("errorBoundOtherProject", { items: wrongProject.map((i) => i.code).join(", ") }) };
  const wrongClient = items.filter((i) => i.ownerClientId && i.ownerClientId !== target.clientId);
  if (wrongClient.length > 0) return { error: t("errorOtherClientGoods", { items: wrongClient.map((i) => i.code).join(", ") }) };

  // Hạn trả MỚI bắt buộc: bộ nhắc trả đồ neo vào phiếu, không có hạn thì hàng rơi khỏi radar.
  const expectedReturnAt = expectedReturnRaw ? new Date(expectedReturnRaw) : null;
  if (!expectedReturnAt || Number.isNaN(expectedReturnAt.getTime())) return { error: t("errorReturnRequired") };

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await createDocWithRetry(() =>
      prisma.$transaction(async (tx) => {
        const code = await nextDocCode(tx, "HOLDING", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "HOLDING",
            status: "PENDING",
            fromProjectId,
            projectId,
            expectedReturnAt,
            note,
            createdById: staffId,
            lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
          },
        });
        for (const l of lines) await debitHolding(tx, fromProjectId, l.itemId, l.quantity);
        // CỐ Ý không chốt kỳ của bên gửi ở đây: phiếu còn PENDING thì đồ chưa thật sự đi.
        // Chốt sớm rồi huỷ sẽ mở lại kỳ bằng ngày hôm nay = reset đồng hồ 15 ngày.
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof InsufficientStockError) return { error: await insufficientMessage(e.itemId) };
    throw e;
  }
  await audit(docId, "CREATE");
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

/** Bên NHẬN xác nhận — nhận ĐỦ hoặc huỷ, không có nhận thiếu (phần hụt phải đi qua phiếu BM của bên gửi). */
export async function confirmHoldingReceive(docId: string, _prev: DocFormState, _formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.documents");
  const doc = await prisma.stockDocument.findUnique({ where: { id: docId }, include: { lines: true } });
  if (!doc || doc.type !== "HOLDING" || !doc.projectId) return { error: t("errorInvalid") };

  const staffId = await getCurrentStaffId();
  const done = await prisma.$transaction(async (tx) => {
    const res = await tx.stockDocument.updateMany({
      where: { id: docId, status: "PENDING" },
      data: { status: "COMPLETED", confirmedById: staffId, confirmedAt: new Date() },
    });
    if (res.count === 0) return false;
    for (const l of doc.lines) {
      await creditHolding(tx, doc.projectId!, l.itemId, l.quantity);
      await tx.stockDocumentLine.update({ where: { id: l.id }, data: { receivedQuantity: l.quantity } });
    }
    // Bên nhận bắt đầu giữ đồ → mở kỳ chiến dịch cho họ nếu chưa có.
    await tx.project.updateMany({
      where: { id: doc.projectId!, stockCampaignOpenedAt: null },
      data: { stockCampaignOpenedAt: utcMidnightToday() },
    });
    // Giờ đồ mới thật sự rời bên gửi → chốt kỳ của họ nếu đã trả hết.
    if (doc.fromProjectId) await closeCampaignIfSettled(tx, doc.fromProjectId);
    return true;
  });
  if (!done) return { error: t("errorAlreadyProcessed") };
  await audit(docId, "UPDATE", "confirm holding receive");
  revalidate();
  return { success: true };
}

export async function cancelHoldingTransfer(docId: string, _prev: DocFormState, _formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.documents");
  const doc = await prisma.stockDocument.findUnique({ where: { id: docId }, include: { lines: true } });
  if (!doc || doc.type !== "HOLDING" || !doc.fromProjectId) return { error: t("errorInvalid") };

  const staffId = await getCurrentStaffId();
  const done = await prisma.$transaction(async (tx) => {
    const res = await tx.stockDocument.updateMany({
      where: { id: docId, status: "PENDING" },
      data: { status: "CANCELED", canceledById: staffId, canceledAt: new Date() },
    });
    if (res.count === 0) return false;
    for (const l of doc.lines) await creditHolding(tx, doc.fromProjectId!, l.itemId, l.quantity); // hoàn ĐỦ về bên gửi
    return true; // kỳ của bên gửi chưa từng bị đóng (xem createHoldingTransfer) → ngày mở gốc giữ nguyên
  });
  if (!done) return { error: t("errorAlreadyProcessed") };
  await audit(docId, "UPDATE", "cancel holding transfer");
  revalidate();
  return { success: true };
}

// ── KHO V2: XUẤT HỦY (DESTROY) — 1 bước, bắt buộc lý do ──
// Đường ra DUY NHẤT cho hàng hết hạn / trạng thái D. K2 siết về quyền thủ kho riêng.

export async function createDestroyDoc(_prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.destroy");
  const t = await getTranslations("inventory.documents");
  const fromWarehouseId = String(formData.get("fromWarehouseId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!fromWarehouseId) return { error: t("errorInvalid") };
  if (!note) return { error: t("errorReasonRequired") };
  const { lines, error } = await parseLines(formData, { allowNegative: false });
  if (error) return { error };

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await createDocWithRetry(() =>
      prisma.$transaction(async (tx) => {
        const code = await nextDocCode(tx, "DESTROY", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "DESTROY",
            status: "COMPLETED",
            fromWarehouseId,
            note,
            createdById: staffId,
            lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
          },
        });
        for (const l of lines) await debitBalance(tx, fromWarehouseId, l.itemId, l.quantity);
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof InsufficientStockError) return { error: await insufficientMessage(e.itemId) };
    throw e;
  }
  await audit(docId, "CREATE", note);
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

// ── KHO V2: CHUYỂN ĐỔI LÔ (CONVERT) — đổi trạng thái/tình trạng = chạy số lượng giữa 2 mã ──
// Quyết định Câu 2 (27/07): mỗi mã là một LÔ đồng nhất; brand new / second hand không chung mã.
// Lô đích tự tìm theo (tên, node, khách, dự án ràng, hạn dùng, partCount) hoặc tạo mới với seq kế tiếp.
// Nguồn là BỘ tách phần → chuyển cả bộ: mỗi phần một dòng ledger, số lượng = số bộ.

type ConvertLineInput = {
  itemId: string;
  quantity: number;
  toStatus: ItemStatusCode;
  toCond: ItemConditionCode;
  note?: string;
};

/**
 * TÌM HOẶC TẠO lô đích cho một lần đổi trạng thái/tình trạng (quyết định Câu 2: mã luôn nói đúng
 * sự thật về hàng, đổi trạng thái = chạy số lượng sang mã khác chứ KHÔNG sửa tại chỗ).
 *
 * Lô đích = cùng mọi thuộc tính nhận dạng của lô nguồn, chỉ khác trạng thái + tình trạng. Có sẵn
 * thì dùng lại (gộp về một mã, không đẻ mã rác); chưa có thì sinh mã mới theo tổ hợp và nhân bản
 * đủ phần con nếu nguồn là bộ tách phần.
 *
 * Dùng chung cho phiếu CHUYỂN ĐỔI (CD, chạy trên tồn kho) và phiếu TRẢ VỀ KHO có khai lại (TH, K5
 * — chạy từ holding sang tồn kho). Tách ra vì K5 cần đúng khối này; để hai bản sao thì lần sau sửa
 * quy tắc sinh mã sẽ lệch một bên.
 */
type LotSource = Prisma.InventoryItemGetPayload<{ include: { parts: true; ownerClient: { select: { code: true } } } }>;
type LotTarget = Prisma.InventoryItemGetPayload<{ include: { parts: true } }>;

async function resolveTargetLot(
  tx: Prisma.TransactionClient,
  src: LotSource,
  toStatus: ItemStatusCode,
  toCond: ItemConditionCode
): Promise<LotTarget> {
  // Mã lô v3: lô đích là lô CÙNG SẢN PHẨM khớp đúng tổ hợp thuộc tính — khớp theo khoá thật (productId), không
  // theo TÊN gõ tay như v2 (hai thủ kho gõ "Bàn gỗ 1m2" và "Bàn gỗ 1m2 " là ra hai sản phẩm).
  if (!src.productId) throw new Error("NO_PRODUCT");
  const lotWhere = {
    productId: src.productId,
    parentItemId: null,
    statusCode: toStatus,
    conditionCode: toCond,
    ownerClientId: src.ownerClientId,
    boundProjectId: src.boundProjectId,
    expiryDate: src.expiryDate,
    isActive: true,
  };
  const found = await tx.inventoryItem.findFirst({ where: lotWhere, include: { parts: { orderBy: { partNo: "asc" } } } });
  if (found) return found;

  const product = await tx.inventoryProduct.findUnique({
    where: { id: src.productId },
    select: { id: true, code: true, name: true, unit: true, isReusable: true, partCount: true, catNodeId: true },
  });
  if (!product) throw new Error("NO_PRODUCT");
  const seq = await nextLotSeq(tx, product.id);
  const code = buildLotCode(product.code, seq);
  const lotData = {
    ...lotFieldsFromProduct(product),
    productId: product.id,
    seq,
    statusCode: toStatus,
    conditionCode: toCond,
    ownerClientId: src.ownerClientId,
    boundProjectId: src.boundProjectId,
    expiryDate: src.expiryDate,
    clientDocNo: src.clientDocNo,
  };
  const created = await tx.inventoryItem.create({ data: { code, ...lotData }, include: { parts: true } });
  if (product.partCount <= 1) return created;

  for (const p of src.parts) {
    await tx.inventoryItem.create({
      data: {
        ...lotData,
        code: partItemCode(code, p.partNo!),
        name: `${product.name} — Phần ${p.partNo}`,
        partCount: 1,
        parentItemId: created.id,
        partNo: p.partNo,
      },
    });
  }
  return (await tx.inventoryItem.findUnique({ where: { id: created.id }, include: { parts: { orderBy: { partNo: "asc" } } } }))!;
}

export async function createConvertDoc(_prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.lot.convert");
  const t = await getTranslations("inventory.documents");
  const warehouseId = String(formData.get("fromWarehouseId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!warehouseId) return { error: t("errorInvalid") };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("linesJson") ?? "[]"));
  } catch {
    return { error: t("errorInvalid") };
  }
  if (!Array.isArray(raw) || raw.length === 0) return { error: t("errorNoLines") };
  const inputs: ConvertLineInput[] = [];
  const seen = new Set<string>();
  for (const l of raw) {
    const itemId = typeof l?.itemId === "string" ? l.itemId : "";
    const quantity = Number(l?.quantity);
    const toStatus = String(l?.toStatus ?? "");
    const toCond = String(l?.toCond ?? "");
    const lineNote = typeof l?.note === "string" && l.note.trim() !== "" ? l.note.trim() : undefined;
    if (
      !itemId || seen.has(itemId) || !Number.isInteger(quantity) || quantity <= 0 ||
      !(ITEM_STATUS_CODES as readonly string[]).includes(toStatus) ||
      !(ITEM_CONDITION_CODES as readonly string[]).includes(toCond)
    ) {
      return { error: t("errorInvalid") };
    }
    seen.add(itemId);
    inputs.push({ itemId, quantity, toStatus: toStatus as ItemStatusCode, toCond: toCond as ItemConditionCode, note: lineNote });
  }

  const sources = await prisma.inventoryItem.findMany({
    where: { id: { in: inputs.map((l) => l.itemId) } },
    include: { parts: { orderBy: { partNo: "asc" } }, ownerClient: { select: { code: true } } },
  });
  const srcById = new Map(sources.map((s) => [s.id, s]));
  for (const input of inputs) {
    const src = srcById.get(input.itemId);
    if (!src || !src.isActive) return { error: t("errorInvalid") };
    // Chỉ lô v2 (đủ node + trạng thái + tình trạng); phần con phải chuyển từ item cha (cả bộ)
    if (src.parentItemId) return { error: t("errorConvertPart", { item: src.code }) };
    if (!src.productId || !src.statusCode || !src.conditionCode) return { error: t("errorConvertLegacy", { item: src.code }) };
    if (src.statusCode === input.toStatus && src.conditionCode === input.toCond) {
      return { error: t("errorConvertSame", { item: src.code }) };
    }
  }

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await createDocWithRetry(() =>
      prisma.$transaction(async (tx) => {
        const ledger: { itemId: string; convertToItemId: string; quantity: number; note?: string }[] = [];
        for (const input of inputs) {
          const src = srcById.get(input.itemId)!;
          const target = await resolveTargetLot(tx, src, input.toStatus, input.toCond);
          if (src.partCount > 1) {
            const tgtByNo = new Map(target.parts.map((p) => [p.partNo, p]));
            for (const p of src.parts) {
              const tp = tgtByNo.get(p.partNo);
              if (!tp) throw new Error("CONVERT_TARGET_PARTS");
              ledger.push({ itemId: p.id, convertToItemId: tp.id, quantity: input.quantity, note: input.note });
            }
          } else {
            ledger.push({ itemId: src.id, convertToItemId: target.id, quantity: input.quantity, note: input.note });
          }
        }
        const code = await nextDocCode(tx, "CONVERT", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "CONVERT",
            status: "COMPLETED",
            fromWarehouseId: warehouseId,
            note,
            createdById: staffId,
            lines: { create: ledger.map((l, i) => ({ ...l, sort: i })) },
          },
        });
        for (const l of ledger) {
          await debitBalance(tx, warehouseId, l.itemId, l.quantity);
          await creditBalance(tx, warehouseId, l.convertToItemId, l.quantity);
        }
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof InsufficientStockError) return { error: await insufficientMessage(e.itemId) };
    if (e instanceof Error && e.message === "SEQ_FULL") return { error: t("errorSeqFull") };
    throw e;
  }
  await audit(docId, "CREATE");
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

/** Field duy nhất sửa được sau COMPLETED (trên phiếu ISSUE) — reset cờ nhắc để nhắc lại theo hạn mới. */
export async function updateExpectedReturn(docId: string, _prev: DocFormState, formData: FormData): Promise<DocFormState> {
  await requirePermission("inventory.doc.create");
  const t = await getTranslations("inventory.documents");
  const raw = String(formData.get("expectedReturnAt") ?? "").trim();
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return { error: t("errorInvalid") };

  const doc = await prisma.stockDocument.findUnique({ where: { id: docId }, select: { type: true, status: true } });
  if (!doc || !["ISSUE", "HOLDING"].includes(doc.type) || doc.status !== "COMPLETED") return { error: t("errorInvalid") };

  await prisma.stockDocument.update({
    where: { id: docId },
    data: { expectedReturnAt: d, returnReminderSentAt: null },
  });
  await audit(docId, "UPDATE", "expected return changed");
  revalidate();
  return { success: true };
}
