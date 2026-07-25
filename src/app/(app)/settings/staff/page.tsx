import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { checkPasswordAge } from "@/lib/password";
import { StaffCreateForm } from "./staff-create-form";
import { StaffRow } from "./staff-row";
import { requirePermission } from "@/lib/permissions";

export default async function SettingsStaffPage() {
  await requirePermission("settings.staff.manage");
  const tAuth = await getTranslations("auth.admin");
  const [staff, departments, teams, t] = await Promise.all([
    prisma.staff.findMany({
      orderBy: { fullName: "asc" },
      include: {
        department: { select: { name: true } },
        team: { select: { name: true } },
        manager: { select: { fullName: true } },
      },
    }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getTranslations("settings.staff"),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <StaffCreateForm departments={departments} teams={teams} />

      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("colName")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colEmail")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colTitle")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colDepartment")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colGender")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colLocation")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colManager")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colDob")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colFirstWorkDate")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colStatus")}</th>
              <th className="px-3 py-2 text-left font-medium">{tAuth("colPassword")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colActions")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colJoined")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {staff.map((s) => (
              <StaffRow
                key={s.id}
                staff={{
                  id: s.id,
                  fullName: s.fullName,
                  email: s.email,
                  title: s.title,
                  departmentName: s.department?.name ?? null,
                  gender: s.gender,
                  workLocation: s.workLocation,
                  managerName: s.manager?.fullName ?? null,
                  isActive: s.isActive,
                  dateOfBirth: s.dateOfBirth,
                  firstWorkDate: s.firstWorkDate,
                  createdAt: s.createdAt,
                  passwordState: !s.passwordHash
                    ? "NEVER_SET"
                    : checkPasswordAge(s.passwordChangedAt).expired
                      ? "EXPIRED"
                      : "OK",
                  lastLoginAt: s.lastLoginAt,
                  locked: !!s.lockedUntil && s.lockedUntil > new Date(),
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
