import { Users, Gavel, Briefcase, TrendingUp, TrendingDown, ClipboardList } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { StatRatio, StatValue } from "@/components/ui/stat-ratio";
import { getDashboardScope } from "@/lib/permissions";
import { getBusinessVolume, getBusinessVolumeAllTeams, getCashflowMtd, getDeptTaskRatios, type BusinessVolume, type DeptTaskRatio } from "@/lib/dashboard";
import { requirePermission } from "@/lib/permissions";

const DEPT_LABEL_KEY: Record<string, string> = {
  ACCOUNT: "deptAccount",
  CREATIVE: "deptCreative",
  PLANNING: "deptPlanning",
  OPE: "deptOperations",
  PRO: "deptProduction",
  PCC: "deptPurchasing",
};

// Đảm bảo mọi bộ phận không-Account luôn hiện (kể cả 0/0) khi exec xem toàn công ty.
const NON_ACCOUNT_DEPTS = ["CREATIVE", "PLANNING", "OPE", "PRO", "PCC"];

export default async function DashboardPage() {
  await requirePermission("dashboard.view");
  const [t, locale] = await Promise.all([getTranslations("dashboard"), getLocale() as Promise<Locale>]);
  const scope = await getDashboardScope();
  const now = new Date();

  const [businessByTeam, cashflow, taskRatios] = await Promise.all([
    scope.canSeeAllTeams
      ? getBusinessVolumeAllTeams(now)
      : scope.ownTeamCode
        ? getBusinessVolume(scope.ownTeamCode, now).then((v) => ({ [scope.ownTeamCode as string]: v }) as Record<string, BusinessVolume>)
        : getBusinessVolume(undefined, now).then((v) => ({ ALL: v }) as Record<string, BusinessVolume>),
    scope.canSeeCashflow ? getCashflowMtd(now) : Promise.resolve(null),
    scope.canSeeAllTeams ? getDeptTaskRatios(now) : getDeptTaskRatios(now, scope.ownTeamCode ?? undefined),
  ]);

  const businessGroups: { code: string; label: string; data: BusinessVolume }[] = scope.canSeeAllTeams
    ? [
        { code: "ALL", label: t("companyTotal"), data: businessByTeam.ALL },
        ...Object.keys(businessByTeam)
          .filter((k) => k !== "ALL")
          .sort()
          .map((code) => ({ code, label: t("teamLabel", { code }), data: businessByTeam[code] })),
      ]
    : Object.entries(businessByTeam).map(([code, data]) => ({
        code,
        label: code === "ALL" ? t("companyTotal") : t("teamLabel", { code }),
        data,
      }));

  const taskByKey = new Map(taskRatios.map((r) => [r.key, r]));
  const taskCards: { key: string; deptCode: string; teamCode: string | null }[] = scope.canSeeAllTeams
    ? [
        ...Object.keys(businessByTeam)
          .filter((k) => k !== "ALL")
          .sort()
          .map((code) => ({ key: `ACCOUNT|${code}`, deptCode: "ACCOUNT", teamCode: code })),
        ...NON_ACCOUNT_DEPTS.map((d) => ({ key: d === "CREATIVE" ? "CREATIVE" : `${d}|`, deptCode: d, teamCode: null })),
      ]
    : scope.ownTeamCode
      ? [{ key: `ACCOUNT|${scope.ownTeamCode}`, deptCode: "ACCOUNT", teamCode: scope.ownTeamCode }]
      : scope.highlightDept && DEPT_LABEL_KEY[scope.highlightDept]
        ? [{ key: scope.highlightDept === "CREATIVE" ? "CREATIVE" : `${scope.highlightDept}|`, deptCode: scope.highlightDept, teamCode: null }]
        : [];

  const money = (n: number) => `${formatNumber(n, locale)}đ`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Khối 1 — Kinh doanh */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">{t("sectionBusiness")}</h2>
        {businessGroups.map((g) => (
          <div key={g.code} className="space-y-2">
            {businessGroups.length > 1 && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatRatio
                icon={Users}
                label={t("activeClients")}
                attention={g.data.activeClients}
                total={g.data.totalClients}
                attentionHref={`/clients?status=ACTIVE${g.code !== "ALL" ? `&team=${g.code}` : ""}`}
                totalHref={`/clients${g.code !== "ALL" ? `?team=${g.code}` : ""}`}
                tone="brand"
                locale={locale}
                sub={t("activeClientsSub")}
              />
              <StatRatio
                icon={Briefcase}
                label={t("runningProjects2")}
                attention={g.data.runningProjectsMtd}
                total={g.data.runningProjectsYtd}
                attentionHref={`/projects${g.code !== "ALL" ? `?team=${g.code}` : ""}`}
                totalHref={`/projects${g.code !== "ALL" ? `?team=${g.code}` : ""}`}
                tone="brand"
                locale={locale}
                sub={t("runningProjectsSub")}
              />
              <StatValue
                icon={Gavel}
                label={t("biddingProjects")}
                value={formatNumber(g.data.biddingProjects, locale)}
                href={`/bidding?status=BIDDING,PENDING${g.code !== "ALL" ? `&team=${g.code}` : ""}`}
                sub={t("biddingProjectsSub")}
                tone="brand"
              />
            </div>
          </div>
        ))}
      </section>

      {/* Khối 2 — Cashflow (chỉ CEO/CFO) */}
      {scope.canSeeCashflow && cashflow && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t("sectionCashflow")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatValue icon={TrendingUp} label={t("cashInActual")} value={money(cashflow.inActual)} tone="success" />
            <StatValue icon={TrendingUp} label={t("cashInRemaining")} value={money(cashflow.inRemaining)} tone="brand" />
            <StatValue icon={TrendingDown} label={t("cashOutActual")} value={money(cashflow.outActual)} tone="danger" />
            <StatValue icon={TrendingDown} label={t("cashOutRemaining")} value={money(cashflow.outRemaining)} tone="brand" />
          </div>
          <p className="text-xs text-muted-foreground">{t("cashflowHint")}</p>
        </section>
      )}

      {/* Khối 3 — Tiến độ theo bộ phận */}
      {taskCards.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t("sectionTasks")}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {taskCards.map((card) => {
              const r: DeptTaskRatio = taskByKey.get(card.key) ?? { key: card.key, deptCode: card.deptCode, teamCode: card.teamCode, overdue: 0, total: 0 };
              const deptLabelKey = DEPT_LABEL_KEY[card.deptCode] ?? "deptAccount";
              const label = card.deptCode === "ACCOUNT" ? `${t("deptAccount")} ${card.teamCode}` : t(deptLabelKey as Parameters<typeof t>[0]);
              const overdueHref = card.deptCode === "CREATIVE" ? "/creative" : "/reminders";
              const totalHref = card.deptCode === "ACCOUNT" ? `/projects?team=${card.teamCode}` : card.deptCode === "CREATIVE" ? "/creative" : undefined;
              return (
                <StatRatio
                  key={card.key}
                  icon={ClipboardList}
                  label={label}
                  attention={r.overdue}
                  total={r.total}
                  attentionHref={overdueHref}
                  totalHref={totalHref}
                  tone="danger"
                  locale={locale}
                  sub={t("taskOverdueRatio")}
                  highlight={scope.highlightDept === card.deptCode}
                />
              );
            })}
          </div>
        </section>
      )}

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("roadmapTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("roadmapDesc")}</p>
      </div>
    </div>
  );
}
