"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { submitQuiz, type QuizState } from "../../quiz-actions";

export type QuizQuestion = { id: string; prompt: string; options: string[] };

/**
 * Form làm bài. Chỉ gửi lên CHỈ SỐ phương án đã chọn (`q_<id>` = 0..3); điểm do server tính.
 *
 * Sau khi nộp, form được thay bằng bảng kết quả thay vì cho làm lại tại chỗ: mỗi lần nộp là một
 * lượt được lưu, để nút submit nguyên đó là người dùng bấm nhầm sinh ra lượt trượt thừa.
 */
export function QuizForm({
  clientId,
  topicId,
  questions,
}: {
  clientId: string;
  topicId: string;
  questions: QuizQuestion[];
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
        </div>

        <ul className="space-y-3">
          {r.detail.map((d, i) => (
            <li key={d.questionId} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start gap-2">
                <span className={"mt-0.5 shrink-0 " + (d.ok ? "text-success" : "text-danger")}>
                  {d.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {i + 1}. {d.prompt}
                  </p>
                  {!d.ok && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("quizCorrectIs", { option: questions.find((q) => q.id === d.questionId)?.options[d.correctIndex] ?? "" })}
                    </p>
                  )}
                  {d.explanation && <p className="mt-1 text-xs text-muted-foreground">{d.explanation}</p>}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <a
          href={`/clients/${clientId}/kb/quiz/${topicId}`}
          className="inline-flex h-10 items-center rounded-xl border border-border-strong px-4 text-sm font-medium hover:bg-surface-2"
        >
          {t("quizRetry")}
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl border border-border bg-surface p-4">
          <legend className="px-1 text-sm font-medium text-foreground">
            {i + 1}. {q.prompt}
          </legend>
          <div className="mt-2 space-y-1.5">
            {q.options.map((opt, idx) => (
              <label key={idx} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <input type="radio" name={`q_${q.id}`} value={idx} className="mt-1 shrink-0" />
                <span className="text-sm text-foreground">{opt}</span>
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
