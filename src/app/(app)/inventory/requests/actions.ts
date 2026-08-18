"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import {
  InsufficientStockError,
  creditBalance,
  creditHolding,
  debitBalance,
  expiryLevel,
  nextDocCode,
  utcDayDiff,
  utcMidnightToday,
} from "@/lib/inventory";
import {
  approvalOutcome,
  approverStaffIds,
  availableToRequest,
  buildRequestCode,
  canApproveIssue,
  confirmableStatus,
  effectiveApproved,
  lotOwnerKey,
  parseApprovedQuantities,
  remainingReserve,
  type RequestType,
} from "@/lib/inventory-request";
import { getNumberSetting } from "@/lib/settings";
import { hasPermission, requirePermission } from "@/lib/permissions";

export type RequestFormState = { error?: string; success?: boolean };

type LineInput = { itemId: string; quantity: number; note?: string };

async function audit(entityId: string, action: string, reason?: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType: "stock_request", entityId, field: "*", action, changedBy: staffId, reason } });
}

function revalidate() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/requests");
  revalidatePath("/inventory/documents");
}

/** Fan-out notification theo MÃ QUYỀN (thay danh sách phòng ban cứng — thủ kho là role mới). */
async function notifyByPermission(permissionCode: string, type: string, title: string, body: string | null, projectId?: string | null) {
  const recipients = await prisma.staff.findMany({
    where: { isActive: true, role: { permissions: { some: { permissionCode } } } },
    select: { id: true },
  });
  if (recipients.length === 0) return;
  await prisma.notification.createMany({
    data: recipients.map((r) => ({ recipientStaffId: r.id, type, title, body, projectId: projectId ?? null })),
  });
}

async function notifyStaff(staffIds: (string | null)[], type: string, title: string, body: string | null, projectId?: string | null) {
  const ids = [...new Set(staffIds.filter((s): s is string => !!s))];
  if (ids.length === 0) return;
  await prisma.notification.createMany({
    data: ids.map((id) => ({ recipientStaffId: id, type, title, body, projectId: projectId ?? null })),
  });
}

/** Parse dòng đề xuất: item tồn tại, active, stockable, không trùng, số nguyên > 0. */
async function parseLines(formData: FormData): Promise<{ lines: LineInput[]; error?: string }> {
  const t = await getTranslations("inventory.requests");
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
    if (!itemId || seen.has(itemId) || !Number.isInteger(quantity) || quantity <= 0) return { lines: [], error: t("errorInvalid") };
    seen.add(itemId);
    lines.push({ itemId, quantity, note });
  }
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: lines.map((l) => l.itemId) } },
    select: { id: true, isActive: true, partCount: true },
  });
  if (items.length !== lines.length || items.some((i) => !i.isActive || i.partCount !== 1)) {
    return { lines: [], error: t("errorInvalid") };
  }
  return { lines };
}

/** Mã đề xuất kế tiếp trong tháng — count-based, caller retry P2002 (code @unique là backstop). */
async function nextRequestCode(tx: Prisma.TransactionClient, type: RequestType, now: Date): Promise<string> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const count = await tx.stockRequest.count({ where: { type, createdAt: { gte: monthStart, lt: monthEnd } } });
  return buildRequestCode(type, now, count + 1);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
}

/** Số đã duyệt chưa xuất theo (kho, item) — giữ chỗ mềm để hai đề xuất không hứa cùng một lô hàng. */
async function approvedNotIssuedByItem(warehouseId: string, itemIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.stockRequestLine.findMany({
    // TRANSFER cũng giữ chỗ mềm y như ISSUE: đã duyệt chuyển đi thì không hứa lại cho lệnh khác.
    where: { itemId: { in: itemIds }, request: { type: { in: ["ISSUE", "TRANSFER"] }, status: "APPROVED", warehouseId } },
    select: { itemId: true, quantity: true, approvedQuantity: true },
  });
  const map = new Map<string, number>();
  // K6: phần "đã hứa" = số Account ĐÃ DUYỆT (duyệt 3/5 thì chỉ giữ 3), không phải số đề xuất.
  for (const r of rows) map.set(r.itemId, (map.get(r.itemId) ?? 0) + effectiveApproved(r));
  return map;
}

/**
 * Giữ chỗ K3 CÒN TRỐNG theo (kho, item), tách theo dự án: `mine` = của dự án đang xét,
 * `others` = tổng của các dự án khác.
 *
 * "Còn trống" = SL đã duyệt giữ chỗ − SL dự án đó đã đòi qua lệnh xuất (PROPOSED + APPROVED +
 * đã xuất thật). Trừ như vậy để KHÔNG đếm trùng với `approvedNotIssuedByItem`: phần giữ chỗ đã
 * biến thành lệnh xuất được trừ ở đây trước, còn lệnh xuất thì đã nằm trong hàm kia.
 */
async function reserveFreeByItem(
  warehouseId: string,
  itemIds: string[],
  forProjectId: string | null
): Promise<{ mine: Map<string, number>; others: Map<string, number>; capped: Set<string> }> {
  const [reserved, used, returned] = await Promise.all([
    prisma.stockRequestLine.findMany({
      where: { itemId: { in: itemIds }, request: { type: "RESERVE", status: "APPROVED", warehouseId } },
      select: { itemId: true, quantity: true, request: { select: { projectId: true } } },
    }),
    prisma.stockRequestLine.findMany({
      where: {
        itemId: { in: itemIds },
        request: { type: "ISSUE", status: { in: ["PROPOSED", "APPROVED", "DONE"] }, warehouseId },
      },
      select: { itemId: true, quantity: true, approvedQuantity: true, confirmedQuantity: true, request: { select: { projectId: true, status: true } } },
    }),
    // Hàng đã TRẢ VỀ KHO thì nhả lại trần: giữ chỗ nghĩa là "được dùng N cái cho dự án này", không
    // phải "được xuất tổng cộng N cái trọn đời". Không trừ thì chiến dịch xuất-trả nhiều ngày (K4)
    // sẽ bị chặn oan ngay vòng thứ hai.
    prisma.stockDocumentLine.findMany({
      where: {
        itemId: { in: itemIds },
        document: { type: "RETURN", status: "COMPLETED", toWarehouseId: warehouseId },
      },
      select: { itemId: true, quantity: true, document: { select: { projectId: true } } },
    }),
  ]);

  const key = (projectId: string | null, itemId: string) => `${projectId ?? ""}|${itemId}`;
  const reservedBy = new Map<string, number>();
  for (const r of reserved) {
    const k = key(r.request.projectId, r.itemId);
    reservedBy.set(k, (reservedBy.get(k) ?? 0) + r.quantity);
  }
  const usedBy = new Map<string, number>();
  for (const u of used) {
    const k = key(u.request.projectId, u.itemId);
    // Đã xuất thật thì lấy số thực xuất; đã duyệt thì lấy số ĐÃ DUYỆT (K6); còn đề xuất thì số đang đòi.
    const q = u.request.status === "DONE" ? (u.confirmedQuantity ?? effectiveApproved(u)) : u.request.status === "APPROVED" ? effectiveApproved(u) : u.quantity;
    usedBy.set(k, (usedBy.get(k) ?? 0) + q);
  }
  for (const r of returned) {
    const k = key(r.document.projectId, r.itemId);
    usedBy.set(k, Math.max(0, (usedBy.get(k) ?? 0) - r.quantity));
  }

  const mine = new Map<string, number>();
  const others = new Map<string, number>();
  // Mọi item CÓ giữ chỗ của dự án đang xét — KỂ CẢ khi đã dùng hết (free = 0). Guard trần bật/tắt
  // theo tập này chứ không theo `mine`: nếu dựa vào `mine` thì trần cạn = item biến mất khỏi map =
  // guard câm lặng, xuất bao nhiêu cũng qua — ngược hẳn ý định.
  const capped = new Set<string>();
  for (const [k, qty] of reservedBy) {
    const [projectId, itemId] = k.split("|");
    const isMine = !!forProjectId && projectId === forProjectId;
    if (isMine) capped.add(itemId);
    const free = remainingReserve(qty, usedBy.get(k) ?? 0);
    if (free <= 0) continue;
    const target = isMine ? mine : others;
    target.set(itemId, (target.get(itemId) ?? 0) + free);
  }
  return { mine, others, capped };
}

