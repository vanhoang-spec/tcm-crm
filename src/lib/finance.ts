import { prisma } from "./prisma";
import { getNumberSetting } from "./settings";
import { computeLineNetAmount } from "./bidding";

// ─────────────────────────────────────────────────────────
// Module ④ Chi phí & Công nợ — helpers thuần + đồng bộ CO
// ─────────────────────────────────────────────────────────

export const ADVANCE_STATUSES = ["REQUESTED", "DISBURSED", "SETTLED", "CANCELED"] as const;
export const ADVANCE_TYPES = ["VENDOR", "STAFF"] as const;
/** Tạm ứng "đang giữ" (chưa hoàn ứng, chưa hủy) — dùng cho hạn mức NV + tổng đã ứng của dòng. */
export const OUTSTANDING_ADVANCE_STATUSES = ["REQUESTED", "DISBURSED"] as const;

/**
 * Khoá liên kết dòng CO/CE ↔ module ④ = `CostLine.stableKey`.
 *
 * TRƯỚC ĐÂY là `sectionCode‖itemName`. Phải đổi vì builder gán mã cứng "SECTION" cho mọi hạng
 * mục và không cho sửa, nên hai dòng trùng tên ở hai hạng mục khác nhau (vd "Nhân công" ở cả
 * Mặt bằng lẫn Vận hành) bị gộp thành MỘT dòng chi phí với số tiền cộng dồn — tạm ứng khi đó
 * kiểm hạn mức trên số gộp và bảng chi phí thiếu hẳn một dòng.
 *
 * `stableKey` do builder sinh một lần và đi theo payload qua mọi lần lưu, nên mã hiển thị
 * (`itemCode`) được tự do đánh lại số khi thêm/xoá dòng mà không làm đứt liên kết tiền.
 */
export function financeLineKey(stableKey: string): string {
  return stableKey;
}

/**
 * Đồng bộ (Refresh) các dòng CO nội bộ từ CostSheet CTRACT mới nhất xuống FinanceCostLine.
 * - Chỉ lấy dòng thuộc section isProxy=false (loại Chi hộ).
 * - Upsert theo (projectId, lineKey); dòng cũ không còn ở version mới → isStale=true (giữ lịch sử tạm ứng).
 * Trả về số liệu tóm tắt { added, updated, staled, revNo }.
 */
