"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { saveAiFile, readAiFile, AI_FILE_MIME_TYPES, MAX_AI_FILE_BYTES } from "@/lib/ai-file-storage";
import { parseOverheadExcel, reconcileImport } from "@/lib/overhead-import";
import { itemBudgetState, importBudget } from "@/lib/overhead-data";
import {
  isBudgetEditable,
  isValidMonth,
  spendTotal,
  wouldExceedBudget,
  MONTHS,
  OVERHEAD_REQUEST_KINDS,
} from "@/lib/overhead";

export type OverheadState = { error?: string; success?: boolean; message?: string };

export type ImportPreview = {
  fileKey: string;
  fileName: string;
  itemCount: number;
  spendCount: number;
  planYear: number;
  paidParsed: number;
  warnings: string[];
  /** Khoản mà cột tóm tắt của file KHÔNG khớp sheet chi tiết của chính nó. */
  mismatches: { pidCode: string; name: string; usedInFile: number; parsedFromDetail: number; diff: number }[];
};
export type ImportState = OverheadState & { preview?: ImportPreview };

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function numOrZero(v: FormDataEntryValue | null): number {
  const n = Math.round(Number(str(v)) || 0);
  return Number.isFinite(n) ? n : 0;
}
function big(n: number): bigint {
  return BigInt(Math.round(n));
}

function revalidate() {
  revalidatePath("/overhead");
  revalidatePath("/overhead/spends");
  revalidatePath("/overhead/budget");
}

async function audit(entityId: string, action: string, payload: unknown) {
  await prisma.auditLog.create({
    data: {
      entityType: "overhead",
      entityId,
      field: "*",
      newValue: JSON.stringify(payload),
      action,
      changedBy: await getCurrentStaffId(),
    },
  });
}

// ─────────────────────────────────────────────────────────
// NGÂN SÁCH — import (năm 2026) và nhân bản (2027 trở đi)
// ─────────────────────────────────────────────────────────

/**
 * Bước 1 của import: lưu file, ĐỌC THỬ và trả về bản xem trước. KHÔNG ghi gì vào bảng ngân sách.
 *
 * Lưu file trước rồi mới parse là cố ý: bước xác nhận sẽ ĐỌC LẠI TỪ FILE chứ không nhận số do màn
 * hình gửi lên (quy ước "không tin số từ client", HANDOVER 4.1). Đồng thời `fileKey` chính là thứ
 * `OverheadBudget.sourceFileKey` cần giữ để về sau còn đối chiếu được với bản gốc.
 */
export async function previewBudgetImport(fiscalYear: number, _prev: ImportState, formData: FormData): Promise<ImportState> {
  await requirePermission("overhead.budget.manage");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "NO_FILE" };
  if (file.size > MAX_AI_FILE_BYTES) return { error: "FILE_TOO_BIG" };
  if (!AI_FILE_MIME_TYPES.includes(file.type)) return { error: "BAD_MIME" };

  const existing = await prisma.overheadBudget.findUnique({ where: { fiscalYear }, select: { id: true } });
  if (existing) return { error: "YEAR_EXISTS" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseOverheadExcel(buffer, fiscalYear);
  if (parsed.items.length === 0) return { error: "NO_ITEMS", message: parsed.warnings.join(" · ") };

  const fileKey = await saveAiFile(buffer, file.type);
  return {
    preview: {
      fileKey,
      fileName: file.name,
      itemCount: parsed.items.length,
      spendCount: parsed.spends.length,
      planYear: parsed.items.reduce((a, i) => a + i.months.reduce((x, y) => x + y, 0), 0),
      paidParsed: parsed.spends.reduce((a, s) => a + s.amountTotal, 0),
      warnings: parsed.warnings,
      mismatches: reconcileImport(parsed.items, parsed.spends),
    },
  };
}

/**
 * Bước 2: ghi thật. Đọc LẠI từ file đã lưu — không nhận dữ liệu từ bản xem trước.
 *
 * Bản import đặt thẳng LOCKED: BOD đã duyệt ngoài app cho năm 2026 (luồng duyệt 2 cấp chỉ áp dụng
 * từ bản 2027 lập trong app).
 */