/**
 * K4 — KỲ CHIẾN DỊCH: đồ ra hiện trường nhiều ngày, chỉ chốt trả một lần cuối kỳ. Quá ngưỡng thì
 * KHÔNG cho mở thêm lệnh xuất mới cho dự án đó — buộc phải chốt kỳ (trả về kho / báo mất) trước.
 *
 * CỐ Ý chỉ chặn đường RA. Chặn cả đường về là nhốt hàng ngoài hiện trường, người dùng sẽ lách bằng
 * phiếu điều chỉnh — đúng cái bẫy mà HANDOVER §10.11 đã cảnh báo với hàng hết hạn.
 */
async function campaignBlocked(project: { stockCampaignOpenedAt: Date | null }): Promise<{ days: number; max: number } | null> {
  if (!project.stockCampaignOpenedAt) return null;
  const max = await getNumberSetting("inventory", "campaign_max_days", 15);
  const days = utcDayDiff(project.stockCampaignOpenedAt, new Date());
  return days > max ? { days, max } : null;
}

// ── GIỮ CHỖ TỒN KHO ĐỂ ĐƯA VÀO CO/CE (workflow b — K3) ────
// Account tìm hàng tái sử dụng còn tồn → xin giữ một số lượng cho dự án sắp chạy → Kế toán HOẶC
// HR Manager duyệt → số duyệt vào CO với đơn giá 0 và trở thành TRẦN xuất kho của OPE.
// Vòng đời dừng ở APPROVED: giữ chỗ KHÔNG đụng sổ cái, không sinh phiếu kho.

export async function createReserveRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!warehouseId || !projectId) return { error: t("errorInvalid") };
  const { lines, error } = await parseLines(formData);
  if (error) return { error };

  // Giữ chỗ xảy ra lúc DỰNG CO/CE (dự án còn đang chào giá) nên KHÔNG dùng EXECUTION_STATUS_CODES;
  // chỉ loại dự án đã thua thầu / đã huỷ.
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { status: true } });
  if (!project || ["LOST", "CANCELED"].includes(project.status.code)) return { error: t("errorProjectRequired") };

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: lines.map((l) => l.itemId) } },
    select: { id: true, code: true, statusCode: true, expiryDate: true, ownerClientId: true, boundProjectId: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  // Chỉ hàng "sẵn sàng dùng" mới tái sử dụng được cho dự án mới (spec workflow b).
  const notReady = items.filter((i) => i.statusCode !== "R");
  if (notReady.length > 0) return { error: t("errorNotReadyToUse", { items: notReady.map((i) => i.code).join(", ") }) };
  const expired = items.filter((i) => expiryLevel(i.expiryDate, new Date()) === "EXPIRED");
  if (expired.length > 0) return { error: t("errorExpired", { items: expired.map((i) => i.code).join(", ") }) };
  const wrongProject = items.filter((i) => i.boundProjectId && i.boundProjectId !== projectId);
  if (wrongProject.length > 0) return { error: t("errorBoundOtherProject", { items: wrongProject.map((i) => i.code).join(", ") }) };
  const wrongClient = items.filter((i) => i.ownerClientId && i.ownerClientId !== project.clientId);
  if (wrongClient.length > 0) return { error: t("errorOtherClientGoods", { items: wrongClient.map((i) => i.code).join(", ") }) };

  const itemIds = lines.map((l) => l.itemId);
  const [balances, approvedNotIssued, free] = await Promise.all([
    prisma.stockBalance.findMany({ where: { warehouseId, itemId: { in: itemIds } } }),
    approvedNotIssuedByItem(warehouseId, itemIds),
    reserveFreeByItem(warehouseId, itemIds, projectId),
  ]);
  const balByItem = new Map(balances.map((b) => [b.itemId, b.quantity]));
  // Giữ chỗ của CHÍNH dự án này cũng phải trừ — xin thêm lần hai không được hứa lại cùng số hàng.
  const short = lines.filter(
    (l) =>
      l.quantity >
      availableToRequest(
        balByItem.get(l.itemId) ?? 0,
        approvedNotIssued.get(l.itemId) ?? 0,
        (free.others.get(l.itemId) ?? 0) + (free.mine.get(l.itemId) ?? 0)
      )
  );
  if (short.length > 0) return { error: t("errorInsufficientAvailable", { items: short.map((l) => byId.get(l.itemId)?.code ?? "").join(", ") }) };

  const staffId = await getCurrentStaffId();
  let reqId = "";
  let reqCode = "";
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const code = await nextRequestCode(tx, "RESERVE", new Date());
      const req = await tx.stockRequest.create({
        data: {
          code,
          type: "RESERVE",
          status: "PROPOSED",
          warehouseId,
          projectId,
          note,
          createdById: staffId,
          lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
        },
      });
      reqId = req.id;
      reqCode = req.code;
    })
  );
  await audit(reqId, "CREATE");
  await notifyByPermission(
    "inventory.reservation.approve",
    "INVENTORY_RESERVE_PENDING",
    `Đề xuất giữ chỗ kho ${reqCode} chờ duyệt`,
    `${project.code} — ${lines.length} dòng hàng`,
    projectId
  );
  revalidate();
  redirect(`/inventory/requests/${reqId}`);
}

/** Kế toán HOẶC HR Manager duyệt — cùng một mã quyền, ai bấm trước thắng (claim idempotent). */
export async function approveReserveRequest(requestId: string, _prev: RequestFormState, _formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.reservation.approve");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({
    where: { id: requestId },
    include: { project: { select: { id: true, code: true } }, lines: true },
  });
  if (!req || req.type !== "RESERVE" || !req.projectId) return { error: t("errorInvalid") };

  // Kiểm lại tồn ở thời điểm DUYỆT — đề xuất lập từ hôm trước có thể đã lỗi thời.
  const itemIds = req.lines.map((l) => l.itemId);
  const [balances, approvedNotIssued, free] = await Promise.all([
    prisma.stockBalance.findMany({ where: { warehouseId: req.warehouseId, itemId: { in: itemIds } } }),
    approvedNotIssuedByItem(req.warehouseId, itemIds),
    reserveFreeByItem(req.warehouseId, itemIds, req.projectId),
  ]);
  const balByItem = new Map(balances.map((b) => [b.itemId, b.quantity]));
  const short = req.lines.filter(
    (l) =>
      l.quantity >
      availableToRequest(
        balByItem.get(l.itemId) ?? 0,
        approvedNotIssued.get(l.itemId) ?? 0,
        (free.others.get(l.itemId) ?? 0) + (free.mine.get(l.itemId) ?? 0)
      )
  );
  if (short.length > 0) {
    const codes = await prisma.inventoryItem.findMany({ where: { id: { in: short.map((l) => l.itemId) } }, select: { code: true } });
    return { error: t("errorInsufficientAvailable", { items: codes.map((c) => c.code).join(", ") }) };
  }

  const staffId = await getCurrentStaffId();
  const done = await prisma.stockRequest.updateMany({
    where: { id: requestId, status: "PROPOSED" },
    data: { status: "APPROVED", approvedById: staffId, approvedAt: new Date() },
  });
  if (done.count === 0) return { error: t("errorAlreadyProcessed") };
  await audit(requestId, "UPDATE", "approve reserve");
  await notifyStaff(
    [req.createdById],
    "INVENTORY_RESERVE_APPROVED",
    `Giữ chỗ kho ${req.code} đã duyệt — chèn được vào CO/CE`,
    `${req.project?.code ?? ""} — ${req.lines.length} dòng hàng`,
    req.projectId
  );
  revalidate();
  return { success: true };
}

