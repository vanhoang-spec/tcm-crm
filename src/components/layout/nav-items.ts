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
  HandCoins,
  ShoppingCart,
  CalendarCheck,
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
  { module: null, labelKey: "overview", href: "/", icon: LayoutDashboard, status: "active", permission: "dashboard.view" },
  { module: "⑨", labelKey: "chat", href: "/chat", icon: MessagesSquare, status: "active", accent: true, permission: "chat.use" },
  // Trợ lý AI — đặt ngay dưới Trao đổi: cả hai đều là công cụ dùng chung mọi lúc, không thuộc
  // luồng nghiệp vụ tuần tự bên dưới.
  { module: null, labelKey: "ai", href: "/ai", icon: Sparkles, status: "active", accent: true },
  { module: "①", labelKey: "clients", href: "/clients", icon: Users, status: "active", permission: "clients.view" },
  // Họp Account team — BGĐ có mã meetings.view; TRƯỞNG TEAM không có mã nào (kiểm theo bản ghi
  // Team.leadStaffId) nên layout tự nối "meetings.view" vào mảng quyền của Sidebar cho họ. Trang trí:
  // hàng rào thật là requireMeetingAccess() ở page/action.
  { module: null, labelKey: "meetings", href: "/meetings", icon: CalendarCheck, status: "active", permission: "meetings.view" },
  { module: "②", labelKey: "bidding", href: "/bidding", icon: Gavel, status: "active", permission: "bidding.view" },
  { module: "③", labelKey: "projects", href: "/projects", icon: Briefcase, status: "active", permission: "projects.view" },
  { module: "✦", labelKey: "creative", href: "/creative", icon: Palette, status: "active", permission: "creative.view" },
  { module: "⑧", labelKey: "inventory", href: "/inventory", icon: Warehouse, status: "active", permission: "inventory.view" },
  // Thu mua (PUR-1) — RFQ + hồ sơ NCC. Đặt ngay dưới Kho: hàng mua về đi vào kho / ra hiện trường.
  { module: null, labelKey: "purchasing", href: "/purchasing", icon: ShoppingCart, status: "active", permission: "purchasing.view" },
  { module: "④", labelKey: "finance", href: "/finance", icon: Wallet, status: "active", permission: "finance.view" },
  // Tạm ứng của tôi — trang CÁ NHÂN, mở theo finance.advance.request (20 nhóm) chứ không phải
  // finance.view (5 vai): ai chạy hiện trường cũng phải đề nghị được tạm ứng và thấy hạn mức mình.
  { module: null, labelKey: "advances", href: "/advances", icon: HandCoins, status: "active", permission: "finance.advance.request" },
  { module: null, labelKey: "mkt", href: "/mkt", icon: Megaphone, status: "active", permission: "mkt.view" },
  { module: "⑤", labelKey: "staff", href: "/staff", icon: UsersRound, status: "active", permission: "staff.view" },
  { module: "⑥", labelKey: "kpi", href: "/kpi", icon: Award, status: "active", permission: "kpi.view" },
  { module: "⑦", labelKey: "payroll", href: "/payroll", icon: Banknote, status: "soon", permission: "payroll.view" },
  // Chi phí văn phòng — đặt NGAY DƯỚI Lương theo yêu cầu chủ dự án: cùng là chi phí vận hành công
  // ty (khác chi phí theo dự án ở module ④). Không đánh số vì nằm ngoài chuỗi ①…⑨ nghiệp vụ dự án.
  { module: null, labelKey: "overhead", href: "/overhead", icon: Receipt, status: "active", permission: "overhead.view" },
  // Hồ sơ ISO — báo cáo tuân thủ, cắt ngang mọi dự án nên không mang số module nghiệp vụ.
  { module: null, labelKey: "iso", href: "/iso", icon: FileCheck, status: "active", permission: "iso.view" },
  // Cơ sở tri thức — nằm cuối cùng, độc lập với chuỗi module nghiệp vụ tuần tự phía trên.
  { module: null, labelKey: "kb", href: "/kb", icon: BookOpen, status: "active", permission: "kb.view" },
  // Sơ đồ tổ chức — ngay dưới Knowledge Base, dựng realtime từ Staff.managerId.
  { module: null, labelKey: "orgchart", href: "/orgchart", icon: Network, status: "active" },
];

export const SETTINGS_ITEM: NavItem = {
  module: null,
  labelKey: "settings",
  href: "/settings",
  icon: Settings,
  status: "active",
  permission: "settings.view",
};
