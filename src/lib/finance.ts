import { prisma } from "./prisma";
import { arStartOfToday, arStatus } from "./ar";
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
 * FIN-B — đồng bộ trần chi CHỈ KHI bản CO sống đã được duyệt.
 *
 * `syncFinanceCostLines` đọc từ dòng CO SỐNG, nên chỉ được phép chạy khi bản sống == bản đã duyệt
 * (`approvedRevNo` == revNo mới nhất — mỗi lần lưu đều sinh revision nên hai điều này tương đương).
 * Mọi đường sync NGOÀI approveCostSheet (nút Làm mới, vào Processing) phải đi qua hàm này — gọi
 * thẳng syncFinanceCostLines là kéo số CHƯA DUYỆT vào trần chi, vô hiệu hoá cổng duyệt.
 */
export async function syncIfApproved(
  projectId: string,
): Promise<{ status: "SYNCED" | "PENDING_APPROVAL" | "NEVER_APPROVED" | "NO_SHEET" }> {
  const sheet = await prisma.costSheet.findFirst({
    where: { projectId, version: "CTRACT" },
    orderBy: { createdAt: "desc" },
    select: { approvedRevNo: true, revisions: { orderBy: { revNo: "desc" }, take: 1, select: { revNo: true } } },
  });
  if (!sheet) return { status: "NO_SHEET" };
  if (sheet.approvedRevNo == null) return { status: "NEVER_APPROVED" };
  const latest = sheet.revisions[0]?.revNo ?? 0;
  if (sheet.approvedRevNo !== latest) return { status: "PENDING_APPROVAL" };
  await syncFinanceCostLines(projectId);
  return { status: "SYNCED" };
}