export async function confirmBudgetImport(fiscalYear: number, fileKey: string, _prev: ImportState, _formData: FormData): Promise<ImportState> {
  await requirePermission("overhead.budget.manage");

  const existing = await prisma.overheadBudget.findUnique({ where: { fiscalYear }, select: { id: true } });
  if (existing) return { error: "YEAR_EXISTS" };

  let buffer: Buffer;
  try {
    buffer = await readAiFile(fileKey);
  } catch {
    return { error: "FILE_GONE" };
  }
  const parsed = await parseOverheadExcel(buffer, fiscalYear);
  if (parsed.items.length === 0) return { error: "NO_ITEMS" };

  const res = await importBudget(fiscalYear, parsed, fileKey, await getCurrentStaffId());
  await audit(`budget:${fiscalYear}`, "CREATE", { source: "excel", ...res });
  revalidate();
  return { success: true, message: `${res.items}/${res.spends}` };
}

/**
 * Nhân bản ngân sách năm sau từ số THÁNG 12 của năm đang chạy.
 *
 * Nguồn số: THỰC CHI tháng 12 nếu tháng đó đã có phát sinh, ngược lại lấy KẾ HOẠCH tháng 12 — vì
 * lúc lập ngân sách (thường tháng 11-12) tháng 12 có thể chưa chi xong. Bản tạo ra là DRAFT để HR
 * Manager sửa, thêm, bớt trước khi trình duyệt.
 */
export async function createNextYearBudget(fromYear: number, _prev: OverheadState, _formData: FormData): Promise<OverheadState> {
  await requirePermission("overhead.budget.manage");
  const toYear = fromYear + 1;

  const exists = await prisma.overheadBudget.findUnique({ where: { fiscalYear: toYear }, select: { id: true } });
  if (exists) return { error: "YEAR_EXISTS" };

  const source = await prisma.overheadBudget.findUnique({
    where: { fiscalYear: fromYear },
    include: {
      items: {
        where: { isActive: true },
        orderBy: [{ sort: "asc" }, { pidCode: "asc" }],
        include: {
          budgetMonths: { where: { month: 12 }, select: { amount: true } },
          spends: { where: { month: 12, status: "PAID" }, select: { amountTotal: true } },
        },
      },
    },
  });
  if (!source) return { error: "SOURCE_NOT_FOUND" };
  if (source.items.length === 0) return { error: "SOURCE_EMPTY" };
  // Chỉ nhân bản từ bản ĐÃ KHOÁ. Ẩn nút ở trang là trang trí — layout/UI không chặn được server
  // action (HANDOVER 10.1), mà copy nền từ số còn nháp thì cả năm sau xây trên con số chưa ai duyệt.
  if (source.status !== "LOCKED") return { error: "SOURCE_NOT_LOCKED" };

  const staffId = await getCurrentStaffId();
  let fromActual = 0;
  await prisma.$transaction(async (tx) => {
    const budget = await tx.overheadBudget.create({
      data: { fiscalYear: toYear, status: "DRAFT", note: `Nhân bản từ tháng 12/${fromYear}`, submittedById: null },
    });
    for (const [i, it] of source.items.entries()) {
      const paidDec = it.spends.reduce((a, s) => a + Number(s.amountTotal), 0);
      const planDec = it.budgetMonths.reduce((a, m) => a + Number(m.amount), 0);
      const base = paidDec > 0 ? paidDec : planDec;
      if (paidDec > 0) fromActual++;
      const created = await tx.overheadItem.create({
        data: {
          budgetId: budget.id,
          pidCode: it.pidCode.replace(String(fromYear).slice(-2), String(toYear).slice(-2)),
          name: it.name,
          categoryLabel: it.categoryLabel,
          requestKind: it.requestKind,
          actualSource: it.actualSource,
          sort: i,
        },
      });
      await tx.overheadBudgetMonth.createMany({
        data: MONTHS.map((m) => ({ itemId: created.id, month: m, amount: big(base) })),
      });
    }
  });

  await audit(`budget:${toYear}`, "CREATE", { from: fromYear, items: source.items.length, fromActual });
  revalidate();
  return { success: true, message: `${source.items.length}/${fromActual}` };
}

