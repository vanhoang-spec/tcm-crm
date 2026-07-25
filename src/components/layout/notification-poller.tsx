"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

const POLL_MS = 30_000;
const DISMISS_KEY = "tcm_desktop_notif_dismissed";

type PolledNotification = { id: string; title: string; body: string | null; url: string; createdAt: string };

// Mirror pattern của theme-toggle.tsx: đọc state chỉ-có-ở-trình-duyệt (Notification API,
// localStorage) qua useSyncExternalStore thay vì setState trong effect — tránh cascading render
// và khớp giả định SSR (server luôn snapshot "chưa hỏi quyền").
const listeners = new Set<() => void>();
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function notifyListeners() {
  listeners.forEach((cb) => cb());
}
function getPermissionSnapshot(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}
function getPermissionServerSnapshot(): NotificationPermission | "unsupported" {
  return "unsupported";
}
function getDismissedSnapshot(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(DISMISS_KEY) === "1";
}
function getDismissedServerSnapshot(): boolean {
  return true;
}

/**
 * Popup thông báo hệ điều hành (Web Notification API) cho Notification chưa đọc mới phát sinh.
 * Chỉ hoạt động khi tab/trình duyệt đang mở (không phải push thật — không nhận khi đã đóng hẳn app).
 * `after` dùng mốc THỜI ĐIỂM MOUNT làm cursor đầu tiên — tránh bắn lại toàn bộ thông báo cũ chưa đọc
 * ngay khi mở trang, chỉ báo những gì phát sinh MỚI sau đó.
 */
export function NotificationPoller() {
  const t = useTranslations("desktopNotif");
  const permission = useSyncExternalStore(subscribe, getPermissionSnapshot, getPermissionServerSnapshot);
  const dismissed = useSyncExternalStore(subscribe, getDismissedSnapshot, getDismissedServerSnapshot);
  const cursorRef = useRef<string>(new Date().toISOString());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/notifications/poll?after=${encodeURIComponent(cursorRef.current)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data: { notifications: PolledNotification[]; serverTime: string } = await res.json();
          if (!cancelled && data.notifications.length > 0 && Notification.permission === "granted") {
            // Cũ→mới để popup cuối cùng hiện đúng thông báo mới nhất lên trên khay hệ điều hành.
            for (const n of [...data.notifications].reverse()) {
              const popup = new Notification(n.title, { body: n.body ?? undefined, tag: n.id });
              popup.onclick = () => {
                window.focus();
                window.location.assign(n.url);
              };
            }
          }
          if (!cancelled) cursorRef.current = data.serverTime;
        }
      } catch {
        // Mất mạng tạm thời — bỏ qua, lần poll sau tự thử lại.
      }
      if (!cancelled) timerRef.current = setTimeout(poll, POLL_MS);
    }

    timerRef.current = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleEnable() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    await Notification.requestPermission();
    window.localStorage.setItem(DISMISS_KEY, "1");
    notifyListeners();
  }

  function handleDismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    notifyListeners();
  }

  if (permission !== "default" || dismissed) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-200 bg-brand-50 px-4 py-2 text-xs text-brand-900 lg:px-6">
      <span>{t("prompt")}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleEnable}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
        >
          {t("enable")}
        </button>
        <button type="button" onClick={handleDismiss} className="rounded-lg px-2 py-1.5 text-xs text-brand-700 hover:underline">
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}
