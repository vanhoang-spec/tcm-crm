import Link from "next/link";
import { Users, Gavel, Briefcase, TrendingUp, TrendingDown } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { StatRatio, StatValue, SectionHeading, CashLane, ProgressRow, HeroBand, AttentionCard } from "@/components/ui/stat-ratio";
import { CashTrendChart, StageMixChart, type TrendColumn, type StageSlice } from "@/components/ui/dashboard-charts";
import { getDashboardScope } from "@/lib/permissions";
import {
  getBusinessVolume,
  getBusinessVolumeAllTeams,
  getCashflowMtd,
  getCashflowTrend,
  getDeptTaskRatios,
  getProjectStageMix,
  type BusinessVolume,
  type DeptTaskRatio,
} from "@/lib/dashboard";
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

/** Khối nền có sắc bọc quanh một nhóm thẻ — thẻ trắng nổi lên trên, tạo chiều sâu. */
function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-surface-2 p-4">{children}</div>;
}

/** Ô "chú ý / tổng" trong bảng so sánh team — cùng quy ước đọc với card: số trước đậm, mẫu số xám. */
function RatioCell({
  attention,
  total,
  attentionHref,
  totalHref,
  locale,
}: {
  attention: number;
  total: number;
  attentionHref: string;
  totalHref: string;
  locale: Locale;
}) {
  return (
    <span className="tabular-nums">
      <Link href={attentionHref} className="font-semibold text-foreground hover:underline">
        {formatNumber(attention, locale)}
      </Link>
      <span className="text-muted-foreground"> / </span>
      <Link href={totalHref} className="text-muted-foreground hover:text-foreground hover:underline">
        {formatNumber(total, locale)}
      </Link>
    </span>
  );
}

