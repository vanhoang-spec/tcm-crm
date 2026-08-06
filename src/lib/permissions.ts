import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getCurrentStaffId } from "./current-staff";
import { PERMISSION_CODES } from "./permission-catalog";

// ─────────────────────────────────────────────────────────
// KIỂM SOÁT TRUY CẬP THẬT — danh mục quyền ở lib/permission-catalog.ts, grant ở bảng
// role_permission (sửa trong /settings/roles tab "Ma trận quyền").
//
// ⚠ Gọi requirePermission("<mã>") ở ĐẦU MỖI page.tsx, ĐẦU MỖI server action, và kiểm bằng
// hasPermission() trong mỗi route handler API. KHÔNG gate bằng layout.tsx: layout không
// re-render khi điều hướng phía client (Partial Rendering) nên session không được kiểm lại mỗi
// lần đổi route, và layout không chặn được server action — xem
// node_modules/next/dist/docs/01-app/02-guides/authentication.md dòng 1350 và 1446.
// Ẩn mục khỏi menu chỉ là trang trí, không phải lớp bảo vệ.
//
// ADMIN là SÀN CỨNG: luôn đủ quyền bất kể ma trận, để không ai tự khoá mình ra khỏi chính trang
// sửa ma trận. Mọi role khác: có dòng trong role_permission = được, không có = cấm.
// ─────────────────────────────────────────────────────────

/**
 * Role luôn có TOÀN BỘ quyền, không phụ thuộc ma trận.
 *
 * Cố ý KHÔNG dùng chung với isAdminStaff() bên current-staff.ts: hàm đó quyết định ai được MẠO
 * DANH người khác, phải giữ chặt ở đúng ADMIN kể cả khi danh sách này nới ra.
 */
const ALLOWED_ROLE_CODES = new Set(["ADMIN"]);

/** Tập quyền của MỘT nhân sự cụ thể. Rỗng nếu chưa gán role. */
async function permissionsOf(staffId: string): Promise<Set<string>> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { role: { select: { code: true, permissions: { select: { permissionCode: true } } } } },
  });
  if (!staff?.role) return new Set();
  if (ALLOWED_ROLE_CODES.has(staff.role.code)) return new Set(PERMISSION_CODES);
  return new Set(staff.role.permissions.map((p) => p.permissionCode));
}

/** Tập quyền của người đang thao tác (đã tính act-as). Rỗng nếu chưa đăng nhập / chưa gán role. */
export async function getMyPermissions(): Promise<Set<string>> {
  const staffId = await getCurrentStaffId();
  if (!staffId) return new Set();
  return permissionsOf(staffId);
}

export async function hasPermission(code: string): Promise<boolean> {
  return (await getMyPermissions()).has(code);
}

/**
 * Quyền xét theo NGƯỜI ĐĂNG NHẬP THẬT thay vì người đang bị mạo danh.
 *
 * Chỉ dùng cho chính cơ chế act-as: `getCurrentStaffId()` trả về người BỊ mạo danh, nên nếu lối
 * thoát act-as gác bằng requirePermission thì admin mạo danh một nhân viên thường sẽ không thoát
 * ra được — chính cánh cửa thoát bị khoá. Mọi chỗ khác vẫn dùng requirePermission/hasPermission.
 */
export async function staffHasPermission(staffId: string, code: string): Promise<boolean> {
  return (await permissionsOf(staffId)).has(code);
}

/**
 * Trang hạ cánh an toàn khi bị từ chối, xét theo quyền NGƯỜI ĐÓ THẬT SỰ CÓ.
 *
 * KHÔNG hard-code "/" được: chính trang "/" cũng gác `dashboard.view`, nên người thiếu mã đó
 * (tài khoản vận hành hẹp quyền: thủ kho, bảo vệ) sẽ bị đá "/" → "/" → vòng lặp 307 vô hạn,
 * không còn đường nào vào app. Thứ tự dưới đây = thứ tự ưu tiên trang chính của từng vai.
 */
const SAFE_LANDING: [permission: string, href: string][] = [
  ["dashboard.view", "/"],
  ["creative.view", "/creative"],
  ["creative.task.submit", "/creative/my"],
  ["settings.view", "/settings"],
];

/** Chặn cứng theo quyền — không có → đẩy về trang hạ cánh hợp với vai. Dùng cho page VÀ server action. */
export async function requirePermission(code: string): Promise<void> {
  const perms = await getMyPermissions();
  if (perms.has(code)) return;
  redirect(SAFE_LANDING.find(([p]) => perms.has(p))?.[1] ?? "/no-access");
}


// Bản mini KHÔNG có `getDashboardScope` / `getAiVisibility` như bản TCM: hai hàm đó phục vụ
// Dashboard đa team + trợ lý AI, đều đã cắt. Trang chủ bản mini chỉ đưa thẳng vào bảng task.
