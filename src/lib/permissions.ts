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
  ["inventory.view", "/inventory"],
  ["projects.view", "/projects"],
  ["clients.view", "/clients"],
  ["finance.view", "/finance"],
  ["creative.view", "/creative"],
  ["staff.view", "/staff"],
  ["chat.use", "/chat"],
  ["kb.view", "/kb"],
  ["settings.view", "/settings"],
];

/** Chặn cứng theo quyền — không có → đẩy về trang hạ cánh hợp với vai. Dùng cho page VÀ server action. */
export async function requirePermission(code: string): Promise<void> {
  const perms = await getMyPermissions();
  if (perms.has(code)) return;
  redirect(SAFE_LANDING.find(([p]) => perms.has(p))?.[1] ?? "/no-access");
}

// ─────────────────────────────────────────────────────────
// Phạm vi hiển thị Dashboard — QUYỀN lấy từ ma trận, còn phòng ban/team vẫn lấy từ hồ sơ nhân sự
// (đó là "dữ liệu của ai", không phải "được phép hay không").
// ─────────────────────────────────────────────────────────

export type DashboardScope = {
  canSeeAllTeams: boolean;
  canSeeCashflow: boolean;
  /** Team Account của nhân sự hiện tại (A1/A2/A3) — null nếu không thuộc Account hoặc xem được mọi team. */
  ownTeamCode: string | null;
  /** Danh sách team hiển thị ở khối kinh doanh: ["A1","A2","A3","ALL"] khi xem được tất cả, [team] cho Account, ["ALL"] cho phòng khác. */
  visibleTeamCodes: string[];
  /** Mã phòng ban của nhân sự hiện tại — dùng để tô đậm card bộ phận mình ở khối tiến độ. */
  highlightDept: string | null;
};

export async function getDashboardScope(): Promise<DashboardScope> {
  const staffId = await getCurrentStaffId();
  const [staff, perms] = await Promise.all([
    staffId
      ? prisma.staff.findUnique({
          where: { id: staffId },
          select: { department: { select: { code: true } }, team: { select: { code: true } } },
        })
      : Promise.resolve(null),
    getMyPermissions(),
  ]);

  const isExec = perms.has("dashboard.all_teams");
  const deptCode = staff?.department?.code ?? null;
  const ownTeamCode = !isExec && deptCode === "ACCOUNT" ? (staff?.team?.code ?? null) : null;

  const allTeams = await prisma.team.findMany({ where: { isActive: true }, select: { code: true }, orderBy: { code: "asc" } });
  const visibleTeamCodes = isExec ? [...allTeams.map((t) => t.code), "ALL"] : ownTeamCode ? [ownTeamCode] : ["ALL"];

  return {
    canSeeAllTeams: isExec,
    canSeeCashflow: perms.has("dashboard.cashflow"),
    ownTeamCode,
    visibleTeamCodes,
    highlightDept: !isExec && deptCode !== "ACCOUNT" ? deptCode : null,
  };
}

// ─────────────────────────────────────────────────────────
// Phạm vi hiển thị trợ lý AI.
//
// Trước đây gate bằng DANH SÁCH EMAIL cứng trong file này (3 người BGĐ + Hồ Sĩ Bảo) cộng với
// phòng ban. Nay đi qua ma trận: seed đã dựng lại đúng phân bổ cũ theo nhóm role, admin chỉnh
// tiếp trong /settings/roles. Giữ nguyên hình dạng trả về để 8 chỗ gọi không phải sửa.
//
// ⚠ Đây chỉ là lớp HIỂN THỊ — mỗi action AI vẫn tự requirePermission("ai.*") trước khi gọi model.
// ─────────────────────────────────────────────────────────

export type AiVisibility = {
  canBrainstorm: boolean;
  canContent: boolean;
  canCanva: boolean;
  canCostSheet: boolean;
  canBoardReport: boolean;
  canTrend: boolean;
  canDocument: boolean;
};

export async function getAiVisibility(): Promise<AiVisibility> {
  const p = await getMyPermissions();
  return {
    canBrainstorm: p.has("ai.brainstorm"),
    canContent: p.has("ai.content"),
    canCanva: p.has("ai.canva"),
    canCostSheet: p.has("ai.costsheet"),
    canBoardReport: p.has("ai.board_report"),
    canTrend: p.has("ai.trend"),
    canDocument: p.has("ai.document"),
  };
}
