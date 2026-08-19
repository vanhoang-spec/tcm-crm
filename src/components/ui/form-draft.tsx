"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

/**
 * NHÁP TỰ LƯU cho các form TẠO MỚI dài (khách hàng, dự án).
 *
 * Vì sao cần: hai form này có 12–20 ô. Người dùng điền nửa chừng rồi bị gọi đi họp / đóng nhầm tab là
 * mất trắng. Nháp giữ ở localStorage của chính máy đó — KHÔNG lên server: không cần bảng mới,
 * không cần migration, và dữ liệu dở dang chưa qua validate thì cũng chưa nên nằm trong DB.
 *
 * ⚠ Hệ quả phải biết: nháp theo TRÌNH DUYỆT + MÁY. Đổi máy, đổi trình duyệt, hoặc xoá dữ liệu duyệt
 * web là mất nháp. Muốn nháp đi theo tài khoản thì phải làm bảng ở server — việc riêng, chưa làm.
 *
 * Đọc localStorage qua `useSyncExternalStore` đúng khuôn `notification-poller.tsx` / `theme-toggle.tsx`:
 * server luôn snapshot "không có nháp" nên không lệch hydration; sau khi hydrate mới hiện băng khôi phục.
 */

export type DraftValues = Record<string, string>;
type Stored = { values: DraftValues; savedAt: number };

const PREFIX = "tcm-draft:";
/** Nháp quá hạn thì coi như không có — tránh mời khôi phục một bản từ tháng trước. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit() {
  listeners.forEach((cb) => cb());
}

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null; // trình duyệt chặn storage (ẩn danh / chính sách) — coi như không có nháp
  }
}

export function readDraft(key: string): Stored | null {
  const raw = readRaw(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.values || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, values: DraftValues) {
  if (typeof window === "undefined") return;
  // Bỏ ô rỗng để nháp trống không kích hoạt băng khôi phục.
  const clean: DraftValues = {};
  for (const [k, v] of Object.entries(values)) if (v.trim() !== "") clean[k] = v;
  try {
    if (Object.keys(clean).length === 0) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify({ values: clean, savedAt: Date.now() } satisfies Stored));
  } catch {
    return; // hết dung lượng / bị chặn — nháp là tiện ích, không được làm hỏng việc nhập
  }
  emit();
}

export function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    return;
  }
  emit();
}

/** Bóc FormData thành cặp chuỗi — bỏ field nội bộ của Server Action ($ACTION_*) và file. */
export function formToValues(form: HTMLFormElement): DraftValues {
  const out: DraftValues = {};
  for (const [k, v] of new FormData(form).entries()) {
    if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  }
  return out;
}

/**
 * Trạng thái nháp cho một form.
 *
 * `restored` = giá trị người dùng bấm khôi phục; form đọc nó làm `defaultValue` và tự remount bằng
 * `formKey` (input không kiểm soát chỉ nhận defaultValue mới khi remount).
 */
export function useFormDraft(key: string, enabled: boolean) {
  const stored = useSyncExternalStore(
    subscribe,
    () => (enabled ? readRaw(key) : null),
    () => null,
  );
  const [restored, setRestored] = useState<DraftValues | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const draft = enabled && stored ? readDraft(key) : null;

  /** Gõ tới đâu lưu tới đó (gộp 600ms để không ghi localStorage mỗi phím). */
  const scheduleSave = (form: HTMLFormElement) => {
    if (!enabled) return;
    // Đang gõ nghĩa là người dùng đã bắt tay vào form này rồi → cất băng mời khôi phục đi, nếu không
    // chính nháp mình vừa lưu sẽ bật băng lên giữa lúc đang nhập.
    setDismissed(true);
    const values = formToValues(form);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => writeDraft(key, values), 600);
  };

  const restore = () => {
    if (!draft) return;
    setRestored(draft.values);
    setFormKey((n) => n + 1); // ép remount để input nhận defaultValue mới
    setDismissed(true);
  };

  const discard = () => {
    clearDraft(key);
    setDismissed(true);
  };

  return {
    /** Có nháp chưa xử lý để mời khôi phục không */
    pending: !!draft && !dismissed ? draft : null,
    restored,
    formKey,
    scheduleSave,
    restore,
    discard,
    clear: () => clearDraft(key),
  };
}

/** Băng "có bản nháp" — hiện trên đầu form khi tìm thấy nháp còn hạn. */
export function DraftBanner({ savedAt, onRestore, onDiscard }: { savedAt: number; onRestore: () => void; onDiscard: () => void }) {
  const t = useTranslations("common");
  const time = new Date(savedAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning">
      <span className="flex-1">{t("draftFound", { time })}</span>
      <button type="button" onClick={onRestore} className="h-8 rounded-lg border border-warning/50 px-3 text-xs font-semibold hover:bg-warning/10">
        {t("draftRestore")}
      </button>
      <button type="button" onClick={onDiscard} className="h-8 rounded-lg px-3 text-xs font-medium underline">
        {t("draftDiscard")}
      </button>
    </div>
  );
}
