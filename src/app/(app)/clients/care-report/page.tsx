import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { getCareOverdueClients } from "@/lib/reminders";
import { requirePermission } from "@/lib/permissions";

const TEAM_TONE: Record<string, "brand" | "success" | "warning"> = {
  A1: "brand",
  A2: "success",
  A3: "warning",
};

const STATUS_TONE: Record<string, "brand" | "success" | "neutral"> = {
  POTENTIAL: "brand",
  ACTIVE: "success",
  INACTIVE: "neutral",
};

export default async function CareReportPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  await requirePermission("clients.view");
  const { team } = await searchParams;
  const [t, locale, teams, items] = await Promise.all([
    getTranslations("careReport"),
    getLocale() as Promise<Locale>,
    prisma.team.findMany({ orderBy: { code: "asc" } }),
    getCareOverdueClients(team),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
        {[{ code: undefined, label: t("allTeams") }, ...teams.map((tm) => ({ code: tm.code, label: tm.code }))].map(
          (tab) => {
            const isActive = team === tab.code || (!team && !tab.code);
            const href = tab.code ? `/clients/care-report?team=${tab.code}` : "/clients/care-report";
            return (
              <Link
                key={tab.label}
                href={href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive ? "bg-surface text-brand-700 shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          },
        )}
      </div>

      {/* Mobile: thẻ rút gọn — ưu tiên Khách hàng/PIC(team)/Tình trạng/số ngày quá hạn (timeline). Bảng đầy đủ ở desktop. */}
      <ul className="space-y-2 sm:hidden">
        {items.map((item) => (
          <li key={item.clientId}>
            <Link
              href={`/clients/${item.clientId}`}
              className="block rounded-xl border border-border bg-surface p-3 active:bg-surface-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.clientName}</p>
                  <p className="font-mono text-xs text-muted-foreground">{item.clientCode}</p>
                </div>
                <Badge tone={STATUS_TONE[item.statusCode] ?? "neutral"}>{item.statusCode}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <Badge tone={item.teamCode ? (TEAM_TONE[item.teamCode] ?? "neutral") : "neutral"}>
                  {item.teamCode ?? t("teamUnassigned")}
                </Badge>
                <span className="font-medium text-danger">{formatNumber(item.daysSince, locale)}</span>
                <span className="text-muted-foreground">{t("overdue", { threshold: formatNumber(item.thresholdDays, locale) })}</span>
              </div>
            </Link>
          </li>
        ))}
        {items.length === 0 && (
          <li className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground">{t("empty")}</li>
        )}
      </ul>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface sm:block">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface-2 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("colClient")}</th>
              <th className="px-4 py-3">{t("colTeam")}</th>
              <th className="px-4 py-3">{t("colStatus")}</th>
              <th className="px-4 py-3">{t("colLastCare")}</th>
              <th className="px-4 py-3">{t("colDaysSince")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr key={item.clientId} className="hover:bg-surface-2/60">
                <td className="px-4 py-3">
                  <Link href={`/clients/${item.clientId}`} className="font-medium text-foreground hover:text-brand-600">
                    {item.clientName}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{item.clientCode}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={item.teamCode ? (TEAM_TONE[item.teamCode] ?? "neutral") : "neutral"}>
                    {item.teamCode ?? t("teamUnassigned")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{item.statusCode}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {item.lastCareAt ? formatDateTime(item.lastCareAt, locale) : t("never")}
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-danger">{formatNumber(item.daysSince, locale)}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {t("overdue", { threshold: formatNumber(item.thresholdDays, locale) })}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
