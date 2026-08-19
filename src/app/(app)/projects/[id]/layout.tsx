import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { pickLabel } from "@/lib/utils";
import { STATUS_TONE, TEAM_TONE } from "@/lib/bidding-ui";
import { hasLegalDoc } from "@/lib/bidding";
import type { Locale } from "@/i18n/locales";
import { hasPermission } from "@/lib/permissions";
import { WorkspaceNav } from "./workspace-nav";

export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project, t, tNav, locale] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: { client: true, ownerTeam: true, owner: true, leader: true, status: true, contract: true },
    }),
    getTranslations("projects.detail"),
    getTranslations("projects.nav"),
    getLocale() as Promise<Locale>,
  ]);
  if (!project) notFound();

  const labels = {
    overview: tNav("overview"),
    pnl: tNav("pnl"),
    timeline: tNav("timeline"),
    orders: tNav("orders"),
    coce: tNav("coce"),
    planning: tNav("planning"),
    operations: tNav("operations"),
    production: tNav("production"),
    purchasing: tNav("purchasing"),
    liquidation: tNav("liquidation"),
    iso: tNav("iso"),
  };

  /**
   * Dự án đã vào thực thi (hoặc xa hơn) mà chưa có confirm email / PO / hợp đồng — từ 19/08/2026 app
   * KHÔNG chặn nữa mà nhắc bằng băng vàng ở đây, hiện trên MỌI tab của dự án cho tới khi bổ sung.
   * Dự án thua thầu / khách huỷ thì không nhắc: chẳng còn gì để bổ sung.
   */
  // Xét theo TRẠNG THÁI chứ không theo processingAt: dự án nhập liệu thẳng vào Đang triển khai (T013,
  // T025) không có mốc đó, mà vẫn cần nhắc. Còn đấu thầu / tạm dừng / thua / khách huỷ thì không nhắc.
  const needsLegalDoc =
    !["BIDDING", "PENDING", "FAILED", "CANCELED"].includes(project.status.code) && !hasLegalDoc(project.contract);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>
          <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
          <Badge tone={STATUS_TONE[project.status.code] ?? "neutral"}>{pickLabel(project.status, locale)}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {project.ownerTeam && <Badge tone={TEAM_TONE[project.ownerTeam.code] ?? "neutral"}>{project.ownerTeam.code}</Badge>}
          <span>{t("clientLabel")}: {project.client.name}</span>
          <span>· {t("ownerLabel")}: {project.owner?.fullName ?? t("ownerUnassigned")}</span>
          <span>· {t("leaderLabel")}: {project.leader?.fullName ?? t("leaderUnassigned")}</span>
        </div>
      </div>

      {needsLegalDoc && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning">
          <span className="flex-1 font-medium">{t("missingLegalDoc")}</span>
          <Link
            href={`/bidding/${id}`}
            className="h-8 shrink-0 rounded-lg border border-warning/50 px-3 text-xs font-semibold leading-8 hover:bg-warning/10"
          >
            {t("missingLegalDocAction")}
          </Link>
        </div>
      )}

      {/* Sub-module nav nằm ngang trên đầu (thay left-rail) để nhường chiều ngang cho nội dung (Master Timeline). */}
      <WorkspaceNav
        projectId={id}
        labels={labels}
        showPnl={await hasPermission("projects.pnl.view")}
        showIso={await hasPermission("iso.view")}
      />

      <div className="min-w-0">{children}</div>
    </div>
  );
}
