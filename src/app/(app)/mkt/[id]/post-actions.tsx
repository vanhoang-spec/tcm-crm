"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2, X } from "lucide-react";
import { deletePost, deleteImage, type MktState } from "../actions";

/** Xoá cả bài — chỉ hiện khi chưa kênh nào đăng (server cũng chặn lại bằng errLOCKED). */
export function DeletePostButton({ postId }: { postId: string }) {
  const t = useTranslations("mkt");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<MktState, FormData>(deletePost.bind(null, postId), {});

  if (state.success) router.push("/mkt");

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(t("deleteConfirm"))) e.preventDefault();
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/40 px-2.5 text-xs text-danger hover:bg-danger-bg disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {pending ? "..." : t("deletePost")}
      </button>
      {state.error && <span className="ml-2 text-[11px] text-danger">{t(`err${state.error}` as "errGeneric")}</span>}
    </form>
  );
}

export function DeleteImageButton({ postId, imageId }: { postId: string; imageId: string }) {
  const t = useTranslations("mkt");
  const [, formAction, pending] = useActionState<MktState, FormData>(deleteImage.bind(null, postId, imageId), {});

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(t("deleteImageConfirm"))) e.preventDefault();
      }}
      className="absolute right-1 top-1"
    >
      <button
        type="submit"
        disabled={pending}
        title={t("deleteImage")}
        className="rounded-md bg-surface/90 p-1 text-danger opacity-0 transition-opacity hover:bg-surface group-hover:opacity-100 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
