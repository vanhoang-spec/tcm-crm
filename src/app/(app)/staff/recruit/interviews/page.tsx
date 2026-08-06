import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RespondForm } from "../candidates/[id]/interview-panel";

const IV_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  DECLINED: "danger",
  DONE: "neutral",
  CANCELLED: "neutral",
};

/**
 * "Lịch phỏng vấn của tôi" — trang duy nhất của module mở cho MỌI người đã đăng nhập.
 *
 * ⚠ CỐ Ý không gác bằng mã quyền: người phỏng vấn là bất kỳ ai được HR mời (trưởng bộ phận, BGĐ,
 * đồng nghiệp cùng chuyên môn) và họ không có mã quyền tuyển dụng nào. Trang chỉ liệt kê lượt
 * phỏng vấn GẮN TÊN CHÍNH NGƯỜI ĐANG XEM — phạm vi dữ liệu do câu truy vấn quyết định, không phải
 * do mã quyền.
 */
export default async function MyInterviewsPage() {
  const meId = await getCurrentStaffId();
  if (!meId) redirect("/login");
  const t = await getTranslations("recruit");

  const interviews = await prisma.interview.findMany({
    where: { interviewerStaffId: meId, status: { not: "CANCELLED" } },
    orderBy: [{ status: "asc" }, { scheduledAt: "asc" }],
    select: {
      id: true,
      round: true,
      scheduledAt: true,
      durationMin: true,
      location: true,
      status: true,
      // ⚠ KHÔNG select lương, điện thoại, email, ngày sinh của ứng viên ở màn hình danh sách. Người
      // phỏng vấn xem hồ sơ đầy đủ ở trang chi tiết, nơi có phép kiểm theo bản ghi.
      candidate: {
        select: { id: true, fullName: true, summarySkills: true, position: { select: { title: true } } },
      },
    },
  });

  const pending = interviews.filter((i) => i.status === "PENDING");
  const others = interviews.filter((i) => i.status !== "PENDING");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("myInterviewsTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("myInterviewsSubtitle")}</p>
      </div>

      {interviews.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
          {t("noMyInterviews")}
        </p>
      )}

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">{t("needsConfirm")}</h2>
          {pending.map((iv) => (
            <div key={iv.id} className="space-y-2 rounded-xl border border-warning bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/staff/recruit/candidates/${iv.candidate.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                  {iv.candidate.fullName}
                </Link>
                <Badge tone="warning">{t("roundN", { n: iv.round })}</Badge>
                <span className="text-xs text-muted-foreground">
                  {iv.candidate.position.title} · {formatDateTime(iv.scheduledAt)} · {t("minutes", { n: iv.durationMin })}
                  {iv.location ? ` · ${iv.location}` : ""}
                </span>
              </div>
              {iv.candidate.summarySkills && (
                <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{iv.candidate.summarySkills}</p>
              )}
              <RespondForm interviewId={iv.id} />
            </div>
          ))}
        </section>
      )}

      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">{t("upcomingAndDone")}</h2>
          {others.map((iv) => (
            <div key={iv.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4">
              <Link href={`/staff/recruit/candidates/${iv.candidate.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                {iv.candidate.fullName}
              </Link>
              <Badge tone={IV_TONE[iv.status] ?? "neutral"}>{t(`ivStatus${iv.status}`)}</Badge>
              <span className="text-xs text-muted-foreground">
                {t("roundN", { n: iv.round })} · {iv.candidate.position.title} · {formatDateTime(iv.scheduledAt)}
                {iv.location ? ` · ${iv.location}` : ""}
              </span>
              {(iv.status === "CONFIRMED" || iv.status === "DONE") && (
                <a
                  href={`/api/interview-ics/${iv.id}`}
                  className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-xs font-semibold text-foreground hover:bg-surface-2"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("addToCalendar")}
                </a>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
