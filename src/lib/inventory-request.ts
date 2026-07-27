// ─────────────────────────────────────────────────────────
// Kho v2 — K2: phần THUẦN của tầng đề xuất kho (không IO).
// Vòng đời + quy tắc "ai làm được gì" tách khỏi action để đọc/kiểm được một chỗ.
// ─────────────────────────────────────────────────────────

/**
 * RESERVE (K3) = GIỮ CHỖ tồn kho cho dự án lúc dựng CO/CE. Dùng chung bảng StockRequest với
 * ISSUE/INTAKE vì đã có sẵn sinh mã, cặp duyệt/từ chối/huỷ, audit, notify — nhưng KHÔNG bao giờ
 * đụng sổ cái: vòng đời dừng ở APPROVED (không có DONE, không sinh StockDocument).
 */
export const REQUEST_TYPES = ["ISSUE", "INTAKE", "RESERVE"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = ["PROPOSED", "APPROVED", "REJECTED", "CANCELED", "DONE"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_CODE_PREFIX: Record<RequestType, string> = { ISSUE: "DX", INTAKE: "DN", RESERVE: "GC" };

export function buildRequestCode(type: RequestType, date: Date, seq: number): string {
  const ym = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `${REQUEST_CODE_PREFIX[type]}-${ym}-${String(seq).padStart(3, "0")}`;
}

/**
 * Trạng thái mà thủ kho được phép xác nhận thực tế:
 * ISSUE phải qua duyệt (APPROVED); INTAKE không có bước duyệt (spec workflow c) nên xác nhận thẳng.
 */
export function confirmableStatus(type: RequestType): RequestStatus {
  return type === "ISSUE" ? "APPROVED" : "PROPOSED";
}

/**
 * Ai được duyệt đề xuất xuất kho của một dự án (quyết định flow: "Account PIC dự án hoặc AD/AM").
 * PIC = owner (Project Owner) hoặc leader. `approveAny` là mã quyền riêng cho AD/AM/BGĐ.
 *
 * ⚠ Dự án CHƯA gán PIC/Leader (21 dự án cũ) chỉ người có approveAny mới duyệt được — cố ý, để
 * không ai tự duyệt đề xuất của mình khi dữ liệu phụ trách còn trống.
 */
export function canApproveIssue(
  project: { ownerId: string | null; leaderId: string | null },
  staffId: string | null,
  approveAny: boolean
): boolean {
  if (approveAny) return true;
  if (!staffId) return false;
  return project.ownerId === staffId || project.leaderId === staffId;
}

/**
 * Số khả dụng để đề xuất = tồn thực − đã duyệt chưa xuất − phần GIỮ CHỖ CÒN TRỐNG của dự án KHÁC.
 *
 * `reservedFreeByOthers` là phần giữ chỗ (K3) mà chủ của nó CHƯA biến thành lệnh xuất nào. Không
 * trừ trùng với `approvedNotIssued`: phần giữ chỗ đã thành lệnh xuất được trừ khỏi "còn trống"
 * trước khi cộng vào đây (xem remainingReserve), nên mỗi đơn vị hàng chỉ bị giữ đúng một lần.
 */
export function availableToRequest(balance: number, approvedNotIssued: number, reservedFreeByOthers = 0): number {
  return Math.max(0, balance - approvedNotIssued - reservedFreeByOthers);
}

/**
 * Phần giữ chỗ CÒN TRỐNG của một dự án = SL đã duyệt giữ chỗ − SL dự án đó đã đòi qua lệnh xuất
 * (đang đề xuất + đã duyệt + đã xuất thật). Đây cũng chính là TRẦN còn lại để OPE đề xuất xuất kho.
 */
export function remainingReserve(approvedReserved: number, usedByIssues: number): number {
  return Math.max(0, approvedReserved - usedByIssues);
}

/** Lệch giữa số đã duyệt giữ chỗ và số đang dùng trong CO/CE — chỉ để cảnh báo, không chặn. */
export function reserveDrift(approvedQty: number, qtyInCostSheet: number): "MATCH" | "MISSING" | "LESS" | "MORE" {
  if (qtyInCostSheet <= 0) return "MISSING";
  if (qtyInCostSheet < approvedQty) return "LESS";
  if (qtyInCostSheet > approvedQty) return "MORE";
  return "MATCH";
}
