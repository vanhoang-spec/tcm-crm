import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { parseLessonBlocks } from "@/lib/client-kb";
import { loadKbClient, loadKbLesson, lessonBelongsToAnchor } from "@/lib/client-kb-data";
import { LessonBlocks } from "../../lesson-blocks";

export default async function KbLessonPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  await requirePermission("clients.kb.view");
  const { id, lessonId } = await params;
  const [t, locale, canManage, loaded, lesson] = await Promise.all([
    getTranslations("clients.kb"),
    getLocale() as Promise<Locale>,
    hasPermission("clients.kb.manage"),
    loadKbClient(id),
    loadKbLesson(lessonId),
  ]);

  // Bài phải thuộc đúng kho của khách đang mở — không có bước này thì đoán id là đọc chéo được.
  if (!loaded || !lesson || !lessonBelongsToAnchor(lesson, loaded.anchor)) notFound();
  // Bản nháp chỉ người soạn nội dung mới xem được.
  if (lesson.status !== "PUBLISHED" && !canManage) notFound();

  const blocks = parseLessonBlocks(lesson.blocksJson);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link href={`/clients/${id}/kb`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToKb")}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{lesson.topic.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{lesson.title}</h1>
            {lesson.status === "DRAFT" && <Badge tone="warning">{t("statusDraft")}</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("lastUpdated", {
              time: formatDateTime(lesson.updatedAt, locale),
              who: lesson.updatedBy?.fullName ?? "—",
            })}
          </p>
        </div>
        {canManage && (
          <LinkButton href={`/clients/${id}/kb/lesson/${lessonId}/edit`} variant="secondary" size="sm">
            <Pencil className="h-3.5 w-3.5" />
            {t("editLessonBtn")}
          </LinkButton>
        )}
      </div>

      <article className="rounded-xl border border-border bg-surface p-5">
        {blocks.length === 0 ? <p className="text-sm text-muted-foreground">{t("lessonEmpty")}</p> : <LessonBlocks blocks={blocks} />}
      </article>
    </div>
  );
}
