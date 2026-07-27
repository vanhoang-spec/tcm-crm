"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit, toNum } from "@/lib/utils";
import { saveChatAttachment, FILE_MIME_TYPES, MAX_MEDIA_BYTES } from "@/lib/chat-storage";
import { parseCtvExcel, fillCtvDocx } from "@/lib/ctv";
import { ctvRowCost, ctvEffectiveLineId } from "@/lib/ctv-costing";
import { ctvRowSchema } from "@/lib/validators/ctv";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import fs from "fs/promises";
import path from "path";
import { hasPermission, requirePermission } from "@/lib/permissions";

export type CtvActionState = { error?: string; success?: boolean; count?: number };

/** Hình dạng 1 dòng CTV gửi về client — money field đã đổi BigInt→Number (an toàn, VND < 2^53). */
export type CtvRowClient = {
  id: string;
  sort: number;
  fullName: string;
  gender: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  idNumber: string | null;
  idIssueDate: string | null;
  idIssuePlace: string | null;
  permanentAddress: string | null;
  taxCode: string | null;
  bankAccountNo: string | null;
  bankName: string | null;
  bankBranch: string | null;
  phone: string | null;
  eventName: string | null;
  executionDate: string | null;
  acceptanceDate: string | null;
  executionLocation: string | null;
  workItem: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  grossNet: string | null;
  pitTax: number | null;
  netReceived: number | null;
  note: string | null;
  financeCostLineId: string | null;
  generated: boolean;
  generatedAt: string | null;
};

export type CtvImportState = CtvActionState & {
  rows?: CtvRowClient[];
  header?: { programFrom: string | null; programTo: string | null; teamLeader: string | null; workLocation: string | null };
};

export type CtvGenerateState = CtvActionState & { rows?: CtvRowClient[] };

function toClientRow(r: {
  id: string;
  sort: number;
  fullName: string;
  gender: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  idNumber: string | null;
  idIssueDate: string | null;
  idIssuePlace: string | null;
  permanentAddress: string | null;
  taxCode: string | null;
  bankAccountNo: string | null;
  bankName: string | null;
  bankBranch: string | null;
  phone: string | null;
  eventName: string | null;
  executionDate: string | null;
  acceptanceDate: string | null;
  executionLocation: string | null;
  workItem: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: bigint | null;
  amount: bigint | null;
  grossNet: string | null;
  pitTax: bigint | null;
  netReceived: bigint | null;
  note: string | null;
  financeCostLineId: string | null;
  generatedFileKey: string | null;
  generatedAt: Date | null;
}): CtvRowClient {
  return {
    ...r,
    unitPrice: r.unitPrice == null ? null : Number(r.unitPrice),
    amount: r.amount == null ? null : Number(r.amount),
    pitTax: r.pitTax == null ? null : Number(r.pitTax),
    netReceived: r.netReceived == null ? null : Number(r.netReceived),
    generated: !!r.generatedFileKey,
    generatedAt: r.generatedAt ? r.generatedAt.toISOString() : null,
  };
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

async function audit(entityType: string, entityId: string, action: string, payload: unknown) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType, entityId, field: "*", newValue: stringifyAudit(payload), action, changedBy: staffId },
  });
}

function revalidateOperations(projectId: string) {
  revalidatePath(`/projects/${projectId}/operations`);
}

export async function createCtvBatch(projectId: string, formData: FormData): Promise<CtvActionState> {
  await requirePermission("projects.ctv.manage");
  const meId = await getCurrentStaffId();
  const batch = await prisma.ctvBatch.create({
    data: { projectId, name: nullable(formData.get("name")), createdById: meId },
  });
  await audit("ctv_batch", batch.id, "CREATE", { projectId });
  revalidateOperations(projectId);
  return { success: true };
}

export async function deleteCtvBatch(batchId: string): Promise<CtvActionState> {
  await requirePermission("projects.ctv.manage");
  const batch = await prisma.ctvBatch.findUnique({ where: { id: batchId }, select: { projectId: true } });
  if (!batch) return { error: "NOT_FOUND" };
  await prisma.ctvBatch.delete({ where: { id: batchId } });
  await audit("ctv_batch", batchId, "DELETE", {});
  revalidateOperations(batch.projectId);
  return { success: true };
}

