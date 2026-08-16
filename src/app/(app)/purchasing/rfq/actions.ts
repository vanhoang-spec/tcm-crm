"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { stringifyAudit, toNum } from "@/lib/utils";
import { hashGuestToken } from "@/lib/guest-session";
import { resolveRfqTemplate, isRfqTemplateCode } from "@/lib/rfq-templates";
import { RFQ_FILE_MIME_TYPES, MAX_RFQ_FILE_BYTES, MAX_RFQ_TEXT_CHARS, RFQ_OPEN_FOR_QUOTES, makeRfqCode, tokenExpiryFor } from "@/lib/rfq";
import { parseQuoteFormData, writeVendorQuote } from "@/lib/rfq-server";
import { saveRfqFile, readRfqFile } from "@/lib/rfq-storage";
import { extractTextFromFile } from "@/lib/ai/extract-text";
import { aiChatJson, AiError } from "@/lib/ai/deepseek";
import { rfqParseMessages, rfqParseSchema, type RfqParseResult } from "@/lib/ai/rfq-prompts";

export type RfqFormState = { error?: string; success?: boolean; token?: string; tokenVendorId?: string; parsed?: RfqParseResult; errorCode?: string };

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function dateOrNull(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s) : null; // UTC-midnight (HANDOVER 4.3)
}

async function audit(rfqId: string, action: string, payload: unknown) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType: "rfq", entityId: rfqId, field: "*", newValue: stringifyAudit(payload), action, changedBy: staffId },
  });
}

function revalidateRfq(rfqId?: string, projectId?: string) {
  revalidatePath("/purchasing");
  if (rfqId) revalidatePath(`/purchasing/rfq/${rfqId}`);
  if (projectId) revalidatePath(`/projects/${projectId}/purchasing`);
}

/**
 * Tạo RFQ (nháp) từ các dòng CO đã tick. Dòng RFQ là ẢNH CHỤP: tên/mô tả/ĐVT/SL/đơn giá CO trước thuế
 * + `stableKey` để về sau (PUR-1b) ghi ngược giá chốt vào đúng dòng dù bảng CO đã lưu lại nhiều lần.
 * Chỉ nhận dòng QTY_PRICE/FIXED, không dòng % (không có "đơn giá" để hỏi), không dòng kho K3 (giá 0
 * cố ý, hàng lấy từ kho TCM).
 */
export async function createRfq(_prev: RfqFormState, formData: FormData): Promise<RfqFormState> {
  await requirePermission("purchasing.rfq.manage");
  const staffId = await getCurrentStaffId();

  const projectId = str(formData.get("projectId"));
  if (!projectId) return { error: "NO_PROJECT" };
  const groupCode = str(formData.get("groupCode"));
  if (!isRfqTemplateCode(groupCode)) return { error: "NO_TEMPLATE" };
  const title = str(formData.get("title")).slice(0, 200);
  if (!title) return { error: "NO_TITLE" };
  const stableKeys = formData.getAll("lineKey").map((v) => String(v)).filter(Boolean);
  if (stableKeys.length === 0) return { error: "NO_LINES" };
  const vendorIds = [...new Set(formData.getAll("vendorId").map((v) => String(v)).filter(Boolean))];
  if (vendorIds.length === 0) return { error: "NO_VENDORS" };
  const departmentTaskId = nullable(formData.get("departmentTaskId"));

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true } });
  if (!project) return { error: "NOT_FOUND" };

  // Đọc dòng CO SỐNG theo stableKey (server, không tin payload): đúng dự án, không dòng %, không dòng kho.
  const sheet = await prisma.costSheet.findFirst({
    where: { projectId, version: "CTRACT" },
    orderBy: { createdAt: "desc" },
    select: { id: true, sections: { select: { lines: { where: { stableKey: { in: stableKeys } }, orderBy: { sort: "asc" } } } } },
  });
  if (!sheet) return { error: "NO_LINES" };
  const lines = sheet.sections.flatMap((s) => s.lines).filter((l) => l.stableKey && l.lineType !== "PERCENT_OF_TOTAL" && !l.stockResvLineId);
  if (lines.length === 0) return { error: "NO_LINES" };
  const vendors = await prisma.vendor.findMany({ where: { id: { in: vendorIds }, isActive: true }, select: { id: true } });
  if (vendors.length === 0) return { error: "NO_VENDORS" };
  if (departmentTaskId) {
    const task = await prisma.departmentTask.findFirst({ where: { id: departmentTaskId, projectId, department: "PCC" }, select: { id: true } });
    if (!task) return { error: "NOT_FOUND" };
  }

  const seq = (await prisma.rfq.count({ where: { projectId } })) + 1;
  const rfq = await prisma.rfq.create({
    data: {
      code: makeRfqCode(project.code, seq),
      projectId,
      departmentTaskId,
      groupCode,
      title,
      note: nullable(formData.get("note")),
      deadline: dateOrNull(formData.get("deadline")),
      status: "DRAFT",
      createdById: staffId,
      lines: {
        create: lines.map((l, i) => ({
          costLineStableKey: l.stableKey as string,
          itemName: l.itemName,
          specs: l.specs,
          unit: l.unit,
          quantity: l.quantity,
          // Đơn giá CO TRƯỚC THUẾ — cùng số PUR đang thấy ở cột "CO trước thuế" của builder.
          refUnitPrice: l.lineType === "FIXED" ? BigInt(Math.round(toNum(l.fixedAmount ?? BigInt(0)) / (l.quantity || 1))) : l.unitPrice,
          sort: i,
        })),
      },
      vendors: { create: vendors.map((v) => ({ vendorId: v.id })) },
    },
    select: { id: true },
  });
  await audit(rfq.id, "CREATE", { code: makeRfqCode(project.code, seq), lines: lines.length, vendors: vendors.length, groupCode });
  revalidateRfq(rfq.id, projectId);
  redirect(`/purchasing/rfq/${rfq.id}`);
}