export async function syncFinanceCostLines(projectId: string): Promise<{
  added: number;
  updated: number;
  staled: number;
  revNo: number;
}> {
  const sheet = await prisma.costSheet.findFirst({
    where: { projectId, version: "CTRACT" },
    orderBy: { createdAt: "desc" },
    include: {
      sections: { orderBy: { sort: "asc" }, include: { lines: { orderBy: { sort: "asc" } } } },
      revisions: { orderBy: { revNo: "desc" }, take: 1, select: { revNo: true } },
    },
  });
  if (!sheet) return { added: 0, updated: 0, staled: 0, revNo: 0 };

  const revNo = sheet.revisions[0]?.revNo ?? 0;

  // Mỗi dòng CO nội bộ (non-proxy) = MỘT dòng chi phí, khoá theo stableKey nên không còn gộp
  // nhầm hai dòng trùng tên ở hai hạng mục khác nhau. Dòng chưa có stableKey (dữ liệu trước khi
  // có trường này) bị BỎ QUA thay vì gộp bừa — đã backfill toàn bộ nên trên thực tế không xảy ra.
  const liveLines = new Map<string, { itemCode: string | null; sectionCode: string; sectionName: string; itemName: string; specs: string | null; amount: bigint; netAmount: bigint; vendorId: string | null; sort: number }>();
  let sortCounter = 0;
  let skippedNoKey = 0;
  for (const s of sheet.sections) {
    if (s.isProxy) continue;
    for (const l of s.lines) {
      if (!l.stableKey) {
        skippedNoKey++;
        continue;
      }
      liveLines.set(financeLineKey(l.stableKey), {
        itemCode: l.itemCode,
        sectionCode: s.code,
        sectionName: s.nameVi,
        itemName: l.itemName,
        specs: l.specs,
        amount: l.amount,
        // PERCENT_OF_TOTAL là dòng suy ra, không gross-up → net chính bằng amount đã lưu; khỏi
        // phải tính lại directCo ở đây (và khỏi rủi ro lệch làm tròn so với lúc lưu CO/CE).
        netAmount:
          l.lineType === "PERCENT_OF_TOTAL"
            ? l.amount
            : BigInt(
                computeLineNetAmount(
                  {
                    lineType: l.lineType,
                    quantity: l.quantity,
                    unitPrice: Number(l.unitPrice),
                    fixedAmount: l.fixedAmount == null ? null : Number(l.fixedAmount),
                    percentVal: l.percentVal,
                    taxType: l.taxType,
                    customTaxAmount: l.customTaxAmount == null ? null : Number(l.customTaxAmount),
                  },
                  0,
                ),
              ),
        vendorId: l.vendorId,
        sort: sortCounter++,
      });
    }
  }
  if (skippedNoKey > 0) console.warn(`[finance] ${skippedNoKey} dòng CO/CE chưa có stableKey — bỏ qua khi đồng bộ.`);

  const existingRows = await prisma.financeCostLine.findMany({ where: { projectId } });
  const existingByKey = new Map(existingRows.map((r) => [r.lineKey, r]));

  let added = 0;
  let updated = 0;
  for (const [key, live] of liveLines) {
    const row = existingByKey.get(key);
    if (row) {
      await prisma.financeCostLine.update({
        where: { id: row.id },
        data: {
          itemCode: live.itemCode,
          sectionCode: live.sectionCode,
          sectionName: live.sectionName,
          itemName: live.itemName,
          specs: live.specs,
          amount: live.amount,
          netAmount: live.netAmount,
          vendorId: live.vendorId,
          sort: live.sort,
          sourceRevNo: revNo,
          isStale: false,
        },
      });
      updated++;
    } else {
      await prisma.financeCostLine.create({
        data: {
          projectId,
          lineKey: key,
          itemCode: live.itemCode,
          sectionCode: live.sectionCode,
          sectionName: live.sectionName,
          itemName: live.itemName,
          specs: live.specs,
          amount: live.amount,
          netAmount: live.netAmount,
          vendorId: live.vendorId,
          sort: live.sort,
          sourceRevNo: revNo,
        },
      });
      added++;
    }
  }

  // Dòng cũ không còn ở version mới → đánh dấu stale (không xóa vì có thể đã gắn tạm ứng).
  let staled = 0;
  for (const row of existingRows) {
    if (!liveLines.has(row.lineKey) && !row.isStale) {
      await prisma.financeCostLine.update({ where: { id: row.id }, data: { isStale: true } });
      staled++;
    }
  }

  return { added, updated, staled, revNo };
}

export type LineDisbursement = {
  /** Tạm ứng chưa huỷ — GỘP cả 2 loại: ứng cho NV giữ tiền (STAFF) và ứng chuyển thẳng NCC (VENDOR). */
  advanced: number;
  /** Thanh toán NCC đã lập cho dòng này (mọi trạng thái trừ huỷ). */
  paid: number;
  /** Tổng đã chi ra = advanced + paid. */
  disbursed: number;
  /** Trần = số THỰC TRẢ của dòng (đã bóc gross-up thuế). */
  netAmount: number;
  /** Còn được chi thêm. Âm = đã lỡ chi vượt (dữ liệu cũ trước khi có trần này). */
  remaining: number;
};

/**
 * Tổng đã chi ra của 1 dòng và phần còn lại được chi.
 *
 * TRẦN LÀ `netAmount`, KHÔNG phải `amount`: `amount` đã gross-up thuế TNCN (÷0,9) / TNDN (÷0,8),
 * mà phần gross-up là thuế công ty nộp hộ chứ không trao cho NCC hay nhân viên. Lấy `amount`
 * làm trần cho chi vượt đúng bằng phần thuế — đo trên T013 là 70.250.002đ.
 *
 * Đếm CẢ tạm ứng LẪN thanh toán NCC: cùng một dòng chi phí có thể vừa ứng trước vừa thanh toán,
 * tính riêng từng loại sẽ cho chi tổng cộng gấp đôi giá trị dòng.
 */