export default async function DashboardPage() {
  await requirePermission("dashboard.view");
  const [t, locale] = await Promise.all([getTranslations("dashboard"), getLocale() as Promise<Locale>]);
  const scope = await getDashboardScope();
  const now = new Date();

  const [businessByTeam, cashflow, cashTrend, taskRatios, stageMix] = await Promise.all([
    scope.canSeeAllTeams
      ? getBusinessVolumeAllTeams(now)
      : scope.ownTeamCode
        ? getBusinessVolume(scope.ownTeamCode, now).then((v) => ({ [scope.ownTeamCode as string]: v }) as Record<string, BusinessVolume>)
        : getBusinessVolume(undefined, now).then((v) => ({ ALL: v }) as Record<string, BusinessVolume>),
    scope.canSeeCashflow ? getCashflowMtd(now) : Promise.resolve(null),
    // Xu hướng thu/chi là dữ liệu dòng tiền → chỉ nạp khi người xem được phép thấy khối cashflow.
    scope.canSeeCashflow ? getCashflowTrend(now, 6) : Promise.resolve(null),
    scope.canSeeAllTeams ? getDeptTaskRatios(now) : getDeptTaskRatios(now, scope.ownTeamCode ?? undefined),
    getProjectStageMix(now, scope.ownTeamCode ?? undefined),
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

  // Nhóm đầu là con số CHỦ ĐẠO (toàn công ty với exec, team của mình với Account) → lên dải hero;
  // các team còn lại xuống bảng so sánh, vì 3 thẻ × mỗi team làm mất luôn khả năng đối chiếu.
  const [primary, ...otherTeams] = businessGroups;

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
  const num = (n: number) => formatNumber(n, locale);
  const clientsHref = (code: string, active: boolean) =>
    `/clients${active ? "?status=ACTIVE" : ""}${code !== "ALL" ? `${active ? "&" : "?"}team=${code}` : ""}`;
  const projectsHref = (code: string) => `/projects${code !== "ALL" ? `?team=${code}` : ""}`;
  const biddingHref = (code: string) => `/bidding?status=BIDDING,PENDING${code !== "ALL" ? `&team=${code}` : ""}`;
  // Truyền chuỗi: next-intl format số nguyên có phân nhóm → 2026 sẽ thành "2.026".
  const period = t("periodMonth", { month: String(now.getMonth() + 1), year: String(now.getFullYear()) });

  // ── Dải "Cần chú ý" — gom từ dữ liệu ĐÃ nạp ở trên, không thêm truy vấn nào ──
  const overdueTasks = taskCards.reduce((s, c) => s + (taskByKey.get(c.key)?.overdue ?? 0), 0);
  const totalTasks = taskCards.reduce((s, c) => s + (taskByKey.get(c.key)?.total ?? 0), 0);
  const deptsWithOverdue = taskCards.filter((c) => (taskByKey.get(c.key)?.overdue ?? 0) > 0).length;
  const attention: React.ReactNode[] = [];
  if (cashflow && cashflow.inOverdue > 0) {
    const pct = cashflow.inRemaining > 0 ? Math.round((cashflow.inOverdue / cashflow.inRemaining) * 100) : 100;
    attention.push(
      <AttentionCard
        key="overdue"
        glyph="₫"
        tone="danger"
        label={t("attnOverdue")}
        value={money(cashflow.inOverdue)}
        desc={t("attnOverdueDesc", { pct: String(pct) })}
        href="/finance/debt"
      />,
    );
  }
  if (overdueTasks > 0) {
    attention.push(
      <AttentionCard
        key="tasks"
        glyph="!"
        tone="warning"
        label={t("attnTasks")}
        value={`${num(overdueTasks)} / ${num(totalTasks)}`}
        desc={t("attnTasksDesc", { n: String(deptsWithOverdue) })}
        href="/reminders"
      />,
    );
  }
  if (primary.data.biddingProjects > 0) {
    attention.push(
      <AttentionCard
        key="bidding"
        glyph="◷"
        tone="brand"
        label={t("attnBidding")}
        value={num(primary.data.biddingProjects)}
        desc={t("attnBiddingDesc")}
        href={biddingHref(primary.code)}
      />,
    );
  }

  // ── Biểu đồ xu hướng ──
  const trendColumns: TrendColumn[] = (cashTrend ?? []).map((m) => ({
    label: t("monthShort", { month: String(m.month) }),
    fullLabel: t("periodMonth", { month: String(m.month), year: String(m.year) }),
    inActual: m.inActual,
    outActual: m.outActual,
    inText: money(m.inActual),
    outText: money(m.outActual),
  }));
  const liveMonths = (cashTrend ?? []).filter((m) => m.inActual > 0 || m.outActual > 0).length;

  // ── Biểu đồ cơ cấu dự án ──
  // Màu nền + màu CHỮ TRONG mảnh đi thành cặp: chữ chọn theo độ sáng của nền mảnh (xem StageSlice).
  const STAGE_STYLE: Record<string, { color: string; textOn: string }> = {
    BIDDING: { color: "bg-chart-1", textOn: "text-white" },
    EXECUTION: { color: "bg-chart-2", textOn: "text-[#0f172a]" },
    CLOSED: { color: "bg-chart-3", textOn: "text-white" },
  };
  const stageSlices: StageSlice[] = stageMix.map((s) => ({
    key: s.stage,
    label: t(`stage${s.stage}` as "stageBIDDING"),
    count: s.count,
    ...STAGE_STYLE[s.stage],
  }));

  return (
    <div className="space-y-6">
      <HeroBand
        title={t("heroTitle")}
        lead={t("subtitle")}
        chips={[period, primary.label]}
        stats={[
          {
            label: t("activeClients"),
            value: num(primary.data.activeClients),
            unit: `/ ${num(primary.data.totalClients)}`,
            ratio: primary.data.totalClients > 0 ? primary.data.activeClients / primary.data.totalClients : 0,
          },
          {
            label: t("runningProjects2"),
            value: num(primary.data.runningProjectsMtd),
            unit: `/ ${num(primary.data.runningProjectsYtd)}`,
            ratio: primary.data.runningProjectsYtd > 0 ? primary.data.runningProjectsMtd / primary.data.runningProjectsYtd : 0,
          },
          { label: t("biddingProjects"), value: num(primary.data.biddingProjects) },
        ]}
      />

      {/* Dải cần chú ý — tự ẩn hoàn toàn khi không có gì xấu */}
      {attention.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title={t("sectionAttention")} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{attention}</div>
        </section>
      )}

      {/* Khối 1 — Kinh doanh */}
      <section className="space-y-3">
        <SectionHeading title={t("sectionBusiness")} hint={primary.label} />
        <Panel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatRatio
              icon={Users}
              label={t("activeClients")}
              attention={primary.data.activeClients}
              total={primary.data.totalClients}
              attentionHref={clientsHref(primary.code, true)}
              totalHref={clientsHref(primary.code, false)}
              tone="brand"
              locale={locale}
              sub={t("activeClientsSub")}
              featured
            />
            <StatRatio
              icon={Briefcase}
              label={t("runningProjects2")}
              attention={primary.data.runningProjectsMtd}
              total={primary.data.runningProjectsYtd}
              attentionHref={projectsHref(primary.code)}
              totalHref={projectsHref(primary.code)}
              tone="brand"
              locale={locale}
              sub={t("runningProjectsSub")}
              featured
            />
            <StatValue
              icon={Gavel}
              label={t("biddingProjects")}
              value={num(primary.data.biddingProjects)}
              href={biddingHref(primary.code)}
              sub={t("biddingProjectsSub")}
              featured
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {otherTeams.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lift)]">
                <div className="border-b border-border px-4 py-2.5">
                  {/* Cùng sắc độ với nhãn trên thẻ (xem CAP trong stat-ratio.tsx) — `muted-foreground`
                      ở đây chỉ đạt 4,76, sát ngưỡng AA. */}
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">{t("teamCompare")}</span>
                </div>
                {/* Bảng cuộn ngang trong khung riêng — body không bao giờ cuộn ngang (HANDOVER 4.4). */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                        <th className="px-4 py-2 font-semibold">{t("colTeam")}</th>
                        <th className="px-4 py-2 text-right font-semibold">{t("colClients")}</th>
                        <th className="px-4 py-2 text-right font-semibold">{t("colProjects")}</th>
                        <th className="px-4 py-2 text-right font-semibold">{t("colBidding")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {otherTeams.map((g) => (
                        <tr key={g.code} className="hover:bg-surface-2">
                          <td className="px-4 py-2.5 font-semibold text-foreground">{g.code}</td>
                          <td className="px-4 py-2.5 text-right">
                            <RatioCell
                              attention={g.data.activeClients}
                              total={g.data.totalClients}
                              attentionHref={clientsHref(g.code, true)}
                              totalHref={clientsHref(g.code, false)}
                              locale={locale}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <RatioCell
                              attention={g.data.runningProjectsMtd}
                              total={g.data.runningProjectsYtd}
                              attentionHref={projectsHref(g.code)}
                              totalHref={projectsHref(g.code)}
                              locale={locale}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            <Link href={biddingHref(g.code)} className="font-semibold text-foreground hover:underline">
                              {num(g.data.biddingProjects)}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-lift)]">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                {t("sectionStages", { year: String(now.getFullYear()) })}
              </span>
              <div className="mt-2">
                <StageMixChart slices={stageSlices} totalText={t("stagesTotal")} />
              </div>
            </div>
          </div>
        </Panel>
      </section>

      {/* Khối 2 — Cashflow (chỉ CEO/CFO) */}
      {scope.canSeeCashflow && cashflow && (
        <section className="space-y-3">
          <SectionHeading title={t("sectionCashflow")} />
          <Panel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CashLane
                icon={TrendingUp}
                title={t("cashIn")}
                tone="success"
                rows={[
                  { label: t("cashInActual"), value: money(cashflow.inActual), amount: cashflow.inActual },
                  { label: t("cashInRemaining"), value: money(cashflow.inRemaining), amount: cashflow.inRemaining },
                ]}
                note={cashflow.inOverdue > 0 ? t("cashInRemainingOverdue", { amount: money(cashflow.inOverdue) }) : undefined}
              />
              <CashLane
                icon={TrendingDown}
                title={t("cashOut")}
                tone="danger"
                rows={[
                  { label: t("cashOutActual"), value: money(cashflow.outActual), amount: cashflow.outActual },
                  { label: t("cashOutRemaining"), value: money(cashflow.outRemaining), amount: cashflow.outRemaining },
                ]}
              />
            </div>

            {trendColumns.length > 0 && (
              <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-lift)]">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">{t("sectionTrend")}</span>
                <div className="mt-3">
                  <CashTrendChart
                    columns={trendColumns}
                    inLabel={t("trendIn")}
                    outLabel={t("trendOut")}
                    emptyNote={liveMonths < 2 ? t("trendSparse", { n: String(liveMonths) }) : undefined}
                  />
                </div>
              </div>
            )}

            <p className="mt-3 text-[11px] leading-relaxed text-foreground/65">{t("cashflowHint")}</p>
          </Panel>
        </section>
      )}

      {/* Khối 3 — Tiến độ theo bộ phận */}
      {taskCards.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title={t("sectionTasks")} hint={t("taskOverdueRatio")} />
          <Panel>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {taskCards.map((card) => {
                const r: DeptTaskRatio = taskByKey.get(card.key) ?? {
                  key: card.key,
                  deptCode: card.deptCode,
                  teamCode: card.teamCode,
                  overdue: 0,
                  total: 0,
                };
                const deptLabelKey = DEPT_LABEL_KEY[card.deptCode] ?? "deptAccount";
                const label = card.deptCode === "ACCOUNT" ? `${t("deptAccount")} ${card.teamCode}` : t(deptLabelKey as Parameters<typeof t>[0]);
                const overdueHref = card.deptCode === "CREATIVE" ? "/creative" : "/reminders";
                const totalHref = card.deptCode === "ACCOUNT" ? `/projects?team=${card.teamCode}` : card.deptCode === "CREATIVE" ? "/creative" : undefined;
                return (
                  <ProgressRow
                    key={card.key}
                    label={label}
                    overdue={r.overdue}
                    total={r.total}
                    overdueHref={overdueHref}
                    totalHref={totalHref}
                    locale={locale}
                    emptyText={t("taskNoTasks")}
                    highlight={scope.highlightDept === card.deptCode}
                  />
                );
              })}
            </ul>
          </Panel>
        </section>
      )}
    </div>
  );
}
