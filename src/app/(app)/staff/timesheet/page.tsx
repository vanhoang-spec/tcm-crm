import Link from "next/link";
import { Download } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/locales";
import { getMonthlyTimesheet } from "@/lib/timekeeping";
import { requirePermission } from "@/lib/permissions";

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission("staff.view");
  const { month } = await searchParams;
  const [t, locale] = await Promise.all([getTranslations("staff.timesheet"), getLocale() as Promise<Locale>]);
  const now = new Date();
  const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rows = (await getMonthlyTimesheet(ym)) ?? [];
  const hasData = rows.some((r) => r.plannedHours > 0);

  const leave = (r: (typeof rows)[number], code: string) => r.leaveDays[code] ?? 0;
  const otherLeave = (r: (typeof rows)[number]) =>
    Object.entries(r.leaveDays)
      .filter(([code]) => !["ANNUAL", "SICK", "UNPAID", "ABSENT"].includes(code))
      .reduce((s, [, v]) => s + v, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/staff/timesheet?month=${shiftMonth(ym, -1)}`} className="rounded-lg border border-border-strong px-3 py-2 text-xs font-medium hover:bg-surface-2">
          {t("prevMonth")}
        </Link>
        <span className="text-sm font-semibold text-foreground">{t("monthOf", { month: ym.split("-").reverse().join("/") })}</span>
        <Link href={`/staff/timesheet?month=${shiftMonth(ym, 1)}`} className="rounded-lg border border-border-strong px-3 py-2 text-xs font-medium hover:bg-surface-2">
          {t("nextMonth")}
        </Link>
        <a
          href={`/api/timekeeping/export?month=${ym}`}
          className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Download className="h-4 w-4" />
          {t("exportExcel")}
        </a>
      </div>

      {!hasData && <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{t("empty")}</p>}

      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">{t("colStaff")}</th>
              <th className="px-3 py-2">{t("colDept")}</th>
              <th className="px-3 py-2">{t("colTeam")}</th>
              <th className="px-3 py-2 text-right">{t("colPlanned")}</th>
              <th className="px-3 py-2 text-right">{t("colWorked")}</th>
              <th className="px-3 py-2 text-right">{t("colAnnual")}</th>
              <th className="px-3 py-2 text-right">{t("colSick")}</th>
              <th className="px-3 py-2 text-right">{t("colUnpaid")}</th>
              <th className="px-3 py-2 text-right">{t("colAbsent")}</th>
              <th className="px-3 py-2 text-right">{t("colOther")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.staffId} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium text-foreground">
                  {r.fullName}
                  {/* Vẫn liệt kê để tham chiếu ca trực, nhưng phải nhìn ra ngay là không vào bảng lương. */}
                  {r.payrollExempt && <Badge tone="neutral">{t("payrollExemptBadge")}</Badge>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.departmentName ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.teamCode ?? "—"}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.plannedHours, locale)}</td>
                <td className="px-3 py-2 text-right font-semibold text-foreground">{formatNumber(r.workedHours, locale)}</td>
                <td className="px-3 py-2 text-right">{leave(r, "ANNUAL") || "—"}</td>
                <td className="px-3 py-2 text-right">{leave(r, "SICK") || "—"}</td>
                <td className="px-3 py-2 text-right">{leave(r, "UNPAID") || "—"}</td>
                <td className="px-3 py-2 text-right">{leave(r, "ABSENT") || "—"}</td>
                <td className="px-3 py-2 text-right">{otherLeave(r) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
