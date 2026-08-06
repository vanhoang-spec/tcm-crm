/**
 * DANH MỤC QUYỀN — nguồn sự thật duy nhất (bản mini Creative).
 *
 * Vì sao để trong CODE chứ không phải bảng DB: mỗi mã dưới đây phải có một chỗ gọi
 * `requirePermission("<mã>")` tương ứng. Thêm một dòng vào DB sẽ tạo ra quyền không ai kiểm —
 * tưởng đã cấu hình mà thực tế không có hiệu lực. Nên: DANH MỤC ở code, AI ĐƯỢC GÌ (grant) ở DB
 * (bảng `role_permission`, sửa trong `/settings/roles` tab "Ma trận quyền").
 *
 * Nhãn song ngữ đi qua `pickLabel()` như OptionItem — không đẻ thêm key i18n cho danh mục thuần
 * dữ liệu.
 *
 * ⚠ Bản này CHỈ có 17 mã. Bản TCM đầy đủ có 138 — phần chênh là các module đã cắt khỏi bản mini
 * (thầu, CO/CE, tài chính, kho, chat, chấm công, KPI, tuyển dụng…). Thêm mã mới thì phải thêm cả
 * chỗ `requirePermission()` tương ứng VÀ đường cấp quyền trong `prisma/seed.ts`.
 *
 * ⚠ KHÔNG có kiểm tự động nào đối chiếu hai chiều "mã trong danh mục ↔ chỗ requirePermission".
 * Việc đối chiếu làm TAY, và phải soát cả đường cấp quyền trong seed.
 */

export type PermissionDef = {
  /** Mã bất biến — ĐỪNG đổi sau khi đã grant trong DB, grant khớp theo chuỗi này. */
  code: string;
  /** Nhóm hiển thị trong ma trận, trùng module ở nav. */
  module: string;
  labelVi: string;
  labelEn: string;
  /** Quyền đụng tiền / duyệt / dữ liệu nhân sự — tô cảnh báo trong ma trận. */
  sensitive?: boolean;
};

export const PERMISSION_MODULES = ["dashboard", "creative", "settings", "system"] as const;

/** Nhãn nhóm hiển thị trong ma trận — cùng quy ước pickLabel như nhãn quyền. */
export const PERMISSION_MODULE_LABELS: Record<string, { labelVi: string; labelEn: string }> = {
  dashboard: { labelVi: "Tổng quan", labelEn: "Dashboard" },
  creative: { labelVi: "Creative", labelEn: "Creative" },
  settings: { labelVi: "Cài đặt", labelEn: "Settings" },
  system: { labelVi: "Hệ thống", labelEn: "System" },
};

export const PERMISSIONS: PermissionDef[] = [
  // ── Trang chủ ──
  { code: "dashboard.view", module: "dashboard", labelVi: "Xem trang chủ", labelEn: "View dashboard" },

  // ── Creative ──
  // ⚠ Trưởng team nhỏ giao việc bằng phép kiểm THEO BẢN GHI (squad.leadStaffId), KHÔNG có mã quyền
  // riêng — đừng đi tìm requirePermission tương ứng cho vai đó.
  { code: "creative.view", module: "creative", labelVi: "Xem bảng task Creative", labelEn: "View Creative board" },
  { code: "creative.request.create", module: "creative", labelVi: "Gửi yêu cầu Creative", labelEn: "Submit Creative requests" },
  { code: "creative.task.manage", module: "creative", labelVi: "Tạo / xoá task", labelEn: "Create / delete tasks" },
  { code: "creative.task.assign", module: "creative", labelVi: "Điều phối về team & giao người", labelEn: "Route to squad & assign" },
  { code: "creative.task.submit", module: "creative", labelVi: "Nộp thành phẩm", labelEn: "Submit deliverables" },
  { code: "creative.task.approve", module: "creative", labelVi: "Duyệt / trả lại thành phẩm", labelEn: "Approve / reject deliverables" },
  { code: "creative.cost.view", module: "creative", labelVi: "Xem chi phí theo giờ", labelEn: "View cost per task", sensitive: true },

  // ── Cài đặt ──
  { code: "settings.view", module: "settings", labelVi: "Vào trang Cài đặt", labelEn: "Open settings" },
  { code: "settings.staff.manage", module: "settings", labelVi: "Thêm / sửa nhân sự & tài khoản", labelEn: "Manage staff & accounts", sensitive: true },
  { code: "settings.departments.manage", module: "settings", labelVi: "Sửa phòng ban", labelEn: "Manage departments" },
  { code: "settings.creative.manage", module: "settings", labelVi: "Sửa team nhỏ & cấu hình Creative", labelEn: "Manage squads & Creative settings" },
  { code: "settings.options.manage", module: "settings", labelVi: "Sửa danh mục dùng chung", labelEn: "Manage shared option sets" },
  // ⚠ Ba mã dưới là quyền META — người giữ chúng tự cấp lại được mọi quyền khác. Giữ hẹp.
  { code: "settings.roles.manage", module: "settings", labelVi: "Gán nhóm quyền cho nhân sự", labelEn: "Assign roles to staff", sensitive: true },
  { code: "settings.permissions.manage", module: "settings", labelVi: "Sửa ma trận phân quyền", labelEn: "Edit permission matrix", sensitive: true },
  { code: "settings.security.manage", module: "settings", labelVi: "Đổi mật khẩu chung", labelEn: "Change default password", sensitive: true },

  // ── Hệ thống ──
  { code: "system.impersonate", module: "system", labelVi: "Xem với tư cách người khác (act as)", labelEn: "Impersonate another user", sensitive: true },
];

export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code);

/** Tra nhanh theo mã — dùng khi render ma trận và khi đối chiếu 2 chiều code ↔ danh mục. */
export const PERMISSION_BY_CODE = new Map(PERMISSIONS.map((p) => [p.code, p]));
