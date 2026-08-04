"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MKT_CHANNELS, MKT_IMAGE_MIME_TYPES } from "@/lib/mkt";
import { createPost, type MktState } from "../actions";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

type Option = { value: string; label: string; sublabel?: string };

export function NewPostForm({ contentTypes, projects }: { contentTypes: Option[]; projects: Option[] }) {
  const t = useTranslations("mkt");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<MktState, FormData>(createPost, {});

  // ⚠ Ô CHỮ phải CONTROLLED: React 19 chạy `requestFormReset` sau MỌI lần gọi action, kể cả khi
  // action TRẢ LỖI. Để uncontrolled thì bỏ quên tick kênh là mất trắng ý chính vừa gõ — mà ý chính
  // chính là thứ tốn công nhất của cả form này.
  const [title, setTitle] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  // Mặc định tick cả hai kênh: đa số bài đăng cả LinkedIn lẫn Fanpage, bỏ bớt dễ hơn nhớ tick thêm.
  const [channels, setChannels] = useState<string[]>([...MKT_CHANNELS]);

  const rejected = state.message?.split(" · ").filter(Boolean) ?? [];
  // Có ảnh bị từ chối thì DỪNG lại cho người dùng đọc, không tự nhảy trang — nếu nhảy luôn họ sẽ
  // không bao giờ biết ảnh nào không vào được.
  if (state.success && state.postId && rejected.length === 0) router.push(`/mkt/${state.postId}`);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] text-muted-foreground sm:col-span-2">
          {t("formTitleLabel")}
          <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
        </label>

        <label className="text-[11px] text-muted-foreground">
          {t("formContentType")}
          <SearchableSelect name="contentTypeId" options={contentTypes} required className="mt-1" />
        </label>

        <label className="text-[11px] text-muted-foreground">
          {t("formProject")}
          <SearchableSelect name="projectId" options={projects} placeholder={t("formProjectPlaceholder")} className="mt-1" />
        </label>

        <label className="text-[11px] text-muted-foreground sm:col-span-2">
          {t("formKeyPoints")}
          <textarea
            name="keyPoints"
            required
            rows={8}
            value={keyPoints}
            onChange={(e) => setKeyPoints(e.target.value)}
            placeholder={"- …\n- …"}
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{t("formKeyPointsHint")}</span>
        </label>
      </div>

      <fieldset>
        <legend className="text-[11px] text-muted-foreground">{t("formChannels")}</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {MKT_CHANNELS.map((ch) => (
            <label key={ch} className="flex items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                name={`channel_${ch}`}
                value="1"
                checked={channels.includes(ch)}
                onChange={(e) => setChannels((prev) => (e.target.checked ? [...prev, ch] : prev.filter((x) => x !== ch)))}
                className="h-4 w-4"
              />
              {t(`channel${ch}` as "channelLINKEDIN")}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] text-muted-foreground">
          {t("formImages")}
          <input
            type="file"
            name="images"
            multiple
            accept={MKT_IMAGE_MIME_TYPES.join(",")}
            className="mt-1 block w-full text-xs text-muted-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
          />
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{t("formImagesHint")}</span>
        </label>

        <label className="text-[11px] text-muted-foreground">
          {t("formDriveUrl")}
          <input name="driveUrl" value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://…" className={input} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : t("create")}
        </button>
        {state.error && <span className="text-xs text-danger">{t(`err${state.error}` as "errGeneric")}</span>}
      </div>

      {rejected.length > 0 && state.success && (
        <div className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-xs text-warning">
          <p>{t("rejectedImages", { names: rejected.join(", ") })}</p>
          {state.postId && (
            <a href={`/mkt/${state.postId}`} className="mt-1 inline-block font-medium underline">
              {t("openPost")}
            </a>
          )}
        </div>
      )}
    </form>
  );
}
