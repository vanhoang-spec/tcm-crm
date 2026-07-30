import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { getNumberSetting } from "@/lib/settings";
import {
  DEFAULT_KB_MAX_ATTEMPTS_PER_DAY,
  DEFAULT_KB_PASS_PCT,
  parseQuizOptions,
  shuffleOptions,
} from "@/lib/client-kb";
import { countAttemptsToday, loadKbClient, loadQuizQuestions } from "@/lib/client-kb-data";
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

  const [rows, passPct, maxPerDay, usedToday, canManage, best] = await Promise.all([
    loadQuizQuestions(topicId),
    getNumberSetting("clients", "kb_pass_pct", DEFAULT_KB_PASS_PCT),
    getNumberSetting("clients", "kb_max_attempts_per_day", DEFAULT_KB_MAX_ATTEMPTS_PER_DAY),
    staffId ? countAttemptsToday(topicId, staffId) : Promise.resolve(0),
    hasPermission("clients.kb.manage"),
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
  // Đảo thứ tự HIỂN THỊ mỗi lần tải trang; ô radio vẫn gửi CHỈ SỐ GỐC nên bộ chấm không đổi.
  // Chặn học vẹt vị trí, và làm việc dò đáp án qua nhiều lượt trở nên vô nghĩa.
  const questions = rows.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: shuffleOptions(parseQuizOptions(q.optionsJson)),
  }));
  const attemptsLeft = Math.max(0, Math.round(maxPerDay) - usedToday);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link href={`/clients/${id}/kb`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToKb")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("quizTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{topic.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("quizHint", { pct: Math.round(passPct), max: Math.round(maxPerDay) })}
        </p>
        {canManage && (
          <Link
            href={`/clients/${id}/kb/quiz/${topicId}/review`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
          >
            <Eye className="h-3.5 w-3.5" />
            {t("quizReviewLink")}
          </Link>
        )}
      </div>

      {best && (
        <p className="rounded-xl border border-success/40 bg-success-bg p-3 text-sm text-foreground">
          {t("quizAlreadyPassed", { score: best.score, total: best.total })}
        </p>
      )}

      {questions.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">{t("quizEmpty")}</p>
      ) : attemptsLeft === 0 ? (
        /* Hết lượt HÔM NAY — mai lại làm được, không cần ai mở khoá. Chặn ở cả đây lẫn server. */
        <p className="rounded-xl border border-warning/40 bg-warning-bg p-5 text-sm text-foreground">
          {t("quizOutOfAttempts", { max: Math.round(maxPerDay) })}
        </p>
      ) : (
        <QuizForm clientId={id} topicId={topicId} questions={questions} attemptsLeft={attemptsLeft} />
      )}
    </div>
  );
}
