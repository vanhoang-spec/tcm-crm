"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { uploadCandidate, type UploadState } from "./actions";
import { CV_MIME_TYPES, MAX_CV_BYTES } from "@/lib/recruit";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

const ERR_KEY: Record<string, string> = {
  NO_POSITION: "errNoPosition",
  POSITION_CLOSED: "errPositionClosed",
  NO_FILE: "errNoFile",
  FILE_TOO_BIG: "errFileTooBig",
  FILE_TYPE: "errFileType",
  SAVE_FAILED: "errSaveFailed",
};

/**
 * HR nhận CV: chọn vị trí + tải file. Tạo xong là nhảy thẳng vào hồ sơ để bấm "AI đọc CV".
 *
 * Ô tên ứng viên là TUỲ CHỌN — bình thường để trống và để AI điền; gõ tay chỉ khi CV là ảnh scan
 * mà bộ đọc không lấy được chữ.
 */
export function UploadCvForm({ positions }: { positions: { id: string; title: string }[] }) {
  const t = useTranslations("recruit");
  const [state, formAction, pending] = useActionState<UploadState, FormData>(uploadCandidate, {});

  // ⚠ Ô CHỮ phải CONTROLLED: React 19 gọi `requestFormReset` sau MỌI lần chạy action, kể cả khi
  // action TRẢ LỖI — để defaultValue thì tên vừa gõ bị xoá đúng lúc người dùng phải sửa lỗi.
  const [fullName, setFullName] = useState("");
  const [positionId, setPositionId] = useState("");

  // Tạo xong đi thẳng sang hồ sơ vừa tạo — việc điều hướng do SERVER làm (`redirect()` trong
  // `uploadCandidate`), không phải `router.push()` ở đây: gọi router trong lúc render là cập nhật
  // một component khác giữa chừng, React cảnh báo và hành vi không bảo đảm ở chế độ đồng thời.

  if (positions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">{t("noOpenPosition")}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Upload className="h-4 w-4" />
        {t("uploadTitle")}
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("uploadPosition")}</span>
          <select name="positionId" value={positionId} onChange={(e) => setPositionId(e.target.value)} className={input} required>
            <option value="">—</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("uploadFile")}</span>
          <input
            type="file"
            name="cv"
            required
            accept={CV_MIME_TYPES.join(",")}
            className="block w-full text-xs text-muted-foreground file:mr-2 file:h-9 file:rounded-lg file:border file:border-border-strong file:bg-surface-2 file:px-3 file:text-xs file:font-semibold file:text-foreground"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("uploadName")}</span>
          <input name="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : t("uploadSubmit")}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("uploadHint", { mb: Math.round(MAX_CV_BYTES / 1024 / 1024) })}
      </p>
      {state.error && <p className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</p>}
    </form>
  );
}