export async function saveCtvBatchHeader(batchId: string, formData: FormData): Promise<CtvActionState> {
  await requirePermission("projects.ctv.manage");
  const batch = await prisma.ctvBatch.findUnique({ where: { id: batchId }, select: { projectId: true } });
  if (!batch) return { error: "NOT_FOUND" };
  // Dòng CO mặc định của đợt — không tin client: dòng phải thuộc ĐÚNG dự án của đợt.
  const defaultFinanceCostLineId = nullable(formData.get("defaultFinanceCostLineId"));
  if (defaultFinanceCostLineId) {
    const line = await prisma.financeCostLine.findUnique({ where: { id: defaultFinanceCostLineId }, select: { projectId: true } });
    if (!line || line.projectId !== batch.projectId) return { error: "LINE_NOT_IN_PROJECT" };
  }
  await prisma.ctvBatch.update({
    where: { id: batchId },
    data: {
      name: nullable(formData.get("name")),
      programFrom: nullable(formData.get("programFrom")),
      programTo: nullable(formData.get("programTo")),
      teamLeader: nullable(formData.get("teamLeader")),
      workLocation: nullable(formData.get("workLocation")),
      defaultFinanceCostLineId,
    },
  });
  await audit("ctv_batch", batchId, "UPDATE_HEADER", {});
  revalidateOperations(batch.projectId);
  return { success: true };
}

/**
 * Import file Excel BM08 — parse rồi REPLACE-ALL toàn bộ dòng CtvContract của batch này (giống
 * pattern saveCostSheet). Không đụng batch khác. Cũng lưu lại file gốc (sourceFileKey) để tải lại.
 */
export async function importCtvExcel(batchId: string, formData: FormData): Promise<CtvImportState> {
  await requirePermission("projects.ctv.manage");
  const t = await getTranslations("projects.operations");
  const batch = await prisma.ctvBatch.findUnique({ where: { id: batchId }, select: { projectId: true } });
  if (!batch) return { error: "NOT_FOUND" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: t("importHint") };
  if (file.type !== XLSX_MIME && !FILE_MIME_TYPES.includes(file.type)) return { error: t("importHint") };
  if (file.size > MAX_MEDIA_BYTES) return { error: t("importHint") };

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseCtvExcel(buffer);
  } catch {
    return { error: t("importHint") };
  }

  const sourceFileKey = await saveChatAttachment(buffer, XLSX_MIME);

  await prisma.$transaction([
    prisma.ctvContract.deleteMany({ where: { batchId } }),
    prisma.ctvBatch.update({
      where: { id: batchId },
      data: {
        sourceFileKey,
        programFrom: parsed.header.programFrom,
        programTo: parsed.header.programTo,
        teamLeader: parsed.header.teamLeader,
        workLocation: parsed.header.workLocation,
      },
    }),
    prisma.ctvContract.createMany({
      data: parsed.rows.map((r) => ({
        batchId,
        sort: r.sort,
        fullName: r.fullName,
        gender: (r.gender as string | null) ?? null,
        dateOfBirth: (r.dateOfBirth as string | null) ?? null,
        nationality: (r.nationality as string | null) ?? null,
        idNumber: (r.idNumber as string | null) ?? null,
        idIssueDate: (r.idIssueDate as string | null) ?? null,
        idIssuePlace: (r.idIssuePlace as string | null) ?? null,
        permanentAddress: (r.permanentAddress as string | null) ?? null,
        taxCode: (r.taxCode as string | null) ?? null,
        bankAccountNo: (r.bankAccountNo as string | null) ?? null,
        bankName: (r.bankName as string | null) ?? null,
        bankBranch: (r.bankBranch as string | null) ?? null,
        phone: (r.phone as string | null) ?? null,
        eventName: (r.eventName as string | null) ?? null,
        executionDate: (r.executionDate as string | null) ?? null,
        acceptanceDate: (r.acceptanceDate as string | null) ?? null,
        executionLocation: (r.executionLocation as string | null) ?? null,
        workItem: (r.workItem as string | null) ?? null,
        unit: (r.unit as string | null) ?? null,
        quantity: (r.quantity as number | null) ?? null,
        unitPrice: r.unitPrice == null ? null : BigInt(Math.round(r.unitPrice as number)),
        amount: r.amount == null ? null : BigInt(Math.round(r.amount as number)),
        grossNet: (r.grossNet as string | null) ?? null,
        pitTax: r.pitTax == null ? null : BigInt(Math.round(r.pitTax as number)),
        netReceived: r.netReceived == null ? null : BigInt(Math.round(r.netReceived as number)),
        note: (r.note as string | null) ?? null,
      })),
    }),
  ]);

  const freshRows = await prisma.ctvContract.findMany({ where: { batchId }, orderBy: { sort: "asc" } });

  await audit("ctv_batch", batchId, "IMPORT_EXCEL", { rowCount: parsed.rows.length });
  revalidateOperations(batch.projectId);
  return {
    success: true,
    count: parsed.rows.length,
    rows: freshRows.map(toClientRow),
    header: parsed.header,
  };
}

