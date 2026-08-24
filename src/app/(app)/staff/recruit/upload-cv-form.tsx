"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, Link2, CheckCircle2, AlertTriangle } from "lucide-react";
import { uploadCandidate, type UploadState } from "./actions";
import { CV_MIME_TYPES, MAX_CV_BYTES, MAX_CV_UPLOAD, MAX_CV_TOTAL_BYTES } from "@/lib/recruit";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

const ERR_KEY: Record<string, string> = {
  NO_POSITION: "errNoPosition",
  POSITION_CLOSED: "errPositionClosed",
  NO_FILE: "errNoFile",
  FILE_TOO_BIG: "errFileTooBig",
  FILE_TYPE: "errFileType",
  TOO_MANY_FILES: "errTooManyCv",
  TOTAL_TOO_BIG: "errCvTotalTooBig",
  SAVE_FAILED: "errSaveFailed",
  WEB_BAD_URL: "errWebBadUrl",
  WEB_BLOCKED_HOST: "errWebBlockedHost",
  WEB_TOO_MANY_REDIRECTS: "errWebRedirect",
  WEB_HTTP_ERROR: "errWebHttp",
  WEB_BAD_CONTENT: "errWebContent",
  WEB_TOO_LARGE: "errWebTooLarge",
  WEB_TIMEOUT: "errWebTimeout",
  WEB_EMPTY: "errWebEmpty",
};

/**
 * HR nhận CV: chọn vị trí + tải LÊN TỚI `MAX_CV_UPLOAD` file một lượt, và/hoặc dán MỘT link web
 * (portfolio — dân thiết kế hay gửi link thay vì file).
 *
 * Ô tên ứng viên là TUỲ CHỌN và chỉ có nghĩa khi nhận ĐÚNG MỘT nguồn: nhiều file thì một cái tên
 * không thể đúng cho tất cả, nên ô này tự khoá lại. App tự đọc tên/email/điện thoại từ từng CV.
 */
export function UploadCvForm({ positions }: { positions: { id: string; title: string }[] }) {
  const t = useTranslations("recruit");
  const [state, formAction, pending] = useActionState<UploadState, FormData>(uploadCandidate, {});

  // ⚠ Ô CHỮ phải CONTROLLED: React 19 gọi `requestFormReset` sau MỌI lần chạy action, kể cả khi
  // action TRẢ LỖI — để defaultValue thì thứ vừa gõ bị xoá đúng lúc người dùng phải sửa lỗi.
  const [fullName, setFullName] = useState("");
  const [positionId, setPositionId] = useState("");
  const [cvUrl, setCvUrl] = useState("");
  const [fileCount, setFileCount] = useState(0);

  // Nhận nhiều nguồn thì ô tên gõ tay vô nghĩa — khoá lại thay vì để người dùng gõ rồi bị bỏ qua.
  const multi = fileCount + (cvUrl.trim() ? 1 : 0) > 1;

  // Tạo xong đi thẳng sang hồ sơ (một nguồn) hoặc về danh sách (nhiều nguồn) — việc điều hướng do
  // SERVER làm (`redirect()` trong `uploadCandidate`), không phải `router.push()` ở đây: gọi router
  // trong lúc render là cập nhật một component khác giữa chừng, hành vi không bảo đảm.

  if (positions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">{t("noOpenPosition")}</p>
      </div>
    );
  }

  return (
    // ⚠ Chặn `reset`: React 19 bắn sự kiện reset sau mỗi lần action chạy, và nó xoá cả
    // <select>/checkbox KỂ CẢ khi controlled (HANDOVER 10.37).
    <form action={formAction} onReset={(e) => e.preventDefault()} className="space-y-3 rounded-xl border border-border bg-surface p-4">
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
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("uploadFile")}
            {fileCount > 0 && <span className="ml-1 font-semibold text-brand-700">({t("uploadPicked", { n: fileCount, max: MAX_CV_UPLOAD })})</span>}
          </span>
          <input
            type="file"
            name="cv"
            multiple
            accept={CV_MIME_TYPES.join(",")}
            onChange={(e) => setFileCount(e.target.files?.length ?? 0)}
            className="block w-full text-xs text-muted-foreground file:mr-2 file:h-9 file:rounded-lg file:border file:border-border-strong file:bg-surface-2 file:px-3 file:text-xs file:font-semibold file:text-foreground"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("uploadName")}</span>
          <input
            name="fullName"
            value={multi ? "" : fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={multi}
            placeholder={multi ? t("uploadNameMulti") : ""}
            className={input + (multi ? " opacity-50" : "")}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : t("uploadSubmit")}
        </button>
      </div>

      <label className="block">
        <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          {t("uploadUrl")}
        </span>
        <input
          name="cvUrl"
          type="url"
          value={cvUrl}
          onChange={(e) => setCvUrl(e.target.value)}
          placeholder="https://..."
          className={input}
        />
        <span className="mt-1 block text-[11px] text-muted-foreground">{t("uploadUrlHint")}</span>
      </label>

      <p className="text-xs text-muted-foreground">
        {t("uploadHintMulti", {
          max: MAX_CV_UPLOAD,
          mb: Math.round(MAX_CV_BYTES / 1024 / 1024),
          totalMb: Math.round(MAX_CV_TOTAL_BYTES / 1024 / 1024),
        })}
      </p>
      <p className="text-[11px] text-muted-foreground">{t("uploadScanHint")}</p>

      {state.error && <p className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</p>}

      {/* Bảng kết quả chỉ hiện khi CÓ nguồn hỏng — mọi nguồn thành công thì server đã điều hướng đi. */}
      {state.rows && state.rows.length > 0 && (
        <div className="space-y-1 rounded-lg border border-border bg-surface-2 p-2">
          {state.rows.map((r, i) => (
            <div key={`${r.source}-${i}`} className="flex items-start gap-2 text-xs">
              {r.ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
              )}
              <span className="min-w-0 flex-1 break-all">
                <span className="font-medium text-foreground">{r.source}</span>
                {r.ok ? (
                  <span className="text-muted-foreground">
                    {" — "}
                    {r.guessed?.fullName ?? t("intakeNoName")}
                    {r.guessed?.email ? ` · ${r.guessed.email}` : ""}
                    {r.guessed?.phone ? ` · ${r.guessed.phone}` : ""}
                  </span>
                ) : (
                  <span className="text-danger">{" — " + t(ERR_KEY[r.detail] ?? "errGeneric")}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