export async function lineDisbursement(financeCostLineId: string): Promise<LineDisbursement> {
  const [line, advAgg, payAgg] = await Promise.all([
    prisma.financeCostLine.findUnique({ where: { id: financeCostLineId }, select: { netAmount: true } }),
    prisma.advance.aggregate({ where: { financeCostLineId, status: { not: "CANCELED" } }, _sum: { amount: true } }),
    prisma.vendorPayment.aggregate({ where: { financeCostLineId }, _sum: { amount: true } }),
  ]);
  const advanced = Number(advAgg._sum.amount ?? BigInt(0));
  const paid = Number(payAgg._sum.amount ?? BigInt(0));
  const netAmount = Number(line?.netAmount ?? BigInt(0));
  const disbursed = advanced + paid;
  return { advanced, paid, disbursed, netAmount, remaining: netAmount - disbursed };
}

export type StaffAdvanceQuota = {
  openCount: number;
  outstandingAmount: number;
  maxCount: number;
  maxAmount: number;
  blockedByCount: boolean;
  blockedByAmount: boolean;
  blocked: boolean;
};

/**
 * Hạn mức tạm ứng của 1 NV (loại STAFF) — check CHÉO tất cả dự án theo recipientStaffId.
 * "Đang giữ" = status REQUESTED|DISBURSED (chưa hoàn ứng). Vượt số lần HOẶC vượt tổng tiền → blocked.
 * `extraAmount` = số tiền lần ứng mới đang định thực hiện (để kiểm tra trước khi tạo).
 */
export async function getStaffAdvanceQuota(staffId: string, extraAmount = 0): Promise<StaffAdvanceQuota> {
  const [maxCount, maxAmount, rows] = await Promise.all([
    getNumberSetting("finance", "max_advance_count_per_staff", 3),
    getNumberSetting("finance", "max_outstanding_advance_amount_per_staff", 50_000_000),
    prisma.advance.findMany({
      where: { advanceType: "STAFF", recipientStaffId: staffId, status: { in: ["REQUESTED", "DISBURSED"] } },
      select: { amount: true },
    }),
  ]);

  const openCount = rows.length;
  const outstandingAmount = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const blockedByCount = openCount + 1 > maxCount;
  const blockedByAmount = outstandingAmount + extraAmount > maxAmount;

  return {
    openCount,
    outstandingAmount,
    maxCount,
    maxAmount,
    blockedByCount,
    blockedByAmount,
    blocked: blockedByCount || blockedByAmount,
  };
}

export type ArOverdueItem = {
  invoiceId: string;
  invoiceNo: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  teamCode: string | null;
  outstanding: number;
  dueDate: Date;
  daysOverdue: number;
};

/** Hóa đơn khách quá hạn mà còn dư — thuần computed cho /reminders.
 * Mốc quá hạn = dueDate ?? invoiceDate (thống nhất với cashflow.ts/dashboard.ts/trang debt):
 * hóa đơn không có dueDate nhưng phát hành đã lâu vẫn phải được nhắc, không "vô hình". */
export async function getArOverdueItems(teamCode?: string): Promise<ArOverdueItem[]> {
  const now = new Date();
  const invoices = await prisma.clientInvoice.findMany({
    where: {
      OR: [{ dueDate: { lt: now } }, { dueDate: null, invoiceDate: { lt: now } }],
      project: teamCode ? { ownerTeam: { code: teamCode } } : undefined,
    },
    include: {
      client: true,
      project: { include: { ownerTeam: true } },
      payments: { select: { amount: true } },
    },
  });

  const out: ArOverdueItem[] = [];
  for (const inv of invoices) {
    const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstanding = Number(inv.amount) - paid;
    if (outstanding <= 0) continue;
    const dueDate = inv.dueDate ?? inv.invoiceDate;
    out.push({
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo,
      projectId: inv.projectId,
      projectCode: inv.project.code,
      projectName: inv.project.name,
      clientName: inv.client.name,
      teamCode: inv.project.ownerTeam?.code ?? null,
      outstanding,
      dueDate,
      daysOverdue: Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)),
    });
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
}
