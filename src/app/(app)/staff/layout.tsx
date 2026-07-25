import { getTranslations } from "next-intl/server";
import { StaffNav } from "./staff-nav";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("staff.nav");
  const labels = { schedule: t("schedule"), timesheet: t("timesheet"), leave: t("leave") };

  return (
    <div className="space-y-4">
      <StaffNav labels={labels} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
