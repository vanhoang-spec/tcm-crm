import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Locale } from "@/i18n/locales";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─────────────────────────────────────────────────────────
// ĐỊNH DẠNG SỐ — MỘT chuẩn duy nhất cho cả app, KHÔNG đổi theo ngôn ngữ hiển thị.
//
// Nghìn ngăn bằng ".", thập phân bằng "," (kiểu vi-VN) kể cả khi đang xem tiếng Anh. Cố ý: đây là
// hệ thống nội bộ của một công ty Việt Nam, mọi người đọc cùng một con số trên cùng màn hình —
// để en-US ra "1,000,000" thì cùng một bảng, hai người mở hai ngôn ngữ sẽ đọc ra hai kiểu.
// Ô NHẬP LIỆU cũng theo đúng chuẩn này, xem components/ui/number-field.tsx.
// ─────────────────────────────────────────────────────────

/** Locale số dùng chung — cố định, không phụ thuộc ngôn ngữ giao diện. */
const NUMBER_LOCALE = "vi-VN";

/**
 * Số nguyên có ngăn cách nghìn: 1.000.000. Dùng cho TIỀN và mọi số đếm được.
 * KHÔNG thêm hậu tố (VND/đồng/đ) — caller tự thêm.
 * Tham số `locale` giữ lại để không phải sửa ~200 chỗ gọi; chuẩn số nay không phụ thuộc nó.
 */
export function formatNumber(value: number | bigint, _locale?: Locale) {
  return new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 0 }).format(Number(value));
}

/**
 * Số có phần thập phân: 11,25. Dùng cho SỐ LƯỢNG (m², ngày công), giờ, tỉ số, %.
 * Cắt số 0 thừa ở đuôi — 12,50 hiển thị "12,5", 12,00 hiển thị "12".
 */
export function formatDecimal(value: number, _locale?: Locale, digits: number = 1) {
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    minimumFractionDigits: 0,
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

// ─────────────────────────────────────────────────────────
// ĐỊNH DẠNG NGÀY — MỘT chuẩn duy nhất: DD/MM/YYYY, KHÔNG đổi theo ngôn ngữ hiển thị.
//
// Trước đây các hàm có giờ/phút chạy theo locale, nên xem bằng tiếng Anh sẽ ra MM/DD/YYYY —
// cùng một ngày, hai người đọc lệch nhau (07/05 là 7/5 hay 5/7?). Nay khoá cứng vi-VN.
// Năm để 4 số: hợp đồng và nghiệm thu trải nhiều năm, "26" dễ đọc nhầm khi tra lại hồ sơ cũ.
// Ô NHẬP ngày dùng components/ui/date-field.tsx — mask dd/mm/yyyy, cũng không phụ thuộc locale.
// ─────────────────────────────────────────────────────────

/** Locale ngày dùng chung — cố định, không phụ thuộc ngôn ngữ giao diện. */
const DATE_LOCALE = "vi-VN";

/** Ngày: 25/07/2026. */
export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Ngày + giờ: 25/07/2026 14:30 (log chăm sóc khách, audit, chat...). */
export function formatDateTime(date: Date | string, _locale?: Locale) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Chỉ giờ: 14:30 (bong bóng chat, dòng thời gian trong ngày). */
export function formatTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(DATE_LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
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