export type CtvRowActionState = CtvActionState & { row?: CtvRowClient };

function rowDataFromPayload(r: ReturnType<typeof ctvRowSchema.parse>) {
  return {
    sort: r.sort,
    fullName: r.fullName,
    gender: r.gender || null,
    dateOfBirth: r.dateOfBirth || null,
    nationality: r.nationality || null,
    idNumber: r.idNumber || null,
    idIssueDate: r.idIssueDate || null,
    idIssuePlace: r.idIssuePlace || null,
    permanentAddress: r.permanentAddress || null,
    taxCode: r.taxCode || null,
    bankAccountNo: r.bankAccountNo || null,
    bankName: r.bankName || null,
    bankBranch: r.bankBranch || null,
    phone: r.phone || null,
    eventName: r.eventName || null,
    executionDate: r.executionDate || null,
    acceptanceDate: r.acceptanceDate || null,
    executionLocation: r.executionLocation || null,
    workItem: r.workItem || null,
    unit: r.unit || null,
    quantity: r.quantity ?? null,
    unitPrice: r.unitPrice == null ? null : BigInt(Math.round(r.unitPrice)),
    amount: r.amount == null ? null : BigInt(Math.round(r.amount)),
    grossNet: r.grossNet || null,
    pitTax: r.pitTax == null ? null : BigInt(Math.round(r.pitTax)),
    netReceived: r.netReceived == null ? null : BigInt(Math.round(r.netReceived)),
    note: r.note || null,
    financeCostLineId: r.financeCostLineId || null,
  };
}

/** Dòng CO gán vào dòng CTV phải thuộc ĐÚNG dự án — không tin id từ client. */
async function assertLineInProject(financeCostLineId: string | null, projectId: string): Promise<boolean> {
  if (!financeCostLineId) return true;
  const line = await prisma.financeCostLine.findUnique({ where: { id: financeCostLineId }, select: { projectId: true } });
  return !!line && line.projectId === projectId;
}

/**
 * Thêm 1 dòng CTV mới — lưu RIÊNG dòng này (khác import Excel — không đụng các dòng khác trong
 * batch, không làm mất generatedFileKey/generatedAt của dòng đã tạo biên bản trước đó).
 */
export async function createCtvRow(batchId: string, formData: FormData): Promise<CtvRowActionState> {
  await requirePermission("projects.ctv.manage");
  const batch = await prisma.ctvBatch.findUnique({ where: { id: batchId }, select: { projectId: true } });
  if (!batch) return { error: "NOT_FOUND" };

  let data;
  try {
    data = ctvRowSchema.parse(JSON.parse(str(formData.get("rowJson")) || "{}"));
  } catch {
    return { error: "INVALID_PAYLOAD" };
  }
  if (!(await assertLineInProject(data.financeCostLineId || null, batch.projectId))) return { error: "LINE_NOT_IN_PROJECT" };

  const created = await prisma.ctvContract.create({ data: { batchId, ...rowDataFromPayload(data) } });
  await audit("ctv_contract", created.id, "CREATE", {});
  revalidateOperations(batch.projectId);
  return { success: true, row: toClientRow(created) };
}

/** Sửa 1 dòng đã có sẵn — CHỈ update field nhập tay, không đụng generatedFileKey/generatedAt. */
export async function updateCtvRow(rowId: string, formData: FormData): Promise<CtvRowActionState> {
  await requirePermission("projects.ctv.manage");
  const existing = await prisma.ctvContract.findUnique({ where: { id: rowId }, select: { batch: { select: { projectId: true } } } });
  if (!existing) return { error: "NOT_FOUND" };

  let data;
  try {
    data = ctvRowSchema.parse(JSON.parse(str(formData.get("rowJson")) || "{}"));
  } catch {
    return { error: "INVALID_PAYLOAD" };
  }
  if (!(await assertLineInProject(data.financeCostLineId || null, existing.batch.projectId))) return { error: "LINE_NOT_IN_PROJECT" };

  const updated = await prisma.ctvContract.update({ where: { id: rowId }, data: rowDataFromPayload(data) });
  await audit("ctv_contract", rowId, "UPDATE", {});
  revalidateOperations(existing.batch.projectId);
  return { success: true, row: toClientRow(updated) };
}

