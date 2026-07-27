"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { stringifyAudit } from "@/lib/utils";
import { syncFinanceCostLines, lineDisbursement, projectDisbursement, getStaffAdvanceQuota } from "@/lib/finance";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import { hasPermission, requirePermission } from "@/lib/permissions";

export type FinanceFormState = { error?: string; success?: boolean; notice?: boolean };

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function bigIntOrZero(v: FormDataEntryValue | null): bigint {
  const n = Math.round(Number(str(v)) || 0);
  return BigInt(n < 0 ? 0 : n);
}
function dateOrNull(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  return s === "" ? null : new Date(s);
}

async function audit(entityType: string, entityId: string, action: string, payload: unknown) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({
    data: { entityType, entityId, field: "*", newValue: stringifyAudit(payload), action, changedBy: staffId },
  });
}

function revalidateFinance() {
  for (const seg of ["", "/vendor-payments", "/debt"]) revalidatePath(`/finance${seg}`);
  revalidatePath("/reminders");
}

async function notifyFinanceDept(type: string, title: string, body: string | null, projectId: string | null) {
  const recipients = await prisma.staff.findMany({ where: { department: { code: "FIN" }, isActive: true } });
  if (recipients.length === 0) return;
  await prisma.notification.createMany({
    data: recipients.map((r) => ({ recipientStaffId: r.id, type, title, body, projectId })),
  });
}

// ── Tạm ứng ──

export async function refreshFinanceCostLines(projectId: string) {
  await requirePermission("finance.costlines.refresh");
  await syncFinanceCostLines(projectId);
  await audit("finance_cost_line", projectId, "REFRESH", {});
  revalidatePath("/finance");
}

