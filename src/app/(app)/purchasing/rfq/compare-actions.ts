"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { stringifyAudit, toNum } from "@/lib/utils";
import { loadRfqTemplate } from "@/lib/rfq-groups";
import { loadCompareMatrix, matrixToText, canConfirmRfq } from "@/lib/rfq-server";
import { parseSelection, type RfqSelection } from "@/lib/rfq-compare";
import { aiChatJson, AiError } from "@/lib/ai/deepseek";
import { rfqCompareMessages, rfqCompareSchema, type RfqCompareResult } from "@/lib/ai/rfq-prompts";
import { buildSheetPayloadFromDb } from "@/lib/costsheet-import-server";
import { saveCostSheet } from "@/app/(app)/bidding/actions";

export type CompareState = { error?: string; errorCode?: string; success?: boolean; ai?: RfqCompareResult; createdRevNo?: number };

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
async function audit(rfqId: string, action: string, payload: unknown) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType: "rfq", entityId: rfqId, field: "*", newValue: stringifyAudit(payload), action, changedBy: staffId } });
}
function revalidateRfq(rfqId: string, projectId: string) {
  revalidatePath("/purchasing");
  revalidatePath(`/purchasing/rfq/${rfqId}`);
  revalidatePath(`/projects/${projectId}/purchasing`);
  revalidatePath(`/projects/${projectId}/co-ce`);
  revalidatePath(`/bidding/${projectId}`);
}

/**
 * AI NHẬN XÉT ma trận so sánh (PUR-1b). Số đã tính bằng code (lib/rfq-compare.ts) — AI chỉ viết
 * nhận xét + gợi ý; kết quả lưu vào `Rfq.aiJson` làm BẢN NHÁP cho PUR đọc, KHÔNG tự chọn NCC.
 * Đặc quyền AI: kiểm `purchasing.rfq.ai` BÊN TRONG action đã gác `purchasing.rfq.manage`.
 */
export async function runRfqCompareAi(rfqId: string, _prev: CompareState, _fd: FormData): Promise<CompareState> {
  await requirePermission("purchasing.rfq.manage");
  if (!(await hasPermission("purchasing.rfq.ai"))) return { error: "NO_AI_PERM" };
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { id: true, title: true, groupCode: true, status: true, projectId: true } });
  if (!rfq) return { error: "NOT_FOUND" };
  if (!["COMPARING", "SENT"].includes(rfq.status)) return { error: "BAD_STATUS" };
  const matrix = await loadCompareMatrix(rfqId);
  if (!matrix || matrix.vendors.filter((v) => v.status === "SUBMITTED").length === 0) return { error: "NO_QUOTES" };
  const template = await loadRfqTemplate(rfq.groupCode);
  let raw: unknown;
  try {
    // KHÔNG bọc transaction quanh call AI.
    raw = await aiChatJson(rfqCompareMessages({ rfqTitle: rfq.title, templateLabel: template?.labelVi ?? rfq.groupCode, matrixText: matrixToText(matrix) }), { temperature: 0.2 });
  } catch (e) {
    console.error("[RFQ] lỗi gọi AI so sánh:", e);
    return { error: "AI_FAILED", errorCode: e instanceof AiError ? e.code : "UNKNOWN" };
  }
  const parsed = rfqCompareSchema.safeParse(raw);
  if (!parsed.success) return { error: "AI_FAILED", errorCode: "BAD_SHAPE" };
  // Loại gợi ý trỏ vào NCC/dòng không tồn tại (model có thể bịa id).
  const vendorIds = new Set(matrix.vendors.map((v) => v.rfqVendorId));
  const lineIds = new Set(matrix.lines.map((l) => l.rfqLineId));
  const clean: RfqCompareResult = {
    ...parsed.data,
    lineSuggestions: parsed.data.lineSuggestions
      .filter((s) => lineIds.has(s.rfqLineId))
      .map((s) => ({ ...s, rfqVendorId: s.rfqVendorId && vendorIds.has(s.rfqVendorId) ? s.rfqVendorId : null })),
  };
  await prisma.rfq.update({ where: { id: rfqId }, data: { aiJson: JSON.stringify(clean) } });
  await audit(rfqId, "AI_COMPARE", { suggestions: clean.lineSuggestions.length });
  revalidateRfq(rfqId, rfq.projectId);
  return { success: true, ai: clean };
}

