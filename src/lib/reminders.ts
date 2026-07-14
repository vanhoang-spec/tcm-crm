import { prisma } from "./prisma";
import { getNumberSetting } from "./settings";
import { ORDER_DEPARTMENT_LABELS } from "./bidding";

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export type CareOverdueItem = {
  clientId: string;
  clientCode: string;
  clientName: string;
  teamCode: string;
  statusCode: string;
  lastCareAt: Date | null;
  daysSince: number;
  thresholdDays: number;
};

/** Khách hàng Active/Inactive quá hạn "chăm sóc" — dùng cho trang Reminders + báo cáo. */
export async function getCareOverdueClients(teamCode?: string): Promise<CareOverdueItem[]> {
  const [activeDays, inactiveDays] = await Promise.all([
    getNumberSetting("clients", "care_interval_active_days", 60),
    getNumberSetting("clients", "care_interval_inactive_days", 90),
  ]);

  const clients = await prisma.client.findMany({
    where: {
      isActive: true,
      status: { code: { in: ["ACTIVE", "INACTIVE"] } },
      ...(teamCode ? { ownerTeam: { code: teamCode } } : {}),
    },
    include: { status: true, ownerTeam: true },
  });

  const lastCareByClient = await prisma.careNote.groupBy({
    by: ["clientId"],
    _max: { createdAt: true },
  });
  const lastCareMap = new Map(lastCareByClient.map((r) => [r.clientId, r._max.createdAt]));

  const now = new Date();
  const out: CareOverdueItem[] = [];
  for (const c of clients) {
    const threshold = c.status.code === "ACTIVE" ? activeDays : inactiveDays;
    const lastCareAt = lastCareMap.get(c.id) ?? null;
    const baseline = lastCareAt ?? c.createdAt; // chưa từng chăm sóc → tính từ lúc tạo khách hàng
    const daysSince = daysBetween(baseline, now);
    if (daysSince > threshold) {
      out.push({
        clientId: c.id,
        clientCode: c.code,
        clientName: c.name,
        teamCode: c.ownerTeam.code,
        statusCode: c.status.code,
        lastCareAt,
        daysSince,
        thresholdDays: threshold,
      });
    }
  }
  return out.sort((a, b) => b.daysSince - a.daysSince);
}

export type BiddingReminderItem = {
  projectId: string;
  projectCode: string;
  projectName: string;
  teamCode: string | null;
  kind: "processing" | "liquidation";
  sinceAt: Date;
  daysSince: number;
  thresholdDays: number;
};

/** Dự án Đang triển khai (>7 ngày, HĐ chưa xong) hoặc Đang nghiệm thu (hàng tuần, chưa đủ hồ sơ). */
export async function getBiddingReminders(teamCode?: string): Promise<BiddingReminderItem[]> {
  const [processingDays, liquidationDays] = await Promise.all([
    getNumberSetting("bidding", "processing_reminder_days", 7),
    getNumberSetting("bidding", "liquidation_reminder_interval_days", 7),
  ]);

  const projects = await prisma.project.findMany({
    where: {
      status: { code: { in: ["PROCESSING", "LIQUIDATION"] } },
      ...(teamCode ? { ownerTeam: { code: teamCode } } : {}),
    },
    include: { ownerTeam: true, contract: true, status: true },
  });

  const now = new Date();
  const out: BiddingReminderItem[] = [];
  for (const p of projects) {
    if (p.status.code === "PROCESSING" && p.processingAt && !p.contract?.accountantConfirmedAt) {
      const daysSince = daysBetween(p.processingAt, now);
      if (daysSince >= processingDays) {
        out.push({
          projectId: p.id,
          projectCode: p.code,
          projectName: p.name,
          teamCode: p.ownerTeam?.code ?? null,
          kind: "processing",
          sinceAt: p.processingAt,
          daysSince,
          thresholdDays: processingDays,
        });
      }
    }
    if (p.status.code === "LIQUIDATION" && p.liquidationAt && !p.contract?.acceptanceDocsConfirmedAt) {
      const daysSince = daysBetween(p.liquidationAt, now);
      if (daysSince >= liquidationDays) {
        out.push({
          projectId: p.id,
          projectCode: p.code,
          projectName: p.name,
          teamCode: p.ownerTeam?.code ?? null,
          kind: "liquidation",
          sinceAt: p.liquidationAt,
          daysSince,
          thresholdDays: liquidationDays,
        });
      }
    }
  }
  return out.sort((a, b) => b.daysSince - a.daysSince);
}