export async function requestAdvance(
  financeCostLineId: string,
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  await requirePermission("finance.advance.request");
  const t = await getTranslations("finance.advances");
  const line = await prisma.financeCostLine.findUnique({
    where: { id: financeCostLineId },
    include: { project: { include: { status: true } } },
  });
  if (!line) return { error: t("errRequired") };
  // Hai chốt chặn phía SERVER, không chỉ ẩn form: giao diện giấu nút trên dòng cũ nhưng một
  // request dựng tay vẫn tới được đây.
  //  - dòng cũ (isStale): dòng CO/CE đã bị đổi/xoá, ứng vào đây là ứng cho khoản không còn tồn tại
  //    và dòng mới tương ứng vẫn còn nguyên trần → chi hai lần.
  //  - dự án đã hủy/thua/kết thúc: không còn lý do chi thêm tiền.
  if (line.isStale) return { error: t("errStaleLine") };
  if (!EXECUTION_STATUS_CODES.includes(line.project.status.code as (typeof EXECUTION_STATUS_CODES)[number])) {
    return { error: t("errProjectNotExecuting") };
  }

  const amount = bigIntOrZero(formData.get("amount"));
  const advanceType = str(formData.get("advanceType")) === "VENDOR" ? "VENDOR" : "STAFF";
  const recipientVendorId = advanceType === "VENDOR" ? nullable(formData.get("recipientVendorId")) : null;
  const recipientStaffId = advanceType === "STAFF" ? nullable(formData.get("recipientStaffId")) : null;
  const bankName = nullable(formData.get("bankName"));
  const bankAccountNo = nullable(formData.get("bankAccountNo"));
  const bankAccountHolder = nullable(formData.get("bankAccountHolder"));

  const recipientOk = advanceType === "VENDOR" ? !!recipientVendorId : !!recipientStaffId;
  if (amount <= BigInt(0) || !recipientOk || !bankName || !bankAccountNo || !bankAccountHolder) {
    return { error: t("errRequired") };
  }

  // Chặn vượt giá trị dòng — check ngoài để trả lỗi thân thiện (check quyết định nằm trong transaction).
  // TRẦN = netAmount (số THỰC TRẢ, đã bóc gross-up thuế), và tính CẢ thanh toán NCC lẫn cả 2 loại
  // tạm ứng: cùng một dòng vừa ứng vừa thanh toán mà đếm riêng thì chi được gấp đôi giá trị dòng.
  const disb = await lineDisbursement(financeCostLineId);
  if (Number(amount) > disb.remaining) {
    return { error: t("errExceedLine", { remaining: disb.remaining }) };
  }

  // Chặn hạn mức NV (loại STAFF, check chéo dự án).
  const quota = advanceType === "STAFF" && recipientStaffId ? await getStaffAdvanceQuota(recipientStaffId, Number(amount)) : null;
  if (quota) {
    if (quota.blockedByCount) return { error: t("errBlockedCount", { count: quota.openCount, max: quota.maxCount }) };
    if (quota.blockedByAmount) return { error: t("errBlockedAmount", { amount: quota.outstandingAmount, max: quota.maxAmount }) };
  }

  const staffId = await getCurrentStaffId();
  let created;
  try {
    // Check QUYẾT ĐỊNH nằm TRONG transaction: 2 đề nghị gửi song song trên cùng dòng (hoặc cùng NV)
    // không thể cùng đọc số dư cũ rồi cùng lách qua — check ngoài chỉ là pre-check UX.
    created = await prisma.$transaction(async (tx) => {
      const [agg, payAgg] = await Promise.all([
        tx.advance.aggregate({ where: { financeCostLineId, status: { not: "CANCELED" } }, _sum: { amount: true } }),
        tx.vendorPayment.aggregate({ where: { financeCostLineId }, _sum: { amount: true } }),
      ]);
      const already = Number(agg._sum.amount ?? 0) + Number(payAgg._sum.amount ?? 0);
      if (Number(amount) > Number(line.netAmount) - already) throw new Error("EXCEED_LINE");
      if (quota && recipientStaffId) {
        const open = await tx.advance.findMany({
          where: { advanceType: "STAFF", recipientStaffId, status: { in: ["REQUESTED", "DISBURSED"] } },
          select: { amount: true },
        });
        if (open.length + 1 > quota.maxCount) throw new Error("QUOTA_COUNT");
        const outstanding = open.reduce((s, a) => s + Number(a.amount), 0);
        if (outstanding + Number(amount) > quota.maxAmount) throw new Error("QUOTA_AMOUNT");
      }
      const count = await tx.advance.count({ where: { financeCostLineId } });
      return tx.advance.create({
        data: {
          financeCostLineId,
          projectId: line.projectId,
          installmentNo: count + 1,
          amount,
          advanceType,
          recipientVendorId,
          recipientStaffId,
          bankName,
          bankAccountNo,
          bankAccountHolder,
          note: nullable(formData.get("note")),
          status: "REQUESTED",
          requestedById: staffId,
        },
      });
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "EXCEED_LINE") return { error: t("errExceedLine", { remaining: disb.remaining }) };
    if (code === "QUOTA_COUNT" && quota) return { error: t("errBlockedCount", { count: quota.openCount, max: quota.maxCount }) };
    if (code === "QUOTA_AMOUNT" && quota) return { error: t("errBlockedAmount", { amount: quota.outstandingAmount, max: quota.maxAmount }) };
    throw e;
  }
  await notifyFinanceDept("ADVANCE_REQUESTED", `Đề nghị tạm ứng — dự án ${line.project.code}`, line.itemName, line.projectId);
  await audit("advance", created.id, "REQUEST", { amount: amount.toString(), advanceType });
  revalidateFinance();
  return { success: true, notice: true };
}

export async function confirmAdvanceDisbursed(advanceId: string) {
  await requirePermission("finance.advance.approve");
  const staffId = await getCurrentStaffId();
  const adv = await prisma.advance.findUnique({ where: { id: advanceId }, include: { project: true } });
  if (!adv || adv.status !== "REQUESTED") return;
  await prisma.advance.update({ where: { id: advanceId }, data: { status: "DISBURSED", disbursedById: staffId, disbursedAt: new Date() } });
  if (adv.requestedById) {
    await prisma.notification.create({
      data: { recipientStaffId: adv.requestedById, type: "ADVANCE_DISBURSED", title: `Tạm ứng đã chi — dự án ${adv.project.code}`, body: null, projectId: adv.projectId },
    });
  }
  await audit("advance", advanceId, "DISBURSE", {});
  revalidateFinance();
}

export async function settleAdvance(advanceId: string, formData: FormData) {
  await requirePermission("finance.advance.approve");
  const staffId = await getCurrentStaffId();
  const adv = await prisma.advance.findUnique({ where: { id: advanceId } });
  if (!adv || adv.status !== "DISBURSED") return;
  await prisma.advance.update({
    where: { id: advanceId },
    data: { status: "SETTLED", settledById: staffId, settledAt: new Date(), settleNote: nullable(formData.get("settleNote")) },
  });
  await audit("advance", advanceId, "SETTLE", {});
  revalidateFinance();
}

export async function cancelAdvance(advanceId: string) {
  await requirePermission("finance.advance.approve");
  const adv = await prisma.advance.findUnique({ where: { id: advanceId } });
  if (!adv || adv.status !== "REQUESTED") return;
  await prisma.advance.update({ where: { id: advanceId }, data: { status: "CANCELED" } });
  await audit("advance", advanceId, "CANCEL", {});
  revalidateFinance();
}

// ── Đường ĐẢO ───────────────────────────────────────────
// Trước đây mọi thao tác tiền đều một chiều: tạm ứng đã giải ngân không huỷ được, phiếu đã trả
// không bỏ được, hóa đơn xuất sai không huỷ được. Sai một cái là phải sửa DB tay.
// Cả 3 đường dưới đây đều: đòi LÝ DO, GIỮ bản ghi (không xoá), và ghi AuditLog.

/**
 * Huỷ tạm ứng ĐÃ GIẢI NGÂN — tiền đã chi nay thu hồi được (chi nhầm, đổi phương án).
 * Trả lại trần chi cho dòng (lineDisbursement loại CANCELED) nên bắt buộc có lý do.
 */
export async function reverseDisbursedAdvance(
  advanceId: string,
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  await requirePermission("finance.advance.approve");
  const t = await getTranslations("finance.advances");
  const note = str(formData.get("cancelNote"));
  if (!note) return { error: t("errReverseReason") };

  const adv = await prisma.advance.findUnique({ where: { id: advanceId } });
  if (!adv) return { error: t("errRequired") };
  if (adv.status !== "DISBURSED") return { error: t("errReverseWrongStatus") };

  await prisma.advance.update({
    where: { id: advanceId },
    data: { status: "CANCELED", canceledById: await getCurrentStaffId(), canceledAt: new Date(), cancelNote: note },
  });
  await audit("advance", advanceId, "REVERSE_DISBURSED", { amount: adv.amount.toString(), reason: note });
  revalidateFinance();
  return { success: true };
}

/** Bỏ đánh dấu "đã trả" của phiếu chi NCC (bấm nhầm, hoặc lệnh chuyển tiền bị trả về). */
export async function unmarkVendorPaymentPaid(
  id: string,
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  await requirePermission("finance.vendor_payment.pay");
  const t = await getTranslations("finance.vendorPayments");
  const note = str(formData.get("reverseNote"));
  if (!note) return { error: t("errReverseReason") };

  // updateMany + guard PAID: 2 người cùng bấm thì chỉ một lượt có tác dụng.
  const res = await prisma.vendorPayment.updateMany({
    where: { id, status: "PAID" },
    data: { status: "SCHEDULED", paidDate: null },
  });
  if (res.count === 0) return { error: t("errReverseWrongStatus") };
  await audit("vendor_payment", id, "UNMARK_PAID", { reason: note });
  revalidateFinance();
  return { success: true };
}

/**
 * Huỷ hóa đơn xuất sai. KHÔNG xoá bản ghi — số hóa đơn đã phát hành phải truy được.
 * Chỉ huỷ khi CHƯA ghi nhận lần thu nào: có thu rồi thì phải đảo khoản thu trước, nếu không
 * số đã thu sẽ treo vào một hóa đơn không còn tồn tại trên mọi báo cáo.
 */
export async function voidClientInvoice(
  invoiceId: string,
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  await requirePermission("finance.invoice.manage");
  const t = await getTranslations("finance.debt");
  const note = str(formData.get("voidNote"));
  if (!note) return { error: t("errVoidReason") };

  const inv = await prisma.clientInvoice.findUnique({
    where: { id: invoiceId },
    select: { voidedAt: true, invoiceNo: true, amount: true, _count: { select: { payments: true } } },
  });
  if (!inv) return { error: t("errRequired") };
  if (inv.voidedAt) return { error: t("errAlreadyVoided") };
  if (inv._count.payments > 0) return { error: t("errVoidHasPayments") };

  await prisma.clientInvoice.update({
    where: { id: invoiceId },
    data: { voidedById: await getCurrentStaffId(), voidedAt: new Date(), voidNote: note },
  });
  await audit("client_invoice", invoiceId, "VOID", { invoiceNo: inv.invoiceNo, amount: inv.amount.toString(), reason: note });
  revalidateFinance();
  return { success: true };
}

// ── Thanh toán NCC ──

export async function createVendorPayment(_prev: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  await requirePermission("finance.vendor_payment.manage");
  const t = await getTranslations("finance.vendorPayments");
  const vendorId = nullable(formData.get("vendorId"));
  const amount = bigIntOrZero(formData.get("amount"));
  if (!vendorId || amount <= BigInt(0)) return { error: t("errRequired") };
  const financeCostLineId = nullable(formData.get("financeCostLineId"));
  const staffId = await getCurrentStaffId();

  // Gắn vào dòng chi phí thì phải chịu CHUNG trần với tạm ứng — nếu không, cùng một dòng có thể
  // vừa ứng đủ 100% vừa thanh toán đủ 100%, chi gấp đôi giá trị. Trần là netAmount (đã bóc
  // gross-up thuế). Check nằm TRONG transaction để 2 phiếu gửi song song không cùng lách qua.
  if (financeCostLineId) {
    // Pre-check để có số "còn lại" đưa vào thông báo (check quyết định vẫn nằm trong transaction).
    const disb = await lineDisbursement(financeCostLineId);
    if (Number(amount) > disb.remaining) return { error: t("errExceedLine", { remaining: disb.remaining }) };
    try {
      await prisma.$transaction(async (tx) => {
        const line = await tx.financeCostLine.findUnique({ where: { id: financeCostLineId }, select: { netAmount: true, projectId: true } });
        if (!line) throw new Error("LINE_NOT_FOUND");
        const [advAgg, payAgg] = await Promise.all([
          tx.advance.aggregate({ where: { financeCostLineId, status: { not: "CANCELED" } }, _sum: { amount: true } }),
          tx.vendorPayment.aggregate({ where: { financeCostLineId }, _sum: { amount: true } }),
        ]);
        const already = Number(advAgg._sum.amount ?? 0) + Number(payAgg._sum.amount ?? 0);
        if (Number(amount) > Number(line.netAmount) - already) throw new Error("EXCEED_LINE");
        await tx.vendorPayment.create({
          data: {
            vendorId,
            // Dòng chi phí đã buộc vào 1 dự án — lấy luôn projectId của nó, không tin ô chọn ở form.
            projectId: line.projectId,
            financeCostLineId,
            amount,
            dueDate: dateOrNull(formData.get("dueDate")),
            invoiceNo: nullable(formData.get("invoiceNo")),
            note: nullable(formData.get("note")),
            createdById: staffId,
          },
        });
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      // Trả lỗi RA GIAO DIỆN: trước đây return rỗng nên phiếu bị chặn mà kế toán tưởng đã lưu.
      if (code === "EXCEED_LINE") return { error: t("errExceedLine", { remaining: disb.remaining }) };
      if (code === "LINE_NOT_FOUND") return { error: t("errLineNotFound") };
      throw e;
    }
  } else {
    // Khoản chi CẤP DỰ ÁN (không gắn dòng cụ thể). Trước đây nhánh này KHÔNG có trần nào và dự án
    // cũng không bắt buộc — đó là cửa duy nhất để chi tiền không kiểm soát. Nay: bắt buộc gắn dự
    // án, trần = tổng số thực trả còn lại của dự án, vượt trần phải có quyền riêng + lý do.
    const projectId = nullable(formData.get("projectId"));
    if (!projectId) return { error: t("errProjectRequired") };

    const disb = await projectDisbursement(projectId);
    const overCapNote = nullable(formData.get("overCapNote"));
    // Dự án chưa có dòng chi phí nào (chưa dựng/chưa đồng bộ CO/CE) → chưa có trần để đối chiếu,
    // coi như vượt trần: vẫn chi được nhưng phải là người có quyền và phải ghi lý do.
    const overCap = !disb.hasLines || Number(amount) > disb.remaining;
    if (overCap) {
      if (!(await hasPermission("finance.vendor_payment.over_cap"))) {
        return { error: disb.hasLines ? t("errExceedProject", { remaining: disb.remaining }) : t("errNoCostLines") };
      }
      if (!overCapNote) return { error: disb.hasLines ? t("errOverCapReason", { remaining: disb.remaining }) : t("errNoCostLinesReason") };
    }

    // Check QUYẾT ĐỊNH trong transaction: 2 phiếu gửi song song không cùng đọc số dư cũ rồi cùng lọt.
    let createdId: string | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        const [capAgg, advAgg, payAgg] = await Promise.all([
          tx.financeCostLine.aggregate({ where: { projectId, isStale: false, isProxy: false }, _sum: { netAmount: true } }),
          tx.advance.aggregate({ where: { projectId, status: { not: "CANCELED" } }, _sum: { amount: true } }),
          tx.vendorPayment.aggregate({ where: { projectId }, _sum: { amount: true } }),
        ]);
        const remaining =
          Number(capAgg._sum.netAmount ?? 0) - Number(advAgg._sum.amount ?? 0) - Number(payAgg._sum.amount ?? 0);
        if (Number(amount) > remaining && !overCapNote) throw new Error("EXCEED_PROJECT");
        const created = await tx.vendorPayment.create({
          data: {
            vendorId,
            projectId,
            amount,
            dueDate: dateOrNull(formData.get("dueDate")),
            invoiceNo: nullable(formData.get("invoiceNo")),
            note: nullable(formData.get("note")),
            overCapNote: overCap ? overCapNote : null,
            createdById: staffId,
          },
        });
        createdId = created.id;
      });
    } catch (e) {
      if (e instanceof Error && e.message === "EXCEED_PROJECT") {
        return { error: t("errExceedProject", { remaining: disb.remaining }) };
      }
      throw e;
    }
    // Ghi vết vượt trần SAU commit — khoản chi vượt trần phải truy được ai duyệt và vì sao.
    if (overCap && createdId) {
      await audit("vendor_payment", createdId, "OVER_CAP", {
        amount: amount.toString(),
        projectId,
        remainingBefore: disb.remaining,
        reason: overCapNote,
      });
    }
  }
  revalidatePath("/finance/vendor-payments");
  revalidatePath("/finance");
  return { success: true };
}

