import "server-only";
import { prisma } from "@/lib/prisma";
import { getNumberSetting } from "@/lib/settings";
import { computeMarginPct } from "@/lib/bidding";
import { toNum } from "@/lib/utils";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import { getCareOverdueClients, getTimelineOverdueItems } from "@/lib/reminders";
import { getArOverdueItems } from "@/lib/finance";
import { readAiFile } from "@/lib/ai-file-storage";
import { extractTextFromFile } from "./extract-text";
import type { BoardReportInput, BrainstormInput, CanvaBriefInput, ContentWriterInput, CostSheetSnapshot } from "./prompts";

/**
 * Nạp dữ liệu THẬT từ CRM để làm đầu vào cho AI.
 *
 * Đây là lớp chống bịa số: model chỉ được nhìn thấy con số lấy từ DB, không tự sinh ra.
 * Mọi BigInt phải đổi sang Number ở đây (JSON.stringify không xử lý được BigInt).
 */

const dmy = (d: Date | null | undefined): string | null =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : null;

/** Ảnh chụp bảng CO/CE của 1 dự án. Null nếu dự án chưa có bảng CO/CE. */
export async function buildCostSheetSnapshot(projectId: string): Promise<CostSheetSnapshot | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      code: true,
      name: true,
      client: { select: { name: true } },
      projectType: { select: { labelVi: true } },
    },
  });
  if (!project) return null;

  const sheet = await prisma.costSheet.findFirst({
    where: { projectId, version: "CTRACT" },
    orderBy: { createdAt: "desc" },
    select: {
      ceTotal: true,
      coTotal: true,
      chiHo: true,
      vatPct: true,
      minMarginPct: true,
      sections: {
        orderBy: { sort: "asc" },
        select: {
          nameVi: true,
          isProxy: true,
          lines: {
            orderBy: { sort: "asc" },
            select: {
              itemName: true, specs: true, quantity: true, unit: true,
              unitPrice: true, amount: true, isLocked: true, maxMarkupPct: true,
            },
          },
        },
      },
    },
  });
  if (!sheet) return null;

  const coTotal = toNum(sheet.coTotal);
  const ceTotal = toNum(sheet.ceTotal);

  return {
    projectCode: project.code,
    projectName: project.name,
    clientName: project.client?.name ?? null,
    projectType: project.projectType?.labelVi ?? null,
    coTotal,
    ceTotal,
    chiHo: toNum(sheet.chiHo),
    vatPct: sheet.vatPct,
    marginPct: computeMarginPct(ceTotal, coTotal),
    minMarginPct: sheet.minMarginPct,
    sections: sheet.sections.map((s) => ({
      name: s.nameVi,
      isProxy: s.isProxy,
      lines: s.lines.map((l) => ({
        itemName: l.itemName,
        specs: l.specs,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: toNum(l.unitPrice),
        amount: toNum(l.amount),
        isLocked: l.isLocked,
        maxMarkupPct: l.maxMarkupPct,
      })),
    })),
  };
}

/**
 * Đọc TOÀN BỘ file đính kèm dự án (thư viện `ProjectFile` — mời thầu/tài liệu khách gửi, xem
 * prisma/schema.prisma) và ghép thành 1 khối text cho prompt. Best-effort: file không đọc được
 * nội dung (doc/ppt/xls/ảnh) vẫn liệt kê TÊN để model biết "có tài liệu, không đọc được nội dung"
 * thay vì im lặng bỏ qua. Trả `null` nếu dự án chưa có file nào — chỗ gọi không in khối rỗng.
 */
export async function buildProjectFilesText(projectId: string): Promise<string | null> {
  const files = await prisma.projectFile.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: { fileKey: true, fileMime: true, fileName: true, label: true },
  });
  if (files.length === 0) return null;

  const blocks = await Promise.all(
    files.map(async (f) => {
      const header = `--- ${f.fileName}${f.label ? ` (${f.label})` : ""} ---`;
      try {
        const buffer = await readAiFile(f.fileKey);
        const extracted = await extractTextFromFile(buffer, f.fileMime);
        if (!extracted) return `${header}\n(không đọc được nội dung định dạng này — chỉ có tên file)`;
        return `${header}\n${extracted.text}${extracted.truncated ? "\n…(đã cắt bớt, file dài hơn)" : ""}`;
      } catch (e) {
        console.error("[AI] không đọc được file đính kèm dự án:", e);
        return `${header}\n(lỗi khi đọc file)`;
      }
    }),
  );
  return blocks.join("\n\n");
}

