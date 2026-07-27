// ─────────────────────────────────────────────────────────
// Kho v2 — K2: phần THUẦN của tầng đề xuất kho (không IO).
// Vòng đời + quy tắc "ai làm được gì" tách khỏi action để đọc/kiểm được một chỗ.
// ─────────────────────────────────────────────────────────

export const REQUEST_TYPES = ["ISSUE", "INTAKE"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = ["PROPOSED", "APPROVED", "REJECTED", "CANCELED", "DONE"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_CODE_PREFIX: Record<RequestType, string> = { ISSUE: "DX", INTAKE: "DN" };

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

/** Số khả dụng để đề xuất = tồn thực − phần đã duyệt chưa xuất (giữ chỗ mềm của chính tầng đề xuất). */
export function availableToRequest(balance: number, approvedNotIssued: number): number {
  return Math.max(0, balance - approvedNotIssued);
}