/**
 * Đồng bộ (Refresh) các dòng chi phí từ CostSheet CTRACT mới nhất xuống FinanceCostLine.
 * ⚠ FIN-B: hàm này KHÔNG tự kiểm trạng thái duyệt — người gọi hợp lệ chỉ có approveCostSheet
 * (vừa set con trỏ xong) và syncIfApproved (đã kiểm). Đừng gọi thẳng từ chỗ khác.
 * - Lấy CẢ dòng Chi hộ (section isProxy) nhưng gắn cờ `isProxy` để tách bạch: Chi hộ là tiền ứng
 *   giùm khách, có trần chi riêng theo dòng như mọi dòng khác nhưng KHÔNG thuộc giá vốn nên không
 *   được cộng vào trần cấp dự án (xem projectDisbursement) và không vào margin (bất biến #2).
 *   Trước đây Chi hộ bị bỏ hẳn, khiến toàn bộ tiền chi hộ phải đi đường phiếu chi không trần.
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
  const liveLines = new Map<string, { itemCode: string | null; sectionCode: string; sectionName: string; itemName: string; specs: string | null; amount: bigint; netAmount: bigint; payCap: bigint; isProxy: boolean; vendorId: string | null; sort: number }>();
  let sortCounter = 0;
  let skippedNoKey = 0;

  // Chi hộ KẾ THỪA xuống nhánh con: section con nằm dưới một mục Chi hộ cũng là Chi hộ dù tự nó
  // không đánh dấu — giống hệt effectiveIsProxy trong flattenSectionTree (lib/bidding.ts). Lấy
  // thẳng s.isProxy sẽ bỏ sót cả nhánh con và đẩy tiền chi hộ vào trần giá vốn.
  const sectionById = new Map(sheet.sections.map((s) => [s.id, s]));
  const effectiveProxy = (start: (typeof sheet.sections)[number]): boolean => {
    let cur: (typeof sheet.sections)[number] | undefined = start;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      if (cur.isProxy) return true;
      seen.add(cur.id);
      cur = cur.parentSectionId ? sectionById.get(cur.parentSectionId) : undefined;
    }
    return false;
  };

  for (const s of sheet.sections) {
    const isProxy = effectiveProxy(s);
    for (const l of s.lines) {
      if (!l.stableKey) {
        skippedNoKey++;
        continue;
      }
      // K3: dòng LẤY TỪ KHO không sinh dòng chi phí — hàng đã trả tiền ở hợp đồng trước, trần chi
      // của nó bằng 0. Để nó vào đây thì dự án có "dòng chi phí" với trần 0, và phiếu chi cấp dự án
      // báo "vượt trần" thay vì "chưa có dòng chi phí". Phần phải mua nằm ở dòng mua bù cùng cặp.
      if (l.stockRefUnitPrice != null) continue;
      // PERCENT_OF_TOTAL là dòng suy ra, không gross-up → net chính bằng amount đã lưu; khỏi
      // phải tính lại directCo ở đây (và khỏi rủi ro lệch làm tròn so với lúc lưu CO/CE).
      const netAmount =
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
            );
      // CO/CE v3 — TRẦN CHI hiệu lực: dòng VAT đã chọn % thì số phải trả NCC GỒM VAT; còn lại
      // giữ net (Q4: VAT chưa chọn % giữ trần cũ). Cùng công thức payCapFor (lib/bidding.ts).
      const payCap =
        l.taxType === "VAT" && l.vatPct != null && l.vatPct > 0
          ? BigInt(Math.round(Number(netAmount) * (1 + l.vatPct / 100)))
          : netAmount;
      liveLines.set(financeLineKey(l.stableKey), {
        itemCode: l.itemCode,
        sectionCode: s.code,
        sectionName: s.nameVi,
        itemName: l.itemName,
        specs: l.specs,
        amount: l.amount,
        isProxy,
        netAmount,
        payCap,
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
          payCap: live.payCap,
          isProxy: live.isProxy,
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
          payCap: live.payCap,
          isProxy: live.isProxy,
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
  /** Thanh toán NCC đã lập cho dòng này (SCHEDULED + PAID, không tính phiếu đã huỷ). */
  paid: number;
  /** Tổng đã chi ra = advanced + paid. */
  disbursed: number;
  /** Số thực trả (đã bóc gross-up thuế) — để hiển thị đối chiếu. */
  netAmount: number;
  /** CO/CE v3 — TRẦN hiệu lực: VAT đã chọn % thì gồm VAT, còn lại = netAmount. */
  cap: number;
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
    prisma.financeCostLine.findUnique({ where: { id: financeCostLineId }, select: { netAmount: true, payCap: true } }),
    prisma.advance.aggregate({ where: { financeCostLineId, status: { not: "CANCELED" } }, _sum: { amount: true } }),
    prisma.vendorPayment.aggregate({ where: { financeCostLineId, status: { not: "CANCELED" } }, _sum: { amount: true } }),
  ]);
  const advanced = Number(advAgg._sum.amount ?? BigInt(0));
  const paid = Number(payAgg._sum.amount ?? BigInt(0));
  const netAmount = Number(line?.netAmount ?? BigInt(0));
  // CO/CE v3 — trần hiệu lực đọc từ payCap (VAT đã chọn % thì gồm VAT; backfill = netAmount).
  const cap = Number(line?.payCap ?? BigInt(0));
  const disbursed = advanced + paid;
  return { advanced, paid, disbursed, netAmount, cap, remaining: cap - disbursed };
}

export type ProjectDisbursement = {
  /** Trần = Σ số thực trả của các dòng chi phí còn hiệu lực, KHÔNG gồm Chi hộ. */
  capBase: number;
  advanced: number;
  paid: number;
  disbursed: number;
  remaining: number;
  /** false = dự án chưa có dòng chi phí nào (chưa dựng/chưa đồng bộ CO/CE) → mọi khoản chi đều vượt trần. */
  hasLines: boolean;
};

