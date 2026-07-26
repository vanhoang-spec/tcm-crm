import { prisma } from "./prisma";

/**
 * "Đến hẹn" cho Reminder tạo trong chat — chạy bởi scheduler 5 phút/lần (src/instrumentation.ts),
 * nên độ trễ tối đa ~5 phút so với remindAt. Khi remindAt <= now: đăng 1 SYSTEM message (systemEvent=REMINDER_DUE) vào đúng hội
 * thoại + fan-out Notification cho đối tượng (ME=chỉ người tạo, GROUP=cả hội thoại).
 *
 * Idempotency chống bắn trùng khi nhiều request cùng lúc trigger check (nhiều người mở app cùng lúc
 * quanh giờ hẹn): UPDATE ... WHERE remindAt = <giá trị vừa đọc> — ai update trước "thắng" (đổi
 * remindAt sang giá trị mới), request sau updateMany trả count=0 vì WHERE không còn khớp → tự bỏ
 * qua. Không cần bảng log riêng như SpecialOccasionLog vì mỗi Reminder chỉ có 1 remindAt "đang chờ"
 * tại 1 thời điểm.
 */

const RECURRENCE_DAYS: Record<string, number> = { DAILY: 1, WEEKLY: 7 };

function nextRemindAt(current: Date, recurrence: string): Date {
  const days = RECURRENCE_DAYS[recurrence];
  if (days) {
    const d = new Date(current);
    d.setDate(d.getDate() + days);
    return d;
  }
  if (recurrence === "MONTHLY") {
    const d = new Date(current);
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  return current; // ONCE — không dùng lại (isActive sẽ set false)
}

export async function checkChatReminders(): Promise<void> {
  const now = new Date();
  const due = await prisma.reminder.findMany({
    where: { isActive: true, remindAt: { lte: now } },
    select: { id: true, conversationId: true, title: true, remindAt: true, recurrence: true, audience: true, createdById: true },
  });

  for (const r of due) {
    const claimed = await prisma.reminder.updateMany({
      where: { id: r.id, remindAt: r.remindAt },
      data: {
        lastFiredAt: now,
        remindAt: r.recurrence === "ONCE" ? r.remindAt : nextRemindAt(r.remindAt, r.recurrence),
        isActive: r.recurrence !== "ONCE",
      },
    });
    if (claimed.count === 0) continue; // thua race — request khác đã xử lý lần đến hẹn này rồi

    await prisma.message.create({
      data: { conversationId: r.conversationId, senderId: null, type: "SYSTEM", systemEvent: "REMINDER_DUE", body: r.title },
    });

    const recipientIds =
      r.audience === "GROUP"
        ? (await prisma.conversationMember.findMany({ where: { conversationId: r.conversationId }, select: { staffId: true } })).map((m) => m.staffId)
        : r.createdById
          ? [r.createdById]
          : [];
    if (recipientIds.length > 0) {
      await prisma.notification.createMany({
        data: recipientIds.map((staffId) => ({
          recipientStaffId: staffId,
          type: "REMINDER_DUE",
          title: r.title,
          body: r.title,
          conversationId: r.conversationId,
        })),
      });
    }
  }
}
