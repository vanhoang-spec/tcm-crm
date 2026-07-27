import Link from "next/link";
import {
  Building2,
  Truck,
  KeyRound,
  Users2,
  Tags,
  HandCoins,
  ChevronRight,
  Gavel,
  FileText,
  XOctagon,
  Radio,
  SlidersHorizontal,
  UserCheck,
  ListFilter,
  Layers,
  HeartHandshake,
  ClipboardList,
  FileSpreadsheet,
  Palette,
  CalendarClock,
  Wallet,
  MessagesSquare,
  UserPlus,
  BookOpen,
  Sparkles,
  Coins,
  Warehouse,
  Boxes,
  Clock,
  CalendarDays,
  Plane,
  ShieldCheck,
  Award,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/permissions";

export default async function SettingsPage() {
  await requirePermission("settings.view");
  const t = await getTranslations("settings.index");

  const sections = [
    { href: "/settings/teams", icon: Users2, title: t("teamsTitle"), desc: t("teamsDesc") },
    { href: "/settings/departments", icon: Building2, title: t("departmentsTitle"), desc: t("departmentsDesc") },
    { href: "/settings/vendors", icon: Truck, title: t("vendorsTitle"), desc: t("vendorsDesc") },
    { href: "/settings/staff", icon: UserPlus, title: t("staffTitle"), desc: t("staffDesc") },
    { href: "/settings/roles", icon: ShieldCheck, title: t("rolesTitle"), desc: t("rolesDesc") },
    { href: "/settings/options/industry", icon: Tags, title: t("industryTitle"), desc: t("industryDesc") },
    { href: "/settings/commission", icon: HandCoins, title: t("commissionTitle"), desc: t("commissionDesc") },
    { href: "/settings/options/client_status", icon: UserCheck, title: t("clientStatusTitle"), desc: t("clientStatusDesc") },
    {
      href: "/settings/options/client_classification",
      icon: ListFilter,
      title: t("clientClassificationTitle"),
      desc: t("clientClassificationDesc"),
    },
    { href: "/settings/clients", icon: HeartHandshake, title: t("clientsParamsTitle"), desc: t("clientsParamsDesc") },
    { href: "/settings/options/project_type", icon: Gavel, title: t("projectTypeTitle"), desc: t("projectTypeDesc") },
    { href: "/settings/options/contract_type", icon: FileText, title: t("contractTypeTitle"), desc: t("contractTypeDesc") },
    { href: "/settings/options/fail_reason", icon: XOctagon, title: t("failReasonTitle"), desc: t("failReasonDesc") },
    { href: "/settings/options/channel", icon: Radio, title: t("channelTitle"), desc: t("channelDesc") },
    { href: "/settings/options/complexity", icon: Layers, title: t("complexityTitle"), desc: t("complexityDesc") },
    { href: "/settings/options/project_status", icon: ClipboardList, title: t("projectStatusTitle"), desc: t("projectStatusDesc") },
    { href: "/settings/options/timeline_status", icon: ListFilter, title: t("timelineStatusTitle"), desc: t("timelineStatusDesc") },
    { href: "/settings/options/creative_task_type", icon: Palette, title: t("creativeTaskTypeTitle"), desc: t("creativeTaskTypeDesc") },
    { href: "/settings/costsheet-templates", icon: FileSpreadsheet, title: t("costsheetTemplatesTitle"), desc: t("costsheetTemplatesDesc") },
    { href: "/settings/timeline-templates", icon: CalendarClock, title: t("timelineTemplatesTitle"), desc: t("timelineTemplatesDesc") },
    { href: "/settings/bidding", icon: SlidersHorizontal, title: t("biddingParamsTitle"), desc: t("biddingParamsDesc") },
    { href: "/settings/finance", icon: Wallet, title: t("financeTitle"), desc: t("financeDesc") },
    { href: "/settings/communication", icon: MessagesSquare, title: t("communicationTitle"), desc: t("communicationDesc") },
    { href: "/settings/options/kb_category", icon: BookOpen, title: t("kbCategoryTitle"), desc: t("kbCategoryDesc") },
    { href: "/settings/ai", icon: Sparkles, title: t("aiTitle"), desc: t("aiDesc") },
    { href: "/settings/creative", icon: Coins, title: t("creativeCostTitle"), desc: t("creativeCostDesc") },
    { href: "/settings/warehouses", icon: Warehouse, title: t("warehousesTitle"), desc: t("warehousesDesc") },
    { href: "/settings/inventory-categories", icon: Boxes, title: t("inventoryCategoryTitle"), desc: t("inventoryCategoryDesc") },
    { href: "/settings/kpi", icon: Award, title: t("kpiTitle"), desc: t("kpiDesc") },
    { href: "/settings/shifts", icon: Clock, title: t("shiftsTitle"), desc: t("shiftsDesc") },
    { href: "/settings/timekeeping", icon: CalendarDays, title: t("timekeepingTitle"), desc: t("timekeepingDesc") },
    { href: "/settings/options/leave_type", icon: Plane, title: t("leaveTypeTitle"), desc: t("leaveTypeDesc") },
    { href: "/settings/security", icon: KeyRound, title: t("securityTitle"), desc: t("securityDesc") },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:border-brand-300 hover:bg-surface-2"
          >
            <s.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{s.title}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
