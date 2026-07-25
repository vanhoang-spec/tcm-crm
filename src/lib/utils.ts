import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Locale } from "@/i18n/locales";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Định dạng số theo ngôn ngữ — dùng cho MỌI số hiển thị trong app (tiền, số lượng, ngày công...).
 * vi: 1.000.000 · en: 1,000,000 — luôn số nguyên, KHÔNG thêm hậu tố (VND/đồng/đ).
 */
export function formatNumber(value: number | bigint, locale: Locale) {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    maximumFractionDigits: 0,
  }).format(Number(value));
}

/** Định dạng số thập phân theo locale (vi dùng ",", en dùng ".") — KHÔNG kèm đơn vị. Dùng cho giờ, tỉ số... */
export function formatDecimal(value: number, locale: Locale, digits: number = 1) {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Định dạng phần trăm — nhận value LÀ giá trị phần trăm sẵn (VD 31 → "31,0"), KHÔNG nhân 100, KHÔNG
 * kèm ký hiệu "%" (caller tự thêm). Là bí danh ngữ nghĩa của formatDecimal cho đúng ngữ cảnh %.
 */
export function formatPercent(value: number, locale: Locale, digits: number = 1) {
  return formatDecimal(value, locale, digits);
}

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Ngày + giờ (dùng cho log chăm sóc khách, audit chi tiết...) — theo locale hiển thị. */
export function formatDateTime(date: Date | string, locale: Locale) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Chọn nhãn theo locale cho OptionItem (labelVi/labelEn) — rơi về tiếng Việt nếu chưa dịch. */
export function pickLabel(item: { labelVi: string; labelEn: string | null }, locale: Locale) {
  return locale === "en" ? (item.labelEn ?? item.labelVi) : item.labelVi;
}

/**
 * Tiền lưu BIGINT trong DB (VND có thể tới hàng chục tỷ). BigInt không serialize được qua
 * ranh giới server→client component của Next.js, nên chuyển sang Number khi truyền props.
 * VND < 2^53 nên Number an toàn tuyệt đối về độ chính xác.
 */
export function toNum(value: bigint | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

/** "1:05" cho 65 giây — dùng cho tin nhắn thoại (composer preview + hiển thị trong bong bóng chat). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Chữ cái đầu cho avatar dạng initials — lấy tối đa 2 từ cuối của họ tên (VD "Nguyễn Văn A" → "VA"). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * URL để <img> load avatar nhóm chat. Conversation.avatarKey có 2 dạng: bắt đầu bằng "/" = path tĩnh
 * trong /public (VD logo TCM cho "GIA ĐÌNH TCM") → load thẳng; ngược lại = storageKey ảnh admin upload
 * (lib/chat-storage.ts) → phải qua route có kiểm tra membership. Hàm thuần, dùng được cả client/server.
 */
export function groupAvatarUrl(conversationId: string, avatarKey: string | null): string | null {
  if (!avatarKey) return null;
  return avatarKey.startsWith("/") ? avatarKey : `/api/chat/group-avatar/${conversationId}`;
}

/** JSON.stringify an toàn với BigInt (dùng cho audit_log.newValue). */
export function stringifyAudit(obj: unknown): string {
  return JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}
