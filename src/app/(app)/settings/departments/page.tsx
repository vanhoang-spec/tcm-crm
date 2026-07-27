import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { DepartmentRow } from "./department-row";
import { requirePermission } from "@/lib/permissions";

export default async function SettingsDepartmentsPage() {
  await requirePermission("settings.departments.manage");
  const [departments, staff, t] = await Promise.all([
    prisma.department.findMany({ orderBy: { code: "asc" } }),
    prisma.staff.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, title: true } }),
    getTranslations("settings.departments"),
  ]);

  const staffOptions = staff.map((s) => ({ value: s.id, label: s.fullName, sublabel: s.title ?? undefined }));

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

      <div className="space-y-3">
        {departments.map((d) => (
          <DepartmentRow key={d.id} dept={d} staff={staffOptions} />
        ))}
      </div>
    </div>
  );
}
