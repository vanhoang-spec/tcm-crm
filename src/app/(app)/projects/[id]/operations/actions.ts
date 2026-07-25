"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit } from "@/lib/utils";
import { saveChatAttachment, FILE_MIME_TYPES, MAX_MEDIA_BYTES } from "@/lib/chat-storage";
import { parseCtvExcel, fillCtvDocx } from "@/lib/ctv";
import { ctvRowSchema } from "@/lib/validators/ctv";
import fs from "fs/promises";
import path from "path";

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
  const meId = await getCurrentStaffId();
  const batch = await prisma.ctvBatch.create({
    data: { projectId, name: nullable(formData.get("name")), createdById: meId },
  });
  await audit("ctv_batch", batch.id, "CREATE", { projectId });
  revalidateOperations(projectId);
  return { success: true };
}

export async function deleteCtvBatch(batchId: string): Promise<CtvActionState> {
  const batch = await prisma.ctvBatch.findUnique({ where: { id: batchId }, select: { projectId: true } });
  if (!batch) return { error: "NOT_FOUND" };
  await prisma.ctvBatch.delete({ where: { id: batchId } });
  await audit("ctv_batch", batchId, "DELETE", {});
  revalidateOperations(batch.projectId);
  return { success: true };
}

export async function saveCtvBatchHeader(batchId: string, formData: FormData): Promise<CtvActionState> {
  const batch = await prisma.ctvBatch.findUnique({ where: { id: batchId }, select: { projectId: true } });
  if (!batch) return { error: "NOT_FOUND" };
  await prisma.ctvBatch.update({
    where: { id: batchId },
    data: {
      name: nullable(formData.get("name")),
      programFrom: nullable(formData.get("programFrom")),
      programTo: nullable(formData.get("programTo")),
      teamLeader: nullable(formData.get("teamLeader")),
      workLocation: nullable(formData.get("workLocation")),
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
  };
}

/**
 * Thêm 1 dòng CTV mới — lưu RIÊNG dòng này (khác import Excel — không đụng các dòng khác trong
 * batch, không làm mất generatedFileKey/generatedAt của dòng đã tạo biên bản trước đó).
 */
export async function createCtvRow(batchId: string, formData: FormData): Promise<CtvRowActionState> {
  const batch = await prisma.ctvBatch.findUnique({ where: { id: batchId }, select: { projectId: true } });
  if (!batch) return { error: "NOT_FOUND" };

  let data;
  try {
    data = ctvRowSchema.parse(JSON.parse(str(formData.get("rowJson")) || "{}"));
  } catch {
    return { error: "INVALID_PAYLOAD" };
  }

  const created = await prisma.ctvContract.create({ data: { batchId, ...rowDataFromPayload(data) } });
  await audit("ctv_contract", created.id, "CREATE", {});
  revalidateOperations(batch.projectId);
  return { success: true, row: toClientRow(created) };
}

/** Sửa 1 dòng đã có sẵn — CHỈ update field nhập tay, không đụng generatedFileKey/generatedAt. */
export async function updateCtvRow(rowId: string, formData: FormData): Promise<CtvRowActionState> {
  const existing = await prisma.ctvContract.findUnique({ where: { id: rowId }, select: { batch: { select: { projectId: true } } } });
  if (!existing) return { error: "NOT_FOUND" };

  let data;
  try {
    data = ctvRowSchema.parse(JSON.parse(str(formData.get("rowJson")) || "{}"));
  } catch {
    return { error: "INVALID_PAYLOAD" };
  }

  const updated = await prisma.ctvContract.update({ where: { id: rowId }, data: rowDataFromPayload(data) });
  await audit("ctv_contract", rowId, "UPDATE", {});
  revalidateOperations(existing.batch.projectId);
  return { success: true, row: toClientRow(updated) };
}

export async function deleteCtvRow(rowId: string): Promise<CtvActionState> {
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
