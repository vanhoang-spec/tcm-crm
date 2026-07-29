import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { getNumberSetting } from "@/lib/settings";
import { DEFAULT_KB_PASS_PCT, parseQuizOptions } from "@/lib/client-kb";
import { loadKbClient, loadQuizQuestions } from "@/lib/client-kb-data";
import { QuizForm } from "./quiz-form";

/**
 * Trang LÀM BÀI kiểm tra của một chủ đề.
 *
 * ⚠ Dùng `loadQuizQuestions` — hàm này KHÔNG select `correctIndex`, nên đáp án không nằm trong
 * payload gửi xuống trình duyệt. Chấm điểm chạy ở `submitQuiz` phía server. Đừng "tối ưu" bằng
 * cách nạp cả câu hỏi lẫn đáp án rồi so ở client: bấm F12 là xong bài.
 */
export default async function KbQuizPage({ params }: { params: Promise<{ id: string; topicId: string }> }) {
  await requirePermission("clients.kb.quiz");
  const { id, topicId } = await params;

  const [t, loaded, staffId] = await Promise.all([
    getTranslations("clients.kb"),
    loadKbClient(id),
    getCurrentStaffId(),
  ]);
  if (!loaded) notFound();

  const topic = await prisma.clientKbTopic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, space: { select: { clientId: true, groupId: true } } },
  });
  if (!topic) notFound();
  const inAnchor =
    loaded.anchor.kind === "GROUP" ? topic.space.groupId === loaded.anchor.id : topic.space.clientId === loaded.anchor.id;
  if (!inAnchor) notFound();

  const [rows, passPct, best] = await Promise.all([
    loadQuizQuestions(topicId),
    getNumberSetting("clients", "kb_pass_pct", DEFAULT_KB_PASS_PCT),
    staffId
      ? prisma.clientKbAttempt.findFirst({
          where: { topicId, staffId, passed: true },
          orderBy: { createdAt: "desc" },
          select: { score: true, total: true, createdAt: true },
        })
      : null,
  ]);

  // Câu hỏng khuôn đã bị loại TRONG loadQuizQuestions — cùng một hàm lọc với lúc chấm điểm, nên số
  // câu hiện ra luôn bằng mẫu số chấm. Ở đây chỉ còn việc đổi optionsJson thành mảng.
  const questions = rows.map((q) => ({ id: q.id, prompt: q.prompt, options: parseQuizOptions(q.optionsJson) }));

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link href={`/clients/${id}/kb`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToKb")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("quizTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{topic.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("quizHint", { pct: Math.round(passPct) })}</p>
      </div>

      {best && (
        <p className="rounded-xl border border-success/40 bg-success-bg p-3 text-sm text-foreground">
          {t("quizAlreadyPassed", { score: best.score, total: best.total })}
        </p>
      )}

      {questions.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">{t("quizEmpty")}</p>
      ) : (
        <QuizForm clientId={id} topicId={topicId} questions={questions} />
      )}
    </div>
  );
}
