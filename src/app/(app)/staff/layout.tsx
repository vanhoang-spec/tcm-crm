import { getTranslations } from "next-intl/server";
import { StaffNav } from "./staff-nav";
import { shouldShowRecruitTab } from "./recruit/access";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const [t, showRecruit] = await Promise.all([getTranslations("staff.nav"), shouldShowRecruitTab()]);
  const labels = { schedule: t("schedule"), timesheet: t("timesheet"), leave: t("leave"), recruit: t("recruit") };

  return (
    <div className="space-y-4">
      <StaffNav labels={labels} showRecruit={showRecruit} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
