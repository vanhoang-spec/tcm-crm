import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { pickLabel, cn } from "@/lib/utils";
import { COMPLEXITY_TONE, STATUS_TONE, TEAM_TONE } from "@/lib/bidding-ui";
import type { Locale } from "@/i18n/locales";

export default async function BiddingListPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; status?: string; q?: string }>;
}) {
  const { team, status, q } = await searchParams;
  const [t, locale] = await Promise.all([getTranslations("bidding.list"), getLocale() as Promise<Locale>]);

  const teamRecord = team ? await prisma.team.findUnique({ where: { code: team } }) : null;
  const [teams, statusSet, projects, unassignedCount] = await Promise.all([
    prisma.team.findMany({ orderBy: { code: "asc" } }),
    prisma.optionSet.findUnique({ where: { code: "project_status" }, include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } } }),
    prisma.project.findMany({
      where: {
        ownerTeamId: teamRecord?.id,
        status: status ? { code: status } : undefined,
        ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }] } : {}),
      },
      include: { client: true, ownerTeam: true, owner: true, projectType: true, complexity: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.count({ where: { ownerTeamId: null } }),
  ]);

  const teamTabs = [{ code: undefined as string | undefined, label: t("allTeams") }, ...teams.map((tm) => ({ code: tm.code, label: tm.code }))];

  function withParams(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const merged = { team, status, q, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/bidding?${s}` : "/bidding";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <LinkButton href="/bidding/new">
          <Plus className="h-4 w-4" />
          {t("addProject")}
        </LinkButton>
      </div>

      {unassignedCount > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
          {t("unassignedCount", { count: unassignedCount })}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
            {teamTabs.map((tab) => {
              const isActive = team === tab.code || (!team && !tab.code);
              return (
                <Link
                  key={tab.label}
                  href={withParams({ team: tab.code })}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive ? "bg-surface text-brand-700 shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
          <form>
            {team && <input type="hidden" name="team" value={team} />}
            {q && <input type="hidden" name="q" value={q} />}
            <select
              name="status"
              defaultValue={status ?? ""}
              className="h-8 rounded-lg border border-border-strong bg-surface px-2.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">{t("allStatuses")}</option>
              {(statusSet?.items ?? []).map((s) => (
                <option key={s.id} value={s.code}>
                  {pickLabel(s, locale)}
                </option>
              ))}
            </select>
            <button type="submit" className="ml-2 text-xs font-medium text-brand-600 hover:underline">
              ↵
            </button>
          </form>
        </div>
        <form className="relative w-full lg:w-72">
          {team && <input type="hidden" name="team" value={team} />}
          {status && <input type="hidden" name="status" value={status} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </form>
      </div>

      {/* Mobile: thẻ rút gọn — chỉ ưu tiên Khách hàng/PIC/Trạng thái + nút chuyển sang workspace. Bảng đầy đủ ở desktop. */}
      <ul className="space-y-2 sm:hidden">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              href={`/bidding/${p.id}`}
              className="block rounded-xl border border-border bg-surface p-3 active:bg-surface-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.client.name}</p>
                </div>
                <Badge tone={STATUS_TONE[p.status.code] ?? "neutral"}>{pickLabel(p.status, locale)}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                {p.ownerTeam ? (
                  <Badge tone={TEAM_TONE[p.ownerTeam.code] ?? "neutral"}>{p.ownerTeam.code}</Badge>
                ) : (
                  <Badge tone="warning">{t("teamUnassigned")}</Badge>
                )}
                {p.owner && <span className="text-muted-foreground">PIC: {p.owner.fullName}</span>}
              </div>
              <span className="mt-2 block text-xs font-medium text-brand-600">{t("viewDetail")}</span>
            </Link>
          </li>
        ))}
        {projects.length === 0 && (
          <li className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground">{t("empty")}</li>
        )}
      </ul>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface sm:block">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("colCode")}</th>
              <th className="px-4 py-3">{t("colName")}</th>
              <th className="px-4 py-3">{t("colType")}</th>
              <th className="px-4 py-3">{t("colComplexity")}</th>
              <th className="px-4 py-3">{t("colStatus")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-surface-2/60">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-muted-foreground">{p.code}</td>
                <td className="px-4 py-3">
                  <Link href={`/bidding/${p.id}`} className="font-medium text-foreground hover:text-brand-600">
                    {p.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {p.ownerTeam ? (
                      <Badge tone={TEAM_TONE[p.ownerTeam.code] ?? "neutral"}>{p.ownerTeam.code}</Badge>
                    ) : (
                      <Badge tone="warning">{t("teamUnassigned")}</Badge>
                    )}{" "}
                    {p.client.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.projectType ? pickLabel(p.projectType, locale) : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={COMPLEXITY_TONE[p.complexity.code] ?? "neutral"}>{pickLabel(p.complexity, locale)}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[p.status.code] ?? "neutral"}>{pickLabel(p.status, locale)}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/bidding/${p.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                    {t("viewDetail")}
                  </Link>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