export async function rejectReserveRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.reservation.approve");
  const t = await getTranslations("inventory.requests");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: t("errorReasonRequired") };
  const req = await prisma.stockRequest.findUnique({ where: { id: requestId }, select: { type: true, code: true, createdById: true, projectId: true } });
  if (!req || req.type !== "RESERVE") return { error: t("errorInvalid") };

  const staffId = await getCurrentStaffId();
  const done = await prisma.stockRequest.updateMany({
    where: { id: requestId, status: "PROPOSED" },
    data: { status: "REJECTED", rejectedById: staffId, rejectedAt: new Date(), rejectReason: reason },
  });
  if (done.count === 0) return { error: t("errorAlreadyProcessed") };
  await audit(requestId, "UPDATE", `reject reserve: ${reason}`);
  await notifyStaff([req.createdById], "INVENTORY_RESERVE_REJECTED", `Đề xuất giữ chỗ kho ${req.code} bị từ chối`, reason, req.projectId);
  revalidate();
  return { success: true };
}

// ── ĐỀ XUẤT XUẤT KHO (workflow a) ─────────────────────────

export async function createIssueRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const expectedReturnRaw = String(formData.get("expectedReturnAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!warehouseId || !projectId) return { error: t("errorInvalid") };
  const { lines, error } = await parseLines(formData);
  if (error) return { error };

  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { status: true, ownerTeam: { select: { code: true, leadStaffId: true } } } });
  if (!project || !(EXECUTION_STATUS_CODES as readonly string[]).includes(project.status.code)) return { error: t("errorProjectRequired") };
  const overdueCampaign = await campaignBlocked(project);
  if (overdueCampaign) return { error: t("errorCampaignExpired", overdueCampaign) };

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: lines.map((l) => l.itemId) } },
    select: { id: true, code: true, isReusable: true, expiryDate: true, statusCode: true, ownerClientId: true, boundProjectId: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  // Hàng hết hạn: chặn ngay từ khâu đề xuất (đường ra duy nhất là phiếu xuất hủy)
  const expired = items.filter((i) => expiryLevel(i.expiryDate, new Date()) === "EXPIRED");
  if (expired.length > 0) return { error: t("errorExpired", { items: expired.map((i) => i.code).join(", ") }) };
  // K6: hàng của chủ KHÁC (dự án khác / khách gửi) KHÔNG còn bị chặn cứng — đề xuất tách riêng và team Account
  // CHỦ SỞ HỮU duyệt. Chỉ trạng thái P ("Theo dự án") còn nghĩa ĐỘC QUYỀN: dự án khác không xin được.
  const exclusive = items.filter((i) => i.statusCode === "P" && i.boundProjectId && i.boundProjectId !== projectId);
  if (exclusive.length > 0) return { error: t("errorBoundOtherProject", { items: exclusive.map((i) => i.code).join(", ") }) };

  const itemIds = lines.map((l) => l.itemId);
  const [balances, reserved, free] = await Promise.all([
    prisma.stockBalance.findMany({ where: { warehouseId, itemId: { in: itemIds } } }),
    approvedNotIssuedByItem(warehouseId, itemIds),
    reserveFreeByItem(warehouseId, itemIds, projectId),
  ]);
  const balByItem = new Map(balances.map((b) => [b.itemId, b.quantity]));
  // Hàng dự án KHÁC đang giữ chỗ thì không đụng tới được; giữ chỗ của chính dự án này thì được dùng.
  const short = lines.filter(
    (l) => l.quantity > availableToRequest(balByItem.get(l.itemId) ?? 0, reserved.get(l.itemId) ?? 0, free.others.get(l.itemId) ?? 0)
  );
  if (short.length > 0) return { error: t("errorInsufficientAvailable", { items: short.map((l) => byId.get(l.itemId)?.code ?? "").join(", ") }) };

  // TRẦN K3: item nào ĐÃ được duyệt giữ chỗ cho dự án này thì OPE chỉ được đòi trong phạm vi còn
  // lại của giữ chỗ đó. Item KHÔNG có giữ chỗ giữ nguyên hành vi cũ (Account PIC duyệt là cửa
  // kiểm soát) — nếu áp trần cho mọi item thì 21 dự án cũ chưa từng giữ chỗ sẽ không xuất được gì.
  const overCap = lines.filter((l) => free.capped.has(l.itemId) && l.quantity > (free.mine.get(l.itemId) ?? 0));
  if (overCap.length > 0) {
    return {
      error: t("errorOverReserveCap", {
        items: overCap.map((l) => `${byId.get(l.itemId)?.code ?? ""} (còn ${free.mine.get(l.itemId) ?? 0})`).join(", "),
      }),
    };
  }

  const hasReusable = lines.some((l) => byId.get(l.itemId)?.isReusable);
  const expectedReturnAt = expectedReturnRaw ? new Date(expectedReturnRaw) : null;
  if (hasReusable && (!expectedReturnAt || Number.isNaN(expectedReturnAt.getTime()))) return { error: t("errorReturnRequired") };

  // K6: TÁCH đề xuất theo CHỦ SỞ HỮU ngay lúc lập — mỗi phiếu đúng MỘT người duyệt (quyết định chủ dự án 18/08/2026:
  // "một đề xuất gom hàng của nhiều chủ thì tự tách"). Khoá "" = hàng chung TCM + hàng của chính dự án xin → PIC/Leader
  // dự án xin duyệt như K2; khoá khác = id dự án chủ → team Account dự án đó duyệt.
  const groups = new Map<string, LineInput[]>();
  for (const l of lines) {
    const k = lotOwnerKey(byId.get(l.itemId)!, projectId);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const ownerProjectIds = [...groups.keys()].filter((k) => k && !k.startsWith("client:"));
  const ownerProjects = await prisma.project.findMany({
    where: { id: { in: ownerProjectIds } },
    select: { id: true, code: true, ownerId: true, leaderId: true, ownerTeam: { select: { code: true, leadStaffId: true } } },
  });
  const ownerById = new Map(ownerProjects.map((o) => [o.id, o]));

  const staffId = await getCurrentStaffId();
  const created: { id: string; code: string; ownerKey: string; count: number }[] = [];
  const now = new Date();
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      created.length = 0;
      let idx = 0;
      for (const [ownerKey, groupLines] of groups) {
        const code = await nextRequestCode(tx, "ISSUE", new Date(now.getTime() + idx++));
        const ownerProjectId = ownerKey && !ownerKey.startsWith("client:") ? ownerKey : null;
        const splitNote = groups.size > 1 ? `[Tách ${idx}/${groups.size} theo chủ sở hữu]` : "";
        const req = await tx.stockRequest.create({
          data: {
            code,
            type: "ISSUE",
            status: "PROPOSED",
            warehouseId,
            projectId,
            ownerProjectId,
            expectedReturnAt: hasReusable ? expectedReturnAt : null,
            note: [splitNote, note].filter(Boolean).join(" ") || null,
            createdById: staffId,
            lines: { create: groupLines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
          },
        });
        created.push({ id: req.id, code: req.code, ownerKey, count: groupLines.length });
      }
    })
  );
  for (const c of created) {
    await audit(c.id, "CREATE", groups.size > 1 ? `split ${groups.size}` : undefined);
    const owner = c.ownerKey && !c.ownerKey.startsWith("client:") ? ownerById.get(c.ownerKey) : null;
    // Báo đúng người duyệt: dự án CHỦ (nếu hàng của chủ khác) hoặc dự án đang xin — PIC + Leader, không có thì trưởng
    // team, không có nữa thì nhóm duyệt-mọi-dự-án.
    const target = owner ?? project;
    const recipients = approverStaffIds({ ownerId: target.ownerId, leaderId: target.leaderId, ownerTeam: owner ? owner.ownerTeam : null });
    const body = owner
      ? `${project.code} xin dùng ${c.count} dòng hàng của dự án ${owner.code} (${owner.ownerTeam?.code ?? "?"})`
      : `${project.code} — ${c.count} dòng hàng`;
    if (recipients.length) {
      await notifyStaff(recipients, "INVENTORY_REQUEST_PENDING", `Đề xuất xuất kho ${c.code} chờ duyệt`, body, projectId);
    } else {
      await notifyByPermission("inventory.request.approve_any", "INVENTORY_REQUEST_PENDING", `Đề xuất xuất kho ${c.code} chờ duyệt`, `${body} — chưa gán PIC`, projectId);
    }
  }
  revalidate();
  redirect(created.length === 1 ? `/inventory/requests/${created[0].id}` : "/inventory/requests");
}

