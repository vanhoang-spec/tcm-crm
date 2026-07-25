import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { prisma } from "@/lib/prisma";
import {
  checkOrderDeadlineReminders,
  checkAcceptanceSignReminders,
  checkCreativeTaskDeadlineReminders,
  checkDepartmentTaskDeadlineReminders,
  getBiddingReminders,
  getCareOverdueClients,
  getPendingCostSheetApprovals,
  getTimelineOverdueItems,
  checkInventoryReturnReminders,
} from "@/lib/reminders";
import { getArOverdueItems } from "@/lib/finance";
import { redirect } from "next/navigation";
import { getCurrentStaffId, getSessionContext } from "@/lib/current-staff";
import { needsPasswordChange } from "@/lib/auth";
import { checkSpecialOccasions } from "@/lib/occasions";
import { checkChatReminders } from "@/lib/chat-reminders";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // ── Chốt chặn đăng nhập: chạy TRƯỚC mọi query để người chưa đăng nhập không kích hoạt
  // check-and-notify hay đọc bất kỳ dữ liệu nào. Đây là hàng rào thật, không phải lời nhắc. ──
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (await needsPasswordChange(session.authenticatedStaffId)) redirect("/change-password");

  // Không có cron — check-and-notify chạy mỗi lần layout render (xem doc-comment trong lib/reminders.ts).
  await Promise.all([
    checkOrderDeadlineReminders(),
    checkAcceptanceSignReminders(),
    checkCreativeTaskDeadlineReminders(),
    checkDepartmentTaskDeadlineReminders(),
    checkInventoryReturnReminders(),
    checkSpecialOccasions(),
    checkChatReminders(),
  ]);

  // currentStaffId lấy TRƯỚC vì badge chuông phải đếm notification CỦA RIÊNG người đang đăng nhập —
  // đếm toàn hệ thống sẽ lộ số thông báo của người khác và cho phép "đọc hộ" (xem markNotificationRead).
  const currentStaffId = await getCurrentStaffId();
  const [careItems, biddingItems, pendingApprovals, timelineItems, arItems, unreadNotifications, staffRows] =
    await Promise.all([
      getCareOverdueClients(),
      getBiddingReminders(),
      getPendingCostSheetApprovals(),
      getTimelineOverdueItems(),
      getArOverdueItems(),
      // CHAT_MESSAGE có badge chưa đọc riêng trong module Chat — không cộng vào chuông nhắc việc.
      prisma.notification.count({
        where: { isRead: false, recipientStaffId: currentStaffId ?? "", type: { not: "CHAT_MESSAGE" } },
      }),
      prisma.staff.findMany({
        where: { isActive: true },
        select: { id: true, fullName: true, title: true, avatarKey: true, updatedAt: true, department: { select: { name: true } } },
        orderBy: { fullName: "asc" },
      }),
    ]);
  // Mỗi nguồn đếm ĐÚNG 1 lần trên chuông: acceptance/creative-task/inventory-return đã có Notification
  // bền vững từ các hàm check* (nằm trong unreadNotifications) nên KHÔNG cộng danh sách computed nữa —
  // tránh đếm kép. Các nguồn thuần computed (care/bidding/approvals/timeline/AR) vẫn cộng trực tiếp.
  // Trang /reminders vẫn tự query đầy đủ các danh sách để hiển thị.
  const reminderCount =
    careItems.length + biddingItems.length + pendingApprovals.length + timelineItems.length + arItems.length + unreadNotifications;
  const actAsStaff = staffRows.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    title: s.title,
    departmentName: s.department?.name ?? null,
    avatarKey: s.avatarKey,
    updatedAt: s.updatedAt,
  }));

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          reminderCount={reminderCount}
          actAsStaff={session.isAdmin ? actAsStaff : []}
          currentStaffId={currentStaffId}
          canImpersonate={session.isAdmin}
          impersonating={session.impersonating}
        />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