/**
 * Sửa CẢ 12 THÁNG của một khoản trong một lần gửi. Chỉ khi bản còn DRAFT/REJECTED.
 *
 * Lưu từng ô riêng thì với 50 khoản là 600 lượt gọi server — và người dùng sửa vài ô rồi rời trang
 * sẽ để lại bản ngân sách nửa vời mà không ai biết. Một form cho một khoản là đơn vị sửa tự nhiên.
 */
export async function setBudgetItemMonths(itemId: string, _prev: OverheadState, formData: FormData): Promise<OverheadState> {
  await requirePermission("overhead.budget.manage");

  const item = await prisma.overheadItem.findUnique({ where: { id: itemId }, select: { budget: { select: { status: true } } } });
  if (!item) return { error: "NOT_FOUND" };
  if (!isBudgetEditable(item.budget.status)) return { error: "BUDGET_LOCKED" };

  const amounts = MONTHS.map((m) => numOrZero(formData.get(`m${m}`)));
  if (amounts.some((a) => a < 0)) return { error: "NEGATIVE" };

  await prisma.$transaction(
    MONTHS.map((m) =>
      prisma.overheadBudgetMonth.upsert({
        where: { itemId_month: { itemId, month: m } },
        create: { itemId, month: m, amount: big(amounts[m - 1]) },
        update: { amount: big(amounts[m - 1]) },
      }),
    ),
  );
  await audit(`item:${itemId}`, "UPDATE", { months: amounts });
  revalidate();
  return { success: true };
}

/** Thêm khoản chi mới vào bản ngân sách đang soạn. */
export async function addBudgetItem(fiscalYear: number, _prev: OverheadState, formData: FormData): Promise<OverheadState> {
  await requirePermission("overhead.budget.manage");
  const budget = await prisma.overheadBudget.findUnique({ where: { fiscalYear }, select: { id: true, status: true } });
  if (!budget) return { error: "NOT_FOUND" };
  if (!isBudgetEditable(budget.status)) return { error: "BUDGET_LOCKED" };

  const pidCode = str(formData.get("pidCode"));
  const name = str(formData.get("name"));
  const categoryLabel = str(formData.get("categoryLabel"));
  const requestKind = str(formData.get("requestKind"));
  if (!pidCode || !name) return { error: "NEED_FIELDS" };
  if (!OVERHEAD_REQUEST_KINDS.includes(requestKind as (typeof OVERHEAD_REQUEST_KINDS)[number])) return { error: "BAD_KIND" };

  const dup = await prisma.overheadItem.findUnique({ where: { budgetId_pidCode: { budgetId: budget.id, pidCode } }, select: { id: true } });
  if (dup) return { error: "PID_EXISTS" };

  const last = await prisma.overheadItem.findFirst({ where: { budgetId: budget.id }, orderBy: { sort: "desc" }, select: { sort: true } });
  const created = await prisma.overheadItem.create({
    data: { budgetId: budget.id, pidCode, name, categoryLabel: categoryLabel || "KHÁC", requestKind, sort: (last?.sort ?? -1) + 1 },
  });
  await prisma.overheadBudgetMonth.createMany({ data: MONTHS.map((m) => ({ itemId: created.id, month: m, amount: BigInt(0) })) });
  await audit(`item:${created.id}`, "CREATE", { pidCode, name });
  revalidate();
  return { success: true };
}

/**
 * Bớt / bật lại một khoản.
 * KHÔNG xoá bản ghi: các năm trước còn khoản chi trỏ vào (mirror cách Vendor/ClientGroup làm).
 */
export async function toggleBudgetItem(itemId: string): Promise<void> {
  await requirePermission("overhead.budget.manage");
  const item = await prisma.overheadItem.findUnique({ where: { id: itemId }, select: { isActive: true, budget: { select: { status: true } } } });
  if (!item || !isBudgetEditable(item.budget.status)) return;
  await prisma.overheadItem.update({ where: { id: itemId }, data: { isActive: !item.isActive } });
  await audit(`item:${itemId}`, "UPDATE", { isActive: !item.isActive });
  revalidate();
}

// ─────────────────────────────────────────────────────────
// DUYỆT 2 CẤP — HR trình → CFO → CEO khoá
// ─────────────────────────────────────────────────────────

