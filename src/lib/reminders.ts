import { prisma } from "./prisma";
import { getNumberSetting } from "./settings";
import { getArOverdueItems } from "./finance";
import { ORDER_DEPARTMENT_LABELS } from "./bidding";
import { ACTIVE_TASK_STATUSES, isTaskLocked } from "./creative";
import { ACTIVE_DEPARTMENT_TASK_STATUSES } from "./department-tasks";

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export type CareOverdueItem = {
  clientId: string;
  clientCode: string;
  clientName: string;
  teamCode: string | null; // null = khách cấp BGĐ/chưa giao team
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
        teamCode: c.ownerTeam?.code ?? null,
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
      await prisma.projectOrder.update({ where: { id: order.id }, data: { deadlineReminderSentAt: new Date() } });
    }
  }
}

export type CreativeOverdueTask = {
  taskId: string;
  title: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  teamCode: string | null;
  deadline: Date;
  daysOverdue: number;
};

/** Task Creative đã quá deadline mà chưa trả (còn active) và dự án chưa khóa — thuần computed cho /reminders. */
export async function getCreativeOverdueTasks(teamCode?: string): Promise<CreativeOverdueTask[]> {
  const now = new Date();
  const tasks = await prisma.creativeTask.findMany({
    where: {
      deadline: { lt: now },
      status: { in: [...ACTIVE_TASK_STATUSES] },
      ...(teamCode ? { project: { ownerTeam: { code: teamCode } } } : {}),
    },
    include: { project: { include: { status: true, ownerTeam: true } } },
  });

  return tasks
    .filter((t) => !isTaskLocked(t.project.status.code, t.project.finishedAt)) // lock là phép tính thời gian → lọc ở JS
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      projectId: t.projectId,
      projectCode: t.project.code,
      projectName: t.project.name,
      teamCode: t.project.ownerTeam?.code ?? null,
      deadline: t.deadline as Date,
      daysOverdue: daysBetween(t.deadline as Date, now),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/**
 * Chạy bởi scheduler 5 phút/lần (src/instrumentation.ts); layout render là lưới an toàn. Phát hiện
 * task Creative quá deadline mà chưa trả → nhắc 1 lần
 * cho người thực hiện (assignee) + người giao (CD). Idempotent qua `deadlineReminderSentAt` (reset khi
 * đổi deadline ở assignCreativeTask). Lock là phép tính thời gian nên lọc ở JS trước khi gửi/gắn cờ.
 */
export async function checkCreativeTaskDeadlineReminders(): Promise<void> {
  const overdue = await prisma.creativeTask.findMany({
    where: {
      deadline: { lte: new Date() },
      status: { in: [...ACTIVE_TASK_STATUSES] },
      deadlineReminderSentAt: null,
    },
    include: { project: { include: { status: true } } },
  });
  const actionable = overdue.filter((t) => !isTaskLocked(t.project.status.code, t.project.finishedAt));
  if (actionable.length === 0) return;

  for (const task of actionable) {
    const recipientIds = new Set<string>();
    if (task.assigneeId) recipientIds.add(task.assigneeId);
    if (task.assignedById) recipientIds.add(task.assignedById);

    if (recipientIds.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(recipientIds).map((recipientStaffId) => ({
          recipientStaffId,
          type: "CREATIVE_TASK_DEADLINE_REMINDER",
          title: `Quá hạn task Creative — dự án ${task.project.code}`,
          body: task.title,
          projectId: task.projectId,
        })),
      });
      await prisma.creativeTask.update({ where: { id: task.id }, data: { deadlineReminderSentAt: new Date() } });
    }
  }
}

export type DepartmentTaskOverdueItem = {
  taskId: string;
  title: string;
  department: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  teamCode: string | null;
  deadline: Date;
  daysOverdue: number;
};

