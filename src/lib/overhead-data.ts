import "server-only";

import { prisma } from "./prisma";
import { toNum } from "./utils";
import { computeOverheadReport, MONTHS, type OverheadReport } from "./overhead";
import type { ParseOverheadResult } from "./overhead-import";

/**
 * Nạp dữ liệu chi phí văn phòng. Tách IO khỏi phần tính (src/lib/overhead.ts thuần).
 *
 * ⚠ TRANG và SERVER ACTION dùng chung đúng những hàm ở đây. HANDOVER 10.11 ghi lại vết xe đổ của
 * Kho v2: `requests/load.ts` tính tồn khả dụng khác `requests/actions.ts`, hệ quả là màn hình hiện
 * số rộng hơn thực tế rồi server mới báo lỗi. Đừng đẻ đường nạp thứ hai cho cùng một con số.
 */

export type OverheadBudgetHeader = {
  id: string;
  fiscalYear: number;
  status: string;
  note: string | null;
  submittedAt: Date | null;
  submittedByName: string | null;
  cfoApprovedAt: Date | null;
  cfoApprovedByName: string | null;
  ceoApprovedAt: Date | null;
  ceoApprovedByName: string | null;
  rejectedAt: Date | null;
  rejectedByName: string | null;
  rejectedNote: string | null;
};

export type OverheadSpendRow = {
  id: string;
  itemId: string;
  pidCode: string;
  itemName: string;
  categoryLabel: string;
  month: number;
  name: string;
  expectedDate: Date | null;
  amountNet: number;
  vat: number;
  tncn: number;
  tndn: number;
  amountTotal: number;
  status: string;
  paidDate: Date | null;
  paidByName: string | null;
  overBudgetNote: string | null;
  cancelNote: string | null;
  reverseNote: string | null;
};

/**
 * Ghi bản ngân sách đã đọc từ Excel vào DB.
 *
 * Tách khỏi server action để bộ kiểm thử gọi được ĐÚNG hàm này — nếu test viết bản sao logic thì nó
 * chỉ chứng minh bản sao đúng, không chứng minh app đúng.
 *
 * Bản import vào thẳng LOCKED: năm 2026 BOD đã duyệt ngoài app. Luồng duyệt 2 cấp chỉ áp cho bản
 * lập trong app từ 2027.
 */
export async function importBudget(
  fiscalYear: number,
  parsed: ParseOverheadResult,
  fileKey: string | null,
  staffId: string | null,
): Promise<{ items: number; spends: number }> {
  let spendCount = 0;
  await prisma.$transaction(async (tx) => {
    const budget = await tx.overheadBudget.create({
      data: {
        fiscalYear,
        status: "LOCKED",
        sourceFileKey: fileKey,
        note: `Import từ Excel (${parsed.items.length} khoản, ${parsed.spends.length} lần chi)`,
        ceoApprovedAt: new Date(),
        ceoApprovedById: staffId,
      },
    });

    const idByPid = new Map<string, string>();
    for (const [i, it] of parsed.items.entries()) {
      const created = await tx.overheadItem.create({
        data: {
          budgetId: budget.id,
          pidCode: it.pidCode,
          name: it.name,
          categoryLabel: it.categoryLabel,
          requestKind: it.requestKind,
          // Khoản lương/BHXH/công đoàn sẽ đọc số thực chi từ module ⑦ khi Payroll xong. File không
          // có cột nào đánh dấu nên nhận diện bằng TÊN — chấp nhận được vì chỉ 3 khoản, và sai thì
          // sửa được bằng tay ở màn hình ngân sách.
          actualSource: /lương|bhxh|công đoàn/i.test(it.name) ? "PAYROLL" : "MANUAL",
          sort: i,
          note: it.note,
        },
      });
      idByPid.set(it.pidCode, created.id);
      await tx.overheadBudgetMonth.createMany({
        data: MONTHS.map((m) => ({ itemId: created.id, month: m, amount: BigInt(Math.round(it.months[m - 1] ?? 0)) })),
      });
    }

    // Thực chi trong file là số kế toán ĐÃ CHI → PAID ngay, không phải phiếu chờ thanh toán.
    for (const s of parsed.spends) {
      const itemId = idByPid.get(s.pidCode);
      if (!itemId) continue;
      await tx.overheadSpend.create({
        data: {
          itemId,
          month: s.month,
          name: s.name,
          amountNet: BigInt(Math.round(s.amountNet)),
          vat: BigInt(Math.round(s.vat)),
          tncn: BigInt(Math.round(s.tncn)),
          tndn: BigInt(Math.round(s.tndn)),
          amountTotal: BigInt(Math.round(s.amountTotal)),
          status: "PAID",
          createdById: staffId,
          note: s.note,
        },
      });
      spendCount++;
    }
  });
  return { items: parsed.items.length, spends: spendCount };
}