export async function approveIssueRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.approve");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({
    where: { id: requestId },
    include: {
      project: { select: { id: true, code: true, ownerId: true, leaderId: true, stockCampaignOpenedAt: true, ownerTeam: { select: { leadStaffId: true } } } },
      ownerProject: { select: { id: true, code: true, ownerId: true, leaderId: true, ownerTeam: { select: { leadStaffId: true } } } },
      lines: true,
    },
  });
  if (!req || req.type !== "ISSUE" || !req.project) return { error: t("errorInvalid") };
  // Kiểm LẠI lúc duyệt: đề xuất lập ngày 14 mà duyệt ngày 17 thì phải rớt.
  const overdueCampaign = await campaignBlocked(req.project);
  if (overdueCampaign) return { error: t("errorCampaignExpired", overdueCampaign) };

  const staffId = await getCurrentStaffId();
  // Ngoại lệ có chủ đích (mirror finance over_cap): hasPermission BÊN TRONG action đã có
  // requirePermission ở đầu — quyền "duyệt mọi dự án" chỉ nới phạm vi, không mở thêm cửa mới.
  const approveAny = await hasPermission("inventory.request.approve_any");
  // K6: người duyệt = team Account của dự án CHỦ SỞ HỮU hàng (ownerProject); hàng chung TCM / của chính dự án xin thì
  // là dự án xin (K2). Trưởng team là fallback (canApproveIssue).
  const approverProject = req.ownerProject ?? req.project;
  if (!canApproveIssue(approverProject, staffId, approveAny)) return { error: t("errorNotPic") };

  // K6: số duyệt TỪNG DÒNG 0..n từ form (thiếu ô = duyệt đủ dòng đó); dưới đề xuất thì bắt buộc lý do.
  const approved = parseApprovedQuantities(req.lines, (id) => (formData.get(`qty_${id}`) === null ? null : String(formData.get(`qty_${id}`))));
  if (!approved) return { error: t("errorInvalid") };
  const reason = String(formData.get("reason") ?? "").trim();
  const decided = req.lines.map((l) => ({ ...l, approvedQuantity: approved.get(l.id)! }));
  const outcome = approvalOutcome(decided);
  if (outcome !== "FULL" && !reason) return { error: t("errorReasonRequired") };

  if (outcome !== "REJECTED") {
    // Tồn phải còn đủ ở thời điểm DUYỆT cho SỐ ĐÃ DUYỆT (đề xuất cũ có thể đã lỗi thời)
    const issueItemIds = req.lines.map((l) => l.itemId);
    const [balances, reserved, freeAtApprove] = await Promise.all([
      prisma.stockBalance.findMany({ where: { warehouseId: req.warehouseId, itemId: { in: issueItemIds } } }),
      approvedNotIssuedByItem(req.warehouseId, issueItemIds),
      reserveFreeByItem(req.warehouseId, issueItemIds, req.projectId),
    ]);
    const balByItem = new Map(balances.map((b) => [b.itemId, b.quantity]));
    const short = decided.filter(
      (l) => l.approvedQuantity > availableToRequest(balByItem.get(l.itemId) ?? 0, reserved.get(l.itemId) ?? 0, freeAtApprove.others.get(l.itemId) ?? 0)
    );
    if (short.length > 0) {
      const codes = await prisma.inventoryItem.findMany({ where: { id: { in: short.map((l) => l.itemId) } }, select: { code: true } });
      return { error: t("errorInsufficientAvailable", { items: codes.map((c) => c.code).join(", ") }) };
    }
    // Trần giữ chỗ kiểm lại lần hai: `free.mine` ở đây ĐÃ trừ chính đề xuất đang duyệt (nó đang ở
    // trạng thái PROPOSED), nên cộng ngược phần của nó vào trước khi so.
    const ownUsed = new Map<string, number>();
    for (const l of req.lines) ownUsed.set(l.itemId, (ownUsed.get(l.itemId) ?? 0) + l.quantity);
    const overCapAtApprove = decided.filter((l) => {
      if (!freeAtApprove.capped.has(l.itemId)) return false; // item không có giữ chỗ → không áp trần
      const capLeft = (freeAtApprove.mine.get(l.itemId) ?? 0) + (ownUsed.get(l.itemId) ?? 0);
      return l.approvedQuantity > capLeft;
    });
    if (overCapAtApprove.length > 0) {
      const codes = await prisma.inventoryItem.findMany({ where: { id: { in: overCapAtApprove.map((l) => l.itemId) } }, select: { code: true } });
      return { error: t("errorOverReserveCap", { items: codes.map((c) => c.code).join(", ") }) };
    }
  }

  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    const claimed = await tx.stockRequest.updateMany({
      where: { id: requestId, status: "PROPOSED" },
      data:
        outcome === "REJECTED"
          ? { status: "REJECTED", rejectedById: staffId, rejectedAt: now, rejectReason: reason }
          : { status: "APPROVED", approvedById: staffId, approvedAt: now, rejectReason: reason || null },
    });
    if (claimed.count === 0) return false;
    for (const l of decided) await tx.stockRequestLine.update({ where: { id: l.id }, data: { approvedQuantity: l.approvedQuantity } });
    return true;
  });
  if (!done) return { error: t("errorAlreadyProcessed") };
  await audit(requestId, "UPDATE", `approve:${outcome}${reason ? ` — ${reason}` : ""}`);

  // K6: PHẢN HỒI về OPS — đủ / một phần (3/5) / từ chối, kèm lý do; thủ kho chỉ được báo khi còn gì để xuất.
  const items = await prisma.inventoryItem.findMany({ where: { id: { in: req.lines.map((l) => l.itemId) } }, select: { id: true, code: true } });
  const codeOf = new Map(items.map((i) => [i.id, i.code]));
  const detail = decided.map((l) => `${codeOf.get(l.itemId) ?? l.itemId}: ${l.approvedQuantity}/${l.quantity}`).join(" · ");
  const ownerTag = req.ownerProject ? ` (chủ hàng: ${req.ownerProject.code})` : "";
  if (outcome === "REJECTED") {
    await notifyStaff([req.createdById], "INVENTORY_REQUEST_REJECTED", `Đề xuất xuất kho ${req.code} bị từ chối${ownerTag}`, reason, req.projectId);
  } else {
    const title = outcome === "FULL" ? `Đề xuất xuất kho ${req.code} được duyệt đủ${ownerTag}` : `Đề xuất xuất kho ${req.code} được duyệt MỘT PHẦN${ownerTag}`;
    await notifyStaff([req.createdById], "INVENTORY_REQUEST_APPROVED", title, reason ? `${detail} — ${reason}` : detail, req.projectId);
    await notifyByPermission("inventory.issue.confirm", "INVENTORY_REQUEST_APPROVED", `Lệnh xuất kho ${req.code} đã duyệt — chờ soạn hàng`, `${req.project.code} — ${detail}`, req.projectId);
  }
  revalidate();
  return { success: true };
}