/** Task bộ phận (PLANNING/PCC/OPE/PRO) đã quá deadline mà chưa trả (còn active) và dự án chưa khóa — thuần computed cho /reminders. */
export async function getDepartmentTaskOverdueTasks(teamCode?: string): Promise<DepartmentTaskOverdueItem[]> {
  const now = new Date();
  const tasks = await prisma.departmentTask.findMany({
    where: {
      deadline: { lt: now },
      status: { in: [...ACTIVE_DEPARTMENT_TASK_STATUSES] },
      ...(teamCode ? { project: { ownerTeam: { code: teamCode } } } : {}),
    },
    include: { project: { include: { status: true, ownerTeam: true } } },
  });

  return tasks
    .filter((t) => !isTaskLocked(t.project.status.code, t.project.finishedAt)) // lock là phép tính thời gian → lọc ở JS
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      department: t.department,
      projectId: t.projectId,
      projectCode: t.project.code,
      projectName: t.project.name,
      teamCode: t.project.ownerTeam?.code ?? null,
      deadline: t.deadline as Date,
      daysOverdue: daysBetween(t.deadline as Date, now),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/**
 * Chạy bởi scheduler 5 phút/lần (src/instrumentation.ts); layout render là lưới an toàn. Phát hiện
 * task bộ phận quá deadline mà chưa trả → nhắc 1 lần
 * cho người thực hiện (assignee) + người giao (lead). Idempotent qua `deadlineReminderSentAt` (reset khi
 * đổi deadline ở assignDepartmentTask). Mirror checkCreativeTaskDeadlineReminders.
 */
export async function checkDepartmentTaskDeadlineReminders(): Promise<void> {
  const overdue = await prisma.departmentTask.findMany({
    where: {
      deadline: { lte: new Date() },
      status: { in: [...ACTIVE_DEPARTMENT_TASK_STATUSES] },
      deadlineReminderSentAt: null,
    },
    include: { project: { include: { status: true } } },
  });
  const actionable = overdue.filter((t) => !isTaskLocked(t.project.status.code, t.project.finishedAt));
  if (actionable.length === 0) return;

  for (const task of actionable) {
    const recipientIds = new Set<string>();
    if (task.assigneeId) recipientIds.add(task.assigneeId);
    if (task.assignedById) recipientIds.add(task.assignedById);

    if (recipientIds.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(recipientIds).map((recipientStaffId) => ({
          recipientStaffId,
          type: "DEPT_TASK_DEADLINE_REMINDER",
          title: `Quá hạn task ${task.department} — dự án ${task.project.code}`,
          body: task.title,
          projectId: task.projectId,
        })),
      });
      await prisma.departmentTask.update({ where: { id: task.id }, data: { deadlineReminderSentAt: new Date() } });
    }
  }
}

export type AcceptanceSignReminderItem = {
  projectId: string;
  projectCode: string;
  projectName: string;
  teamCode: string | null;
  expectedAcceptanceSignDate: Date;
  daysOverdue: number;
};

