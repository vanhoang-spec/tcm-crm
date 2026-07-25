import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { isWebSearchConfigured } from "@/lib/ai/websearch";
import { getAiVisibility } from "@/lib/permissions";
import { NotConfiguredBanner } from "./ai-shared";
import { BoardReportTool, BrainstormTool, CanvaBriefTool, ContentWriterTool, CostSheetTool, TrendTool } from "./ai-tools";

export default async function AiPage() {
  const [t, vis, projects] = await Promise.all([
    getTranslations("ai"),
    getAiVisibility(),
    // Mọi dự án chưa đóng — brainstorm/content/canva/rà soát CO/CE dùng cả dự án đang đấu thầu.
    prisma.project.findMany({
      where: { status: { code: { notIn: ["FAILED", "CANCELED"] } } },
      select: { id: true, code: true, name: true },
      orderBy: { code: "desc" },
      take: 200,
    }),
  ]);

  const options = projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
  const anyTool = vis.canBrainstorm || vis.canContent || vis.canCanva || vis.canCostSheet || vis.canBoardReport || vis.canTrend;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      {!isAiConfigured() && <NotConfiguredBanner />}

      {/* Mỗi công cụ chỉ hiện đúng nhóm phòng ban/người được BGĐ chốt — server action cũng tự
          re-check bằng getAiVisibility(), không tin việc ẩn UI (đúng quy ước toàn app). */}
      {vis.canBrainstorm && <BrainstormTool projects={options} />}
      {vis.canContent && <ContentWriterTool projects={options} />}
      {vis.canCanva && <CanvaBriefTool projects={options} />}
      {vis.canCostSheet && <CostSheetTool projects={options} />}
      {vis.canBoardReport && <BoardReportTool />}
      {vis.canTrend && <TrendTool webSearchOn={isWebSearchConfigured()} />}

      {!anyTool && (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {t("noToolsForRole")}
        </p>
      )}
    </div>
  );
}
