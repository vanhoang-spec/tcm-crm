import "server-only";
import { prisma } from "@/lib/prisma";
import { getMyPermissions } from "@/lib/permissions";
import { getCurrentStaffId } from "@/lib/current-staff";
import { loadRfqTemplates } from "@/lib/rfq-groups";

/**
 * PHẠM VI THU MUA — ai được dùng nhóm hàng nào và NCC nào.
 *
 * Bối cảnh (quyết định chủ dự án 20/08/2026): phòng SẢN XUẤT được dùng chung cấu trúc NCC + nhóm/form
 * của Thu mua, nhưng KHÔNG phải toàn bộ — admin tick trong app xem PRO được dùng nhóm nào, NCC nào.
 *
 * ⚠ MỘT NGUỒN SỰ THẬT cho mọi chỗ chặn (trang danh sách NCC, hồ sơ NCC, lập RFQ, xem RFQ, và
 * validate ở server). Rải phép kiểm ra từng trang là kiểu bug im lặng: sót MỘT chỗ thì PRO nhìn thấy
 * toàn bộ hồ sơ nhà cung cấp của công ty, gồm cả số tài khoản ngân hàng và lịch sử giá.
 *
 * ⚠ Cấu hình lưu trong bảng `setting` (module `production`) dạng JSON, KHÔNG phải cột enum: sửa
 * bằng tick trong app, không cần deploy. Mã nhóm lưu dạng CHUỖI để sau này nếu danh mục nhóm chuyển
 * từ code sang DB thì cấu hình cũ vẫn đọc được.
 */

export const SCOPE_MODULE = "production";
export const KEY_GROUPS = "shared_group_codes";
export const KEY_VENDORS = "shared_vendor_ids";

/**
 * Role được hưởng phần chia sẻ. Ngoài danh sách này thì hoặc full (PUR/BGĐ) hoặc không có gì.
 *
 * ⚠ Phải KHỚP hằng PRO_SHARED_ROLES trong prisma/seed.ts (nơi cấp purchasing.view +
 * purchasing.rfq.manage cho hai role này). Thêm role ở một bên mà quên bên kia thì hoặc role đó có
 * quyền mà không thấy gì, hoặc THẤY TOÀN BỘ hồ sơ NCC gồm số tài khoản ngân hàng.
 */
const SHARED_ROLE_CODES = ["PRODUCTION_MANAGER", "PRODUCTION_STAFF"];

export type PurchasingScope = {
  /** true = thấy mọi nhóm và mọi NCC (PUR, BGĐ, ADMIN). */
  full: boolean;
  /** Mã nhóm được dùng. Khi `full` thì là toàn bộ danh mục. */
  groupCodes: string[];
  /** null = không giới hạn theo NCC. Mảng = CHỈ những NCC này. */
  vendorIds: string[] | null;
  /** true = đang bị giới hạn vì là phòng Sản xuất (để giao diện hiện dòng giải thích). */
  limited: boolean;
};

