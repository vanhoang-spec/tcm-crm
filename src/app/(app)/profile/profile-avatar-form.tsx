"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateMyAvatar, removeMyAvatar, type AvatarFormState } from "./actions";

export function ProfileAvatarForm({ hasAvatar }: { hasAvatar: boolean }) {
  const t = useTranslations("profile");
  const [state, formAction, pending] = useActionState<AvatarFormState, FormData>(updateMyAvatar, {});

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="avatar"
          accept="image/jpeg,image/png,image/webp"
          required
          className="text-sm text-foreground file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:text-xs file:font-medium file:text-white hover:file:bg-brand-600"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {pending ? "..." : t("uploadButton")}
        </button>
      </form>
      {hasAvatar && (
        <form action={removeMyAvatar}>
          <button type="submit" className="text-xs text-danger hover:underline">
            {t("removeAvatar")}
          </button>
        </form>
      )}
      <p className="text-xs text-muted-foreground">{t("uploadHint")}</p>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      {state.success && <p className="text-xs text-success">{t("uploadSuccess")}</p>}
    </div>
  );
}