/** Dự án Đang nghiệm thu đã tới/qua "Ngày dự kiến khách ký" mà khách CHƯA xác nhận — thuần computed cho /reminders. */
export async function getAcceptanceSignReminders(teamCode?: string): Promise<AcceptanceSignReminderItem[]> {
  const now = new Date();
  const projects = await prisma.project.findMany({
    where: {
      status: { code: "LIQUIDATION" },
      contract: { expectedAcceptanceSignDate: { lte: now }, clientAcceptanceConfirmedAt: null },
      ...(teamCode ? { ownerTeam: { code: teamCode } } : {}),
    },
    include: { ownerTeam: true, contract: true },
  });

  return projects
    .filter((p) => p.contract?.expectedAcceptanceSignDate)
    .map((p) => ({
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      teamCode: p.ownerTeam?.code ?? null,
      expectedAcceptanceSignDate: p.contract!.expectedAcceptanceSignDate as Date,
      daysOverdue: daysBetween(p.contract!.expectedAcceptanceSignDate as Date, now),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/**
 * Chạy bởi scheduler 5 phút/lần (src/instrumentation.ts); layout render là lưới an toàn. Idempotent qua
 * `acceptanceReminderSentAt`: dự án Đang nghiệm thu tới/qua "Ngày dự kiến khách ký" mà khách chưa
 * xác nhận nghiệm thu → nhắc Project Leader + Owner 1 lần (đổi mốc ngày sẽ reset cờ để nhắc lại).
 */
export async function checkAcceptanceSignReminders(): Promise<void> {
  const overdue = await prisma.contract.findMany({
    where: {
      expectedAcceptanceSignDate: { lte: new Date() },
      clientAcceptanceConfirmedAt: null,
      acceptanceReminderSentAt: null,
      project: { status: { code: "LIQUIDATION" } },
    },
    include: { project: true },
  });
  if (overdue.length === 0) return;

  for (const c of overdue) {
    const recipientIds = new Set<string>();
    if (c.project.leaderId) recipientIds.add(c.project.leaderId);
    if (c.project.ownerId) recipientIds.add(c.project.ownerId);

    if (recipientIds.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(recipientIds).map((recipientStaffId) => ({
          recipientStaffId,
          type: "ACCEPTANCE_SIGN_REMINDER",
          title: `Đến hạn thu về biên bản nghiệm thu đã ký — dự án ${c.project.code}`,
          body: c.project.name,
          projectId: c.projectId,
        })),
      });
      await prisma.contract.update({ where: { id: c.id }, data: { acceptanceReminderSentAt: new Date() } });
    }
  }
}

export type InventoryReturnReminderItem = {
  documentId: string;
  documentCode: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  teamCode: string | null;
  expectedReturnAt: Date;
  daysOverdue: number;
};

export type StockRequestReminderItem = {
  requestId: string;
  code: string;
  type: string; // ISSUE | INTAKE
  /** APPROVE = chờ Account duyệt · CONFIRM = chờ thủ kho chốt số thực tế */
  waitingFor: "APPROVE" | "CONFIRM";
  projectCode: string | null;
  warehouseName: string;
  lineCount: number;
  createdAt: Date;
  daysWaiting: number;
};

/**
 * Đề xuất kho đang treo (Kho v2 K2) — mỗi vai nhìn thấy phần việc của mình:
 * ISSUE PROPOSED chờ Account duyệt · ISSUE APPROVED + INTAKE PROPOSED chờ thủ kho xác nhận thực tế.
 * Thuần computed cho /reminders; notification riêng đã bắn lúc chuyển trạng thái.
 */
export async function getStockRequestReminders(teamCode?: string): Promise<StockRequestReminderItem[]> {
  const now = new Date();
  const requests = await prisma.stockRequest.findMany({
    where: {
      OR: [
        { type: "ISSUE", status: { in: ["PROPOSED", "APPROVED"] } },
        { type: "INTAKE", status: "PROPOSED" },
      ],
      ...(teamCode ? { project: { ownerTeam: { code: teamCode } } } : {}),
    },
    include: { warehouse: { select: { name: true } }, project: { select: { code: true } }, lines: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });
  return requests.map((r) => ({
    requestId: r.id,
    code: r.code,
    type: r.type,
    waitingFor: r.type === "ISSUE" && r.status === "PROPOSED" ? "APPROVE" : "CONFIRM",
    projectCode: r.project?.code ?? null,
    warehouseName: r.warehouse.name,
    lineCount: r.lines.length,
    createdAt: r.createdAt,
    daysWaiting: Math.floor((now.getTime() - r.createdAt.getTime()) / (24 * 3600 * 1000)),
  }));
}

/** Phiếu XUẤT EVENT quá hạn trả mà dự án còn đồ tái sử dụng ở hiện trường — thuần computed cho /reminders + bell. */
export async function getInventoryReturnReminders(teamCode?: string): Promise<InventoryReturnReminderItem[]> {
  const now = new Date();
  const docs = await prisma.stockDocument.findMany({
    where: {
      type: "ISSUE",
      status: "COMPLETED",
      expectedReturnAt: { lt: now },
      project: {
        inventoryHoldings: { some: { quantity: { gt: 0 } } },
        ...(teamCode ? { ownerTeam: { code: teamCode } } : {}),
      },
    },
    include: { project: { include: { ownerTeam: true } } },
    orderBy: { expectedReturnAt: "asc" },
  });
  return docs
    .filter((d) => d.project && d.expectedReturnAt)
    .map((d) => ({
      documentId: d.id,
      documentCode: d.code,
      projectId: d.projectId!,
      projectCode: d.project!.code,
      projectName: d.project!.name,
      teamCode: d.project!.ownerTeam?.code ?? null,
      expectedReturnAt: d.expectedReturnAt!,
      daysOverdue: Math.floor((now.getTime() - d.expectedReturnAt!.getTime()) / (24 * 3600 * 1000)),
    }));
}

/**
 * Nhắc trả đồ event quá hạn (no-cron, idempotent qua returnReminderSentAt trong WHERE) —
 * notify người tạo phiếu + staff OPE/PRO. Cờ được reset khi đổi expectedReturnAt (updateExpectedReturn).
 */
export async function checkInventoryReturnReminders(): Promise<void> {
  const docs = await prisma.stockDocument.findMany({
    where: {
      type: "ISSUE",
      status: "COMPLETED",
      expectedReturnAt: { lt: new Date() },
      returnReminderSentAt: null,
      project: { inventoryHoldings: { some: { quantity: { gt: 0 } } } },
    },
    include: { project: { select: { code: true } } },
  });
  if (docs.length === 0) return;

  const fieldStaff = await prisma.staff.findMany({
    where: { department: { code: { in: ["OPE", "PRO"] } }, isActive: true },
    select: { id: true },
  });
  for (const doc of docs) {
    const recipientIds = new Set<string>(fieldStaff.map((s) => s.id));
    if (doc.createdById) recipientIds.add(doc.createdById);
    if (recipientIds.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(recipientIds).map((recipientStaffId) => ({
          recipientStaffId,
          type: "INVENTORY_RETURN_OVERDUE",
          title: `Quá hạn trả đồ event — phiếu ${doc.code} (dự án ${doc.project?.code ?? ""})`,
          body: "Đồ tái sử dụng chưa trả về kho. Vui lòng tạo phiếu Trả về kho hoặc cập nhật hạn trả.",
          projectId: doc.projectId,
        })),
      });
      await prisma.stockDocument.update({ where: { id: doc.id }, data: { returnReminderSentAt: new Date() } });
    }
  }
}

/**
 * Nhắc CÔNG NỢ QUÁ HẠN — chạy bởi scheduler (src/instrumentation.ts).
 *
 * Trước đây nợ quá hạn chỉ là con số trên chuông và một danh sách ở /reminders: ai không mở trang
 * thì không biết. Loại `AR_OVERDUE_REMINDER` đã khai trong schema nhưng KHÔNG chỗ nào tạo.
 *
 * Hai tham số chỉnh được trong Settings, không phải sửa code:
 *  - finance.ar_reminder_after_days  (mặc định 7): quá hạn bao nhiêu ngày thì bắt đầu nhắc.
 *  - finance.ar_reminder_repeat_days (mặc định 7): bao lâu nhắc lại một lần.
 * Người nhận: phòng Kế toán (FIN) + PIC và Leader của dự án — kế toán là người đi đòi, Account là
 * người có quan hệ với khách.
 */
export async function checkArOverdueReminders(): Promise<void> {
  const [afterDays, repeatDays] = await Promise.all([
    getNumberSetting("finance", "ar_reminder_after_days", 7),
    getNumberSetting("finance", "ar_reminder_repeat_days", 7),
  ]);
  const now = new Date();
  const overdue = await getArOverdueItems();
  const due = overdue.filter((i) => i.daysOverdue >= afterDays);
  if (due.length === 0) return;

  const [invoices, finStaff] = await Promise.all([
    prisma.clientInvoice.findMany({
      where: { id: { in: due.map((i) => i.invoiceId) } },
      select: { id: true, arReminderSentAt: true, project: { select: { ownerId: true, leaderId: true } } },
    }),
    prisma.staff.findMany({ where: { department: { code: "FIN" }, isActive: true }, select: { id: true } }),
  ]);
  const metaById = new Map(invoices.map((inv) => [inv.id, inv]));
  const repeatMs = repeatDays * 24 * 3600 * 1000;

  for (const item of due) {
    const meta = metaById.get(item.invoiceId);
    if (!meta) continue;
    // Đã nhắc và chưa tới chu kỳ nhắc lại → bỏ qua.
    if (meta.arReminderSentAt && now.getTime() - meta.arReminderSentAt.getTime() < repeatMs) continue;

    const recipientIds = new Set<string>(finStaff.map((s) => s.id));
    if (meta.project.ownerId) recipientIds.add(meta.project.ownerId);
    if (meta.project.leaderId) recipientIds.add(meta.project.leaderId);
    if (recipientIds.size === 0) continue; // không ai nhận thì ĐỪNG đốt cờ (xem 5 job trên)

    await prisma.notification.createMany({
      data: Array.from(recipientIds).map((recipientStaffId) => ({
        recipientStaffId,
        type: "AR_OVERDUE_REMINDER",
        title: `Công nợ quá hạn ${item.daysOverdue} ngày — HĐ ${item.invoiceNo} (${item.clientName})`,
        body: `Dự án ${item.projectCode}. Còn phải thu: ${item.outstanding.toLocaleString("vi-VN")}đ.`,
        projectId: item.projectId,
      })),
    });
    await prisma.clientInvoice.update({ where: { id: item.invoiceId }, data: { arReminderSentAt: now } });
  }
}
