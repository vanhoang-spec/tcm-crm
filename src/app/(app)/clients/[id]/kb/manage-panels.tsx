"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Trash2, X } from "lucide-react";
import {
  createLesson,
  createTopic,
  deleteSource,
  deleteTopic,
  renameTopic,
  saveGeneralNote,
  setLessonStatus,
  uploadSource,
  type KbFormState,
} from "./actions";
import { CLIENT_KB_MIME_TYPES, KB_SOURCE_KINDS, MAX_CLIENT_KB_FILE_BYTES } from "@/lib/client-kb";

const input =
  "h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:h-9";
const btn = "h-11 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9";
const btnGhost = "h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";

/** Nhãn loại tài liệu — map TƯỜNG MINH, không ghép `t(\`kind${x}\`)` vì script kiểm i18n không bắt được khoá ghép lúc chạy. */
function useSourceKindLabel() {
  const t = useTranslations("clients.kb");
  return (kind: string) => {
    switch (kind) {
      case "BRAND_GUIDELINE":
        return t("kindBrandGuideline");
      case "BRIEF":
        return t("kindBrief");
      case "OTHER":
        return t("kindOther");
      default:
        return kind;
    }
  };
}

export function GeneralNoteForm({ clientId, value }: { clientId: string; value: string | null }) {
  const t = useTranslations("clients.kb");
  const [state, formAction, pending] = useActionState<KbFormState, FormData>(saveGeneralNote.bind(null, clientId), {});
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <textarea
        name="generalNote"
        defaultValue={value ?? ""}
        rows={4}
        placeholder={t("generalNotePlaceholder")}
        className="w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btn}>
          {pending ? "..." : t("saveBtn")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

export function CreateTopicForm({ clientId }: { clientId: string }) {
  const t = useTranslations("clients.kb");
  const [state, formAction, pending] = useActionState<KbFormState, FormData>(createTopic.bind(null, clientId), {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input name="name" required placeholder={t("topicNamePlaceholder")} className={input + " min-w-0 flex-1"} />
      <button type="submit" disabled={pending} className={btn}>
        {pending ? "..." : t("addTopicBtn")}
      </button>
      {state.error && <span className="w-full text-xs text-danger">{state.error}</span>}
    </form>
  );
}

export function TopicHeaderActions({ clientId, topicId, name }: { clientId: string; topicId: string; name: string }) {
  const t = useTranslations("clients.kb");
  const [editing, setEditing] = useState(false);
  const [renameState, renameAction, renaming] = useActionState<KbFormState, FormData>(
    renameTopic.bind(null, clientId, topicId),
    {},
  );
  const [delState, delAction, deleting] = useActionState<KbFormState, FormData>(deleteTopic.bind(null, clientId, topicId), {});

  if (editing) {
    return (
      <form action={renameAction} className="flex flex-wrap items-center gap-2">
        <input name="name" defaultValue={name} required className={input + " min-w-0 flex-1"} />
        <button type="submit" disabled={renaming} className={btn}>
          {renaming ? "..." : t("saveBtn")}
        </button>
        <button type="button" onClick={() => setEditing(false)} aria-label={t("cancelBtn")} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
          <X className="h-4 w-4" />
        </button>
        {renameState.error && <span className="w-full text-xs text-danger">{renameState.error}</span>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => setEditing(true)} aria-label={t("renameTopicBtn")} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <form
        action={delAction}
        onSubmit={(e) => {
          if (!window.confirm(t("deleteTopicConfirm"))) e.preventDefault();
        }}
      >
        <button type="submit" disabled={deleting} aria-label={t("deleteTopicBtn")} className="rounded-lg p-2 text-muted-foreground hover:bg-danger-bg hover:text-danger">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </form>
      {delState.error && <span className="text-xs text-danger">{delState.error}</span>}
    </div>
  );
}

export function CreateLessonForm({ clientId, topicId }: { clientId: string; topicId: string }) {
  const t = useTranslations("clients.kb");
  const [state, formAction, pending] = useActionState<KbFormState, FormData>(createLesson.bind(null, clientId, topicId), {});
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input name="title" required placeholder={t("lessonTitlePlaceholder")} className={input + " min-w-0 flex-1"} />
      <button type="submit" disabled={pending} className={btnGhost}>
        {pending ? "..." : t("addLessonBtn")}
      </button>
      {state.error && <span className="w-full text-xs text-danger">{state.error}</span>}
    </form>
  );
}

export function PublishToggle({ clientId, lessonId, published }: { clientId: string; lessonId: string; published: boolean }) {
  const t = useTranslations("clients.kb");
  const [state, formAction, pending] = useActionState<KbFormState, FormData>(
    setLessonStatus.bind(null, clientId, lessonId, !published),
    {},
  );
  return (
    <form action={formAction} className="inline">
      <button type="submit" disabled={pending} className={btnGhost}>
        {pending ? "..." : published ? t("unpublishBtn") : t("publishBtn")}
      </button>
      {state.error && <span className="ml-2 text-xs text-danger">{state.error}</span>}
    </form>
  );
}

export function UploadSourceForm({ clientId }: { clientId: string }) {
  const t = useTranslations("clients.kb");
  const [state, formAction, pending] = useActionState<KbFormState, FormData>(uploadSource.bind(null, clientId), {});
  const [localError, setLocalError] = useState<string | null>(null);
  const label = useSourceKindLabel();
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // Chặn TẠI MÁY trước khi đẩy lên: file vượt trần body của Next (30MB, next.config.ts) bị
        // chặn ở tầng framework và trả 413 TRƯỚC khi action chạy — người dùng thấy trang vỡ chứ
        // không thấy câu "Tệp vượt quá 25MB" đã dịch sẵn. Guard server vẫn giữ nguyên, đây chỉ là
        // lớp báo sớm.
        const f = (e.currentTarget.elements.namedItem("file") as HTMLInputElement | null)?.files?.[0];
        if (f && f.size > MAX_CLIENT_KB_FILE_BYTES) {
          e.preventDefault();
          setLocalError(t("errorFileTooBig"));
          return;
        }
        setLocalError(null);
      }}
      className="mt-3 flex flex-wrap items-end gap-2"
    >
      <label className="space-y-1 text-xs text-muted-foreground">
        {t("sourceKind")}
        <select name="kind" className={input + " w-full"}>
          {KB_SOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
        {t("sourceFile")}
        <input type="file" name="file" required accept={CLIENT_KB_MIME_TYPES.join(",")} className={input + " w-full py-1.5"} />
      </label>
      <label className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
        {t("sourceNote")}
        <input name="note" className={input + " w-full"} />
      </label>
      <button type="submit" disabled={pending} className={btn}>
        {pending ? "..." : t("uploadBtn")}
      </button>
      {(localError ?? state.error) && (
        <span className="w-full text-xs font-medium text-danger">{localError ?? state.error}</span>
      )}
    </form>
  );
}

export function DeleteSourceButton({ clientId, sourceId }: { clientId: string; sourceId: string }) {
  const t = useTranslations("clients.kb");
  const [state, formAction, pending] = useActionState<KbFormState, FormData>(deleteSource.bind(null, clientId, sourceId), {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // Xoá dòng KÈM xoá file gốc khỏi đĩa — brand guideline/brief của khách không có bản sao nào khác.
        if (!window.confirm(t("deleteSourceConfirm"))) e.preventDefault();
      }}
      className="inline"
    >
      <button type="submit" disabled={pending} aria-label={t("deleteSourceBtn")} className="rounded-lg p-2 text-muted-foreground hover:bg-danger-bg hover:text-danger">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {state.error && <span className="ml-2 text-xs text-danger">{state.error}</span>}
    </form>
  );
}

export { useSourceKindLabel };