export async function rejectIssueRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.approve");
  const t = await getTranslations("inventory.requests");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: t("errorReasonRequired") };
  const req = await prisma.stockRequest.findUnique({
    where: { id: requestId },
    include: {
      project: { select: { id: true, ownerId: true, leaderId: true, ownerTeam: { select: { leadStaffId: true } } } },
      ownerProject: { select: { id: true, code: true, ownerId: true, leaderId: true, ownerTeam: { select: { leadStaffId: true } } } },
    },
  });
  if (!req || req.type !== "ISSUE" || !req.project) return { error: t("errorInvalid") };

  const staffId = await getCurrentStaffId();
  const approveAny = await hasPermission("inventory.request.approve_any");
  if (!canApproveIssue(req.ownerProject ?? req.project, staffId, approveAny)) return { error: t("errorNotPic") };

  const done = await prisma.stockRequest.updateMany({
    where: { id: requestId, status: "PROPOSED" },
    data: { status: "REJECTED", rejectedById: staffId, rejectedAt: new Date(), rejectReason: reason },
  });
  if (done.count === 0) return { error: t("errorAlreadyProcessed") };
  await prisma.stockRequestLine.updateMany({ where: { requestId }, data: { approvedQuantity: 0 } });
  await audit(requestId, "UPDATE", `reject: ${reason}`);
  await notifyStaff([req.createdById], "INVENTORY_REQUEST_REJECTED", `Đề xuất xuất kho ${req.code} bị từ chối${req.ownerProject ? ` (chủ hàng: ${req.ownerProject.code})` : ""}`, reason, req.projectId);
  revalidate();
  return { success: true };
}

/** Huỷ đề xuất khi chưa xác nhận — người lập hoặc người duyệt-mọi-dự-án. */
export async function cancelRequest(requestId: string, _prev: RequestFormState, _formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({ where: { id: requestId }, select: { status: true, createdById: true, code: true } });
  if (!req) return { error: t("errorInvalid") };
  const staffId = await getCurrentStaffId();
  if (req.createdById !== staffId && !(await hasPermission("inventory.request.approve_any"))) return { error: t("errorNotOwner") };

  const done = await prisma.stockRequest.updateMany({
    where: { id: requestId, status: { in: ["PROPOSED", "APPROVED"] } },
    data: { status: "CANCELED", canceledById: staffId, canceledAt: new Date() },
  });
  if (done.count === 0) return { error: t("errorAlreadyProcessed") };
  await audit(requestId, "UPDATE", "cancel");
  revalidate();
  return { success: true };
}

/**
 * Thủ kho xác nhận THỰC XUẤT (bước cuối, nơi tồn kho mới thay đổi):
 * số thực ≤ số duyệt từng dòng, sinh phiếu XE + trừ tồn + cộng holding trong CÙNG transaction.
 */
export async function confirmIssueRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.issue.confirm");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({ where: { id: requestId }, include: { lines: true } });
  if (!req || req.type !== "ISSUE" || !req.projectId) return { error: t("errorInvalid") };

  // K6: thủ kho chốt ≤ số Account ĐÃ DUYỆT từng dòng (không phải số đề xuất); dòng duyệt 0 thì không xuất.
  const actual = new Map<string, number>();
  for (const l of req.lines) {
    const cap = effectiveApproved(l);
    const raw = formData.get(`qty_${l.id}`);
    const v = raw === null || String(raw).trim() === "" ? cap : Number(raw);
    if (!Number.isInteger(v) || v < 0 || v > cap) return { error: t("errorInvalid") };
    actual.set(l.id, v);
  }
  if ([...actual.values()].every((v) => v === 0)) return { error: t("errorNothingIssued") };

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: req.lines.map((l) => l.itemId) } },
    select: { id: true, isReusable: true },
  });
  const reusableIds = new Set(items.filter((i) => i.isReusable).map((i) => i.id));
  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        // Guard idempotent: chỉ một request thắng khi double-submit
        const claimed = await tx.stockRequest.updateMany({
          where: { id: requestId, status: confirmableStatus("ISSUE") },
          data: { status: "DONE", confirmedById: staffId, confirmedAt: new Date() },
        });
        if (claimed.count === 0) throw new Error("ALREADY_PROCESSED");

        const issued = req.lines.filter((l) => (actual.get(l.id) ?? 0) > 0);
        const code = await nextDocCode(tx, "ISSUE", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "ISSUE",
            status: "COMPLETED",
            fromWarehouseId: req.warehouseId,
            projectId: req.projectId,
            expectedReturnAt: req.expectedReturnAt,
            note: req.note ? `${req.code} · ${req.note}` : req.code,
            createdById: staffId,
            lines: { create: issued.map((l, i) => ({ itemId: l.itemId, quantity: actual.get(l.id)!, note: l.note, sort: i })) },
          },
        });
        for (const l of issued) {
          const qty = actual.get(l.id)!;
          await debitBalance(tx, req.warehouseId, l.itemId, qty);
          if (reusableIds.has(l.itemId)) await creditHolding(tx, req.projectId!, l.itemId, qty);
        }
        for (const l of req.lines) {
          await tx.stockRequestLine.update({ where: { id: l.id }, data: { confirmedQuantity: actual.get(l.id)! } });
        }
        // K4 — MỞ KỲ CHIẾN DỊCH ở lần đầu có đồ tái sử dụng ra hiện trường. Kỳ tự đóng khi holding
        // của dự án về 0 (xem closeCampaignIfSettled ở lib/inventory.ts).
        if (issued.some((l) => reusableIds.has(l.itemId))) {
          await tx.project.updateMany({
            where: { id: req.projectId!, stockCampaignOpenedAt: null },
            data: { stockCampaignOpenedAt: utcMidnightToday() },
          });
        }
        await tx.stockRequest.update({ where: { id: requestId }, data: { documentId: doc.id } });
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_PROCESSED") return { error: t("errorAlreadyProcessed") };
    if (e instanceof InsufficientStockError) {
      const item = await prisma.inventoryItem.findUnique({ where: { id: e.itemId }, select: { code: true } });
      return { error: t("errorInsufficientAvailable", { items: item?.code ?? e.itemId }) };
    }
    throw e;
  }
  await audit(requestId, "UPDATE", "confirm issue");
  await notifyStaff([req.createdById, req.approvedById], "INVENTORY_REQUEST_ISSUED", `Đã xuất kho theo lệnh ${req.code}`, null, req.projectId);
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

// ── BÁO HÀNG VỀ + THỦ KHO XÁC NHẬN THỰC NHẬP (workflow c) ─

export async function createIntakeRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!warehouseId) return { error: t("errorInvalid") };
  const { lines, error } = await parseLines(formData);
  if (error) return { error };

  if (purchaseOrderId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { status: true } });
    if (!po || po.status === "CANCELED") return { error: t("errorInvalidPo") };
  }

  const staffId = await getCurrentStaffId();
  let reqId = "";
  let reqCode = "";
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const code = await nextRequestCode(tx, "INTAKE", new Date());
      const req = await tx.stockRequest.create({
        data: {
          code,
          type: "INTAKE",
          status: "PROPOSED",
          warehouseId,
          purchaseOrderId,
          note,
          createdById: staffId,
          lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
        },
      });
      reqId = req.id;
      reqCode = req.code;
    })
  );
  await audit(reqId, "CREATE");
  await notifyByPermission("inventory.intake.confirm", "INVENTORY_INTAKE_PENDING", `Báo hàng về ${reqCode} — chờ thủ kho nhận`, `${lines.length} dòng hàng`);
  revalidate();
  redirect(`/inventory/requests/${reqId}`);
}

