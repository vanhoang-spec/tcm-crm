import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Gavel,
  Briefcase,
  Warehouse,
  Wallet,
  UsersRound,
  Award,
  Banknote,
  Settings,
} from "lucide-react";

export type NavItem = {
  module: string | null;
  label: string;
  href: string;
  icon: LucideIcon;
  status: "active" | "soon";
};

// Thứ tự đúng theo blueprint kiến trúc đã chốt (xem plan file):
// Nền tảng → ① Khách hàng → ② Bidding & Contract → ③ Dự án ↔ ⑧ Kho → ④ Chi phí → ⑤⑥⑦ Con người
export const NAV_ITEMS: NavItem[] = [
  { module: null, label: "Tổng quan", href: "/", icon: LayoutDashboard, status: "active" },
  { module: "①", label: "Khách hàng", href: "/clients", icon: Users, status: "active" },
  { module: "②", label: "Bidding & Hợp đồng", href: "/bidding", icon: Gavel, status: "soon" },
  { module: "③", label: "Quản lý dự án", href: "/projects", icon: Briefcase, status: "soon" },
  { module: "⑧", label: "Kho hàng", href: "/inventory", icon: Warehouse, status: "soon" },
  { module: "④", label: "Chi phí & Công nợ", href: "/finance", icon: Wallet, status: "soon" },
  { module: "⑤", label: "Nhân sự", href: "/staff", icon: UsersRound, status: "soon" },
  { module: "⑥", label: "KPI & Thưởng/Phạt", href: "/kpi", icon: Award, status: "soon" },
  { module: "⑦", label: "Lương", href: "/payroll", icon: Banknote, status: "soon" },
];

export const SETTINGS_ITEM: NavItem = {
  module: null,
  label: "Thiết lập hệ thống",
  href: "/settings",
  icon: Settings,
  status: "soon",
};