/** Các năm đã có bản ngân sách — dùng cho ô chọn năm. */
export async function loadBudgetYears(): Promise<number[]> {
  const rows = await prisma.overheadBudget.findMany({ select: { fiscalYear: true }, orderBy: { fiscalYear: "desc" } });
  return rows.map((r) => r.fiscalYear);
}

function headerOf(b: {
  id: string; fiscalYear: number; status: string; note: string | null;
  submittedAt: Date | null; cfoApprovedAt: Date | null; ceoApprovedAt: Date | null; rejectedAt: Date | null; rejectedNote: string | null;
  submittedBy: { fullName: string } | null; cfoApprovedBy: { fullName: string } | null;
  ceoApprovedBy: { fullName: string } | null; rejectedBy: { fullName: string } | null;
}): OverheadBudgetHeader {
  return {
    id: b.id,
    fiscalYear: b.fiscalYear,
    status: b.status,
    note: b.note,
    submittedAt: b.submittedAt,
    submittedByName: b.submittedBy?.fullName ?? null,
    cfoApprovedAt: b.cfoApprovedAt,
    cfoApprovedByName: b.cfoApprovedBy?.fullName ?? null,
    ceoApprovedAt: b.ceoApprovedAt,
    ceoApprovedByName: b.ceoApprovedBy?.fullName ?? null,
    rejectedAt: b.rejectedAt,
    rejectedByName: b.rejectedBy?.fullName ?? null,
    rejectedNote: b.rejectedNote,
  };
}

const HEADER_INCLUDE = {
  submittedBy: { select: { fullName: true } },
  cfoApprovedBy: { select: { fullName: true } },
  ceoApprovedBy: { select: { fullName: true } },
  rejectedBy: { select: { fullName: true } },
} as const;

export async function loadBudgetHeader(fiscalYear: number): Promise<OverheadBudgetHeader | null> {
  const b = await prisma.overheadBudget.findUnique({ where: { fiscalYear }, include: HEADER_INCLUDE });
  return b ? headerOf(b) : null;
}

/**
 * Báo cáo đầy đủ của một năm: header + 3 làn tiền theo từng khoản.
 *
 * `upToMonth` mặc định = tháng hiện tại nếu đang xem năm nay, ngược lại 12 (năm cũ xem cả năm).
 * Dùng giờ ĐỊA PHƯƠNG: `fiscalYear`/`month` là kỳ nghiệp vụ, không phải mốc UTC-midnight của các
 * cột ngày (HANDOVER 4.3) — lấy UTC ở khung 0–7h sáng sẽ nhảy sang tháng trước.
 */