/**
 * Chuyển trạng thái ngân sách. Mọi bước dùng `updateMany` có GUARD TRẠNG THÁI trong `where` và kiểm
 * `count === 0` — chống double-click và chống hai người bấm cùng lúc, đúng khuôn `markVendorPaymentPaid`
 * (src/app/(app)/finance/actions.ts:460).
 */
async function moveBudget(
  fiscalYear: number,
  from: string[],
  to: string,
  data: Record<string, unknown>,
): Promise<OverheadState> {
  const res = await prisma.overheadBudget.updateMany({
    where: { fiscalYear, status: { in: from } },
    data: { status: to, ...data },
  });
  if (res.count === 0) return { error: "WRONG_STATE" };
  await audit(`budget:${fiscalYear}`, "UPDATE", { to });
  revalidate();
  return { success: true };
}

export async function submitBudget(fiscalYear: number, _prev: OverheadState, _formData: FormData): Promise<OverheadState> {
  await requirePermission("overhead.budget.manage");
  const items = await prisma.overheadItem.count({ where: { budget: { fiscalYear }, isActive: true } });
  if (items === 0) return { error: "SOURCE_EMPTY" };
  return moveBudget(fiscalYear, ["DRAFT", "REJECTED"], "PENDING_CFO", {
    submittedAt: new Date(),
    submittedById: await getCurrentStaffId(),
    rejectedAt: null,
    rejectedById: null,
    rejectedNote: null,
  });
}

export async function cfoApproveBudget(fiscalYear: number, _prev: OverheadState, _formData: FormData): Promise<OverheadState> {
  await requirePermission("overhead.budget.approve_cfo");
  return moveBudget(fiscalYear, ["PENDING_CFO"], "PENDING_CEO", {
    cfoApprovedAt: new Date(),
    cfoApprovedById: await getCurrentStaffId(),
  });
}

/** CEO duyệt = KHOÁ số cuối cùng của năm. */
export async function ceoApproveBudget(fiscalYear: number, _prev: OverheadState, _formData: FormData): Promise<OverheadState> {
  await requirePermission("overhead.budget.approve_ceo");
  return moveBudget(fiscalYear, ["PENDING_CEO"], "LOCKED", {
    ceoApprovedAt: new Date(),
    ceoApprovedById: await getCurrentStaffId(),
  });
}

/** Trả về cho HR sửa — BẮT BUỘC lý do, nếu không HR không biết phải sửa gì. */
export async function rejectBudget(fiscalYear: number, stage: "CFO" | "CEO", _prev: OverheadState, formData: FormData): Promise<OverheadState> {
  await requirePermission(stage === "CFO" ? "overhead.budget.approve_cfo" : "overhead.budget.approve_ceo");
  const note = str(formData.get("rejectedNote"));
  if (!note) return { error: "NEED_REASON" };
  return moveBudget(fiscalYear, [stage === "CFO" ? "PENDING_CFO" : "PENDING_CEO"], "REJECTED", {
    rejectedAt: new Date(),
    rejectedById: await getCurrentStaffId(),
    rejectedNote: note,
    // Xoá dấu duyệt của CFO khi CEO trả về: bản sửa lại phải đi qua CFO lần nữa, không được nhảy cóc.
    ...(stage === "CEO" ? { cfoApprovedAt: null, cfoApprovedById: null } : {}),
  });
}

// ─────────────────────────────────────────────────────────
// THỰC CHI — mượn nguyên vòng đời của VendorPayment
// ─────────────────────────────────────────────────────────

