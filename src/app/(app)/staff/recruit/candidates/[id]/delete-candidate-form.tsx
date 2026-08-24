"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2, AlertTriangle } from "lucide-react";
import { deleteCandidate, type DecideState } from "../../actions";

const ERR: Record<string, string> = {
  NOT_FOUND: "delErrNotFound",
  HAS_INTERVIEWS: "delErrHasInterviews",
  HAS_OFFER: "delErrHasOffer",
};

/**
 * XOÁ VĨNH VIỄN một hồ sơ ứng viên — dùng khi tải nhầm CV hoặc nhầm người (yêu cầu chủ dự án
 * 24/08/2026).
 *
 * ⚠ Hàm `deleteCandidate` có từ TD-1 nhưng CHƯA TỪNG có nút nào gọi — tức là code chết cho tới đợt
 * này. Nếu gỡ nút đi thì nhớ gỡ luôn cả action, đừng để lại code chết lần nữa.
 *
 * ⚠ Nút CỐ Ý đặt ở cuối trang chi tiết, KHÔNG đặt ở bảng danh sách: ở danh sách thì một cú bấm nhầm
 * dòng là mất hồ sơ của người khác, còn ở đây người bấm đã nhìn thấy toàn bộ hồ sơ mình sắp xoá.
 * ⚠ Bắt gõ ĐÚNG HỌ TÊN mới mở nút — `window.confirm` một dòng là quá nhẹ cho một hành động xoá cả
 * bản ghi lẫn file CV trên đĩa và không có đường hoàn tác.
 */
export function DeleteCandidateForm({ candidateId, fullName, blocked }: { candidateId: string; fullName: string; blocked: "HAS_INTERVIEWS" | "HAS_OFFER" | null }) {
  const t = useTranslations("recruit");
  const [state, formAction, pending] = useActionState<DecideState, FormData>(deleteCandidate, {});
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  const nameMatches = typed.trim().toLowerCase() === fullName.trim().toLowerCase();

  return (
    <section className="rounded-xl border border-danger/30 bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Trash2 className="h-4 w-4 text-danger" />
        <h2 className="text-sm font-semibold text-danger">{t("delTitle")}</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("delHint")}</p>

      {blocked ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t(ERR[blocked] as "delErrHasInterviews")}
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-danger/40 px-3 text-xs font-medium text-danger hover:bg-danger-bg"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t("delOpen")}
        </button>
      ) : (
        // ⚠ Form chặn `reset`: React 19 gọi requestFormReset sau mỗi lần action chạy kể cả khi trả
        // lỗi, và nó xoá ô chữ đang gõ (HANDOVER 10.37).
        <form action={formAction} onReset={(e) => e.preventDefault()} className="mt-2 space-y-2">
          <input type="hidden" name="candidateId" value={candidateId} />
          <p className="text-xs text-danger">{t("delWarning")}</p>
          <label className="block text-[11px] text-muted-foreground">
            {t("delTypeName", { name: fullName })}
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 h-9 w-full max-w-sm rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-danger"
              autoComplete="off"
            />
          </label>
          <label className="block text-[11px] text-muted-foreground">
            {t("delReason")}
            <input
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 h-9 w-full max-w-sm rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-danger"
              placeholder={t("delReasonPh")}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending || !nameMatches}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> {pending ? "…" : t("delConfirm")}
            </button>
            <button type="button" onClick={() => { setOpen(false); setTyped(""); }} className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
              {t("delCancel")}
            </button>
          </div>
        </form>
      )}

      {state.error && <p className="mt-2 text-xs text-danger">{t(ERR[state.error] ?? "errGeneric")}</p>}
    </section>
  );
}