/**
 * PUR chọn NCC từng dòng + lý do → `finalJson` (chưa trình). Radio `pick_<lineId>` = rfqVendorId
 * (rỗng = không chọn / giữ CO), `reason_<lineId>`, `selectionNote`. Chỉ nhận NCC ĐÃ BÁO dòng đó.
 */
export async function saveRfqSelection(rfqId: string, _prev: CompareState, formData: FormData): Promise<CompareState> {
  await requirePermission("purchasing.rfq.manage");
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { status: true, projectId: true } });
  if (!rfq) return { error: "NOT_FOUND" };
  if (!["COMPARING", "SUBMITTED"].includes(rfq.status)) return { error: "BAD_STATUS" };
  const matrix = await loadCompareMatrix(rfqId);
  if (!matrix) return { error: "NOT_FOUND" };
  const picks: RfqSelection["picks"] = {};
  for (const l of matrix.lines) {
    const rv = str(formData.get(`pick_${l.rfqLineId}`));
    if (!rv) continue;
    if (!l.cells.some((c) => c.rfqVendorId === rv)) continue; // NCC không báo dòng này — bỏ
    picks[l.rfqLineId] = { rfqVendorId: rv, reason: str(formData.get(`reason_${l.rfqLineId}`)).slice(0, 300) };
  }
  if (Object.keys(picks).length === 0) return { error: "NO_PICKS" };
  const sel: RfqSelection = { picks, note: str(formData.get("selectionNote")).slice(0, 1000) || null };
  await prisma.rfq.update({ where: { id: rfqId }, data: { finalJson: JSON.stringify(sel) } });
  await audit(rfqId, "SELECTION_SAVE", { picks: Object.keys(picks).length });
  revalidateRfq(rfqId, rfq.projectId);
  return { success: true };
}

/** PUR TRÌNH Account (một nút = lưu lựa chọn + trình): mỗi dòng đã chọn phải có lý do; báo PIC + Leader dự án. */
export async function submitRfqToAccount(rfqId: string, _prev: CompareState, formData: FormData): Promise<CompareState> {
  await requirePermission("purchasing.rfq.manage");
  const staffId = await getCurrentStaffId();
  const saved = await saveRfqSelection(rfqId, {}, formData);
  if (saved.error) return saved;
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId }, include: { project: { select: { id: true, code: true, ownerId: true, leaderId: true } } } });
  if (!rfq) return { error: "NOT_FOUND" };
  if (rfq.status !== "COMPARING") return { error: "BAD_STATUS" };
  const sel = parseSelection(rfq.finalJson);
  if (!sel) return { error: "NO_PICKS" };
  if (Object.values(sel.picks).some((p) => !p.reason.trim())) return { error: "REASON_REQUIRED" };
  sel.submittedAt = new Date().toISOString();
  await prisma.rfq.update({ where: { id: rfqId }, data: { status: "SUBMITTED", submittedAt: new Date(), submittedById: staffId, finalJson: JSON.stringify(sel) } });
  await audit(rfqId, "SUBMIT_TO_ACCOUNT", { picks: Object.keys(sel.picks).length });
  const recipients = [...new Set([rfq.project.ownerId, rfq.project.leaderId].filter((x): x is string => !!x && x !== staffId))];
  if (recipients.length) {
    await prisma.notification.createMany({
      data: recipients.map((r) => ({ recipientStaffId: r, type: "RFQ_SUBMITTED", title: `PUR trình phương án NCC — ${rfq.code}`, body: rfq.title, projectId: rfq.projectId })),
    });
  }
  revalidateRfq(rfqId, rfq.projectId);
  return { success: true };
}