/**
 * Trần chi Ở CẤP DỰ ÁN — dùng cho phiếu chi không gắn dòng chi phí cụ thể.
 *
 * Trước đây nhánh này không có trần nào: số tiền tùy ý, dự án cũng không bắt buộc. Nay lấy tổng
 * số THỰC TRẢ của mọi dòng còn hiệu lực làm trần, nhất quán với trần cấp dòng (lineDisbursement).
 *
 * KHÔNG dùng CostSheet.coTotal làm trần: coTotal đã gross-up thuế + phí quản lý + dự phòng, chênh
 * lệch so với số thực trả đo trên T013 là 70.250.002đ — lấy nó làm trần là cho chi vượt đúng phần
 * thuế công ty nộp hộ.
 *
 * LOẠI Chi hộ khỏi capBase: Chi hộ là tiền ứng giùm khách, ngoài giá vốn (bất biến #2). Nó có trần
 * riêng theo từng dòng qua lineDisbursement, không trộn vào túi giá vốn của dự án.
 *
 * LOẠI Chi hộ khỏi CẢ disbursed: capBase đã bỏ dòng Chi hộ thì khoản chi GẮN vào dòng Chi hộ cũng
 * phải bỏ — nếu không, chi hộ gặm trần giá vốn (tử số có, mẫu số không). Khoản chi cấp dự án
 * (không gắn dòng) vẫn đếm đủ vì không có cách biết nó thuộc Chi hộ hay giá vốn.
 */
export async function projectDisbursement(projectId: string): Promise<ProjectDisbursement> {
  // "Không thuộc dòng Chi hộ": tạm ứng LUÔN gắn dòng (cột bắt buộc) → chỉ cần dòng non-proxy;
  // phiếu chi có thể không gắn dòng (khoản cấp dự án) → không gắn dòng HOẶC dòng non-proxy.
  const [capAgg, lineCount, advAgg, payAgg] = await Promise.all([
    prisma.financeCostLine.aggregate({ where: { projectId, isStale: false, isProxy: false }, _sum: { payCap: true } }),
    prisma.financeCostLine.count({ where: { projectId, isStale: false, isProxy: false } }),
    prisma.advance.aggregate({
      where: { projectId, status: { not: "CANCELED" }, financeCostLine: { isProxy: false } },
      _sum: { amount: true },
    }),
    prisma.vendorPayment.aggregate({
      where: { projectId, status: { not: "CANCELED" }, OR: [{ financeCostLineId: null }, { financeCostLine: { isProxy: false } }] },
      _sum: { amount: true },
    }),
  ]);
  const capBase = Number(capAgg._sum.payCap ?? BigInt(0));
  const advanced = Number(advAgg._sum.amount ?? BigInt(0));
  const paid = Number(payAgg._sum.amount ?? BigInt(0));
  const disbursed = advanced + paid;
  return { capBase, advanced, paid, disbursed, remaining: capBase - disbursed, hasLines: lineCount > 0 };
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

/** Hóa đơn khách quá hạn mà còn dư — thuần computed cho /reminders. Định nghĩa "còn phải thu",
 * "mốc đến hạn" và "quá hạn" lấy từ lib/ar.ts, dùng chung với trang Công nợ / dashboard / cashflow.
 *
 * So theo NGÀY (đầu ngày hôm nay) chứ không theo thời điểm: trước đây so với `now` nên hóa đơn đến
 * hạn ĐÚNG HÔM NAY đã bị tính quá hạn ngay từ sáng và hiện "quá hạn 0 ngày" trên chuông, trong khi
 * trang Công nợ vẫn xếp nó vào "Chưa tới hạn". Nay cả hai nói cùng một điều. */
export async function getArOverdueItems(teamCode?: string): Promise<ArOverdueItem[]> {
  const now = new Date();
  const today = arStartOfToday(now);
  const invoices = await prisma.clientInvoice.findMany({
    where: {
      voidedAt: null,
      OR: [{ dueDate: { lt: today } }, { dueDate: null, invoiceDate: { lt: today } }],
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
    const st = arStatus(
      {
        amount: Number(inv.amount),
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        paidAmounts: inv.payments.map((p) => Number(p.amount)),
      },
      now,
    );
    // Lọc lại phía app: invoiceDate có thể mang cả giờ (fallback `new Date()` lúc tạo hóa đơn) nên
    // điều kiện SQL ở trên vẫn có thể lọt hóa đơn mà tính theo ngày thì chưa quá hạn.
    if (st.outstanding <= 0 || !st.isOverdue) continue;
    out.push({
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo,
      projectId: inv.projectId,
      projectCode: inv.project.code,
      projectName: inv.project.name,
      clientName: inv.client.name,
      teamCode: inv.project.ownerTeam?.code ?? null,
      outstanding: st.outstanding,
      dueDate: st.dueBase,
      daysOverdue: st.daysOverdue,
    });
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
}
