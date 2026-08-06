import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { SquadRow } from "./squad-row";
import { MemberRow } from "./member-row";

/**
 * Quản trị 3 TEAM NHỎ trong phòng Creative (CR-1): tên + trưởng team + bật/tắt, và bảng phân
 * người vào team. ⚠ KHÔNG liên quan `/settings/teams` — đó là team ACCOUNT (A1/A2/A3).
 * Gác `settings.creative.manage` (BGĐ + CFO + Creative Director đang giữ).
 */
export default async function CreativeSquadsSettingsPage() {
  await requirePermission("settings.creative.manage");
  const [t, squads, creativeStaff] = await Promise.all([
    getTranslations("settings.creativeSquads"),
    prisma.creativeSquad.findMany({ orderBy: { sort: "asc" } }),
    prisma.staff.findMany({
      where: { department: { code: "CREATIVE" }, isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, title: true, creativeSquadId: true },
    }),
  ]);

  const staffOptions = creativeStaff.map((s) => ({ id: s.id, label: s.title ? `${s.fullName} — ${s.title}` : s.fullName }));
  const squadOptions = squads.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }));
  const unassigned = creativeStaff.filter((s) => !s.creativeSquadId).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t("squadsTitle")}</h2>
        {squads.map((s) => (
          <SquadRow key={s.id} squad={s} staffOptions={staffOptions} />
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("membersTitle")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("membersHint")}
            {unassigned > 0 && <span className="ml-1 text-warning">{t("unassignedCount", { n: unassigned })}</span>}
          </p>
        </div>
        {creativeStaff.map((s) => (
          <MemberRow key={s.id} staff={s} squads={squadOptions} />
        ))}
      </section>
    </div>
  );
}