/** Account trả lại PUR (cần bàn thêm) → COMPARING + ghi chú bắt buộc + báo người trình. */
export async function returnRfqToPur(rfqId: string, _prev: CompareState, formData: FormData): Promise<CompareState> {
  await requirePermission("purchasing.view");
  const rfqPre = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { projectId: true } });
  if (!rfqPre) return { error: "NOT_FOUND" };
  // Account (PIC/Leader/người duyệt CO) trả lại, hoặc PUR tự rút về sửa.
  if (!(await canConfirmRfq(rfqPre.projectId)) && !(await hasPermission("purchasing.rfq.manage"))) return { error: "NO_PERM" };
  const note = str(formData.get("returnNote")).slice(0, 1000);
  if (!note) return { error: "REASON_REQUIRED" };
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { status: true, code: true, projectId: true, submittedById: true } });
  if (!rfq || rfq.status !== "SUBMITTED") return { error: "BAD_STATUS" };
  const staffId = await getCurrentStaffId();
  await prisma.rfq.update({ where: { id: rfqId }, data: { status: "COMPARING", submittedAt: null } });
  await audit(rfqId, "RETURN_TO_PUR", { note });
  if (rfq.submittedById && rfq.submittedById !== staffId) {
    await prisma.notification.create({ data: { recipientStaffId: rfq.submittedById, type: "RFQ_RETURNED", title: `Account trả lại phương án NCC — ${rfq.code}`, body: note, projectId: rfq.projectId } });
  }
  revalidateRfq(rfqId, rfq.projectId);
  return { success: true };
}

/**
 * ACCOUNT CHỐT & ĐƯA VÀO CO — MỘT đường ghi: dựng payload từ bảng CO SỐNG (`buildSheetPayloadFromDb`,
 * đúng hàm CE-5 dùng), sửa `vendorId` + `unitPrice`/`fixedAmount` của các dòng đã chọn theo stableKey,
 * rồi gọi CHÍNH `saveCostSheet` (margin gate / validator / revision nguyên vẹn). Vì thế action này
 * TỰ ĐÒI `bidding.costsheet.edit` (Account) — PUR không chốt được: "PUR trình, Account chốt".
 * Bản mới sinh ra CHỜ BGĐ/CFO DUYỆT theo FIN-B (10.35) trần chi mới nở — không tự sync ở đây.
 * Dòng CO đã biến mất khỏi bảng sống (stableKey không còn) → báo số dòng bỏ qua, không ghi dòng đó.
 */
