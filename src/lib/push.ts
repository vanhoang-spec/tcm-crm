import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * GỬI THÔNG BÁO ĐẨY (Web Push) tới các thiết bị người dùng đã bật.
 *
 * ⚠ KHÔNG dựng hệ thống thông báo thứ hai. Nguồn sự thật vẫn là bảng `Notification` đang chạy; push
 * chỉ là một ĐƯỜNG PHÁT thêm. Nhờ vậy 39 chỗ tạo thông báo trong 20 file KHÔNG phải sửa gì.
 *
 * Hai đường phát, chống trùng bằng cột `Notification.pushedAt`:
 *  1. **Ngay lập tức** — chỉ chat (`lib/chat.ts`), vì tin nhắn mà báo trễ 5 phút thì vô nghĩa.
 *  2. **Job quét mỗi 5 phút** (`checkPendingPush`) — lưới hứng cho MỌI loại thông báo còn lại, kể cả
 *     loại thêm mới sau này. Ai gửi trước thì ghi `pushedAt`, người sau bỏ qua.
 *
 * ⚠ Chưa cấu hình VAPID thì mọi hàm ở đây là no-op im lặng (khuôn `isAiConfigured`). App phải chạy
 * bình thường trên máy dev và trên server chưa khai khoá — push là tính năng cộng thêm.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:no-reply@tcmbtl.com";

export function isPushConfigured(): boolean {
  return PUBLIC_KEY.length > 20 && PRIVATE_KEY.length > 20;
}

/** Khoá công khai cho trình duyệt đăng ký. Đọc lúc CHẠY (không phải NEXT_PUBLIC_) nên đổi khoá chỉ cần restart. */
export function getVapidPublicKey(): string | null {
  return isPushConfigured() ? PUBLIC_KEY : null;
}

let configured = false;
function ensureVapid() {
  if (configured || !isPushConfigured()) return;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
}

export type PushPayload = {
  title: string;
  body?: string | null;
  /** Đường dẫn mở khi bấm vào thông báo. */
  url?: string | null;
  /** Gom nhóm: thông báo cùng tag sẽ THAY THẾ nhau thay vì chồng đống trên màn hình khoá. */
  tag?: string | null;
};

/** Số lần gửi lỗi liên tiếp trước khi bỏ hẳn một thiết bị (lỗi mạng tạm thời thì không nên xoá ngay). */
const MAX_FAILS = 5;

/**
 * Gửi tới MỌI thiết bị của các nhân sự chỉ định. Trả số thiết bị gửi thành công.
 *
 * ⚠ KHÔNG BAO GIỜ ném lỗi ra ngoài: hàm này được gọi từ trong luồng nghiệp vụ (gửi tin nhắn, duyệt
 * đề xuất…). Push hỏng mà làm hỏng luôn việc chính là đánh đổi sai hoàn toàn.
 */
export async function sendPushToStaff(staffIds: string[], payload: PushPayload): Promise<number> {
  const ids = [...new Set(staffIds.filter(Boolean))];
  if (!ids.length || !isPushConfigured()) return 0;
  ensureVapid();

  const subs = await prisma.pushSubscription.findMany({ where: { staffId: { in: ids } } });
  if (!subs.length) return 0;

  const body = JSON.stringify({
    title: payload.title.slice(0, 120),
    body: (payload.body ?? "").slice(0, 300),
    url: payload.url ?? "/reminders",
    tag: payload.tag ?? undefined,
  });

  let ok = 0;
  const dead: string[] = [];
  const failed: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 6 * 60 * 60 });
        ok++;
      } catch (e) {
        // 404/410 = trình duyệt báo endpoint không còn tồn tại (gỡ app, xoá dữ liệu duyệt web) ⇒ xoá NGAY.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        else failed.push(s.id);
      }
    }),
  );

  if (dead.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  if (ok) await prisma.pushSubscription.updateMany({ where: { staffId: { in: ids }, id: { notIn: [...dead, ...failed] } }, data: { failCount: 0, lastOkAt: new Date() } });
  if (failed.length) {
    await prisma.pushSubscription.updateMany({ where: { id: { in: failed } }, data: { failCount: { increment: 1 } } });
    await prisma.pushSubscription.deleteMany({ where: { id: { in: failed }, failCount: { gte: MAX_FAILS } } });
  }
  return ok;
}

/**
 * Gửi push cho những thông báo CHƯA gửi và CHƯA đọc — job chạy trong bộ hẹn giờ 5 phút.
 *
 * ⚠ Chỉ lấy thông báo trong 24 giờ gần nhất: bật push lần đầu mà bắn cả tháng thông báo cũ vào màn
 * hình khoá là cách nhanh nhất để người dùng tắt push vĩnh viễn.
 * ⚠ Đánh dấu `pushedAt` cho MỌI thông báo đã xét, kể cả người nhận chưa có thiết bị nào — không thì
 * mỗi 5 phút lại quét lại đúng đống đó mãi mãi.
 */
export async function checkPendingPush(): Promise<{ sent: number; marked: number }> {
  if (!isPushConfigured()) return { sent: 0, marked: 0 };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.notification.findMany({
    where: { pushedAt: null, isRead: false, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, recipientStaffId: true, type: true, title: true, body: true, conversationId: true, projectId: true },
  });
  if (!rows.length) return { sent: 0, marked: 0 };

  let sent = 0;
  for (const n of rows) {
    sent += await sendPushToStaff([n.recipientStaffId], {
      title: n.title,
      body: n.body,
      // TASK_*: việc giao nội bộ sống ở /tasks, không phải trang dự án — kể cả khi có projectId.
      // CREATIVE_TASK_*: board Creative; task NHÁP (CR-2) không có projectId nên nếu không có
      // nhánh này thì rơi về /reminders — bấm vào không tới được chỗ xử lý.
      url: n.conversationId
        ? `/chat/${n.conversationId}`
        : n.type.startsWith("TASK_")
          ? "/tasks"
          : n.type.startsWith("CREATIVE_TASK_")
            ? "/creative"
            : n.projectId
              ? `/projects/${n.projectId}`
              : "/reminders",
      tag: n.conversationId ? `chat-${n.conversationId}` : n.type,
    });
  }
  await prisma.notification.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { pushedAt: new Date() } });
  return { sent, marked: rows.length };
}

/** Đánh dấu đã đẩy — đường gửi NGAY gọi sau khi đã bắn, để job 5 phút không bắn lại. */
export async function markNotificationsPushed(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await prisma.notification.updateMany({ where: { id: { in: ids } }, data: { pushedAt: new Date() } });
}
