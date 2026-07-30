import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/permissions";
import { parseQuizOptions } from "@/lib/client-kb";
import { loadKbClient, loadQuizForReview } from "@/lib/client-kb-data";

/**
 * XEM ĐỀ KÈM ĐÁP ÁN — chỉ người SOẠN nội dung (`clients.kb.manage`).
 *
 * Lý do trang này tồn tại: từ lúc đáp án bị giấu khỏi người học, đây là kênh DUY NHẤT còn lại để
 * phát hiện câu AI ra sai. Không có nó thì một đáp án sai nằm im vĩnh viễn, cả công ty trượt đúng
 * câu đó và không ai biết vì sao — người học thấy "sai" nhưng không thấy đáp án để phản hồi lại.
 *
 * ⚠ KHÔNG hạ mã quyền xuống `clients.kb.quiz` hay `.view`: trang này in thẳng `correctIndex` ra
 * HTML. Ai vào được đây là làm bài đạt 100% trong 10 giây.
 *
 * Chưa có đường SỬA câu hỏi (cắt khỏi v1). Sai thì bấm "AI ra đề" lại ở trang kho kiến thức.
 */
export default async function KbQuizReviewPage({ params }: { params: Promise<{ id: string; topicId: string }> }) {
  await requirePermission("clients.kb.manage");
  const { id, topicId } = await params;

  const [t, loaded] = await Promise.all([getTranslations("clients.kb"), loadKbClient(id)]);
  if (!loaded) notFound();

  const topic = await prisma.clientKbTopic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, space: { select: { clientId: true, groupId: true } } },
  });
  if (!topic) notFound();
  const inAnchor =
    loaded.anchor.kind === "GROUP" ? topic.space.groupId === loaded.anchor.id : topic.space.clientId === loaded.anchor.id;
  if (!inAnchor) notFound();

  const questions = await loadQuizForReview(topicId);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link
          href={`/clients/${id}/kb`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToKb")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("quizReviewTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{topic.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("quizReviewHint")}</p>
      </div>

      {questions.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">{t("quizEmpty")}</p>
      ) : (
        <ol className="space-y-3">
          {questions.map((q, i) => {
            const options = parseQuizOptions(q.optionsJson);
            return (
              <li key={q.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium text-foreground">
                    {i + 1}. {q.prompt}
                  </p>
                  <Badge tone={q.source === "AI" ? "brand" : "neutral"}>
                    {q.source === "AI" ? t("sourceAi") : t("sourceManual")}
                  </Badge>
                </div>
                <ul className="mt-2 space-y-1">
                  {options.map((opt, idx) => (
                    <li
                      key={idx}
                      className={
                        "flex items-start gap-2 rounded-lg px-2 py-1 text-sm " +
                        (idx === q.correctIndex ? "bg-success-bg font-medium text-foreground" : "text-muted-foreground")
                      }
                    >
                      <span className="mt-0.5 w-4 shrink-0 text-success">
                        {idx === q.correctIndex && <Check className="h-3.5 w-3.5" />}
                      </span>
                      {opt}
                    </li>
                  ))}
                </ul>
                {q.explanation && <p className="mt-2 text-xs text-muted-foreground">{q.explanation}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