export async function deleteCtvRow(rowId: string): Promise<CtvActionState> {
  await requirePermission("projects.ctv.manage");
  const existing = await prisma.ctvContract.findUnique({ where: { id: rowId }, select: { batch: { select: { projectId: true } } } });
  if (!existing) return { error: "NOT_FOUND" };
  await prisma.ctvContract.delete({ where: { id: rowId } });
  await audit("ctv_contract", rowId, "DELETE", {});
  revalidateOperations(existing.batch.projectId);
  return { success: true };
}

/**
 * Điền mẫu `templates/ctv-bien-ban.docx` cho từng CTV trong batch, lưu file qua chat-storage, set
 * generatedFileKey/generatedAt. Ghi đè file cũ nếu đã generate trước đó (không giữ lịch sử phiên bản).
 */
export async function generateCtvContracts(batchId: string): Promise<CtvGenerateState> {
  await requirePermission("projects.ctv.contract");
  const batch = await prisma.ctvBatch.findUnique({
    where: { id: batchId },
    include: { rows: true, project: { select: { id: true, code: true } } },
  });
  if (!batch) return { error: "NOT_FOUND" };
  if (batch.rows.length === 0) return { error: "NO_ROWS" };

  const templateBuffer = await fs.readFile(path.join(process.cwd(), "templates", "ctv-bien-ban.docx"));

  for (const row of batch.rows) {
    const filled = fillCtvDocx(
      templateBuffer,
      {
        fullName: row.fullName,
        gender: row.gender,
        dateOfBirth: row.dateOfBirth,
        idNumber: row.idNumber,
        idIssueDate: row.idIssueDate,
        idIssuePlace: row.idIssuePlace,
        permanentAddress: row.permanentAddress,
        taxCode: row.taxCode,
        bankAccountNo: row.bankAccountNo,
        bankName: row.bankName,
        bankBranch: row.bankBranch,
        phone: row.phone,
        workItem: row.workItem,
        unit: row.unit,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        amount: row.amount,
        pitTax: row.pitTax,
        netReceived: row.netReceived,
        executionDate: row.executionDate,
        acceptanceDate: row.acceptanceDate,
      },
      batch.workLocation,
      batch.project.code,
    );
    const generatedFileKey = await saveChatAttachment(filled, DOCX_MIME);
    await prisma.ctvContract.update({
      where: { id: row.id },
      data: { generatedFileKey, generatedAt: new Date() },
    });
  }

  const opsStaff = await prisma.staff.findMany({ where: { department: { code: "OPE" }, isActive: true } });
  if (opsStaff.length > 0) {
    await prisma.notification.createMany({
      data: opsStaff.map((s) => ({
        recipientStaffId: s.id,
        type: "CTV_CONTRACTS_GENERATED",
        title: `Đã tạo ${batch.rows.length} biên bản CTV — dự án ${batch.project.code}`,
        body: batch.name,
        projectId: batch.project.id,
      })),
    });
  }

  const freshRows = await prisma.ctvContract.findMany({ where: { batchId }, orderBy: { sort: "asc" } });

  await audit("ctv_batch", batchId, "GENERATE_CONTRACTS", { count: batch.rows.length });
  revalidateOperations(batch.project.id);
  return { success: true, count: batch.rows.length, rows: freshRows.map(toClientRow) };
}

// ── Đề xuất thanh toán đợt CTV ───────────────────────────
// Kênh trả CTV thật của TCM (quyết định CEO 27/07/2026): OPE đề xuất → KẾ TOÁN CHUYỂN KHOẢN THẲNG
// theo từng số tài khoản trong BM08. Vì vậy tiền CTV phải (1) ăn trần dòng CO và (2) vào dự trù
// cashflow — cả hai đều là việc VendorPayment đã làm sẵn. Action này gom tiền các dòng BM08 theo
// dòng CO hiệu lực rồi sinh MỖI DÒNG CO MỘT phiếu chi SCHEDULED gắn ctvBatchId; kế toán thấy ở
// /finance/vendor-payments, đánh dấu đã trả như mọi phiếu khác. KHÔNG dựng hệ thanh toán song song
// (bất biến #3), và vì thế tự dùng lại luôn đường huỷ phiếu + đối chiếu trần sẵn có.

