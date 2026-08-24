import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Archive, CalendarCheck, Settings2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { MAX_BATCH_SCORE } from "@/lib/recruit-score-server";
import { parseScoredCriteria } from "@/lib/recruit-scoring";
import { getRecruitPerms, ownedPositionWhere, notReplacingWhere } from "./access";
import { UploadCvForm } from "./upload-cv-form";
import { ScreeningBoard, type ScreeningRow } from "./screening-board";

/**
 * Trang chính của sub-module Tuyển dụng: vị trí đang tuyển + hồ sơ đang chạy.
 *
 * HAI PHẠM VI, quyết định ở TẦNG TRUY VẤN:
 *  - có `recruit.view` (HR + hành chính + BGĐ) → thấy toàn bộ kho hồ sơ;
 *  - KHÔNG có mã đó nhưng là TRƯỞNG BỘ PHẬN / quản lý trực tiếp của vị trí đang tuyển → thấy ĐÚNG
 *    vị trí của mình và ứng viên của những vị trí đó (quyết định chủ dự án 24/08/2026).
 *  - không thuộc hai nhóm trên → sang "Lịch phỏng vấn của tôi" thay vì đá về /no-access; họ có
 *    việc thật trong module này, chỉ là không phải việc quản lý kho hồ sơ.
 *
 * ⚠ Phạm vi phải áp ở `where`, KHÔNG lọc sau khi đã nạp: lọc trong JSX thì hồ sơ của phòng khác
 * vẫn nằm nguyên trong HTML thô (bài học KB-H2, HANDOVER 10.13).
 * ⚠ Người BỊ THAY bị loại ở CẢ HAI phạm vi — kể cả người có `recruit.view`. Xem ownedPositionWhere
 * và lib/recruit.ts → isReplacedBySelf.
 */
export default async function RecruitPage() {
  const perms = await getRecruitPerms();
  const scopedToOwn = !perms.canView;
  if (scopedToOwn && !perms.meId) redirect("/staff/recruit/interviews");

  const positionScope = scopedToOwn
    ? ownedPositionWhere(perms.meId as string)
    : perms.meId
      ? notReplacingWhere(perms.meId)
      : {};

  const t = await getTranslations("recruit");

  const [positions, candidates, openPositions] = await Promise.all([
    prisma.jobPosition.findMany({
      where: { status: { not: "CLOSED" }, ...positionScope },
      orderBy: [{ status: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        status: true,
        department: { select: { name: true } },
        team: { select: { code: true } },
        hiringManager: { select: { fullName: true } },
        candidates: { select: { status: true } },
      },
    }),
    // Hồ sơ ĐANG CHẠY. Hồ sơ đã chốt nằm ở Kho hồ sơ để danh sách này không dài mãi theo năm.
    prisma.candidate.findMany({
      where: { status: { in: ["NEW", "INTERVIEWING"] }, position: positionScope },
      orderBy: { createdAt: "desc" },
      take: 100,
      // ⚠ KHÔNG select `expectedSalary` ở màn hình danh sách: trang này mở cho mọi người có
      // `recruit.view`, trong khi ô lương còn phải qua phép kiểm theo bản ghi. Số không được
      // select thì không có đường nào lọt vào HTML.
      select: {
        id: true,
        fullName: true,
        status: true,
        createdAt: true,
        aiParsedAt: true,
        aiReviewStatus: true,
        aiReviewError: true,
        screenDecision: true,
        position: { select: { title: true, isManagerial: true } },
        interviews: { select: { round: true, status: true } },
        // Bản AI chấm MỚI NHẤT. `take: 1` + orderBy desc thay vì đọc hết: mỗi lần chấm lại đẻ một
        // dòng, hồ sơ chấm nhiều lần sẽ kéo cả lịch sử ra danh sách mà không ai nhìn.
        aiReviews: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { totalScore: true, maxScore: true, recommendation: true, summary: true, criteriaJson: true, createdAt: true },
        },
      },
    }),
    prisma.jobPosition.findMany({
      where: { status: "OPEN", ...positionScope },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  // Trưởng bộ phận không phụ trách vị trí nào đang tuyển thì trang này rỗng — đưa họ sang đúng
  // việc của họ thay vì để nhìn một trang trắng.
  if (scopedToOwn && positions.length === 0) redirect("/staff/recruit/interviews");

  // Dựng dòng cho bảng sàng lọc — format ngày và gom nhãn vòng phỏng vấn Ở SERVER để component
  // client không phải kéo theo bộ định dạng ngày (và giữ đúng chuẩn dd/mm/yyyy của app, 10.19).
  const screeningRows: ScreeningRow[] = candidates.map((c) => {
    const r = c.aiReviews[0];
    return {
      id: c.id,
      fullName: c.fullName,
      positionTitle: c.position.title,
      isManagerial: c.position.isManagerial,
      status: c.status,
      receivedAt: formatDate(c.createdAt),
      aiParsed: !!c.aiParsedAt,
      aiReviewStatus: c.aiReviewStatus,
      aiReviewError: c.aiReviewError,
      review: r
        ? {
            totalScore: r.totalScore,
            maxScore: r.maxScore,
            recommendation: r.recommendation,
            summary: r.summary,
            scoredAt: formatDate(r.createdAt),
            criteria: parseScoredCriteria(r.criteriaJson),
          }
        : null,
      screenDecision: c.screenDecision,
      interviewsLabel:
        c.interviews.length === 0
          ? t("noInterview")
          : c.interviews
              .sort((a, b) => a.round - b.round)
              .map((i) => `V${i.round}·${t(`ivStatus${i.status}`)}`)
              .join("  "),
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/staff/recruit/interviews"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-semibold text-foreground hover:bg-surface-2"
          >
            <CalendarCheck className="h-3.5 w-3.5" />
            {t("myInterviews")}
          </Link>
          <Link
            href="/staff/recruit/archive"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-semibold text-foreground hover:bg-surface-2"
          >
            <Archive className="h-3.5 w-3.5" />
            {t("archive")}
          </Link>
          {perms.canJd && (
            <Link
              href="/settings/recruit"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-semibold text-foreground hover:bg-surface-2"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {t("managePositions")}
            </Link>
          )}
        </div>
      </div>

      {/* Nói thẳng phạm vi đang xem — không có dòng này thì trưởng bộ phận tưởng công ty chỉ tuyển
          đúng mấy vị trí họ nhìn thấy. */}
      {scopedToOwn && (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          {t("scopedToOwnPositions")}
        </p>
      )}

      {perms.canManage && <UploadCvForm positions={openPositions} />}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">{t("positionsTitle")}</h2>
        {positions.length === 0 && <p className="text-sm text-muted-foreground">{t("noPositions")}</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {positions.map((p) => {
            const running = p.candidates.filter((c) => c.status === "NEW" || c.status === "INTERVIEWING").length;
            const hired = p.candidates.filter((c) => c.status === "HIRED").length;
            return (
              <div key={p.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{p.title}</span>
                  {p.status === "PAUSED" && <Badge tone="warning">{t("statusPAUSED")}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[p.department?.name, p.team?.code, p.hiringManager?.fullName].filter(Boolean).join(" · ") ||
                    t("noAnchor")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("positionCounts", { running, hired, total: p.candidates.length })}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <ScreeningBoard
        rows={screeningRows}
        canManage={perms.canManage}
        canAiScore={perms.canAiParse}
        canDecide={perms.canInterview}
        aiConfigured={isAiConfigured()}
        maxBatch={MAX_BATCH_SCORE}
      />
    </div>
  );
}