/** Thủ kho xác nhận THỰC NHẬP — số thực ≤ số báo; sinh phiếu NK + cộng tồn trong cùng transaction. */
export async function confirmIntakeRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.intake.confirm");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({ where: { id: requestId }, include: { lines: true } });
  if (!req || req.type !== "INTAKE") return { error: t("errorInvalid") };

  const actual = new Map<string, number>();
  for (const l of req.lines) {
    const raw = formData.get(`qty_${l.id}`);
    const v = raw === null || String(raw).trim() === "" ? l.quantity : Number(raw);
    if (!Number.isInteger(v) || v < 0 || v > l.quantity) return { error: t("errorInvalid") };
    actual.set(l.id, v);
  }
  if ([...actual.values()].every((v) => v === 0)) return { error: t("errorNothingReceived") };

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const claimed = await tx.stockRequest.updateMany({
          where: { id: requestId, status: confirmableStatus("INTAKE") },
          data: { status: "DONE", confirmedById: staffId, confirmedAt: new Date() },
        });
        if (claimed.count === 0) throw new Error("ALREADY_PROCESSED");

        const received = req.lines.filter((l) => (actual.get(l.id) ?? 0) > 0);
        const code = await nextDocCode(tx, "IMPORT", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "IMPORT",
            status: "COMPLETED",
            toWarehouseId: req.warehouseId,
            note: req.note ? `${req.code} · ${req.note}` : req.code,
            createdById: staffId,
            lines: { create: received.map((l, i) => ({ itemId: l.itemId, quantity: actual.get(l.id)!, note: l.note, sort: i })) },
          },
        });
        for (const l of received) await creditBalance(tx, req.warehouseId, l.itemId, actual.get(l.id)!);
        for (const l of req.lines) {
          await tx.stockRequestLine.update({ where: { id: l.id }, data: { confirmedQuantity: actual.get(l.id)! } });
        }
        await tx.stockRequest.update({ where: { id: requestId }, data: { documentId: doc.id } });
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_PROCESSED") return { error: t("errorAlreadyProcessed") };
    throw e;
  }
  await audit(requestId, "UPDATE", "confirm intake");
  await notifyStaff([req.createdById], "INVENTORY_INTAKE_RECEIVED", `Đã nhập kho theo báo hàng ${req.code}`, null);
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

// ── ĐIỀU CHUYỂN GIỮA 2 KHO CÓ DUYỆT (K4) ──────────────────
// Trước K4 chuyển kho là 1 bước: ai có quyền lập là chạy thẳng vào sổ cái. Nay đi qua đúng tầng đề
// xuất của K2: người lập đề xuất → người có `inventory.transfer.approve` duyệt → THỦ KHO chốt số
// thực xuất, lúc đó mới sinh phiếu CK (PENDING) + trừ tồn kho nguồn. Kho đích xác nhận nhận đủ bằng
// luồng cũ (confirmTransferReceive) — phần đó KHÔNG đổi.

export async function createTransferRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.transfer.create");
  const t = await getTranslations("inventory.requests");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const toWarehouseId = String(formData.get("toWarehouseId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!warehouseId || !toWarehouseId) return { error: t("errorInvalid") };
  if (warehouseId === toWarehouseId) return { error: t("errorSameWarehouse") };
  const { lines, error } = await parseLines(formData);
  if (error) return { error };

  const itemIds = lines.map((l) => l.itemId);
  const items = await prisma.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, expiryDate: true } });
  const byId = new Map(items.map((i) => [i.id, i]));
  const expired = items.filter((i) => expiryLevel(i.expiryDate, new Date()) === "EXPIRED");
  if (expired.length > 0) return { error: t("errorExpired", { items: expired.map((i) => i.code).join(", ") }) };

  // Giữ chỗ của MỌI dự án đều là "của người khác" ở đây: điều chuyển không phục vụ dự án nào.
  const [balances, reserved, free] = await Promise.all([
    prisma.stockBalance.findMany({ where: { warehouseId, itemId: { in: itemIds } } }),
    approvedNotIssuedByItem(warehouseId, itemIds),
    reserveFreeByItem(warehouseId, itemIds, null),
  ]);
  const balByItem = new Map(balances.map((b) => [b.itemId, b.quantity]));
  const short = lines.filter(
    (l) => l.quantity > availableToRequest(balByItem.get(l.itemId) ?? 0, reserved.get(l.itemId) ?? 0, free.others.get(l.itemId) ?? 0)
  );
  if (short.length > 0) return { error: t("errorInsufficientAvailable", { items: short.map((l) => byId.get(l.itemId)?.code ?? "").join(", ") }) };

  const staffId = await getCurrentStaffId();
  let reqId = "";
  let reqCode = "";
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const code = await nextRequestCode(tx, "TRANSFER", new Date());
      const req = await tx.stockRequest.create({
        data: {
          code,
          type: "TRANSFER",
          status: "PROPOSED",
          warehouseId,
          toWarehouseId,
          note,
          createdById: staffId,
          lines: { create: lines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
        },
      });
      reqId = req.id;
      reqCode = req.code;
    })
  );
  await audit(reqId, "CREATE");
  await notifyByPermission("inventory.transfer.approve", "INVENTORY_REQUEST_PENDING", `Đề xuất điều chuyển kho ${reqCode} chờ duyệt`, `${lines.length} dòng hàng`);
  revalidate();
  redirect(`/inventory/requests/${reqId}`);
}

export async function approveTransferRequest(requestId: string, _prev: RequestFormState, _formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.transfer.approve");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({ where: { id: requestId }, include: { lines: true } });
  if (!req || req.type !== "TRANSFER") return { error: t("errorInvalid") };

  // Tồn phải còn đủ ở thời điểm DUYỆT — đề xuất cũ có thể đã lỗi thời.
  const itemIds = req.lines.map((l) => l.itemId);
  const [balances, reserved, free] = await Promise.all([
    prisma.stockBalance.findMany({ where: { warehouseId: req.warehouseId, itemId: { in: itemIds } } }),
    approvedNotIssuedByItem(req.warehouseId, itemIds),
    reserveFreeByItem(req.warehouseId, itemIds, null),
  ]);
  const balByItem = new Map(balances.map((b) => [b.itemId, b.quantity]));
  const short = req.lines.filter(
    (l) => l.quantity > availableToRequest(balByItem.get(l.itemId) ?? 0, reserved.get(l.itemId) ?? 0, free.others.get(l.itemId) ?? 0)
  );
  if (short.length > 0) {
    const codes = await prisma.inventoryItem.findMany({ where: { id: { in: short.map((l) => l.itemId) } }, select: { code: true } });
    return { error: t("errorInsufficientAvailable", { items: codes.map((c) => c.code).join(", ") }) };
  }

  const staffId = await getCurrentStaffId();
  const done = await prisma.stockRequest.updateMany({
    where: { id: requestId, status: "PROPOSED" },
    data: { status: "APPROVED", approvedById: staffId, approvedAt: new Date() },
  });
  if (done.count === 0) return { error: t("errorAlreadyProcessed") };
  await audit(requestId, "UPDATE", "approve");
  await notifyByPermission("inventory.issue.confirm", "INVENTORY_REQUEST_APPROVED", `Điều chuyển kho ${req.code} đã duyệt — chờ soạn hàng`, `${req.lines.length} dòng hàng`);
  revalidate();
  return { success: true };
}

