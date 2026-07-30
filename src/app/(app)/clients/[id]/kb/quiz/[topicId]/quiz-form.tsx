"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { submitQuiz, type QuizState } from "../../quiz-actions";

/**
 * `options` đã được ĐẢO THỨ TỰ ở server. `originalIndex` là chỉ số trong `optionsJson` gốc và
 * chính là thứ ô radio gửi lên — bộ chấm so với `correctIndex` trong DB nên không cần biết gì về
 * việc đảo. Gửi chỉ số HIỂN THỊ là chấm sai toàn bộ.
 */
export type QuizQuestion = {
  id: string;
  prompt: string;
  options: { text: string; originalIndex: number }[];
};

/**
 * Form làm bài. Chỉ gửi lên chỉ số phương án gốc; điểm do server tính.
 *
 * ⚠ Màn kết quả CỐ Ý không hiện đáp án đúng và không hiện giải thích — chỉ hiện đúng/sai từng câu
 * để người học biết quay lại đọc bài nào. Hiện đáp án rồi cho làm lại là đường tắt đạt 100% mà
 * không mở bài nào; số lượt mỗi ngày cũng có trần vì cùng lý do.
 */
export function QuizForm({
  clientId,
  topicId,
  questions,
  attemptsLeft,
}: {
  clientId: string;
  topicId: string;
  questions: QuizQuestion[];
  attemptsLeft: number;
}) {
  const t = useTranslations("clients.kb");
  const [state, formAction, pending] = useActionState<QuizState, FormData>(
    submitQuiz.bind(null, clientId, topicId),
    {},
  );

  if (state.result) {
    const r = state.result;
    return (
      <div className="space-y-4">
        <div
          className={
            "rounded-xl border p-5 " +
            (r.passed ? "border-success/40 bg-success-bg" : "border-warning/40 bg-warning-bg")
          }
        >
          <p className="text-lg font-bold text-foreground">
            {t("quizScore", { score: r.score, total: r.total, pct: r.pct })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {r.passed ? t("quizPassed", { pct: r.passPct }) : t("quizFailed", { pct: r.passPct })}
          </p>
          {!r.passed && (
            <p className="mt-2 text-sm text-foreground">
              {r.attemptsLeftToday > 0
                ? t("quizReviewThenRetry", { left: r.attemptsLeftToday })
                : t("quizNoAttemptsLeftToday")}
            </p>
          )}
        </div>

        <ul className="space-y-2">
          {r.detail.map((d, i) => (
            <li key={d.questionId} className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3">
              <span className={"mt-0.5 shrink-0 " + (d.ok ? "text-success" : "text-danger")}>
                {d.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </span>
              <p className="min-w-0 text-sm text-foreground">
                {i + 1}. {d.prompt}
              </p>
            </li>
          ))}
        </ul>

        {!r.passed && r.attemptsLeftToday > 0 && (
          <a
            href={`/clients/${clientId}/kb/quiz/${topicId}`}
            className="inline-flex h-10 items-center rounded-xl border border-border-strong px-4 text-sm font-medium hover:bg-surface-2"
          >
            {t("quizRetry")}
          </a>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("quizAttemptsLeft", { left: attemptsLeft })}</p>

      {questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl border border-border bg-surface p-4">
          <legend className="px-1 text-sm font-medium text-foreground">
            {i + 1}. {q.prompt}
          </legend>
          <div className="mt-2 space-y-1.5">
            {q.options.map((opt) => (
              <label
                key={opt.originalIndex}
                className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2"
              >
                <input type="radio" name={`q_${q.id}`} value={opt.originalIndex} className="mt-1 shrink-0" />
                <span className="text-sm text-foreground">{opt.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-10"
        >
          {pending ? "..." : t("quizSubmit")}
        </button>
        {state.error && <span className="text-xs font-medium text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
