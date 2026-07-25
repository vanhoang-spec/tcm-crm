import { prisma } from "./prisma";
import { getNumberSetting } from "./settings";

// ─────────────────────────────────────────────────────────
// Module ④ Chi phí & Công nợ — helpers thuần + đồng bộ CO
// ─────────────────────────────────────────────────────────

export const ADVANCE_STATUSES = ["REQUESTED", "DISBURSED", "SETTLED", "CANCELED"] as const;
export const ADVANCE_TYPES = ["VENDOR", "STAFF"] as const;
/** Tạm ứng "đang giữ" (chưa hoàn ứng, chưa hủy) — dùng cho hạn mức NV + tổng đã ứng của dòng. */
export const OUTSTANDING_ADVANCE_STATUSES = ["REQUESTED", "DISBURSED"] as const;

/** lineKey ổn định khớp costsheet-diff (CostLine.id bị tạo lại mỗi lần lưu CO/CE). */
export function financeLineKey(sectionCode: string, itemName: string): string {
  return `${sectionCode}‖${itemName}`;
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

  // Gom các dòng CO nội bộ (non-proxy) theo lineKey. Trùng key → cộng dồn amount (an toàn với itemName trùng).
  const liveLines = new Map<string, { sectionCode: string; sectionName: string; itemName: string; specs: string | null; amount: bigint; vendorId: string | null; sort: number }>();
  let sortCounter = 0;
  for (const s of sheet.sections) {
    if (s.isProxy) continue;
    for (const l of s.lines) {
      const key = financeLineKey(s.code, l.itemName);
      const existing = liveLines.get(key);
      if (existing) {
        existing.amount += l.amount;
      } else {
        liveLines.set(key, {
          sectionCode: s.code,
          sectionName: s.nameVi,
          itemName: l.itemName,
          specs: l.specs,
          amount: l.amount,
          vendorId: l.vendorId,
          sort: sortCounter++,
        });
      }
    }
  }

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
          sectionCode: live.sectionCode,
          sectionName: live.sectionName,
          itemName: live.itemName,
          specs: live.specs,
          amount: live.amount,
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
          sectionCode: live.sectionCode,
          sectionName: live.sectionName,
          itemName: live.itemName,
          specs: live.specs,
          amount: live.amount,
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

/** Tổng đã tạm ứng của 1 dòng (các bản ghi chưa hủy) — dùng để tính "còn lại" và chặn vượt giá trị dòng. */
export async function lineAdvancedTotal(financeCostLineId: string): Promise<number> {
  const agg = await prisma.advance.aggregate({
    where: { financeCostLineId, status: { not: "CANCELED" } },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? BigInt(0));
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