/** DRAFT → SENT: từ đây link cổng NCC mới có hiệu lực. */
export async function issueRfq(rfqId: string) {
  await requirePermission("purchasing.rfq.manage");
  const r = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { status: true, projectId: true } });
  if (!r || r.status !== "DRAFT") return;
  await prisma.rfq.update({ where: { id: rfqId }, data: { status: "SENT" } });
  await audit(rfqId, "ISSUE", {});
  revalidateRfq(rfqId, r.projectId);
}

export async function cancelRfq(rfqId: string) {
  await requirePermission("purchasing.rfq.manage");
  const r = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { status: true, projectId: true } });
  if (!r || r.status === "CONFIRMED" || r.status === "CANCELED") return;
  await prisma.rfq.update({ where: { id: rfqId }, data: { status: "CANCELED" } });
  await audit(rfqId, "CANCEL", { from: r.status });
  revalidateRfq(rfqId, r.projectId);
}

/**
 * Phát token cổng NCC. Token thô CHỈ trả về một lần trong state (PUR copy gửi NCC); DB lưu sha256
 * (khuôn GuestInvite). Phát lại = thu hồi token cũ. Hết hạn = hạn báo giá + 7 ngày (hoặc 30 ngày).
 */
export async function issueVendorToken(rfqVendorId: string, _prev: RfqFormState, _fd: FormData): Promise<RfqFormState> {
  await requirePermission("purchasing.rfq.manage");
  const rv = await prisma.rfqVendor.findUnique({ where: { id: rfqVendorId }, select: { id: true, vendorId: true, rfq: { select: { id: true, status: true, deadline: true, projectId: true } } } });
  if (!rv) return { error: "NOT_FOUND" };
  if (!(RFQ_OPEN_FOR_QUOTES as readonly string[]).includes(rv.rfq.status)) return { error: "BAD_STATUS" };
  const token = randomBytes(32).toString("base64url");
  await prisma.rfqVendor.update({
    where: { id: rfqVendorId },
    data: { tokenHash: hashGuestToken(token), tokenExpiresAt: tokenExpiryFor(rv.rfq.deadline, new Date()), revokedAt: null },
  });
  await audit(rv.rfq.id, "TOKEN_ISSUE", { rfqVendorId });
  revalidateRfq(rv.rfq.id, rv.rfq.projectId);
  return { success: true, token, tokenVendorId: rv.vendorId };
}

