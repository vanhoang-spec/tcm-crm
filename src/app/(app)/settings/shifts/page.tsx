import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { ShiftRow, ShiftCreateForm } from "./shift-row";
import { requirePermission } from "@/lib/permissions";

export default async function ShiftsSettingsPage() {
  await requirePermission("settings.timekeeping.manage");
  const t = await getTranslations("settings.shifts");
  const shifts = await prisma.workShift.findMany({ orderBy: { sort: "asc" } });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="space-y-2">
        {shifts.map((s) => (
          <ShiftRow key={s.id} shift={s} />
        ))}
      </div>
      <ShiftCreateForm />
    </div>
  );
}
