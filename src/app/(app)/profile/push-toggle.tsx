"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { savePushSubscription, removePushSubscription, sendTestPush } from "./push-actions";

/**
 * Bật/tắt thông báo đẩy CHO THIẾT BỊ ĐANG DÙNG.
 *
 * ⚠ Trạng thái là THEO THIẾT BỊ, không phải theo tài khoản: một người có thể bật ở điện thoại mà
 * không bật ở máy tính. Vì vậy đọc trạng thái từ chính trình duyệt (`pushManager.getSubscription`)
 * chứ không từ DB — DB có thể còn đăng ký của máy khác.
 *
 * ⚠ Trình duyệt CHỈ cho xin quyền trong một cú bấm thật của người dùng. Không được tự gọi
 * `requestPermission()` lúc trang tải: Chrome/Safari sẽ từ chối thẳng, và người dùng bị hỏi khi
 * chưa hiểu vì sao thì bấm "Chặn" — mà đã chặn thì lần sau không hỏi lại được nữa.
 */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const t = useTranslations("profile.push");
  const [state, setState] = useState<"loading" | "unsupported" | "denied" | "off" | "on">("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !vapidPublicKey) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!cancelled) setState(sub ? "on" : "off");
    })().catch(() => {
      if (!cancelled) setState("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function turnOn() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        // BẮT BUỘC true: trình duyệt không cho push "im lặng". Service worker phải luôn hiện thông báo.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = sub.toJSON();
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
      if (!res.ok) {
        // Lưu không được thì gỡ luôn ở trình duyệt — để trạng thái hai bên không lệch nhau.
        await sub.unsubscribe().catch(() => {});
        setState("off");
        setMsg(t("errSave"));
        return;
      }
      setState("on");
      const test = await sendTestPush();
      setMsg(test.ok ? t("testSent") : null);
    } catch {
      setMsg(t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
    } catch {
      setMsg(t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <p className="mt-3 text-xs text-muted-foreground">{t("checking")}</p>;

  if (state === "unsupported") {
    return <p className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{t("unsupported")}</p>;
  }
  if (state === "denied") {
    return <p className="mt-3 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">{t("denied")}</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        onClick={state === "on" ? turnOff : turnOn}
        disabled={busy}
        className={
          state === "on"
            ? "inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
            : "inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "on" ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {state === "on" ? t("turnOff") : t("turnOn")}
      </button>
      <p className="text-xs text-muted-foreground">{state === "on" ? t("onHint") : t("offHint")}</p>
      {msg && <p className="text-xs text-success">{msg}</p>}
    </div>
  );
}

/**
 * Khoá VAPID là base64url; `pushManager.subscribe` đòi Uint8Array.
 * ⚠ Phải đổi `-`/`_` về `+`/`/` và bù `=` — thiếu bước này trình duyệt ném
 * "InvalidCharacterError" rất khó đoán ra nguyên nhân.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  // Dựng qua ArrayBuffer tường minh: `new Uint8Array(số)` cho ra Uint8Array<ArrayBufferLike>, mà
  // `applicationServerKey` đòi đúng ArrayBufferView<ArrayBuffer> — tsc từ chối.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