export async function revokeVendorToken(rfqVendorId: string) {
  await requirePermission("purchasing.rfq.manage");
  const rv = await prisma.rfqVendor.findUnique({ where: { id: rfqVendorId }, select: { rfq: { select: { id: true, projectId: true } } } });
  if (!rv) return;
  await prisma.rfqVendor.update({ where: { id: rfqVendorId }, data: { revokedAt: new Date() } });
  await audit(rv.rfq.id, "TOKEN_REVOKE", { rfqVendorId });
  revalidateRfq(rv.rfq.id, rv.rfq.projectId);
}

/** PUR nhập hộ / lưu sau khi AI bóc (via = MANUAL hoặc FILE nếu có fileKey đính kèm từ lượt upload). */
export async function saveVendorQuoteManual(rfqVendorId: string, _prev: RfqFormState, formData: FormData): Promise<RfqFormState> {
  await requirePermission("purchasing.rfq.manage");
  const rv = await prisma.rfqVendor.findUnique({ where: { id: rfqVendorId }, select: { fileKey: true, rfq: { select: { id: true, groupCode: true, lines: { select: { id: true } } } } } });
  if (!rv) return { error: "NOT_FOUND" };
  const template = resolveRfqTemplate(rv.rfq.groupCode);
  if (!template) return { error: "NO_TEMPLATE" };
  const { lines, terms } = parseQuoteFormData(formData, rv.rfq.lines.map((l) => l.id), template);
  const viaRaw = str(formData.get("via"));
  const via = viaRaw === "FILE" && rv.fileKey ? "FILE" : "MANUAL";
  const res = await writeVendorQuote({ rfqVendorId, lines, terms, note: nullable(formData.get("vendorNote")), via });
  if (!res.ok) return { error: res.error };
  await audit(rv.rfq.id, "QUOTE_SAVE", { rfqVendorId, via, written: res.written });
  revalidateRfq(res.rfqId, res.projectId);
  return { success: true };
}

export async function markVendorDeclined(rfqVendorId: string) {
  await requirePermission("purchasing.rfq.manage");
  const rv = await prisma.rfqVendor.findUnique({ where: { id: rfqVendorId }, select: { rfq: { select: { id: true, projectId: true } } } });
  if (!rv) return;
  await prisma.rfqVendor.update({ where: { id: rfqVendorId }, data: { status: "DECLINED" } });
  await audit(rv.rfq.id, "VENDOR_DECLINED", { rfqVendorId });
  revalidateRfq(rv.rfq.id, rv.rfq.projectId);
}

/**
 * Upload file NCC gửi (Excel/PDF/…): LƯU FILE trước (hồ sơ phải giữ được kể cả khi AI không đọc nổi),
 * rồi nếu người dùng có `purchasing.rfq.ai` và tick "AI đọc" thì bóc text → DeepSeek → Zod → TRẢ VỀ
 * FORM (state.parsed) để PUR kiểm rồi bấm Lưu. KHÔNG ghi thẳng báo giá.
 */