export async function createSpend(fiscalYear: number, _prev: OverheadState, formData: FormData): Promise<OverheadState> {
  await requirePermission("overhead.spend.record");

  const itemId = str(formData.get("itemId"));
  const month = Number(str(formData.get("month")));
  const name = str(formData.get("name"));
  if (!itemId || !name) return { error: "NEED_FIELDS" };
  if (!isValidMonth(month)) return { error: "BAD_MONTH" };

  const amountNet = numOrZero(formData.get("amountNet"));
  const vat = numOrZero(formData.get("vat"));
  const tncn = numOrZero(formData.get("tncn"));
  const tndn = numOrZero(formData.get("tndn"));
  if (amountNet <= 0) return { error: "AMOUNT_REQUIRED" };
  const total = spendTotal(amountNet, vat, tncn, tndn);

  const item = await prisma.overheadItem.findUnique({
    where: { id: itemId },
    select: { budget: { select: { fiscalYear: true } }, actualSource: true, isActive: true },
  });
  if (!item || item.budget.fiscalYear !== fiscalYear) return { error: "NOT_FOUND" };
  if (!item.isActive) return { error: "ITEM_INACTIVE" };
  // Khoản lương lấy số từ module ⑦ — cho nhập tay là tạo nguồn số thứ hai, chắc chắn lệch.
  if (item.actualSource === "PAYROLL") return { error: "PAYROLL_SOURCE" };

  const overBudgetNote = nullable(formData.get("overBudgetNote"));
  const expectedDate = nullable(formData.get("expectedDate"));
  const staffId = await getCurrentStaffId();

  // Đọc LẠI ngân sách + đã chi ngay trước khi ghi (không tin số màn hình gửi lên).
  const state = await itemBudgetState(itemId);
  if (!state) return { error: "NOT_FOUND" };
  if (wouldExceedBudget(state.planYear, state.paidSoFar, total)) {
    if (!overBudgetNote) return { error: "NEED_OVER_BUDGET_NOTE" };
    if (!(await hasPermission("overhead.spend.over_budget"))) return { error: "NO_OVER_BUDGET_PERM" };
  }

  const created = await prisma.overheadSpend.create({
    data: {
      itemId,
      month,
      name,
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      amountNet: big(amountNet),
      vat: big(vat),
      tncn: big(tncn),
      tndn: big(tndn),
      amountTotal: big(total),
      status: "SCHEDULED",
      requestedById: staffId,
      createdById: staffId,
      overBudgetNote,
    },
  });
  await audit(`spend:${created.id}`, "CREATE", { itemId, month, total, overBudgetNote });
  revalidate();
  return { success: true };
}

export async function markSpendPaid(spendId: string, _prev: OverheadState, formData: FormData): Promise<OverheadState> {
  await requirePermission("overhead.spend.pay");
  const paidDate = nullable(formData.get("paidDate"));
  const res = await prisma.overheadSpend.updateMany({
    where: { id: spendId, status: "SCHEDULED" },
    data: { status: "PAID", paidDate: paidDate ? new Date(paidDate) : new Date(), paidById: await getCurrentStaffId() },
  });
  if (res.count === 0) return { error: "ALREADY_PAID" };
  await audit(`spend:${spendId}`, "UPDATE", { status: "PAID" });
  revalidate();
  return { success: true };
}

/** Đảo "đã thanh toán" — BẮT BUỘC lý do, không xoá bản ghi. */
export async function unmarkSpendPaid(spendId: string, _prev: OverheadState, formData: FormData): Promise<OverheadState> {
  await requirePermission("overhead.spend.pay");
  const reverseNote = str(formData.get("reverseNote"));
  if (!reverseNote) return { error: "NEED_REASON" };
  const res = await prisma.overheadSpend.updateMany({
    where: { id: spendId, status: "PAID" },
    data: { status: "SCHEDULED", paidDate: null, paidById: null, reverseNote },
  });
  if (res.count === 0) return { error: "NOT_PAID" };
  await audit(`spend:${spendId}`, "UPDATE", { status: "SCHEDULED", reverseNote });
  revalidate();
  return { success: true };
}

/**
 * Huỷ khoản chi — chỉ khi CHƯA thanh toán.
 * Đã trả rồi thì phải "bỏ đánh dấu đã trả" trước, đúng thứ tự nghiệp vụ của `cancelVendorPayment`.
 */
export async function cancelSpend(spendId: string, _prev: OverheadState, formData: FormData): Promise<OverheadState> {
  await requirePermission("overhead.spend.record");
  const cancelNote = str(formData.get("cancelNote"));
  if (!cancelNote) return { error: "NEED_REASON" };
  const res = await prisma.overheadSpend.updateMany({
    where: { id: spendId, status: "SCHEDULED" },
    data: { status: "CANCELED", cancelNote },
  });
  if (res.count === 0) return { error: "CANNOT_CANCEL" };
  await audit(`spend:${spendId}`, "UPDATE", { status: "CANCELED", cancelNote });
  revalidate();
  return { success: true };
}