export async function loadOverheadReport(
  fiscalYear: number,
  upToMonth?: number,
): Promise<{ header: OverheadBudgetHeader; report: OverheadReport; cap: number } | null> {
  const budget = await prisma.overheadBudget.findUnique({
    where: { fiscalYear },
    include: {
      ...HEADER_INCLUDE,
      items: {
        orderBy: [{ sort: "asc" }, { pidCode: "asc" }],
        include: { budgetMonths: { select: { itemId: true, month: true, amount: true } } },
      },
    },
  });
  if (!budget) return null;

  const now = new Date();
  const cap = upToMonth ?? (now.getFullYear() === fiscalYear ? now.getMonth() + 1 : 12);

  const itemIds = budget.items.map((i) => i.id);
  const spends = itemIds.length
    ? await prisma.overheadSpend.findMany({
        where: { itemId: { in: itemIds } },
        select: { itemId: true, month: true, amountTotal: true, status: true },
      })
    : [];

  const report = computeOverheadReport(
    budget.items.map((i) => ({
      id: i.id,
      pidCode: i.pidCode,
      name: i.name,
      categoryLabel: i.categoryLabel,
      requestKind: i.requestKind,
      actualSource: i.actualSource,
      isActive: i.isActive,
      sort: i.sort,
    })),
    budget.items.flatMap((i) => i.budgetMonths.map((m) => ({ itemId: m.itemId, month: m.month, amount: toNum(m.amount) }))),
    spends.map((s) => ({ itemId: s.itemId, month: s.month, amountTotal: toNum(s.amountTotal), status: s.status })),
    cap,
  );

  return { header: headerOf(budget), report, cap };
}

/** Danh sách khoản chi của một năm, mới nhất trước. */
export async function loadSpends(fiscalYear: number, filter: { month?: number; status?: string } = {}): Promise<OverheadSpendRow[]> {
  const rows = await prisma.overheadSpend.findMany({
    where: {
      item: { budget: { fiscalYear } },
      ...(filter.month ? { month: filter.month } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    include: {
      item: { select: { id: true, pidCode: true, name: true, categoryLabel: true } },
      paidBy: { select: { fullName: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    itemId: s.item.id,
    pidCode: s.item.pidCode,
    itemName: s.item.name,
    categoryLabel: s.item.categoryLabel,
    month: s.month,
    name: s.name,
    expectedDate: s.expectedDate,
    amountNet: toNum(s.amountNet),
    vat: toNum(s.vat),
    tncn: toNum(s.tncn),
    tndn: toNum(s.tndn),
    amountTotal: toNum(s.amountTotal),
    status: s.status,
    paidDate: s.paidDate,
    paidByName: s.paidBy?.fullName ?? null,
    overBudgetNote: s.overBudgetNote,
    cancelNote: s.cancelNote,
    reverseNote: s.reverseNote,
  }));
}

/** Khoản chi đang mở của một năm — đổ vào ô chọn khi tạo khoản chi mới. */
export async function loadItemOptions(fiscalYear: number) {
  return prisma.overheadItem.findMany({
    where: { budget: { fiscalYear }, isActive: true },
    orderBy: [{ sort: "asc" }, { pidCode: "asc" }],
    select: { id: true, pidCode: true, name: true, categoryLabel: true, actualSource: true },
  });
}

/**
 * Ngân sách năm + đã chi của MỘT khoản — dùng để kiểm vượt trần NGAY TRONG transaction lúc tạo
 * khoản chi. Đọc lại ở thời điểm ghi thay vì tin số màn hình gửi lên (quy ước "không tin số từ
 * client", HANDOVER 4.1), giống cách `createVendorPayment` aggregate lại trước khi create.
 */
export async function itemBudgetState(itemId: string): Promise<{ planYear: number; paidSoFar: number; actualSource: string } | null> {
  const item = await prisma.overheadItem.findUnique({
    where: { id: itemId },
    select: { actualSource: true, budgetMonths: { select: { amount: true } } },
  });
  if (!item) return null;
  const agg = await prisma.overheadSpend.aggregate({
    where: { itemId, status: "PAID" },
    _sum: { amountTotal: true },
  });
  return {
    planYear: item.budgetMonths.reduce((a, m) => a + toNum(m.amount), 0),
    paidSoFar: toNum(agg._sum.amountTotal ?? BigInt(0)),
    actualSource: item.actualSource,
  };
}