export type CtvPaymentState = CtvActionState & { created?: number; total?: number };

/** Vendor "hộp thư" cho phiếu chi CTV — phiếu chi buộc phải có vendorId, mà CTV là cá nhân lẻ
 *  không phải NCC. Find-or-create MỘT vendor hệ thống dùng chung, không sinh vendor rác theo đợt. */
async function ctvSystemVendorId(): Promise<string> {
  const CODE = "CTV-BM08";
  const found = await prisma.vendor.findUnique({ where: { code: CODE }, select: { id: true } });
  if (found) return found.id;
  const created = await prisma.vendor.create({
    data: { code: CODE, name: "Cộng tác viên (BM08)", category: "OPE" },
  });
  return created.id;
}

export async function createCtvBatchPayments(batchId: string, _prev: CtvPaymentState, formData: FormData): Promise<CtvPaymentState> {
  await requirePermission("projects.ctv.manage");
  const t = await getTranslations("projects.operations");
  const batch = await prisma.ctvBatch.findUnique({
    where: { id: batchId },
    include: {
      rows: true,
      project: { select: { id: true, code: true, status: { select: { code: true } } } },
      vendorPayments: { where: { status: { not: "CANCELED" } }, select: { id: true } },
    },
  });
  if (!batch) return { error: "NOT_FOUND" };
  if (batch.rows.length === 0) return { error: "NO_ROWS" };
  if (!EXECUTION_STATUS_CODES.includes(batch.project.status.code as (typeof EXECUTION_STATUS_CODES)[number])) {
    return { error: t("payProjectNotExecuting") };
  }
  // Một đợt = một lần đề xuất. Sửa đợt sau khi đã đề xuất → huỷ phiếu cũ ở /finance/vendor-payments
  // rồi đề xuất lại (phiếu huỷ giữ bản ghi + lý do, không mất vết).
  if (batch.vendorPayments.length > 0) return { error: t("payAlreadyCreated") };

  // Gom tiền theo dòng CO hiệu lực (gán riêng thắng, trống thì kế thừa mặc định của đợt).
  const groups = new Map<string, number>();
  let unassigned = 0;
  for (const row of batch.rows) {
    const cost = ctvRowCost({
      amount: row.amount == null ? null : toNum(row.amount),
      pitTax: row.pitTax == null ? null : toNum(row.pitTax),
      netReceived: row.netReceived == null ? null : toNum(row.netReceived),
      grossNet: row.grossNet,
    });
    if (cost <= 0) continue;
    const lineId = ctvEffectiveLineId(row.financeCostLineId, batch.defaultFinanceCostLineId);
    if (!lineId) {
      unassigned += cost;
      continue;
    }
    groups.set(lineId, (groups.get(lineId) ?? 0) + cost);
  }
  // Còn tiền chưa gán được vào dòng CO nào thì DỪNG: sinh phiếu "mồ côi" là mất luôn đối chiếu
  // kế hoạch ↔ thực chi — đúng lỗ hổng đang vá. Không tìm được dòng CO tương ứng nghĩa là CO/CE
  // thiếu hạng mục → bổ sung CO/CE trước, không nới quy tắc.
  if (unassigned > 0) return { error: t("payUnassigned", { amount: unassigned }) };
  if (groups.size === 0) return { error: t("payNothing") };

  const lines = await prisma.financeCostLine.findMany({
    where: { id: { in: [...groups.keys()] } },
    select: { id: true, projectId: true, itemName: true, netAmount: true, isStale: true },
  });
  const lineById = new Map(lines.map((l) => [l.id, l]));
  for (const lineId of groups.keys()) {
    const line = lineById.get(lineId);
    if (!line || line.projectId !== batch.project.id) return { error: "LINE_NOT_IN_PROJECT" };
    // Dòng stale = dòng CO đã bị đổi/xoá ở bản mới — chi vào đây là chi cho khoản không còn tồn
    // tại trong khi dòng mới vẫn nguyên trần (chi hai lần). Cùng chốt chặn với requestAdvance.
    if (line.isStale) return { error: t("payStaleLine", { item: line.itemName }) };
  }

  // Trần từng dòng: vượt thì vẫn đề xuất được nhưng đòi quyền vượt trần + lý do (BM08 là số ĐÃ ký
  // với người thật — chặn cứng chỉ đẩy việc trả tiền ra ngoài hệ thống; sự kiện phát sinh thêm
  // người là chuyện hằng ngày của BTL). Mirror đúng mẫu phiếu chi cấp dự án vượt trần.
  const overCapNote = nullable(formData.get("overCapNote"));
  const overLines: string[] = [];
  for (const [lineId, total] of groups) {
    const line = lineById.get(lineId)!;
    const [advAgg, payAgg] = await Promise.all([
      prisma.advance.aggregate({ where: { financeCostLineId: lineId, status: { not: "CANCELED" } }, _sum: { amount: true } }),
      prisma.vendorPayment.aggregate({ where: { financeCostLineId: lineId, status: { not: "CANCELED" } }, _sum: { amount: true } }),
    ]);
    const remaining = toNum(line.netAmount) - toNum(advAgg._sum.amount ?? BigInt(0)) - toNum(payAgg._sum.amount ?? BigInt(0));
    if (total > remaining) overLines.push(line.itemName);
  }
  if (overLines.length > 0) {
    if (!(await hasPermission("finance.vendor_payment.over_cap"))) {
      return { error: t("payOverCap", { items: overLines.join(", ") }) };
    }
    if (!overCapNote) return { error: t("payOverCapReason", { items: overLines.join(", ") }) };
  }

  const [vendorId, staffId] = await Promise.all([ctvSystemVendorId(), getCurrentStaffId()]);
  const dueDate = nullable(formData.get("dueDate"));
  const label = batch.name ?? "BM08";

  // Check QUYẾT ĐỊNH trong transaction (2 người cùng đề xuất / phiếu khác chen vào giữa pre-check
  // và ghi): tính lại trần từng dòng + guard "đợt chưa có phiếu" trước khi ghi cả cụm.
  let createdCount = 0;
  let totalAmount = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.vendorPayment.count({ where: { ctvBatchId: batchId, status: { not: "CANCELED" } } });
      if (existing > 0) throw new Error("ALREADY_CREATED");
      for (const [lineId, total] of groups) {
        const line = lineById.get(lineId)!;
        const [advAgg, payAgg] = await Promise.all([
          tx.advance.aggregate({ where: { financeCostLineId: lineId, status: { not: "CANCELED" } }, _sum: { amount: true } }),
          tx.vendorPayment.aggregate({ where: { financeCostLineId: lineId, status: { not: "CANCELED" } }, _sum: { amount: true } }),
        ]);
        const remaining = toNum(line.netAmount) - toNum(advAgg._sum.amount ?? BigInt(0)) - toNum(payAgg._sum.amount ?? BigInt(0));
        const over = total > remaining;
        if (over && !overCapNote) throw new Error("EXCEED_LINE");
        await tx.vendorPayment.create({
          data: {
            vendorId,
            projectId: batch.project.id,
            financeCostLineId: lineId,
            ctvBatchId: batchId,
            amount: BigInt(Math.round(total)),
            dueDate: dueDate ? new Date(dueDate) : null,
            note: `CTV ${label} — ${line.itemName}`,
            overCapNote: over ? overCapNote : null,
            createdById: staffId,
          },
        });
        createdCount++;
        totalAmount += total;
      }
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "ALREADY_CREATED") return { error: t("payAlreadyCreated") };
    if (code === "EXCEED_LINE") return { error: t("payOverCapReason", { items: overLines.join(", ") }) };
    throw e;
  }

  // Báo Kế toán SAU commit — họ là người chuyển khoản theo BM08.
  const finStaff = await prisma.staff.findMany({ where: { department: { code: "FIN" }, isActive: true } });
  if (finStaff.length > 0) {
    await prisma.notification.createMany({
      data: finStaff.map((s) => ({
        recipientStaffId: s.id,
        type: "CTV_PAYMENT_REQUESTED",
        title: `Đề xuất thanh toán CTV — dự án ${batch.project.code}`,
        body: `${label}: ${createdCount} phiếu, tổng ${totalAmount.toLocaleString("vi-VN")}đ`,
        projectId: batch.project.id,
      })),
    });
  }
  await audit("ctv_batch", batchId, "CREATE_PAYMENTS", { created: createdCount, total: totalAmount, overCap: overLines.length > 0 ? overCapNote : null });
  revalidateOperations(batch.project.id);
  revalidatePath("/finance/vendor-payments");
  revalidatePath("/finance");
  return { success: true, created: createdCount, total: totalAmount };
}
