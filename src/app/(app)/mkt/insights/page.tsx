import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { formatDate } from "@/lib/utils";
import { MKT_WEEKLY_TARGET, buildQuarterStats, quarterRange } from "@/lib/mkt";
import { CreateReportForm, ReportPanel } from "./insight-panels";

export default async function MktInsightsPage() {
  await requirePermission("mkt.view");
  const [t, canReview, canGenerate] = await Promise.all([
    getTranslations("mkt"),
    hasPermission("mkt.review"),
    hasPermission("mkt.generate"),
  ]);

  const reports = await prisma.mktInsightReport.findMany({
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
    select: {
      id: true,
      year: true,
      quarter: true,
      note: true,
      aiResult: true,
      aiRanAt: true,
      files: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, channel: true, fileSize: true } },
    },
  });

  // Thống kê nhịp đăng tính LẠI mỗi lần mở trang từ sổ variant — không lưu tổng nào, nên sửa/bỏ
  // đánh dấu một bài là con số ở đây đổi theo ngay.
  const withStats = await Promise.all(
    reports.map(async (r) => {
      const { start, end } = quarterRange(r.year, r.quarter);
      const posted = await prisma.mktPostVariant.findMany({
        where: { status: "POSTED", postedAt: { gte: start, lt: end } },
        select: { channel: true, postedAt: true },
      });
      const stats = buildQuarterStats(
        posted.flatMap((p) => (p.postedAt ? [{ channel: p.channel, postedAt: p.postedAt }] : [])),
        r.year,
        r.quarter,
      );
      const li = MKT_WEEKLY_TARGET.LINKEDIN.min * stats.weekCount;
      const fpMin = MKT_WEEKLY_TARGET.FANPAGE.min * stats.weekCount;
      const fpMax = MKT_WEEKLY_TARGET.FANPAGE.max * stats.weekCount;
      const emptyWeeks = stats.weeks.filter((w) => w.counts.LINKEDIN + w.counts.FANPAGE === 0);
      const statsText = [
        t("statsLine", { channel: t("channelLINKEDIN"), n: stats.totals.LINKEDIN, target: String(li) }),
        t("statsLine", { channel: t("channelFANPAGE"), n: stats.totals.FANPAGE, target: `${fpMin}–${fpMax}` }),
        t("statsWeeks", { n: stats.weekCount, empty: emptyWeeks.length }),
        emptyWeeks.length > 0 ? t("statsEmptyWeeks", { dates: emptyWeeks.map((w) => formatDate(w.start)).join(", ") }) : "",
      ]
        .filter(Boolean)
        .join("\n");
      return { ...r, statsText };
    }),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("insightsDesc")}</p>
        {canReview && <CreateReportForm />}
      </div>

      {withStats.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">{t("insightsEmpty")}</p>
      ) : (
        withStats.map((r) => (
          <ReportPanel key={r.id} report={r} canReview={canReview} canGenerate={canGenerate} aiConfigured={isAiConfigured()} />
        ))
      )}
    </div>
  );
}
