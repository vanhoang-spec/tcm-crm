import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Archive, CalendarCheck, Settings2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getRecruitPerms } from "./access";
import { UploadCvForm } from "./upload-cv-form";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  NEW: "warning",
  INTERVIEWING: "neutral",
  HIRED: "success",
  REJECTED: "danger",
};

/**
 * Trang chính của sub-module Tuyển dụng: vị trí đang tuyển + hồ sơ đang chạy.
 *
 * ⚠ Người KHÔNG có `recruit.view` (người phỏng vấn được mời, trưởng bộ phận) được đưa sang trang
 * "Lịch phỏng vấn của tôi" thay vì đá về /no-access — họ có việc thật trong module này, chỉ là
 * không phải việc quản lý kho hồ sơ.
 */
export default async function RecruitPage() {
  const perms = await getRecruitPerms();
  if (!perms.canView) redirect("/staff/recruit/interviews");

  const t = await getTranslations("recruit");

  const [positions, candidates, openPositions] = await Promise.all([
    prisma.jobPosition.findMany({
      where: { status: { not: "CLOSED" } },
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
      where: { status: { in: ["NEW", "INTERVIEWING"] } },
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
        position: { select: { title: true } },
        interviews: { select: { round: true, status: true } },
      },
    }),
    prisma.jobPosition.findMany({
      where: { status: "OPEN" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

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

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">{t("runningTitle")}</h2>
        {candidates.length === 0 && <p className="text-sm text-muted-foreground">{t("noCandidates")}</p>}
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-surface-2 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left">{t("colName")}</th>
                  <th className="px-4 py-2.5 text-left">{t("colPosition")}</th>
                  <th className="px-4 py-2.5 text-left">{t("colStatus")}</th>
                  <th className="px-4 py-2.5 text-left">{t("colInterviews")}</th>
                  <th className="px-4 py-2.5 text-left">{t("colReceived")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {candidates.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2">
                    <td className="px-4 py-2.5">
                      <Link href={`/staff/recruit/candidates/${c.id}`} className="font-medium text-brand-700 hover:underline">
                        {c.fullName}
                      </Link>
                      {!c.aiParsedAt && <span className="ml-2 text-xs text-muted-foreground">{t("notParsed")}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.position.title}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{t(`status${c.status}`)}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {c.interviews.length === 0
                        ? t("noInterview")
                        : c.interviews
                            .sort((a, b) => a.round - b.round)
                            .map((i) => `V${i.round}·${t(`ivStatus${i.status}`)}`)
                            .join("  ")}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
