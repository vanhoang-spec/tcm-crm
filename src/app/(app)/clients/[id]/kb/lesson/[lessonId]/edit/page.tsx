import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/permissions";
import { readLessonBlocks } from "@/lib/client-kb";
import { loadKbClient, loadKbLesson, lessonBelongsToAnchor } from "@/lib/client-kb-data";
import { LessonEditor } from "../../../lesson-editor";
import { DeleteLessonButton } from "./delete-lesson-button";

export default async function EditKbLessonPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  await requirePermission("clients.kb.manage");
  const { id, lessonId } = await params;
  const [t, loaded, lesson] = await Promise.all([
    getTranslations("clients.kb"),
    loadKbClient(id),
    loadKbLesson(lessonId),
  ]);
  if (!loaded || !lesson || !lessonBelongsToAnchor(lesson, loaded.anchor)) notFound();

  const { blocks, corrupt } = readLessonBlocks(lesson.blocksJson);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link
          href={`/clients/${id}/kb/lesson/${lessonId}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToLesson")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("editLessonTitle")}</h1>
          <DeleteLessonButton clientId={id} lessonId={lessonId} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("editLessonHint")}</p>
      </div>

      {corrupt && (
        <p className="rounded-xl border border-danger/40 bg-danger-bg p-4 text-sm font-medium text-danger">
          {t("corruptWarning")}
        </p>
      )}

      <LessonEditor clientId={id} lessonId={lessonId} title={lesson.title} blocks={blocks} />
    </div>
  );
}
