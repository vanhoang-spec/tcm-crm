import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDecimal } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { getLeaveBalances, getTimekeepingSettings } from "@/lib/timekeeping";

export default async function LeavePage() {
  const [t, locale, settings] = await Promise.all([
    getTranslations("staff.leave"),
    getLocale() as Promise<Locale>,
    getTimekeepingSettings(),
  ]);
  const year = new Date().getFullYear();
  const balances = await getLeaveBalances(year);
  const deadlineLabel = settings.carryoverDeadline.split("-").reverse().join("/");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          {t("title")} {year}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle", { days: settings.annualLeaveDays, deadline: deadlineLabel })}</p>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">{t("colStaff")}</th>
              <th className="px-3 py-2">{t("colDept")}</th>
              <th className="px-3 py-2 text-right">{t("colEntitlement")}</th>
              <th className="px-3 py-2 text-right">{t("colCarried")}</th>
              <th className="px-3 py-2">{t("colCarryValid")}</th>
              <th className="px-3 py-2 text-right">{t("colUsed")}</th>
              <th className="px-3 py-2 text-right">{t("colRemaining")}</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.staffId} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <p className="font-medium text-foreground">{b.fullName}</p>
                  {b.missingFirstWorkDate && <p className="text-[11px] text-warning">{t("missingFirstWorkDate")}</p>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{b.departmentName ?? "—"}</td>
                <td className="px-3 py-2 text-right">{formatDecimal(b.balance.entitlement, locale)}</td>
                <td className="px-3 py-2 text-right">{formatDecimal(b.balance.carriedOver, locale)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(b.balance.carryoverValidUntil)}</td>
                <td className="px-3 py-2 text-right">{formatDecimal(b.balance.used, locale)}</td>
                <td className="px-3 py-2 text-right">
                  <Badge tone={b.balance.remaining > 0 ? "success" : "danger"}>{formatDecimal(b.balance.remaining, locale)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
