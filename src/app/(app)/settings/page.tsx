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
  Briefcase,
  ListChecks,
  Clock,
  CalendarDays,
  Plane,
  ShieldCheck,
  Award,
  Megaphone,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/permissions";

export default async function SettingsPage() {
  await requirePermission("settings.view");
  const t = await getTranslations("settings.index");

  const sections = [
    { href: "/settings/departments", icon: Building2, title: t("departmentsTitle"), desc: t("departmentsDesc") },
    { href: "/settings/staff", icon: UserPlus, title: t("staffTitle"), desc: t("staffDesc") },
    { href: "/settings/roles", icon: ShieldCheck, title: t("rolesTitle"), desc: t("rolesDesc") },
    { href: "/settings/options/creative_task_type", icon: Palette, title: t("creativeTaskTypeTitle"), desc: t("creativeTaskTypeDesc") },
    { href: "/settings/creative", icon: Coins, title: t("creativeCostTitle"), desc: t("creativeCostDesc") },
    { href: "/settings/creative-squads", icon: Users2, title: t("creativeSquadsTitle"), desc: t("creativeSquadsDesc") },
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
