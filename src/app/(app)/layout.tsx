import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getCurrentStaffId, getSessionContext } from "@/lib/current-staff";
import { getMyPermissions } from "@/lib/permissions";
import { needsPasswordChange } from "@/lib/auth";
import { runDueJobs } from "@/lib/job-runner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // ── Chốt chặn đăng nhập: chạy TRƯỚC mọi query để người chưa đăng nhập không kích hoạt
  // check-and-notify hay đọc bất kỳ dữ liệu nào. Đây là hàng rào thật, không phải lời nhắc. ──
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (await needsPasswordChange(session.authenticatedStaffId)) redirect("/change-password");

  // Scheduler chạy ở src/instrumentation.ts (5 phút/lần). Vẫn gọi ở đây làm LƯỚI AN TOÀN cho
  // trường hợp tiến trình server không bật được timer — runDueJobs tự tiết chế bằng vé chạy nên
  // không nhân đôi thông báo và không quét lại 7 job mỗi lần render như trước.
  await runDueJobs();

  // currentStaffId lấy TRƯỚC vì badge chuông phải đếm notification CỦA RIÊNG người đang đăng nhập —
  // đếm toàn hệ thống sẽ lộ số thông báo của người khác và cho phép "đọc hộ" (xem markNotificationRead).
  const currentStaffId = await getCurrentStaffId();
  // Khác session.isAdmin (người đăng nhập thật, dùng cho quyền mạo danh): tập quyền này theo NGƯỜI
  // ĐANG THAO TÁC, nên admin đang "act as" nhân viên thường sẽ thấy đúng menu của nhân viên đó.
  // Set không serialize được sang client component → truyền mảng.
  const navPermissions = [...(await getMyPermissions())];
  // Chuông đếm ĐÚNG những khối người này xem được ở /reminders — nếu không, tài khoản hẹp quyền
  // (thủ kho, bảo vệ) thấy con số của việc họ không mở ra được, bấm vào thì trang trống.
  const [unreadNotifications, staffRows] = await Promise.all([
    prisma.notification.count({
      where: { isRead: false, recipientStaffId: currentStaffId ?? "" },
    }),
    prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, title: true, avatarKey: true, updatedAt: true, department: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
  ]);
  // Bản mini: chuông chỉ đếm Notification bền vững (task Creative quá hạn, giao việc, duyệt).
  // Bản TCM còn cộng 5 nguồn thuần-tính-toán (chăm sóc khách, hạn thầu, duyệt CO/CE, timeline,
  // công nợ) — đã cắt cùng module tương ứng.
  const reminderCount = unreadNotifications;
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
      <Sidebar permissions={navPermissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          reminderCount={reminderCount}
          actAsStaff={session.isAdmin ? actAsStaff : []}
          currentStaffId={currentStaffId}
          canImpersonate={session.isAdmin}
          impersonating={session.impersonating}
          permissions={navPermissions}
        />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      {/* Hộp chat / AI nổi — ĐẶT Ở ĐÂY, ngoài <header> (header có backdrop-blur → containing block,
          sẽ nhốt mọi position:fixed bên trong; xem HANDOVER mục 4.4). State của dock sống trong
          layout nên giữ nguyên khi điều hướng client giữa các module — chính là mục đích tính năng. */}
    </div>
  );
}