/** Thông tin dự án + brief để brainstorm. Null nếu không tìm thấy dự án. */
export async function buildBrainstormInput(projectId: string, extraNote: string): Promise<BrainstormInput | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      budget: true,
      venue: true,
      scale: true,
      briefLinkUrl: true,
      client: { select: { name: true, industry: { select: { labelVi: true } } } },
      projectType: { select: { labelVi: true } },
      orders: {
        where: { department: { in: ["BRAINSTORM", "PLANNING", "CREATIVE"] } },
        select: { department: true, extraBriefInfo: true, outputRequest: true },
      },
    },
  });
  if (!p) return null;

  // Gom mọi ghi chú brief đã có trong CRM để model không phải đoán đề bài.
  const briefParts = [
    p.briefLinkUrl ? `Link brief khách gửi: ${p.briefLinkUrl}` : null,
    ...p.orders.map((o) =>
      [o.extraBriefInfo, o.outputRequest].filter(Boolean).length
        ? `[Order ${o.department}] ${[o.extraBriefInfo, o.outputRequest].filter(Boolean).join(" — ")}`
        : null,
    ),
    extraNote.trim() || null,
  ].filter(Boolean);

  return {
    projectName: p.name,
    clientName: p.client?.name ?? null,
    industry: p.client?.industry?.labelVi ?? null,
    projectType: p.projectType?.labelVi ?? null,
    scale: p.scale,
    venue: p.venue,
    budget: p.budget != null ? toNum(p.budget) : null,
    briefText: briefParts.join("\n"),
    attachmentsText: await buildProjectFilesText(projectId),
  };
}

/** Thông tin dự án + brief để viết bài/content — cùng nguồn dữ liệu với brainstorm, khác prompt. */
export async function buildContentWriterInput(projectId: string, extraNote: string): Promise<ContentWriterInput | null> {
  const base = await buildBrainstormInput(projectId, extraNote);
  return base;
}

/** Thông tin dự án cho brief thiết kế Canva — gắn dự án thật thay vì nhập tay tên dự án/khách. */
export async function buildCanvaBriefInput(projectId: string, deliverable: string, note: string): Promise<CanvaBriefInput | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      briefLinkUrl: true,
      client: { select: { name: true } },
      projectType: { select: { labelVi: true } },
    },
  });
  if (!p) return null;

  return {
    projectName: p.name,
    clientName: p.client?.name ?? null,
    projectType: p.projectType?.labelVi ?? null,
    deliverable,
    note: note.trim() || null,
    briefLinkUrl: p.briefLinkUrl,
    attachmentsText: await buildProjectFilesText(projectId),
  };
}

/**
 * Gom toàn cảnh vận hành cho báo cáo BGĐ. Tái dùng đúng các hàm đang chạy trên /reminders và
 * /finance — báo cáo AI và màn hình nhắc việc luôn khớp số, không có nguồn sự thật thứ hai.
 */
export async function buildBoardReportInput(): Promise<BoardReportInput> {
  const now = new Date();
  const minMargin = await getNumberSetting("bidding", "min_margin_pct", 31);

  const [projects, timelineOverdue, arOverdue, careOverdue, advances] = await Promise.all([
    prisma.project.findMany({
      where: { status: { code: { in: [...EXECUTION_STATUS_CODES] } } },
      select: {
        code: true,
        name: true,
        ownerTeam: { select: { code: true } },
        status: { select: { labelVi: true } },
        costSheets: {
          where: { version: "CTRACT" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { ceTotal: true, coTotal: true },
        },
        timelineItems: {
          where: { endDate: { lt: now }, status: { code: { not: "DONE" } } },
          select: { id: true },
        },
      },
      orderBy: { code: "asc" },
    }),
    getTimelineOverdueItems(),
    getArOverdueItems(),
    getCareOverdueClients(),
    prisma.advance.findMany({
      where: { advanceType: "STAFF", status: { in: ["REQUESTED", "DISBURSED"] } },
      select: { amount: true, recipientStaff: { select: { fullName: true } } },
    }),
  ]);

  // Gộp tạm ứng theo từng nhân sự — BGĐ cần biết "ai đang giữ bao nhiêu", không cần từng khoản.
  const byStaff = new Map<string, { count: number; amount: number }>();
  for (const a of advances) {
    const name = a.recipientStaff?.fullName ?? "(không rõ)";
    const cur = byStaff.get(name) ?? { count: 0, amount: 0 };
    byStaff.set(name, { count: cur.count + 1, amount: cur.amount + toNum(a.amount) });
  }

  return {
    generatedAt: `${dmy(now)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    minMarginPct: minMargin,
    projects: projects.map((p) => {
      const sheet = p.costSheets[0];
      const ce = sheet ? toNum(sheet.ceTotal) : null;
      const co = sheet ? toNum(sheet.coTotal) : null;
      return {
        code: p.code,
        name: p.name,
        team: p.ownerTeam?.code ?? null,
        status: p.status.labelVi,
        ceTotal: ce,
        marginPct: ce != null && co != null ? computeMarginPct(ce, co) : null,
        endDate: null,
        overdueItems: p.timelineItems.length,
      };
    }),
    overdueTimeline: timelineOverdue.slice(0, 40).map((t) => ({
      projectCode: t.projectCode,
      title: t.title,
      dueDate: dmy(t.endDate) ?? "—",
      owner: t.teamCode,
      daysLate: t.daysOverdue,
    })),
    arOverdue: arOverdue.slice(0, 40).map((a) => ({
      clientName: a.clientName,
      invoiceNo: a.invoiceNo,
      amount: a.outstanding,
      dueDate: dmy(a.dueDate) ?? "—",
      daysLate: a.daysOverdue,
    })),
    careOverdue: careOverdue.slice(0, 40).map((c) => ({
      clientName: c.clientName,
      team: c.teamCode,
      lastCareAt: dmy(c.lastCareAt),
      daysSince: c.daysSince,
    })),
    advancesOutstanding: [...byStaff.entries()].map(([staffName, v]) => ({ staffName, ...v })),
  };
}
