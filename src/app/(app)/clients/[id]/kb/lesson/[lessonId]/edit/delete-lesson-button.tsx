"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { deleteLesson, type KbFormState } from "../../../actions";

export function DeleteLessonButton({ clientId, lessonId }: { clientId: string; lessonId: string }) {
  const t = useTranslations("clients.kb");
  const [state, formAction, pending] = useActionState<KbFormState, FormData>(deleteLesson.bind(null, clientId, lessonId), {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // Xoá cứng, không có đường khôi phục — hỏi lại đúng như 4 nút xoá khác trong repo
        // (kb-panel.tsx, chat, operations-grid).
        if (!window.confirm(t("deleteLessonConfirm"))) e.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-danger/40 px-3 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {pending ? "..." : t("deleteLessonBtn")}
      </button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
