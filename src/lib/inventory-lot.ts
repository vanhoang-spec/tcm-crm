// ─────────────────────────────────────────────────────────
// Kho v2 — phần THUẦN của mô hình LÔ (spec + 7 quyết định 27/07/2026; mã lô v3 18/08/2026):
// trạng thái / tình trạng / mã sản phẩm + lô / mức cảnh báo hạn dùng.
// KHÔNG import gì (test được bằng node trực tiếp); IO nằm ở inventory.ts.
// ─────────────────────────────────────────────────────────

/** R ready · P theo dự án · C theo khách · W chờ kiểm · L chờ thanh lý · D hủy bỏ */
export const ITEM_STATUS_CODES = ["R", "P", "C", "W", "L", "D"] as const;
export type ItemStatusCode = (typeof ITEM_STATUS_CODES)[number];

/** B brand new · P mới một phần (đã khui kiện) · S second hand */
export const ITEM_CONDITION_CODES = ["B", "P", "S"] as const;
export type ItemConditionCode = (typeof ITEM_CONDITION_CODES)[number];

// ── Mã lô v3 (18/08/2026) — SẢN PHẨM là danh tính, LÔ là trạng thái ────────────────────────────
//
//   PO  -  0042  .  01
//   ──     ────     ──
//    │       │       └─ số LÔ, 2 chữ số, đếm riêng trong sản phẩm (không tái sử dụng khi lô về 0)
//    │       └───────── số SẢN PHẨM, 4 chữ số, đếm riêng trong nhóm gốc
//    └───────────────── nhóm gốc, 2 ký tự A-Z (PO/DT/TC/DP/IA/KG/VT — admin sửa ở Settings)
//
// Trạng thái / tình trạng / chủ sở hữu / dự án / hạn dùng KHÔNG nằm trong mã — chúng là CỘT trên lô và
// đã lọc được ở mọi màn hình. Nhét vào mã (như v2: P.R.B.TCM.001) thì mã phải đổi mỗi khi trạng thái đổi,
// nhãn đã dán thành rác. Ở v3, đổi trạng thái = chạy số lượng sang lô khác CÙNG SẢN PHẨM (phiếu CD/TH);
// số lô đã cấp đứng yên. ⚠ Số lô KHÔNG mang nghĩa: .01 không phải "mới", .02 không phải "cũ" — chỉ là
// thứ tự tạo. Mã sản phẩm KHÔNG đổi nếu sau này cho đổi nhóm (mã = danh tính, không phải phân loại).

export const PRODUCT_SEQ_MAX = 9999;
export const LOT_SEQ_MAX = 99;
export const GROUP_CODE_RE = /^[A-Z]{2}$/;

/** Mã sản phẩm: PO-0042. */
export function buildProductCode(groupCode: string, seq: number): string {
  return `${groupCode}-${String(seq).padStart(4, "0")}`;
}

/** Tiền tố dùng để đếm seq sản phẩm trong nhóm: "PO-". */
export function productCodePrefix(groupCode: string): string {
  return `${groupCode}-`;
}

/** Mã lô: PO-0042.01 (phần con của bộ tách phần thêm hậu tố -N: PO-0042.01-1). */
export function buildLotCode(productCode: string, lotSeq: number): string {
  return `${productCode}.${String(lotSeq).padStart(2, "0")}`;
}

/** Chuỗi xem trước khi chưa biết số lô: PO-0042.__ */
export function lotCodePreview(productCode: string): string {
  return `${productCode}.__`;
}

export type ExpiryLevel = "EXPIRED" | "RED" | "ORANGE" | "YELLOW";

/**
 * Số ngày giữa hai mốc theo quy ước UTC-midnight của app (HANDOVER §4.3) — dùng chung cho hạn dùng
 * và cho đếm ngày kỳ chiến dịch. MỘT nguồn sự thật, đừng tự viết lại phép trừ ngày ở chỗ khác.
 */
export function utcDayDiff(from: Date, to: Date): number {
  // Đọc bằng thành phần ĐỊA PHƯƠNG, không phải UTC: mốc UTC-midnight của app khi xem ở Asia/Saigon
  // là 07:00 ĐÚNG NGÀY đó, còn new Date() lúc 0-7h sáng lại rơi vào ngày UTC hôm trước. Dùng
  // getUTCDate() thì mọi so sánh với "bây giờ" trong khung giờ đó lệch đúng 1 ngày.
  // (Server bắt buộc TZ=Asia/Ho_Chi_Minh — xem HANDOVER mục 8.)
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((day(to) - day(from)) / 86_400_000);
}

/**
 * Mức cảnh báo hạn dùng: vàng ≤90 · cam ≤60 · đỏ ≤30 ngày trước hết hạn; qua ngày hết hạn =
 * EXPIRED (chặn xuất dùng, chỉ còn phiếu DESTROY).
 */
export function expiryLevel(expiry: Date | null | undefined, now: Date): ExpiryLevel | null {
  if (!expiry) return null;
  const days = utcDayDiff(now, expiry);
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "RED";
  if (days <= 60) return "ORANGE";
  if (days <= 90) return "YELLOW";
  return null;
}

/** Thang nghiêm trọng — chỉ nhắc khi mức hiện tại NẶNG HƠN mức đã nhắc (không spam, không bỏ mốc). */
const EXPIRY_RANK: Record<ExpiryLevel, number> = { YELLOW: 1, ORANGE: 2, RED: 3, EXPIRED: 4 };

export function shouldWarnExpiry(current: ExpiryLevel | null, alreadyWarned: string | null | undefined): boolean {
  if (!current) return false;
  const prev = alreadyWarned && alreadyWarned in EXPIRY_RANK ? EXPIRY_RANK[alreadyWarned as ExpiryLevel] : 0;
  return EXPIRY_RANK[current] > prev;
}