export async function confirmRfqIntoCostSheet(rfqId: string, _prev: CompareState, _fd: FormData): Promise<CompareState> {
  await requirePermission("bidding.costsheet.edit");
  const staffId = await getCurrentStaffId();
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId }, include: { lines: true, vendors: { include: { quoteLines: true } } } });
  if (!rfq) return { error: "NOT_FOUND" };
  if (rfq.status !== "SUBMITTED") return { error: "BAD_STATUS" };
  // Theo BẢN GHI: PIC/Leader dự án hoặc người duyệt CO — costsheet.edit đang cấp cho 20 vai kể cả PUR.
  if (!(await canConfirmRfq(rfq.projectId))) return { error: "NO_PERM" };
  const sel = parseSelection(rfq.finalJson);
  if (!sel || Object.keys(sel.picks).length === 0) return { error: "NO_PICKS" };

  const built = await buildSheetPayloadFromDb(rfq.projectId);
  if (!built) return { error: "NO_SHEET" };
  const sheetRow = await prisma.costSheet.findUnique({
    where: { id: built.sheet.id },
    select: { ceTotal: true, revisions: { orderBy: { revNo: "desc" }, take: 1, select: { revNo: true } } },
  });
  const prevRevNo = sheetRow?.revisions[0]?.revNo ?? 0;

  // stableKey → (vendorId, đơn giá/thành tiền chốt)
  const byKey = new Map<string, { vendorId: string; unitPrice: number; quantity: number | null; amount: number }>();
  for (const line of rfq.lines) {
    const pick = sel.picks[line.id];
    if (!pick) continue;
    const rv = rfq.vendors.find((v) => v.id === pick.rfqVendorId);
    const q = rv?.quoteLines.find((x) => x.rfqLineId === line.id);
    if (!rv || !q) continue;
    byKey.set(line.costLineStableKey, { vendorId: rv.vendorId, unitPrice: toNum(q.unitPrice), quantity: q.quantity, amount: toNum(q.amount) });
  }
  const applied = new Set<string>();
  const lines = (built.payload.lines as Record<string, unknown>[]).map((l) => {
    const key = String(l.stableKey ?? "");
    const p = byKey.get(key);
    if (!p) return l;
    applied.add(key);
    // NCC báo theo KHỐI (đơn giá 0 — mẫu mô hình) hoặc báo SL KHÁC SL hỏi → ghi FIXED = đúng số NCC
    // báo cho gói; còn lại ghi đơn giá, giữ SL của CO (thành tiền = SL × đơn giá NCC).
    const useFixed = l.lineType === "FIXED" || p.unitPrice === 0 || (p.quantity != null && p.quantity !== Number(l.quantity));
    return useFixed ? { ...l, lineType: "FIXED", fixedAmount: p.amount, vendorId: p.vendorId } : { ...l, unitPrice: p.unitPrice, vendorId: p.vendorId };
  });
  const missing = [...byKey.keys()].filter((k) => !applied.has(k)).length;
  if (applied.size === 0) return { error: "LINES_GONE" };

  const fd = new FormData();
  fd.set("sectionsJson", JSON.stringify({ sections: built.payload.sections, lines }));
  fd.set("scenario", built.sheet.scenario);
  fd.set("vatPct", String(built.sheet.vatPct));
  fd.set("agencyFeePct", String(built.sheet.agencyFeePct));
  fd.set("mgmtFeePct", String(built.sheet.mgmtFeePct));
  fd.set("contingencyPct", String(built.sheet.contingencyPct));
  fd.set("discountPct", String(built.sheet.discountPct));
  // ⚠ Bảng chế độ CŨ: ceTotal là input cấp bảng — PHẢI truyền số hiện hành; để "0" là ghi CE về 0 và
  // margin âm. Bảng chế độ CE theo dòng: server tự suy, input bị bỏ qua (CE-5 để "0" là vì thế).
  fd.set("ceTotal", String(toNum(sheetRow?.ceTotal ?? BigInt(0))));
  fd.set("templateId", built.sheet.templateId ?? "");
  const res = await saveCostSheet(rfq.projectId, {}, fd);
  if (res.error || res.fieldErrors) return { error: "SAVE_FAILED", errorCode: res.error ?? Object.values(res.fieldErrors ?? {})[0] };

  const created = await prisma.costSheetRevision.findFirst({ where: { costSheetId: built.sheet.id, revNo: prevRevNo + 1 }, select: { id: true } });
  if (created) await prisma.costSheetRevision.update({ where: { id: created.id }, data: { origin: "RFQ", note: `Chốt NCC theo ${rfq.code}` } });
  await prisma.rfq.update({ where: { id: rfqId }, data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: staffId, appliedRevNo: prevRevNo + 1 } });
  await audit(rfqId, "CONFIRM_INTO_CO", { applied: applied.size, missing, revNo: prevRevNo + 1 });
  if (rfq.submittedById && rfq.submittedById !== staffId) {
    await prisma.notification.create({
      data: { recipientStaffId: rfq.submittedById, type: "RFQ_CONFIRMED", title: `Account đã chốt NCC vào CO — ${rfq.code}`, body: `Bản CO v${prevRevNo + 1} chờ BGĐ/CFO duyệt`, projectId: rfq.projectId },
    });
  }
  revalidateRfq(rfqId, rfq.projectId);
  revalidatePath("/finance");
  return { success: true, createdRevNo: prevRevNo + 1, ...(missing ? { errorCode: `MISSING:${missing}` } : {}) };
}