export async function uploadVendorQuoteFile(rfqVendorId: string, _prev: RfqFormState, formData: FormData): Promise<RfqFormState> {
  await requirePermission("purchasing.rfq.manage");
  const rv = await prisma.rfqVendor.findUnique({
    where: { id: rfqVendorId },
    select: {
      id: true,
      vendor: { select: { name: true } },
      rfq: { select: { id: true, status: true, title: true, groupCode: true, projectId: true, lines: { select: { id: true, itemName: true, specs: true, unit: true, quantity: true }, orderBy: { sort: "asc" } } } },
    },
  });
  if (!rv) return { error: "NOT_FOUND" };
  if (!(RFQ_OPEN_FOR_QUOTES as readonly string[]).includes(rv.rfq.status)) return { error: "BAD_STATUS" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "NO_FILE" };
  if (!(RFQ_FILE_MIME_TYPES as readonly string[]).includes(file.type)) return { error: "BAD_TYPE" };
  if (file.size > MAX_RFQ_FILE_BYTES) return { error: "TOO_BIG" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await saveRfqFile(buffer, file.type);
  await prisma.rfqVendor.update({ where: { id: rfqVendorId }, data: { fileKey: key, fileName: file.name.slice(0, 200) } });
  await audit(rv.rfq.id, "FILE_UPLOAD", { rfqVendorId, fileName: file.name, size: file.size });
  revalidateRfq(rv.rfq.id, rv.rfq.projectId);

  if (formData.get("useAi") !== "on") return { success: true };
  // AI là ĐẶC QUYỀN THÊM chồng lên quyền quản lý RFQ (mirror recruit.ai_parse / mkt.generate).
  if (!(await hasPermission("purchasing.rfq.ai"))) return { success: true, error: "NO_AI_PERM" };
  return runAiParse(rv, buffer, file.type);
}

/** AI đọc lại file ĐÃ upload trước đó (nút riêng, không cần upload lại). */
export async function parseVendorQuoteWithAi(rfqVendorId: string, _prev: RfqFormState, _fd: FormData): Promise<RfqFormState> {
  await requirePermission("purchasing.rfq.manage");
  if (!(await hasPermission("purchasing.rfq.ai"))) return { error: "NO_AI_PERM" };
  const rv = await prisma.rfqVendor.findUnique({
    where: { id: rfqVendorId },
    select: {
      id: true,
      fileKey: true,
      fileName: true,
      vendor: { select: { name: true } },
      rfq: { select: { id: true, status: true, title: true, groupCode: true, projectId: true, lines: { select: { id: true, itemName: true, specs: true, unit: true, quantity: true }, orderBy: { sort: "asc" } } } },
    },
  });
  if (!rv || !rv.fileKey) return { error: "NO_FILE" };
  const mime = mimeFromKey(rv.fileKey);
  let buffer: Buffer;
  try {
    buffer = await readRfqFile(rv.fileKey);
  } catch {
    return { error: "NO_FILE" };
  }
  return runAiParse(rv, buffer, mime);
}

function mimeFromKey(key: string): string {
  const ext = key.split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    txt: "text/plain",
    jpg: "image/jpeg",
    png: "image/png",
  };
  return map[ext] ?? "application/octet-stream";
}

async function runAiParse(
  rv: { id: string; vendor: { name: string }; rfq: { id: string; title: string; groupCode: string; lines: { id: string; itemName: string; specs: string | null; unit: string | null; quantity: number }[] } },
  buffer: Buffer,
  mime: string,
): Promise<RfqFormState> {
  const template = resolveRfqTemplate(rv.rfq.groupCode);
  if (!template) return { error: "NO_TEMPLATE" };
  let text: string;
  try {
    const extracted = await extractTextFromFile(buffer, mime);
    if (!extracted || !extracted.text.trim()) return { error: "UNREADABLE" };
    text = extracted.text.slice(0, MAX_RFQ_TEXT_CHARS);
  } catch (e) {
    console.error("[RFQ] lỗi bóc text file báo giá:", e);
    return { error: "UNREADABLE" };
  }
  let raw: unknown;
  try {
    // KHÔNG bọc transaction quanh call AI (SQLite single-writer, tới 75s).
    raw = await aiChatJson(rfqParseMessages({ template, rfqTitle: rv.rfq.title, vendorName: rv.vendor.name, lines: rv.rfq.lines, fileText: text }), { temperature: 0 });
  } catch (e) {
    console.error("[RFQ] lỗi gọi AI đọc báo giá:", e);
    return { error: "AI_FAILED", errorCode: e instanceof AiError ? e.code : "UNKNOWN" };
  }
  const parsed = rfqParseSchema.safeParse(raw);
  if (!parsed.success) return { error: "AI_FAILED", errorCode: "BAD_SHAPE" };
  // Loại dòng lạ (id không thuộc RFQ) — model có thể bịa id.
  const valid = new Set(rv.rfq.lines.map((l) => l.id));
  const clean: RfqParseResult = { ...parsed.data, lines: parsed.data.lines.filter((l) => valid.has(l.rfqLineId)) };
  await audit(rv.rfq.id, "AI_PARSE", { rfqVendorId: rv.id, lines: clean.lines.length, unmatched: clean.unmatched.length, confidence: clean.confidence ?? null });
  return { success: true, parsed: clean };
}
