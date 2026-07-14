import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime, formatNumber, formatPercent } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { getBiddingReminders, getCareOverdueClients, getPendingCostSheetApprovals, getTimelineOverdueItems } from "@/lib/reminders";
import { markNotificationRead } from "./actions";

const TEAM_TONE: Record<string, "brand" | "success" | "warning"> = {
  A1: "brand",
  A2: "success",
  A3: "warning",
};

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;
  const [t, locale, teams, careItems, biddingItems, pendingApprovals, timelineItems, notifications] = await Promise.all([
    getTranslations("reminders"),
    getLocale() as Promise<Locale>,
    prisma.team.findMany({ orderBy: { code: "asc" } }),
    getCareOverdueClients(team),
    getBiddingReminders(team),
    getPendingCostSheetApprovals(team),
    getTimelineOverdueItems(team),
    prisma.notification.findMany({ where: { isRead: false }, orderBy: { createdAt: "desc" } }),
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
            const href = tab.code ? `/reminders?team=${tab.code}` : "/reminders";
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

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("careSection")}</h2>
        <ul className="mt-3 divide-y divide-border">
          {careItems.map((item) => (
            <li key={item.clientId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <Link href={`/clients/${item.clientId}`} className="text-sm font-medium text-foreground hover:text-brand-600">
                  {item.clientName}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone={TEAM_TONE[item.teamCode] ?? "neutral"}>{item.teamCode}</Badge>
                  {t("careItem", { days: formatNumber(item.daysSince, locale), threshold: formatNumber(item.thresholdDays, locale) })}
                </div>
              </div>
              <Link href={`/clients/${item.clientId}`} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
                {t("goToClient")}
              </Link>
            </li>
          ))}
          {careItems.length === 0 && <li className="py-3 text-sm text-muted-foreground">{t("careEmpty")}</li>}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("biddingSection")}</h2>
        <ul className="mt-3 divide-y divide-border">
          {biddingItems.map((item) => (
            <li key={`${item.projectId}-${item.kind}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <Link href={`/bidding/${item.projectId}`} className="text-sm font-medium text-foreground hover:text-brand-600">
                  {item.projectName}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone={item.teamCode ? (TEAM_TONE[item.teamCode] ?? "neutral") : "warning"}>{item.teamCode ?? t("teamUnassigned")}</Badge>
                  <span>{t(item.kind === "processing" ? "kindProcessing" : "kindLiquidation")}</span>
                  <span>
                    {t("biddingItem", { days: formatNumber(item.daysSince, locale), threshold: formatNumber(item.thresholdDays, locale) })}
                  </span>
                </div>
              </div>
              <Link href={`/bidding/${item.projectId}`} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
                {t("goToProject")}
              </Link>
            </li>
          ))}
          {biddingItems.length === 0 && <li className="py-3 text-sm text-muted-foreground">{t("biddingEmpty")}</li>}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("pendingCostsheetTitle")}</h2>
        <ul className="mt-3 divide-y divide-border">
          {pendingApprovals.map((item) => (
            <li key={item.costSheetId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <Link href={`/bidding/${item.projectId}`} className="text-sm font-medium text-foreground hover:text-brand-600">
                  {item.projectName}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone={item.teamCode ? (TEAM_TONE[item.teamCode] ?? "neutral") : "warning"}>{item.teamCode ?? t("teamUnassigned")}</Badge>
                  <span>
                    {t("pendingCostsheetItem", {
                      ce: formatNumber(item.ceTotal, locale),
                      co: formatNumber(item.coTotal, locale),
                      margin: formatPercent(item.marginPct, locale),
                    })}
                  </span>
                </div>
              </div>
              <Link href={`/bidding/${item.projectId}`} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
                {t("goToProject")}
              </Link>
            </li>
          ))}
          {pendingApprovals.length === 0 && <li className="py-3 text-sm text-muted-foreground">{t("pendingCostsheetEmpty")}</li>}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("timelineSection")}</h2>
        <ul className="mt-3 divide-y divide-border">
          {timelineItems.map((item) => (
            <li key={item.itemId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <Link href={`/projects/${item.projectId}`} className="text-sm font-medium text-foreground hover:text-brand-600">
                  {item.projectName}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone={item.teamCode ? (TEAM_TONE[item.teamCode] ?? "neutral") : "warning"}>{item.teamCode ?? t("teamUnassigned")}</Badge>
                  <span>{t("timelineItem", { title: item.title, days: formatNumber(item.daysOverdue, locale) })}</span>
                </div>
              </div>
              <Link href={`/projects/${item.projectId}`} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
                {t("goToProject")}
              </Link>
            </li>
          ))}
          {timelineItems.length === 0 && <li className="py-3 text-sm text-muted-foreground">{t("timelineEmpty")}</li>}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("notificationsTitle")}</h2>
        <ul className="mt-3 divide-y divide-border">
          {notifications.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {n.body} · {formatDateTime(n.createdAt, locale)}
                </p>
              </div>
              <form action={markNotificationRead.bind(null, n.id)}>
                <button type="submit" className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
                  {t("markRead")}
                </button>
              </form>
            </li>
          ))}
          {notifications.length === 0 && <li className="py-3 text-sm text-muted-foreground">{t("notificationEmpty")}</li>}
        </ul>
      </section>
    </div>
  );
}
