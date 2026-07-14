// Hằng số dùng chung cho Module ③ Quản lý dự án (UI + server action).

/** Trạng thái dự án "đang thực thi" — /projects chỉ hiển thị các dự án đã qua bidding. */
export const EXECUTION_STATUS_CODES = ["PROCESSING", "LIQUIDATION", "HANDOVER", "FINISHED"] as const;

/** Vai trò trong dự án. */
export const PROJECT_ROLES = ["LEADER", "CORE", "SUPPORT"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** Phòng ban core (sát Account) vs support — chỉ để phân nhóm hiển thị Project Team. */
export const CORE_DEPARTMENTS = ["CREATIVE", "PRO", "OPE", "PCC"];
export const SUPPORT_DEPARTMENTS = ["PLANNING", "HR", "IT"];

/** Trạng thái xác nhận phía khách trên item External Timeline (guest ghi được). */
export const CLIENT_TIMELINE_STATUSES = ["PENDING", "CONFIRMED", "NEEDS_DISCUSSION"] as const;
export type ClientTimelineStatus = (typeof CLIENT_TIMELINE_STATUSES)[number];
