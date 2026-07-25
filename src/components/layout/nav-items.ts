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
} from "lucide-react";

export type NavItem = {
  module: string | null;
  labelKey: string; // key trong namespace "nav" của messages/{locale}.json
  href: string;
  icon: LucideIcon;
  status: "active" | "soon";
  accent?: boolean; // tô màu riêng (khác brand) để tách biệt khỏi các module CRM còn lại — hiện chỉ dùng cho Trao đổi
};

// Thứ tự đúng theo blueprint kiến trúc đã chốt (xem plan file), riêng "Trao đổi" (chat nội bộ)
// đặt ngay dưới Tổng quan vì là kênh giao tiếp xuyên suốt, không thuộc luồng nghiệp vụ tuần tự:
// Nền tảng → Trao đổi → ① Khách hàng → ② Bidding & Contract → ③ Dự án ↔ ⑧ Kho → ④ Chi phí → ⑤⑥⑦ Con người
export const NAV_ITEMS: NavItem[] = [
  { module: null, labelKey: "overview", href: "/", icon: LayoutDashboard, status: "active" },
  { module: "⑨", labelKey: "chat", href: "/chat", icon: MessagesSquare, status: "active", accent: true },
  // Trợ lý AI — đặt ngay dưới Trao đổi: cả hai đều là công cụ dùng chung mọi lúc, không thuộc
  // luồng nghiệp vụ tuần tự bên dưới.
  { module: null, labelKey: "ai", href: "/ai", icon: Sparkles, status: "active", accent: true },
  { module: "①", labelKey: "clients", href: "/clients", icon: Users, status: "active" },
  { module: "②", labelKey: "bidding", href: "/bidding", icon: Gavel, status: "active" },
  { module: "③", labelKey: "projects", href: "/projects", icon: Briefcase, status: "active" },
  { module: "✦", labelKey: "creative", href: "/creative", icon: Palette, status: "active" },
  { module: "⑧", labelKey: "inventory", href: "/inventory", icon: Warehouse, status: "active" },
  { module: "④", labelKey: "finance", href: "/finance", icon: Wallet, status: "active" },
  { module: "⑤", labelKey: "staff", href: "/staff", icon: UsersRound, status: "active" },
  { module: "⑥", labelKey: "kpi", href: "/kpi", icon: Award, status: "active" },
  { module: "⑦", labelKey: "payroll", href: "/payroll", icon: Banknote, status: "soon" },
  // Cơ sở tri thức — nằm cuối cùng, độc lập với chuỗi module nghiệp vụ tuần tự phía trên.
  { module: null, labelKey: "kb", href: "/kb", icon: BookOpen, status: "active" },
  // Sơ đồ tổ chức — ngay dưới Knowledge Base, dựng realtime từ Staff.managerId.
  { module: null, labelKey: "orgchart", href: "/orgchart", icon: Network, status: "active" },
];

export const SETTINGS_ITEM: NavItem = {
  module: null,
  labelKey: "settings",
  href: "/settings",
  icon: Settings,
  status: "active",
};