export async function rejectTransferRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.transfer.approve");
  const t = await getTranslations("inventory.requests");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: t("errorReasonRequired") };
  const req = await prisma.stockRequest.findUnique({ where: { id: requestId }, select: { type: true, code: true, createdById: true } });
  if (!req || req.type !== "TRANSFER") return { error: t("errorInvalid") };

  const staffId = await getCurrentStaffId();
  const done = await prisma.stockRequest.updateMany({
    where: { id: requestId, status: "PROPOSED" },
    data: { status: "REJECTED", rejectedById: staffId, rejectedAt: new Date(), rejectReason: reason },
  });
  if (done.count === 0) return { error: t("errorAlreadyProcessed") };
  await audit(requestId, "UPDATE", `reject: ${reason}`);
  await notifyStaff([req.createdById], "INVENTORY_REQUEST_REJECTED", `Đề xuất điều chuyển kho ${req.code} bị từ chối`, reason);
  revalidate();
  return { success: true };
}

/** Thủ kho chốt số THỰC XUẤT khỏi kho nguồn — sinh phiếu CK trạng thái PENDING, kho đích nhận sau. */
export async function confirmTransferRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.issue.confirm");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({ where: { id: requestId }, include: { lines: true } });
  if (!req || req.type !== "TRANSFER" || !req.toWarehouseId) return { error: t("errorInvalid") };

  const actual = new Map<string, number>();
  for (const l of req.lines) {
    const raw = formData.get(`qty_${l.id}`);
    const v = raw === null || String(raw).trim() === "" ? l.quantity : Number(raw);
    if (!Number.isInteger(v) || v < 0 || v > l.quantity) return { error: t("errorInvalid") };
    actual.set(l.id, v);
  }
  if ([...actual.values()].every((v) => v === 0)) return { error: t("errorNothingIssued") };

  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const claimed = await tx.stockRequest.updateMany({
          where: { id: requestId, status: confirmableStatus("TRANSFER") },
          data: { status: "DONE", confirmedById: staffId, confirmedAt: new Date() },
        });
        if (claimed.count === 0) throw new Error("ALREADY_PROCESSED");

        const moved = req.lines.filter((l) => (actual.get(l.id) ?? 0) > 0);
        const code = await nextDocCode(tx, "TRANSFER", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "TRANSFER",
            status: "PENDING", // kho đích xác nhận nhận đủ mới cộng tồn (luồng cũ, không đổi)
            fromWarehouseId: req.warehouseId,
            toWarehouseId: req.toWarehouseId,
            note: req.note ? `${req.code} · ${req.note}` : req.code,
            createdById: staffId,
            lines: { create: moved.map((l, i) => ({ itemId: l.itemId, quantity: actual.get(l.id)!, note: l.note, sort: i })) },
          },
        });
        for (const l of moved) await debitBalance(tx, req.warehouseId, l.itemId, actual.get(l.id)!);
        for (const l of req.lines) {
          await tx.stockRequestLine.update({ where: { id: l.id }, data: { confirmedQuantity: actual.get(l.id)! } });
        }
        await tx.stockRequest.update({ where: { id: requestId }, data: { documentId: doc.id } });
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_PROCESSED") return { error: t("errorAlreadyProcessed") };
    if (e instanceof InsufficientStockError) {
      const item = await prisma.inventoryItem.findUnique({ where: { id: e.itemId }, select: { code: true } });
      return { error: t("errorInsufficientAvailable", { items: item?.code ?? e.itemId }) };
    }
    throw e;
  }
  await audit(requestId, "UPDATE", "confirm transfer");
  await notifyByPermission("inventory.transfer.confirm", "INVENTORY_TRANSFER_INCOMING", `Phiếu chuyển kho theo lệnh ${req.code} đang tới`, "Vui lòng xác nhận khi nhận đủ hàng.");
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}

// ── K6: ĐỀ XUẤT HỦY HÀNG KHÁCH GỬI (DESTROY / DH) — thủ kho lập → team Account CHỦ duyệt → thủ kho chốt → phiếu XH ──
// Hàng khách gửi: MỌI việc dùng kể cả HỦY do team Account của khách/dự án đó quyết định cuối cùng (quyết định chủ dự án
// 18/08/2026). Hàng TCM (kể cả mua từ chi phí dự án) thủ kho vẫn hủy thẳng bằng phiếu XH như K1 — chỉ hàng khách qua cổng này.

export async function createDestroyRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.destroy");
  const t = await getTranslations("inventory.requests");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!warehouseId) return { error: t("errorInvalid") };
  if (!note) return { error: t("errorReasonRequired") };
  const { lines, error } = await parseLines(formData);
  if (error) return { error };

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: lines.map((l) => l.itemId) } },
    select: { id: true, code: true, ownerClientId: true, boundProjectId: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  const notClient = items.filter((i) => !i.ownerClientId);
  if (notClient.length > 0) return { error: t("errorDestroyOnlyClient", { items: notClient.map((i) => i.code).join(", ") }) };
  // Hủy lấy từ TỒN THỰC (không trừ giữ chỗ — hàng hết hạn có thể đang bị giữ chỗ), nhưng không hủy quá tồn.
  const balances = await prisma.stockBalance.findMany({ where: { warehouseId, itemId: { in: items.map((i) => i.id) } } });
  const balByItem = new Map(balances.map((b) => [b.itemId, b.quantity]));
  const short = lines.filter((l) => l.quantity > (balByItem.get(l.itemId) ?? 0));
  if (short.length > 0) return { error: t("errorInsufficientAvailable", { items: short.map((l) => byId.get(l.itemId)?.code ?? "").join(", ") }) };

  // Tách theo CHỦ (dự án sở hữu) — mỗi phiếu một người duyệt, y như đề xuất xuất.
  const groups = new Map<string, LineInput[]>();
  for (const l of lines) {
    const k = lotOwnerKey(byId.get(l.itemId)!, null);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const ownerProjectIds = [...groups.keys()].filter((k) => k && !k.startsWith("client:"));
  const ownerProjects = await prisma.project.findMany({
    where: { id: { in: ownerProjectIds } },
    select: { id: true, code: true, ownerId: true, leaderId: true, ownerTeam: { select: { code: true, leadStaffId: true } } },
  });
  const ownerById = new Map(ownerProjects.map((o) => [o.id, o]));

  const staffId = await getCurrentStaffId();
  const created: { id: string; code: string; ownerKey: string; count: number }[] = [];
  const now = new Date();
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      created.length = 0;
      let idx = 0;
      for (const [ownerKey, groupLines] of groups) {
        const code = await nextRequestCode(tx, "DESTROY", new Date(now.getTime() + idx++));
        const ownerProjectId = ownerKey && !ownerKey.startsWith("client:") ? ownerKey : null;
        const req = await tx.stockRequest.create({
          data: {
            code,
            type: "DESTROY",
            status: "PROPOSED",
            warehouseId,
            ownerProjectId,
            note: [groups.size > 1 ? `[Tách ${idx}/${groups.size} theo chủ sở hữu]` : "", note].filter(Boolean).join(" "),
            createdById: staffId,
            lines: { create: groupLines.map((l, i) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, sort: i })) },
          },
        });
        created.push({ id: req.id, code: req.code, ownerKey, count: groupLines.length });
      }
    })
  );
  for (const c of created) {
    await audit(c.id, "CREATE", "destroy request");
    const owner = c.ownerKey && !c.ownerKey.startsWith("client:") ? ownerById.get(c.ownerKey) : null;
    const recipients = owner ? approverStaffIds(owner) : [];
    const body = `${c.count} dòng hàng khách gửi${owner ? ` (dự án ${owner.code}, team ${owner.ownerTeam?.code ?? "?"})` : ""} — ${note}`;
    if (recipients.length) await notifyStaff(recipients, "INVENTORY_DESTROY_PENDING", `Đề xuất hủy hàng khách ${c.code} chờ duyệt`, body, owner?.id ?? null);
    else await notifyByPermission("inventory.request.approve_any", "INVENTORY_DESTROY_PENDING", `Đề xuất hủy hàng khách ${c.code} chờ duyệt`, `${body} — chưa gán PIC`, owner?.id ?? null);
  }
  revalidate();
  redirect(created.length === 1 ? `/inventory/requests/${created[0].id}` : "/inventory/requests");
}

