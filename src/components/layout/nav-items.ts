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
  Settings,
} from "lucide-react";

export type NavItem = {
  module: string | null;
  labelKey: string; // key trong namespace "nav" của messages/{locale}.json
  href: string;
  icon: LucideIcon;
  status: "active" | "soon";
};

// Thứ tự đúng theo blueprint kiến trúc đã chốt (xem plan file):
// Nền tảng → ① Khách hàng → ② Bidding & Contract → ③ Dự án ↔ ⑧ Kho → ④ Chi phí → ⑤⑥⑦ Con người
export const NAV_ITEMS: NavItem[] = [
  { module: null, labelKey: "overview", href: "/", icon: LayoutDashboard, status: "active" },
  { module: "①", labelKey: "clients", href: "/clients", icon: Users, status: "active" },
  { module: "②", labelKey: "bidding", href: "/bidding", icon: Gavel, status: "active" },
  { module: "③", labelKey: "projects", href: "/projects", icon: Briefcase, status: "active" },
  { module: "✦", labelKey: "creative", href: "/creative", icon: Palette, status: "active" },
  { module: "⑧", labelKey: "inventory", href: "/inventory", icon: Warehouse, status: "soon" },
  { module: "④", labelKey: "finance", href: "/finance", icon: Wallet, status: "soon" },
  { module: "⑤", labelKey: "staff", href: "/staff", icon: UsersRound, status: "soon" },
  { module: "⑥", labelKey: "kpi", href: "/kpi", icon: Award, status: "soon" },
  { module: "⑦", labelKey: "payroll", href: "/payroll", icon: Banknote, status: "soon" },
];

export const SETTINGS_ITEM: NavItem = {
  module: null,
  labelKey: "settings",
  href: "/settings",
  icon: Settings,
  status: "active",
};
