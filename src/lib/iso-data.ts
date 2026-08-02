import "server-only";

import { prisma } from "./prisma";
import { resolveIsoDocs, summarizeIso, type IsoManualEntry, type IsoProjectSnapshot, type IsoDocState, type IsoSummary } from "./iso-report";

/**
 * Nạp dữ liệu cho sổ đăng ký hồ sơ ISO. Tách IO khỏi phần tính (src/lib/iso-report.ts thuần).
 *
 * ⚠ Trang chi tiết 1 dự án và trang tổng hợp toàn công ty DÙNG CHUNG đúng hàm này. HANDOVER 10.11 ghi
 * lại vết xe đổ của Kho v2: `requests/load.ts` và `requests/actions.ts` tính tồn khả dụng khác nhau,
 * hệ quả là màn hình hiện số rộng hơn thực tế rồi server mới báo lỗi. Đừng đẻ đường nạp thứ hai.
 */

export type IsoProjectRow = {
  id: string;
  code: string;
  name: string;
  clientName: string;
  teamCode: string | null;
  ownerName: string | null;
  statusLabelVi: string;
  statusLabelEn: string | null;
  isoFolderUrl: string | null;
  states: IsoDocState[];
  summary: IsoSummary;
};

/**
 * ID các TimelineTemplateItem thuộc template viewMode = "CHECKLIST".
 *
 * ⚠ `TimelineItem.templateItemId` là provenance, KHÔNG có FK cứng (xem chú thích trong schema) nên
 * Prisma không join được — phải lấy tập id rồi lọc tay. Hệ quả CỐ Ý CHẤP NHẬN: item checklist do
 * người dùng gõ tay (không sinh từ template) sẽ KHÔNG được app tự chấm; PIC đính bằng chứng tay.
 * Thà báo thiếu còn hơn nhận vơ là đã có checklist.
 */
async function checklistTemplateItemIds(): Promise<string[]> {
  const rows = await prisma.timelineTemplateItem.findMany({
    where: { section: { template: { viewMode: "CHECKLIST" } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Nạp + chấm cho một tập dự án. `projectIds = null` nghĩa là lấy tất cả (trang tổng hợp). */
export async function loadIsoRows(where: { projectIds?: string[]; teamId?: string; fiscalYear?: number } = {}): Promise<IsoProjectRow[]> {
  const projectWhere = {
    ...(where.projectIds ? { id: { in: where.projectIds } } : {}),
    ...(where.teamId ? { ownerTeamId: where.teamId } : {}),
    ...(where.fiscalYear ? { fiscalYear: where.fiscalYear } : {}),
  };

  const projects = await prisma.project.findMany({
    where: projectWhere,
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      briefLinkUrl: true,
      isoFolderUrl: true,
      client: { select: { name: true } },
      ownerTeam: { select: { code: true } },
      owner: { select: { fullName: true } },
      status: { select: { labelVi: true, labelEn: true } },
      costSheets: { select: { version: true } },
      contract: {
        select: { fileUrl: true, contractNo: true, poNo: true, acceptanceDocsConfirmedAt: true },
      },
      _count: { select: { clientInvoices: { where: { voidedAt: null } } } },
    },
  });
  if (projects.length === 0) return [];

  const ids = projects.map((p) => p.id);
  const checklistItemIds = await checklistTemplateItemIds();

  const [timelineCounts, checklistCounts, finalProposalJobs, sentOrders, designCounts, manualRows] = await Promise.all([
    prisma.timelineItem.groupBy({ by: ["projectId"], where: { projectId: { in: ids } }, _count: { _all: true } }),
    checklistItemIds.length === 0
      ? Promise.resolve([] as { projectId: string; _count: { _all: number } }[])
      : prisma.timelineItem.groupBy({
          by: ["projectId"],
          where: { projectId: { in: ids }, templateItemId: { in: checklistItemIds } },
          _count: { _all: true },
        }),
    prisma.planningJob.findMany({
      where: { projectId: { in: ids }, versions: { some: { status: "FINAL" } } },
      select: { projectId: true },
    }),
    prisma.projectOrder.findMany({
      where: { projectId: { in: ids }, isDraft: false },
      select: { projectId: true, department: true },
    }),
    prisma.creativeTask.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, status: "DELIVERED", deliverableLinkUrl: { not: null } },
      _count: { _all: true },
    }),
    prisma.projectIsoDoc.findMany({
      where: { projectId: { in: ids } },
      select: {
        projectId: true,
        docCode: true,
        status: true,
        linkUrl: true,
        projectFileId: true,
        naReason: true,
        note: true,
        projectFile: { select: { fileName: true } },
      },
    }),
  ]);

  const timelineBy = new Map(timelineCounts.map((r) => [r.projectId, r._count._all]));
  const checklistBy = new Map(checklistCounts.map((r) => [r.projectId, r._count._all]));
  const designBy = new Map(designCounts.map((r) => [r.projectId, r._count._all]));
  const finalProposalIds = new Set(finalProposalJobs.map((r) => r.projectId));
  const ordersBy = new Map<string, string[]>();
  for (const o of sentOrders) {
    const list = ordersBy.get(o.projectId) ?? [];
    list.push(o.department);
    ordersBy.set(o.projectId, list);
  }
  const manualBy = new Map<string, IsoManualEntry[]>();
  for (const m of manualRows) {
    const list = manualBy.get(m.projectId) ?? [];
    list.push({
      docCode: m.docCode,
      status: m.status === "NA" ? "NA" : "PRESENT",
      linkUrl: m.linkUrl,
      projectFileId: m.projectFileId,
      fileName: m.projectFile?.fileName ?? null,
      naReason: m.naReason,
      note: m.note,
    });
    manualBy.set(m.projectId, list);
  }

  return projects.map((p) => {
    const snapshot: IsoProjectSnapshot = {
      briefLinkUrl: p.briefLinkUrl,
      hasFinalProposal: finalProposalIds.has(p.id),
      hasBudgetSheet: p.costSheets.some((c) => c.version === "CTRACT"),
      hasLiquidSheet: p.costSheets.some((c) => c.version === "LIQUID"),
      timelineCount: timelineBy.get(p.id) ?? 0,
      checklistCount: checklistBy.get(p.id) ?? 0,
      contract: p.contract,
      invoiceCount: p._count.clientInvoices,
      sentOrderDepartments: ordersBy.get(p.id) ?? [],
      deliveredDesignCount: designBy.get(p.id) ?? 0,
    };
    const states = resolveIsoDocs(snapshot, manualBy.get(p.id) ?? []);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      clientName: p.client.name,
      teamCode: p.ownerTeam?.code ?? null,
      ownerName: p.owner?.fullName ?? null,
      statusLabelVi: p.status.labelVi,
      statusLabelEn: p.status.labelEn,
      isoFolderUrl: p.isoFolderUrl,
      states,
      summary: summarizeIso(states),
    };
  });
}

/** Một dự án — dùng lại đúng đường nạp ở trên, không viết truy vấn riêng. */
export async function loadIsoRow(projectId: string): Promise<IsoProjectRow | null> {
  const rows = await loadIsoRows({ projectIds: [projectId] });
  return rows[0] ?? null;
}

/** File đã đính cho 1 dự án — đổ vào ô chọn khi PIC gắn file có sẵn vào một mục ISO. */
export async function loadProjectFiles(projectId: string) {
  return prisma.projectFile.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, fileSize: true, label: true, createdAt: true },
  });
}