export async function approveDestroyRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.approve");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({
    where: { id: requestId },
    include: { ownerProject: { select: { id: true, code: true, ownerId: true, leaderId: true, ownerTeam: { select: { leadStaffId: true } } } }, lines: true },
  });
  if (!req || req.type !== "DESTROY") return { error: t("errorInvalid") };
  const staffId = await getCurrentStaffId();
  const approveAny = await hasPermission("inventory.request.approve_any");
  // Không có dự án chủ (lô khách cũ chưa gắn dự án) → chỉ approve_any duyệt được.
  const ok = req.ownerProject ? canApproveIssue(req.ownerProject, staffId, approveAny) : approveAny;
  if (!ok) return { error: t("errorNotPic") };

  const approved = parseApprovedQuantities(req.lines, (id) => (formData.get(`qty_${id}`) === null ? null : String(formData.get(`qty_${id}`))));
  if (!approved) return { error: t("errorInvalid") };
  const reason = String(formData.get("reason") ?? "").trim();
  const decided = req.lines.map((l) => ({ ...l, approvedQuantity: approved.get(l.id)! }));
  const outcome = approvalOutcome(decided);
  if (outcome !== "FULL" && !reason) return { error: t("errorReasonRequired") };

  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    const claimed = await tx.stockRequest.updateMany({
      where: { id: requestId, status: "PROPOSED" },
      data:
        outcome === "REJECTED"
          ? { status: "REJECTED", rejectedById: staffId, rejectedAt: now, rejectReason: reason }
          : { status: "APPROVED", approvedById: staffId, approvedAt: now, rejectReason: reason || null },
    });
    if (claimed.count === 0) return false;
    for (const l of decided) await tx.stockRequestLine.update({ where: { id: l.id }, data: { approvedQuantity: l.approvedQuantity } });
    return true;
  });
  if (!done) return { error: t("errorAlreadyProcessed") };
  await audit(requestId, "UPDATE", `approve destroy:${outcome}${reason ? ` — ${reason}` : ""}`);
  const items = await prisma.inventoryItem.findMany({ where: { id: { in: req.lines.map((l) => l.itemId) } }, select: { id: true, code: true } });
  const codeOf = new Map(items.map((i) => [i.id, i.code]));
  const detail = decided.map((l) => `${codeOf.get(l.itemId) ?? l.itemId}: ${l.approvedQuantity}/${l.quantity}`).join(" · ");
  const title =
    outcome === "REJECTED" ? `Đề xuất hủy ${req.code} bị từ chối` : outcome === "FULL" ? `Đề xuất hủy ${req.code} được duyệt đủ — chờ thủ kho chốt` : `Đề xuất hủy ${req.code} được duyệt MỘT PHẦN — chờ thủ kho chốt`;
  await notifyStaff([req.createdById], outcome === "REJECTED" ? "INVENTORY_REQUEST_REJECTED" : "INVENTORY_REQUEST_APPROVED", title, reason ? `${detail} — ${reason}` : detail, req.ownerProjectId);
  revalidate();
  return { success: true };
}

export async function rejectDestroyRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.request.approve");
  const t = await getTranslations("inventory.requests");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: t("errorReasonRequired") };
  const req = await prisma.stockRequest.findUnique({
    where: { id: requestId },
    include: { ownerProject: { select: { id: true, ownerId: true, leaderId: true, ownerTeam: { select: { leadStaffId: true } } } } },
  });
  if (!req || req.type !== "DESTROY") return { error: t("errorInvalid") };
  const staffId = await getCurrentStaffId();
  const approveAny = await hasPermission("inventory.request.approve_any");
  const ok = req.ownerProject ? canApproveIssue(req.ownerProject, staffId, approveAny) : approveAny;
  if (!ok) return { error: t("errorNotPic") };
  const done = await prisma.stockRequest.updateMany({
    where: { id: requestId, status: "PROPOSED" },
    data: { status: "REJECTED", rejectedById: staffId, rejectedAt: new Date(), rejectReason: reason },
  });
  if (done.count === 0) return { error: t("errorAlreadyProcessed") };
  await prisma.stockRequestLine.updateMany({ where: { requestId }, data: { approvedQuantity: 0 } });
  await audit(requestId, "UPDATE", `reject destroy: ${reason}`);
  await notifyStaff([req.createdById], "INVENTORY_REQUEST_REJECTED", `Đề xuất hủy ${req.code} bị từ chối`, reason, req.ownerProjectId);
  revalidate();
  return { success: true };
}

/** Thủ kho chốt hủy ≤ số Account đã duyệt → phiếu XH + trừ tồn. */
export async function confirmDestroyRequest(requestId: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  await requirePermission("inventory.destroy");
  const t = await getTranslations("inventory.requests");
  const req = await prisma.stockRequest.findUnique({ where: { id: requestId }, include: { lines: true } });
  if (!req || req.type !== "DESTROY") return { error: t("errorInvalid") };
  const actual = new Map<string, number>();
  for (const l of req.lines) {
    const cap = effectiveApproved(l);
    const raw = formData.get(`qty_${l.id}`);
    const v = raw === null || String(raw).trim() === "" ? cap : Number(raw);
    if (!Number.isInteger(v) || v < 0 || v > cap) return { error: t("errorInvalid") };
    actual.set(l.id, v);
  }
  if ([...actual.values()].every((v) => v === 0)) return { error: t("errorNothingIssued") };
  const staffId = await getCurrentStaffId();
  let docId = "";
  try {
    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const claimed = await tx.stockRequest.updateMany({
          where: { id: requestId, status: confirmableStatus("DESTROY") },
          data: { status: "DONE", confirmedById: staffId, confirmedAt: new Date() },
        });
        if (claimed.count === 0) throw new Error("ALREADY_PROCESSED");
        const destroyed = req.lines.filter((l) => (actual.get(l.id) ?? 0) > 0);
        const code = await nextDocCode(tx, "DESTROY", new Date());
        const doc = await tx.stockDocument.create({
          data: {
            code,
            type: "DESTROY",
            status: "COMPLETED",
            fromWarehouseId: req.warehouseId,
            note: req.note ? `${req.code} · ${req.note}` : req.code,
            createdById: staffId,
            lines: { create: destroyed.map((l, i) => ({ itemId: l.itemId, quantity: actual.get(l.id)!, note: l.note, sort: i })) },
          },
        });
        for (const l of destroyed) await debitBalance(tx, req.warehouseId, l.itemId, actual.get(l.id)!);
        for (const l of req.lines) await tx.stockRequestLine.update({ where: { id: l.id }, data: { confirmedQuantity: actual.get(l.id)! } });
        await tx.stockRequest.update({ where: { id: requestId }, data: { documentId: doc.id } });
        docId = doc.id;
      })
    );
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_PROCESSED") return { error: t("errorAlreadyProcessed") };
    if (e instanceof InsufficientStockError) {
      const item = await prisma.inventoryItem.findUnique({ where: { id: e.itemId }, select: { code: true } });
      return { error: t("errorInsufficientAvailable", { items: item?.code ?? e.itemId }) };
    }
    throw e;
  }
  await audit(requestId, "UPDATE", "confirm destroy");
  await notifyStaff([req.approvedById], "INVENTORY_REQUEST_ISSUED", `Đã hủy hàng theo đề xuất ${req.code}`, null, req.ownerProjectId);
  revalidate();
  redirect(`/inventory/documents/${docId}`);
}
