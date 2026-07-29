"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { generateLessonContent, generateOutline, generateQuiz } from "./ai-actions";
import type { KbFormState } from "./actions";

const btnAi =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-brand-400 px-3 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50";

/**
 * Ba nút gọi AI. Tách khỏi `manage-panels.tsx` vì chúng gác bằng mã quyền KHÁC
 * (`clients.kb.generate`) — trang chỉ render khi người xem có mã đó.
 *
 * Mọi nút đều hỏi lại: một lượt gọi tốn tiền thật và mất tới 90s, bấm nhầm không rút lại được.
 */

function AiButton({
  action,
  label,
  confirm,
  running,
}: {
  action: (prev: KbFormState, fd: FormData) => Promise<KbFormState>;
  label: string;
  confirm: string;
  running: string;
}) {
  const t = useTranslations("clients.kb");
  const [state, formAction, pending] = useActionState<KbFormState, FormData>(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex flex-wrap items-center gap-2"
    >
      <button type="submit" disabled={pending} className={btnAi}>
        <Sparkles className="h-3.5 w-3.5" />
        {pending ? running : label}
      </button>
      {state.error && <span className="text-xs font-medium text-danger">{state.error}</span>}
      {state.success && <span className="text-xs font-medium text-success">{t("aiDone")}</span>}
    </form>
  );
}

export function GenerateOutlineButton({ clientId }: { clientId: string }) {
  const t = useTranslations("clients.kb");
  return (
    <AiButton
      action={generateOutline.bind(null, clientId)}
      label={t("aiOutlineBtn")}
      confirm={t("aiOutlineConfirm")}
      running={t("aiRunning")}
    />
  );
}

export function GenerateLessonButton({ clientId, lessonId }: { clientId: string; lessonId: string }) {
  const t = useTranslations("clients.kb");
  return (
    <AiButton
      action={generateLessonContent.bind(null, clientId, lessonId)}
      label={t("aiLessonBtn")}
      confirm={t("aiLessonConfirm")}
      running={t("aiRunning")}
    />
  );
}

export function GenerateQuizButton({ clientId, topicId }: { clientId: string; topicId: string }) {
  const t = useTranslations("clients.kb");
  return (
    <AiButton
      action={generateQuiz.bind(null, clientId, topicId)}
      label={t("aiQuizBtn")}
      confirm={t("aiQuizConfirm")}
      running={t("aiRunning")}
    />
  );
}
