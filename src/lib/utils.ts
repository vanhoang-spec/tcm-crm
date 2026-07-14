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

/** Định dạng % có 1 số thập phân, dấu phân cách thập phân theo locale (vi dùng ",", en dùng "."). */
export function formatPercent(value: number, locale: Locale, digits: number = 1) {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
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

/** JSON.stringify an toàn với BigInt (dùng cho audit_log.newValue). */
export function stringifyAudit(obj: unknown): string {
  return JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}
