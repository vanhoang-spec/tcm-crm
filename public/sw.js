/**
 * Service worker của TCM CRM — CỐ Ý LÀM TỐI THIỂU.
 *
 * ⚠ NGUYÊN TẮC SỐ 1: KHÔNG CACHE BẤT KỲ NỘI DUNG NÀO CỦA APP. Đây là app vận hành có tiền, tồn kho
 * và phân quyền — phục vụ một trang từ cache là hiển thị số dư cũ, tồn kho cũ, hoặc tệ hơn là hiển
 * thị dữ liệu của phiên đăng nhập trước. Vì vậy:
 *   - Chỉ chặn request ĐIỀU HƯỚNG TRANG (mode === "navigate"), và luôn đi mạng trước.
 *   - Mọi request khác (ảnh, JS, CSS, server action, API) KHÔNG gọi respondWith ⇒ trình duyệt xử lý
 *     y như khi không có service worker, không thêm một mili giây nào.
 *   - Cache chỉ chứa ĐÚNG một trang: /offline, để khi mất mạng còn thứ để hiện thay vì màn hình lỗi
 *     trần của trình duyệt. Chrome cũng đòi có fetch handler chạy được khi offline thì mới cho cài.
 *
 * ⚠ Service worker BÁM DAI: cài rồi thì bản lỗi sẽ theo người dùng cho tới khi có bản mới thay thế.
 * Đổi VERSION mỗi lần sửa file này để bản cũ bị xoá; `skipWaiting` + `clients.claim` để bản mới có
 * hiệu lực ngay thay vì đợi đóng hết tab.
 *
 * Gỡ tay khi cần: DevTools → Application → Service Workers → Unregister.
 */

const VERSION = "tcm-v2";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()), // không tải được trang offline thì vẫn cài, chỉ mất fallback
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Chỉ đụng vào điều hướng trang. GET ảnh/JS/CSS và mọi POST (server action) đi thẳng, không qua đây.
  if (req.method !== "GET" || req.mode !== "navigate") return;

  event.respondWith(
    // Luôn đi mạng trước ⇒ online thì tốc độ y hệt lúc chưa có service worker, không bao giờ trả trang cũ.
    fetch(req).catch(() => caches.match(OFFLINE_URL).then((res) => res ?? Response.error())),
  );
});

/**
 * ── THÔNG BÁO ĐẨY ────────────────────────────────────────────────────────────────────────────────
 * ⚠ `userVisibleOnly: true` lúc đăng ký nghĩa là NHẬN push thì BẮT BUỘC phải hiện thông báo. Nhận
 * mà không hiện là trình duyệt tự thu hồi quyền push của cả site. Vì vậy mọi nhánh dưới đây đều kết
 * thúc bằng showNotification, kể cả khi payload hỏng.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "TCM";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      // renotify chỉ hợp lệ khi có tag — rung/kêu lại khi tin mới cùng hội thoại
      renotify: Boolean(data.tag),
      data: { url: data.url || "/reminders" },
    }),
  );
});

/**
 * Bấm vào thông báo: nếu app đang mở sẵn ở tab nào đó thì ĐƯA TAB ĐÓ LÊN rồi điều hướng, thay vì mở
 * thêm tab mới — người dùng bấm 5 thông báo không nên có 5 tab TCM.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/reminders";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          return c.focus().then((w) => (w && w.navigate ? w.navigate(url) : w));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
