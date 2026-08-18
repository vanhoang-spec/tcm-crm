// ─────────────────────────────────────────────────────────
// Kho v2 — K2: phần THUẦN của tầng đề xuất kho (không IO).
// Vòng đời + quy tắc "ai làm được gì" tách khỏi action để đọc/kiểm được một chỗ.
// ─────────────────────────────────────────────────────────

/**
 * RESERVE (K3) = GIỮ CHỖ tồn kho cho dự án lúc dựng CO/CE. Dùng chung bảng StockRequest với
 * ISSUE/INTAKE vì đã có sẵn sinh mã, cặp duyệt/từ chối/huỷ, audit, notify — nhưng KHÔNG bao giờ
 * đụng sổ cái: vòng đời dừng ở APPROVED (không có DONE, không sinh StockDocument).
 */
/** DESTROY (K6) = đề xuất HỦY hàng KHÁCH GỬI: thủ kho lập → team Account chủ duyệt → thủ kho chốt → phiếu XH. */
export const REQUEST_TYPES = ["ISSUE", "INTAKE", "RESERVE", "TRANSFER", "DESTROY"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = ["PROPOSED", "APPROVED", "REJECTED", "CANCELED", "DONE"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_CODE_PREFIX: Record<RequestType, string> = { ISSUE: "DX", INTAKE: "DN", RESERVE: "GC", TRANSFER: "DK", DESTROY: "DH" };

export function buildRequestCode(type: RequestType, date: Date, seq: number): string {
  const ym = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `${REQUEST_CODE_PREFIX[type]}-${ym}-${String(seq).padStart(3, "0")}`;
}

/**
 * Trạng thái mà thủ kho được phép xác nhận thực tế:
 * ISSUE phải qua duyệt (APPROVED); INTAKE không có bước duyệt (spec workflow c) nên xác nhận thẳng.
 */
/** BẢN ĐỒ TƯỜNG MINH — đừng dùng nhánh mặc định: loại mới rơi nhầm vào PROPOSED nghĩa là thủ kho
 *  xác nhận được đề xuất CHƯA DUYỆT, và trình biên dịch không bắt được. */
const CONFIRMABLE: Record<RequestType, RequestStatus> = {
  ISSUE: "APPROVED",
  TRANSFER: "APPROVED",
  INTAKE: "PROPOSED",
  RESERVE: "PROPOSED", // giữ chỗ không có bước xác nhận — dừng ở APPROVED
  DESTROY: "APPROVED", // K6: hủy hàng khách phải qua chủ duyệt rồi thủ kho mới chốt
};

export function confirmableStatus(type: RequestType): RequestStatus {
  return CONFIRMABLE[type];
}

/**
 * Ai được duyệt đề xuất xuất kho của một dự án (quyết định flow: "Account PIC dự án hoặc AD/AM").
 * PIC = owner (Project Owner) hoặc leader. `approveAny` là mã quyền riêng cho AD/AM/BGĐ.
 *
 * ⚠ Dự án CHƯA gán PIC/Leader (21 dự án cũ) chỉ người có approveAny mới duyệt được — cố ý, để
 * không ai tự duyệt đề xuất của mình khi dữ liệu phụ trách còn trống.
 */
export function canApproveIssue(
  project: { ownerId: string | null; leaderId: string | null; ownerTeam?: { leadStaffId: string | null } | null },
  staffId: string | null,
  approveAny: boolean
): boolean {
  if (approveAny) return true;
  if (!staffId) return false;
  // K6: TRƯỞNG TEAM (Team.leadStaffId, PLN-1) cũng duyệt được — "team Account đó" = PIC/Leader dự án chủ, không có
  // thì trưởng team của dự án chủ. Đây là fallback, không thay PIC/Leader.
  return project.ownerId === staffId || project.leaderId === staffId || (project.ownerTeam?.leadStaffId ?? null) === staffId;
}

/** Danh sách người nhận thông báo "chờ duyệt" của một dự án chủ: PIC + Leader, không có ai thì trưởng team. */
export function approverStaffIds(project: { ownerId: string | null; leaderId: string | null; ownerTeam?: { leadStaffId: string | null } | null }): string[] {
  const direct = [project.ownerId, project.leaderId].filter((x): x is string => !!x);
  if (direct.length) return [...new Set(direct)];
  return project.ownerTeam?.leadStaffId ? [project.ownerTeam.leadStaffId] : [];
}

// ── K6: duyệt TỪNG DÒNG 0..n ──────────────────────────────────────────────────────────────────

/** Số đã duyệt HIỆU LỰC của một dòng: null (phiếu trước K6 / loại không duyệt theo dòng) = coi như duyệt đủ. */
export function effectiveApproved(line: { quantity: number; approvedQuantity: number | null }): number {
  return line.approvedQuantity ?? line.quantity;
}

export type ApprovalOutcome = "FULL" | "PARTIAL" | "REJECTED";

/** Kết quả duyệt của cả phiếu từ số duyệt từng dòng: 0 hết = REJECTED · có dòng dưới đề xuất = PARTIAL · còn lại FULL. */
export function approvalOutcome(lines: { quantity: number; approvedQuantity: number | null }[]): ApprovalOutcome {
  const eff = lines.map((l) => effectiveApproved(l));
  if (eff.every((q) => q === 0)) return "REJECTED";
  return lines.some((l, i) => eff[i] < l.quantity) ? "PARTIAL" : "FULL";
}

/**
 * Đọc số duyệt từng dòng từ form: thiếu ô = duyệt đủ dòng đó (form cũ / người duyệt không sửa); có ô thì phải là
 * số nguyên 0..quantity. Trả null nếu có giá trị sai.
 */
export function parseApprovedQuantities(
  lines: { id: string; quantity: number }[],
  read: (lineId: string) => string | null
): Map<string, number> | null {
  const out = new Map<string, number>();
  for (const l of lines) {
    const raw = read(l.id);
    if (raw === null || raw.trim() === "") {
      out.set(l.id, l.quantity);
      continue;
    }
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 0 || v > l.quantity) return null;
    out.set(l.id, v);
  }
  return out;
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

// ── K6 (18/08/2026): CHỦ SỞ HỮU của lô so với dự án đang xin ─────────────────────────────────────
//
// `boundProjectId` trên lô = DỰ ÁN SỞ HỮU (mua từ chi phí dự án đó, hoặc khách gửi cho dự án đó) — gán lúc
// tạo lô. Trạng thái P ("Theo dự án") thêm nghĩa ĐỘC QUYỀN. Đây là MỘT nguồn sự thật cho cả nhãn trong
// picker (K6-1) lẫn "ai duyệt" (K6-2) — hai bên lệch nhau là OPS thấy một đằng, phiếu chạy một nẻo.

export const LOT_OWNER_KINDS = ["OVERHEAD", "MINE", "OTHER_PROJECT", "CLIENT"] as const;
export type LotOwnerKind = (typeof LOT_OWNER_KINDS)[number];

/**
 * OVERHEAD = hàng công ty mua từ ngân sách chung (overhead), dùng cho hoạt động hằng ngày, không dự án nào sở hữu →
 *   SENIOR HR MANAGER duyệt (mã inventory.request.approve_overhead; K6-4 — quyết định chủ dự án 18/08/2026), KHÔNG
 *   phải PIC dự án xin, và approve_any KHÔNG bao.
 * MINE = sở hữu bởi chính dự án đang xin → PIC/Leader dự án đó duyệt (K2).
 * OTHER_PROJECT = hàng TCM mua từ chi phí dự án KHÁC → team Account của dự án chủ duyệt ("ưu tiên").
 * CLIENT = hàng khách gửi → team Account của dự án chủ (khách đó) quyết định cuối cùng — mọi mục đích, kể cả hủy.
 */
export function lotOwnerKind(lot: { ownerClientId: string | null; boundProjectId: string | null }, requestingProjectId: string | null): LotOwnerKind {
  if (lot.ownerClientId) return "CLIENT";
  if (!lot.boundProjectId) return "OVERHEAD";
  return lot.boundProjectId === requestingProjectId ? "MINE" : "OTHER_PROJECT";
}

/** Khoá tách của phiếu hàng OVERHEAD (K6-4) — riêng một phiếu, HR Manager duyệt. */
export const OVERHEAD_OWNER_KEY = "overhead";

/**
 * Khoá TÁCH đề xuất (K6-2): các dòng cùng khoá đi chung một phiếu, cùng một người duyệt. Hàng của chính dự án
 * đang xin = khoá "" (PIC/Leader dự án xin duyệt); hàng OVERHEAD công ty = khoá riêng (HR Manager duyệt — K6-4);
 * hàng của chủ khác tách theo dự án chủ.
 */
export function lotOwnerKey(lot: { ownerClientId: string | null; boundProjectId: string | null }, requestingProjectId: string | null): string {
  const kind = lotOwnerKind(lot, requestingProjectId);
  if (kind === "MINE") return "";
  if (kind === "OVERHEAD") return OVERHEAD_OWNER_KEY;
  return lot.boundProjectId ?? `client:${lot.ownerClientId}`;
}