export type PendingCostSheetApprovalItem = {
  costSheetId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  teamCode: string | null;
  ceTotal: number;
  coTotal: number;
  marginPct: number;
  createdAt: Date;
};

/** CO/CE đã lưu nhưng chưa được CEO duyệt (không auto-approve) và chưa bị từ chối — thuần computed. */
export async function getPendingCostSheetApprovals(teamCode?: string): Promise<PendingCostSheetApprovalItem[]> {
  const sheets = await prisma.costSheet.findMany({
    where: {
      version: "CTRACT",
      approvedById: null,
      rejectedAt: null,
      project: teamCode ? { ownerTeam: { code: teamCode } } : undefined,
    },
    include: { project: { include: { ownerTeam: true } } },
    orderBy: { createdAt: "asc" },
  });

  return sheets.map((s) => {
    const ceTotal = Number(s.ceTotal);
    const coTotal = Number(s.coTotal);
    return {
      costSheetId: s.id,
      projectId: s.projectId,
      projectCode: s.project.code,
      projectName: s.project.name,
      teamCode: s.project.ownerTeam?.code ?? null,
      ceTotal,
      coTotal,
      marginPct: ceTotal > 0 ? ((ceTotal - coTotal) / ceTotal) * 100 : 0,
      createdAt: s.createdAt,
    };
  });
}

export type TimelineOverdueItem = {
  itemId: string;
  title: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  teamCode: string | null;
  endDate: Date;
  daysOverdue: number;
};

/** Hạng mục Master Timeline đã quá hạn (endDate < nay) mà chưa DONE — thuần computed cho /reminders. */
export async function getTimelineOverdueItems(teamCode?: string): Promise<TimelineOverdueItem[]> {
  const now = new Date();
  const items = await prisma.timelineItem.findMany({
    where: {
      endDate: { lt: now },
      status: { code: { not: "DONE" } },
      project: {
        status: { code: { in: ["PROCESSING", "LIQUIDATION", "HANDOVER"] } },
        ...(teamCode ? { ownerTeam: { code: teamCode } } : {}),
      },
    },
    include: { project: { include: { ownerTeam: true } } },
  });

  return items
    .map((it) => ({
      itemId: it.id,
      title: it.title,
      projectId: it.projectId,
      projectCode: it.project.code,
      projectName: it.project.name,
      teamCode: it.project.ownerTeam?.code ?? null,
      endDate: it.endDate as Date,
      daysOverdue: daysBetween(it.endDate as Date, now),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/**
 * Không có cron/scheduler trong app này — hàm này được gọi mỗi lần layout server-render (xem
 * src/app/(app)/layout.tsx) để mô phỏng "tự động" phát hiện Order phòng ban đã quá timeline mong
 * muốn mà chưa "Send Results" (status != DONE), rồi gửi 1 Notification cho cả phòng ban nhận Order
 * VÀ Account đã gửi Order. Idempotent qua `deadlineReminderSentAt` — mỗi order chỉ nhắc 1 lần.
 */
export async function checkOrderDeadlineReminders(): Promise<void> {
  const overdue = await prisma.projectOrder.findMany({
    where: {
      department: { not: "BRAINSTORM" },
      status: { not: "DONE" },
      desiredTimeline: { lte: new Date() },
      deadlineReminderSentAt: null,
    },
    include: { project: true },
  });
  if (overdue.length === 0) return;

  for (const order of overdue) {
    const deptStaff = await prisma.staff.findMany({
      where: { department: { code: order.department }, isActive: true },
    });
    const recipientIds = new Set(deptStaff.map((s) => s.id));
    if (order.sentById) recipientIds.add(order.sentById);

    if (recipientIds.size > 0) {
      const deptLabel = ORDER_DEPARTMENT_LABELS[order.department] ?? order.department;
      await prisma.notification.createMany({
        data: Array.from(recipientIds).map((recipientStaffId) => ({
          recipientStaffId,
          type: "ORDER_DEADLINE_REMINDER",
          title: `Quá hạn Order ${deptLabel} — dự án ${order.project.code}`,
          body: order.project.name,
          projectId: order.projectId,
        })),
      });
    }
    await prisma.projectOrder.update({ where: { id: order.id }, data: { deadlineReminderSentAt: new Date() } });
  }
}