async function readList(key: string): Promise<string[]> {
  const row = await prisma.setting.findFirst({ where: { module: SCOPE_MODULE, key, scope: "GLOBAL", scopeRef: "" } });
  if (!row?.value) return [];
  try {
    const v = JSON.parse(row.value);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function readProductionSharing(): Promise<{ groupCodes: string[]; vendorIds: string[] }> {
  const [groupCodes, vendorIds, known] = await Promise.all([readList(KEY_GROUPS), readList(KEY_VENDORS), knownGroupCodes()]);
  // Lọc lại mã nhóm không còn trong danh mục — nhóm bị gỡ khỏi code (như SPECIAL_STRUCTURE) không
  // được phép làm vỡ trang cấu hình.
  return { groupCodes: groupCodes.filter((c) => known.has(c)), vendorIds };
}

/** Mã nhóm hiện có (gồm cả nhóm đã tắt — cấu hình cũ trỏ vào nhóm tắt vẫn là cấu hình hợp lệ). */
async function knownGroupCodes(): Promise<Set<string>> {
  return new Set((await loadRfqTemplates()).map((t) => t.code));
}

export async function writeProductionSharing(input: { groupCodes: string[]; vendorIds: string[] }): Promise<void> {
  const known = await knownGroupCodes();
  const rows: [string, string[]][] = [
    [KEY_GROUPS, input.groupCodes.filter((c) => known.has(c))],
    [KEY_VENDORS, input.vendorIds],
  ];
  for (const [key, value] of rows) {
    const where = { module: SCOPE_MODULE, key, scope: "GLOBAL", scopeRef: "" };
    const existing = await prisma.setting.findFirst({ where });
    if (existing) await prisma.setting.update({ where: { id: existing.id }, data: { value: JSON.stringify(value) } });
    else await prisma.setting.create({ data: { ...where, value: JSON.stringify(value) } });
  }
}

/**
 * Phạm vi của NGƯỜI ĐANG ĐĂNG NHẬP.
 *
 * ⚠ Xét theo MÃ ROLE chứ không theo phòng ban: phòng ban là nơi ngồi, role mới là thứ ma trận quyền
 * điều khiển — và bài học SECURITY_GUARD-trong-nhóm-WAREHOUSE (mục 10.15) là đừng lọc theo nhóm.
 */
export async function getPurchasingScope(): Promise<PurchasingScope> {
  const staffId = await getCurrentStaffId();
  const perms = await getMyPermissions();
  // Một truy vấn nhỏ (bảng ~10 dòng) để "toàn quyền" nghĩa là toàn bộ danh mục THẬT, kể cả nhóm
  // admin vừa tạo. Trả mảng rỗng cho nhánh full sẽ đúng hôm nay (canUseGroup short-circuit theo
  // scope.full) nhưng là mìn cho người sau đọc scope.groupCodes.
  const all = (await loadRfqTemplates()).map((t) => t.code);

  // Người quản trị thu mua và BGĐ: toàn quyền. `vendor.manage` là mã chỉ PUR + BGĐ giữ.
  if (perms.has("purchasing.vendor.manage")) return { full: true, groupCodes: all, vendorIds: null, limited: false };

  // getCurrentStaff() không kèm role — đọc riêng, chỉ lấy đúng mã role.
  const me = staffId ? await prisma.staff.findUnique({ where: { id: staffId }, select: { role: { select: { code: true } } } }) : null;
  const roleCode = me?.role?.code ?? "";
  if (!SHARED_ROLE_CODES.includes(roleCode)) {
    // Account / kế toán: xem được như trước, KHÔNG bị giới hạn — đợt này không siết ai đang có quyền.
    return { full: true, groupCodes: all, vendorIds: null, limited: false };
  }

  const shared = await readProductionSharing();
  return { full: false, groupCodes: shared.groupCodes, vendorIds: shared.vendorIds, limited: true };
}

/** Điều kiện Prisma lọc NCC theo phạm vi. Trả `{}` khi không giới hạn. */
export function vendorWhereForScope(scope: PurchasingScope): { id?: { in: string[] } } {
  if (scope.full || scope.vendorIds === null) return {};
  // ⚠ Mảng rỗng phải cho ra "không thấy gì" chứ không phải "thấy tất cả": `{ id: { in: [] } }`
  // là truy vấn rỗng đúng nghĩa. Trả `{}` ở đây là mở toang toàn bộ hồ sơ NCC.
  return { id: { in: scope.vendorIds } };
}

/** Có được dùng nhóm hàng này không. */
export function canUseGroup(scope: PurchasingScope, groupCode: string): boolean {
  return scope.full || scope.groupCodes.includes(groupCode);
}

/** Có được nhìn NCC này không. */
export function canSeeVendor(scope: PurchasingScope, vendorId: string): boolean {
  return scope.full || scope.vendorIds === null || scope.vendorIds.includes(vendorId);
}
