import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { formatNumber, pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { TeamFilterTabs } from "./team-filter-tabs";
import { ConcentrationBanner } from "./concentration-banner";

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

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; q?: string }>;
}) {
  const { team, q } = await searchParams;
  const [t, locale] = await Promise.all([getTranslations("clients.list"), getLocale() as Promise<Locale>]);

  const [teams, clients] = await Promise.all([
    prisma.team.findMany({ orderBy: { code: "asc" } }),
    prisma.client.findMany({
      where: {
        isActive: true,
        ownerTeamId: team ? (await prisma.team.findUnique({ where: { code: team } }))?.id : undefined,
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { code: { contains: q } },
                { brand: { name: { contains: q } } },
              ],
            }
          : {}),
      },
      include: {
        ownerTeam: true,
        industry: true,
        brand: true,
        status: true,
        _count: { select: { contacts: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Cảnh báo tập trung khách hàng (FR-11) — bật đủ khi có dữ liệu doanh thu từ module ④ Chi phí.
  const concentrationReady = false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton href="/clients/care-report" variant="secondary">
            {t("careReportLink")}
          </LinkButton>
          <LinkButton href="/clients/new">
            <Plus className="h-4 w-4" />
            {t("addClient")}
          </LinkButton>
        </div>
      </div>

      {!concentrationReady && <ConcentrationBanner />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TeamFilterTabs teams={teams} activeCode={team} allLabel={t("allTeams")} />
        <form className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {team && <input type="hidden" name="team" value={team} />}
        </form>
      </div>

      {/* Mobile: thẻ rút gọn — chỉ ưu tiên Khách hàng/PIC(team)/Tình trạng + nút xem chi tiết. Bảng đầy đủ ở desktop. */}
      <ul className="space-y-2 sm:hidden">
        {clients.map((c) => (
          <li key={c.id}>
            <Link
              href={`/clients/${c.id}`}
              className="block rounded-xl border border-border bg-surface p-3 active:bg-surface-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.brand.name}</p>
                </div>
                <Badge tone={STATUS_TONE[c.status.code] ?? "neutral"}>{pickLabel(c.status, locale)}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <Badge tone={TEAM_TONE[c.ownerTeam.code] ?? "neutral"}>{c.ownerTeam.code}</Badge>
                <span className="text-muted-foreground">{pickLabel(c.industry, locale)}</span>
              </div>
              <span className="mt-2 block text-xs font-medium text-brand-600">{t("viewDetail")}</span>
            </Link>
          </li>
        ))}
        {clients.length === 0 && (
          <li className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground">{t("empty")}</li>
        )}
      </ul>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface sm:block">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("colCode")}</th>
              <th className="px-4 py-3">{t("colClient")}</th>
              <th className="px-4 py-3">{t("colIndustry")}</th>
              <th className="px-4 py-3">{t("colTeam")}</th>
              <th className="px-4 py-3">{t("colPaymentTerm")}</th>
              <th className="px-4 py-3">{t("colContacts")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2/60">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-muted-foreground">
                  {c.code}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/clients/${c.id}`} className="font-medium text-foreground hover:text-brand-600">
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{c.brand.name}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone="neutral">{pickLabel(c.industry, locale)}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TEAM_TONE[c.ownerTeam.code] ?? "neutral"}>{c.ownerTeam.code}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t("paymentTermValue", { days: formatNumber(c.paymentTermDays, locale) })}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatNumber(c._count.contacts, locale)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/clients/${c.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                    {t("viewDetail")}
                  </Link>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
