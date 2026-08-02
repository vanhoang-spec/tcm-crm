"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FolderOpen } from "lucide-react";
import { saveIsoFolderUrl, type IsoFormState } from "./actions";

/** Cột "Link Hồ sơ" của sheet HS ISO — thư mục chứa toàn bộ hồ sơ dự án (SharePoint/Drive). */
export function IsoFolderForm({
  projectId,
  isoFolderUrl,
  canManage,
}: {
  projectId: string;
  isoFolderUrl: string | null;
  canManage: boolean;
}) {
  const t = useTranslations("projects.iso");
  const action = saveIsoFolderUrl.bind(null, projectId);
  const [state, formAction, pending] = useActionState<IsoFormState, FormData>(action, {});

  if (!canManage) {
    return (
      <p className="text-xs text-muted-foreground">
        <FolderOpen className="mr-1 inline h-3.5 w-3.5" />
        {isoFolderUrl ? (
          <a href={isoFolderUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
            {isoFolderUrl}
          </a>
        ) : (
          t("folderEmpty")
        )}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <FolderOpen className="h-3 w-3" />
          {t("folderLabel")}
        </span>
        <input
          name="isoFolderUrl"
          defaultValue={isoFolderUrl ?? ""}
          placeholder={t("folderPlaceholder")}
          className="mt-1 h-9 w-full min-w-[22rem] rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:w-[32rem]"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-lg border border-border-strong px-3 text-xs text-foreground hover:bg-surface-2 disabled:opacity-50"
      >
        {pending ? "..." : t("save")}
      </button>
      {state.success && <span className="text-[11px] text-success">{t("saved")}</span>}
    </form>
  );
}
