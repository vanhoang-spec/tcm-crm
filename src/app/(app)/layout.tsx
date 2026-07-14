import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { prisma } from "@/lib/prisma";
import {
  checkOrderDeadlineReminders,
  getBiddingReminders,
  getCareOverdueClients,
  getPendingCostSheetApprovals,
  getTimelineOverdueItems,
} from "@/lib/reminders";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Không có cron — check-and-notify chạy mỗi lần layout render (xem doc-comment trong lib/reminders.ts).
  await checkOrderDeadlineReminders();

  const [careItems, biddingItems, pendingApprovals, timelineItems, unreadNotifications] = await Promise.all([
    getCareOverdueClients(),
    getBiddingReminders(),
    getPendingCostSheetApprovals(),
    getTimelineOverdueItems(),
    prisma.notification.count({ where: { isRead: false } }),
  ]);
  const reminderCount =
    careItems.length + biddingItems.length + pendingApprovals.length + timelineItems.length + unreadNotifications;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header reminderCount={reminderCount} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
