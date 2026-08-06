import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Gavel,
  Briefcase,
  Palette,
  Warehouse,
  Wallet,
  UsersRound,
  Award,
  Banknote,
  MessagesSquare,
  Settings,
  BookOpen,
  Network,
  Sparkles,
  FileCheck,
  Receipt,
  Megaphone,
} from "lucide-react";

export type NavItem = {
  module: string | null;
  labelKey: string; // key trong namespace "nav" của messages/{locale}.json
  href: string;
  icon: LucideIcon;
  status: "active" | "soon";
  accent?: boolean; // tô màu riêng (khác brand) để tách biệt khỏi các module CRM còn lại — hiện chỉ dùng cho Trao đổi
  /**
   * Mã quyền cần có để thấy mục này (bỏ trống = ai cũng thấy).
   * CHỈ LÀ TRANG TRÍ — ẩn link không chặn được ai gõ thẳng URL. Hàng rào thật là
   * requirePermission() ở đầu page.tsx và đầu mỗi server action (xem lib/permissions.ts).
   */
  permission?: string;
};

// Thứ tự đúng theo blueprint kiến trúc đã chốt (xem plan file), riêng "Trao đổi" (chat nội bộ)
// đặt ngay dưới Tổng quan vì là kênh giao tiếp xuyên suốt, không thuộc luồng nghiệp vụ tuần tự:
// Nền tảng → Trao đổi → ① Khách hàng → ② Bidding & Contract → ③ Dự án ↔ ⑧ Kho → ④ Chi phí → ⑤⑥⑦ Con người
export const NAV_ITEMS: NavItem[] = [
  // Bản mini chỉ có Creative. Bản TCM đầy đủ có 17 mục (khách hàng, thầu, dự án, kho, tài chính,
  // nhân sự, KPI, chat, AI…) — đã cắt cùng module. Trang chủ "/" chuyển thẳng vào /creative.
  { module: null, labelKey: "creative", href: "/creative", icon: Palette, status: "active", permission: "creative.view" },
];

export const SETTINGS_ITEM: NavItem = {
  module: null,
  labelKey: "settings",
  href: "/settings",
  icon: Settings,
  status: "active",
  permission: "settings.view",
};
