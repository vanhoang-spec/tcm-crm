import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck, FileText, ListChecks } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { countPublished, isUsableQuestion, parseLessonBlocks } from "@/lib/client-kb";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { countHiddenClientSpace, loadKbClient, loadKbSpaceView } from "@/lib/client-kb-data";
import { CreateLessonForm, CreateTopicForm, GeneralNoteForm, PublishToggle, TopicHeaderActions, UploadSourceForm } from "./manage-panels";
import { SourceList } from "./source-list";
import { GenerateOutlineButton, GenerateQuizButton } from "./ai-panels";

/**
 * KHO KIẾN THỨC THEO KHÁCH — khung ĐỒNG NHẤT cho mọi khách, chỉ dữ liệu khác nhau:
 * (a) thông tin chung · (b) tài liệu nguồn (brand guideline, brief) · (c) bài học chia theo chủ đề.
 *
 * Khách thuộc nhóm thì đọc/ghi vào kho CỦA NHÓM — mở trang của bất kỳ pháp nhân nào trong nhóm
 * AEON đều thấy cùng một nội dung. Khối quản trị chỉ render khi có `clients.kb.manage`; bản nháp
 * được lọc ngay ở tầng truy vấn nên không lọt xuống payload của người chỉ được xem.
 */
export default async function ClientKbPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("clients.kb.view");
  const { id } = await params;
  const [t, canManage, canGenerate, canQuiz, canCompliance, staffId, loaded] = await Promise.all([
    getTranslations("clients.kb"),
    hasPermission("clients.kb.manage"),
    hasPermission("clients.kb.generate"),
    hasPermission("clients.kb.quiz"),
    hasPermission("clients.kb.compliance"),
    getCurrentStaffId(),
    loadKbClient(id),
  ]);
  if (!loaded) notFound();

  const [view, hidden] = await Promise.all([
    loadKbSpaceView(loaded.anchor, canManage),
    // Khách đang neo theo NHÓM mà trước đó từng có kho riêng: kho cũ vẫn nằm trong DB nhưng không
    // màn hình nào mở tới. Không nói ra thì đây đọc y hệt "mất dữ liệu" với người đã nạp nó.
    loaded.anchor.kind === "GROUP" ? countHiddenClientSpace(loaded.client.id) : Promise.resolve(null),
  ]);
  const topics = view?.topics ?? [];
  const sources = view?.sources ?? [];

  // Chủ đề nào NGƯỜI ĐANG XEM đã đạt — chỉ để hiện nhãn, không chặn gì (cảnh báo mềm).
  const passedTopicIds = new Set(
    staffId && topics.length
      ? (
          await prisma.clientKbAttempt.findMany({
            where: { staffId, passed: true, topicId: { in: topics.map((x) => x.id) } },
            select: { topicId: true },
            distinct: ["topicId"],
          })
        ).map((a) => a.topicId)
      : [],
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href={`/clients/${id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToClient")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          {loaded.anchor.kind === "GROUP" ? (
            <Badge tone="brand">{t("scopeGroup", { name: loaded.anchorName })}</Badge>
          ) : (
            <Badge tone="neutral">{t("scopeClient", { name: loaded.anchorName })}</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {loaded.anchor.kind === "GROUP" ? t("scopeGroupHint") : t("scopeClientHint")}
        </p>
        {canCompliance && (
          <Link
            href={`/clients/${id}/kb/compliance`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            {t("complianceLink")}
          </Link>
        )}
      </div>

      {hidden && (
        <p className="rounded-xl border border-warning/40 bg-warning-bg p-4 text-sm text-foreground">
          {t("hiddenOwnSpace", { client: loaded.client.name, topics: hidden.topics, sources: hidden.sources })}
        </p>
      )}

      {/* (a) Thông tin chung */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("generalTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("generalHint")}</p>
        {canManage ? (
          <GeneralNoteForm clientId={id} value={view?.space.generalNote ?? null} />
        ) : view?.space.generalNote ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{view.space.generalNote}</p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t("generalEmpty")}</p>
        )}
      </section>

      {/* (b) Tài liệu nguồn */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("sourcesTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("sourcesHint")}</p>
        <SourceList
          clientId={id}
          canManage={canManage}
          sources={sources.map((s) => ({
            id: s.id,
            kind: s.kind,
            fileName: s.fileName,
            fileSize: s.fileSize,
            note: s.note,
            uploadedByName: s.uploadedBy?.fullName ?? null,
            uploadedAt: formatDate(s.createdAt),
          }))}
        />
        {canManage && <UploadSourceForm clientId={id} />}
      </section>

      {/* (c) Bài học theo chủ đề */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("topicsTitle")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("topicsHint")}</p>
        </div>
        {canManage && <CreateTopicForm clientId={id} />}

        {topics.length === 0 && (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
            <p className="text-sm text-muted-foreground">{t("topicsEmpty")}</p>
            {/* Dựng dàn bài CHỈ hiện khi kho còn trống — chạy lại trên kho đã có nội dung sẽ đẻ
                chủ đề trùng. Server cũng chặn lần nữa (errorOutlineNotEmpty). */}
            {canGenerate && <GenerateOutlineButton clientId={id} />}
          </div>
        )}

        {topics.map((topic) => {
          const { published, total } = countPublished(topic.lessons);
          const usableQuestions = topic.questions.filter(isUsableQuestion).length;
          return (
            <div key={topic.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{topic.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {canManage ? t("lessonCountManage", { published, total }) : t("lessonCount", { count: total })}
                  </p>
                </div>
                {canManage && <TopicHeaderActions clientId={id} topicId={topic.id} name={topic.name} />}
              </div>

              {/* Bài kiểm tra của chủ đề */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {usableQuestions > 0 && canQuiz && (
                  <Link
                    href={`/clients/${id}/kb/quiz/${topic.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2"
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    {t("quizOpen", { count: usableQuestions })}
                  </Link>
                )}
                {usableQuestions > 0 && passedTopicIds.has(topic.id) && (
                  <Badge tone="success">{t("statusPass")}</Badge>
                )}
                {canGenerate && published > 0 && <GenerateQuizButton clientId={id} topicId={topic.id} />}
              </div>

              {topic.lessons.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("lessonsEmpty")}</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {topic.lessons.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                      <Link
                        href={`/clients/${id}/kb/lesson/${l.id}`}
                        className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground hover:text-brand-600"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{l.title}</span>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatDate(l.updatedAt)}</span>
                        {canManage && parseLessonBlocks(l.blocksJson).length === 0 && (
                          <Badge tone="neutral">{t("lessonEmptyBadge")}</Badge>
                        )}
                        {l.status === "DRAFT" && <Badge tone="warning">{t("statusDraft")}</Badge>}
                        {canManage && (
                          <>
                            <Link
                              href={`/clients/${id}/kb/lesson/${l.id}/edit`}
                              className="text-xs font-medium text-brand-600 hover:underline"
                            >
                              {t("editLessonBtn")}
                            </Link>
                            <PublishToggle clientId={id} lessonId={l.id} published={l.status === "PUBLISHED"} />
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {canManage && <CreateLessonForm clientId={id} topicId={topic.id} />}
            </div>
          );
        })}
      </section>
    </div>
  );
}