export async function markVendorPaymentPaid(id: string, _prev: FinanceFormState, _formData: FormData): Promise<FinanceFormState> {
  await requirePermission("finance.vendor_payment.pay");
  const t = await getTranslations("finance.vendorPayments");
  // updateMany + guard SCHEDULED: bấm 2 lần / 2 người cùng bấm không ghi đè paidDate lần đầu.
  const res = await prisma.vendorPayment.updateMany({
    where: { id, status: "SCHEDULED" },
    data: { status: "PAID", paidDate: new Date() },
  });
  revalidatePath("/finance/vendor-payments");
  // count = 0 → phiếu đã được người khác đánh dấu trả rồi; nói ra thay vì im lặng không đổi gì.
  if (res.count === 0) return { error: t("errAlreadyPaid") };
  return { success: true };
}

// ── Công nợ ──

export async function createClientInvoice(_prev: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  await requirePermission("finance.invoice.manage");
  const t = await getTranslations("finance.debt");
  const projectId = nullable(formData.get("projectId"));
  const invoiceNo = nullable(formData.get("invoiceNo"));
  const amount = bigIntOrZero(formData.get("amount"));
  if (!projectId || !invoiceNo || amount <= BigInt(0)) return { error: t("errRequired") };
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
  if (!project) return { error: t("errRequired") };
  const staffId = await getCurrentStaffId();
  await prisma.clientInvoice.create({
    data: {
      projectId,
      clientId: project.clientId,
      invoiceNo,
      invoiceDate: dateOrNull(formData.get("invoiceDate")) ?? new Date(),
      amount,
      dueDate: dateOrNull(formData.get("dueDate")),
      note: nullable(formData.get("note")),
      createdById: staffId,
    },
  });
  revalidatePath("/finance/debt");
  revalidatePath("/reminders");
  return { success: true };
}

