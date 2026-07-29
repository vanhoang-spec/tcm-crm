import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { readLessonBlocks } from "@/lib/client-kb";
import { loadKbClient, loadKbLesson, lessonBelongsToAnchor } from "@/lib/client-kb-data";
import { LessonEditor } from "../../../lesson-editor";
import { DeleteLessonButton } from "./delete-lesson-button";
import { GenerateLessonButton } from "../../../ai-panels";

export default async function EditKbLessonPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  await requirePermission("clients.kb.manage");
  const { id, lessonId } = await params;
  const [t, canGenerate, loaded, lesson] = await Promise.all([
    getTranslations("clients.kb"),
    hasPermission("clients.kb.generate"),
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
          <div className="flex flex-wrap items-center gap-2">
            {canGenerate && <GenerateLessonButton clientId={id} lessonId={lessonId} />}
            <DeleteLessonButton clientId={id} lessonId={lessonId} />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("editLessonHint")}</p>
      </div>

      {corrupt && (
        <p className="rounded-xl border border-danger/40 bg-danger-bg p-4 text-sm font-medium text-danger">
          {t("corruptWarning")}
        </p>
      )}

      {/*
        `key` theo mốc sửa cuối là BẮT BUỘC, không phải trang trí. LessonEditor giữ nội dung trong
        useState khởi tạo từ prop; nút "AI viết nội dung bài này" nằm ngay trên trang này và ghi
        thẳng vào DB, nhưng prop mới KHÔNG làm useState chạy lại — khung soạn thảo vẫn hiện nội dung
        CŨ. PIC tưởng AI hỏng, sửa một chữ rồi bấm Lưu là ghi đè ngược lên bài AI vừa viết, mất
        trắng, không cảnh báo. Đổi key thì React tháo component cũ và dựng lại với nội dung mới.
      */}
      <LessonEditor
        key={lesson.updatedAt.toISOString()}
        clientId={id}
        lessonId={lessonId}
        title={lesson.title}
        blocks={blocks}
      />
    </div>
  );
}
