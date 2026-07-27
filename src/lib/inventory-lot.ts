// ─────────────────────────────────────────────────────────
// Kho v2 — phần THUẦN của mô hình LÔ (spec + 7 quyết định 27/07/2026):
// trạng thái / tình trạng / mã 5 khối / mức cảnh báo hạn dùng.
// KHÔNG import gì (test được bằng node trực tiếp); IO nằm ở inventory.ts.
// ─────────────────────────────────────────────────────────

/** R ready · P theo dự án · C theo khách · W chờ kiểm · L chờ thanh lý · D hủy bỏ */
export const ITEM_STATUS_CODES = ["R", "P", "C", "W", "L", "D"] as const;
export type ItemStatusCode = (typeof ITEM_STATUS_CODES)[number];

/** B brand new · P mới một phần (đã khui kiện) · S second hand */
export const ITEM_CONDITION_CODES = ["B", "P", "S"] as const;
export type ItemConditionCode = (typeof ITEM_CONDITION_CODES)[number];

/** Segment khách hàng trong mã khi hàng thuộc TCM (ownerClientId null). */
export const TCM_OWNER_SEG = "TCM";

/** Tiền tố tổ hợp mã lô — mọi item cùng tổ hợp chỉ khác 3 số cuối. */
export function itemCodePrefix(group: string, status: string, condition: string, clientSeg: string): string {
  return `${group}.${status}.${condition}.${clientSeg}.`;
}

/** Mã lô 5 khối: P.R.B.DHG.001 (đã chốt: Loại 1 ký tự; phần con bộ tách phần thêm hậu tố -N). */
export function buildItemCode(group: string, status: string, condition: string, clientSeg: string, seq: number): string {
  return `${itemCodePrefix(group, status, condition, clientSeg)}${String(seq).padStart(3, "0")}`;
}

export type ExpiryLevel = "EXPIRED" | "RED" | "ORANGE" | "YELLOW";

/**
 * Mức cảnh báo hạn dùng theo quy ước UTC-midnight của app: vàng ≤90 · cam ≤60 · đỏ ≤30 ngày
 * trước hết hạn; qua ngày hết hạn = EXPIRED (chặn xuất dùng, chỉ còn phiếu DESTROY).
 */
export function expiryLevel(expiry: Date | null | undefined, now: Date): ExpiryLevel | null {
  if (!expiry) return null;
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.floor((day(expiry) - day(now)) / 86_400_000);
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "RED";
  if (days <= 60) return "ORANGE";
  if (days <= 90) return "YELLOW";
  return null;
}