export async function recordClientPayment(
  invoiceId: string,
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  await requirePermission("finance.payment.record");
  const t = await getTranslations("finance.debt");
  const amount = bigIntOrZero(formData.get("amount"));
  if (amount <= BigInt(0)) return { error: t("errRequired") };
  // Không cho ghi nhận vượt số còn lại của hóa đơn — trả dư làm outstanding âm và khoản đó
  // "biến mất" khỏi tổng công nợ (trang debt chỉ cộng bucket khi outstanding > 0).
  const [invoice, paidAgg] = await Promise.all([
    prisma.clientInvoice.findUnique({ where: { id: invoiceId }, select: { amount: true } }),
    prisma.clientPayment.aggregate({ where: { invoiceId }, _sum: { amount: true } }),
  ]);
  if (!invoice) return { error: t("errRequired") };
  const outstanding = invoice.amount - (paidAgg._sum.amount ?? BigInt(0));
  // Trả lỗi RA GIAO DIỆN: trước đây return rỗng nên kế toán tưởng đã ghi nhận thu tiền.
  if (amount > outstanding) return { error: t("errOverPayment", { outstanding: Number(outstanding) }) };
  const staffId = await getCurrentStaffId();
  await prisma.clientPayment.create({
    data: {
      invoiceId,
      amount,
      paidDate: dateOrNull(formData.get("paidDate")) ?? new Date(),
      method: nullable(formData.get("method")),
      note: nullable(formData.get("note")),
      createdById: staffId,
    },
  });
  revalidatePath("/finance/debt");
  revalidatePath("/reminders");
  return { success: true };
}
