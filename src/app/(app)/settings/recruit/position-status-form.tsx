"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { setPositionStatus, type PositionState } from "./actions";
import { POSITION_STATUSES } from "@/lib/recruit";

/**
 * Đổi trạng thái vị trí: đang tuyển / tạm dừng / đã đóng.
 *
 * CỐ Ý không có nút xoá — xoá vị trí đang có ứng viên là mất dấu vết cả kho hồ sơ đã ứng tuyển vào
 * đó. "Đã đóng" ẩn vị trí khỏi ô chọn khi nhận CV mới, hồ sơ cũ giữ nguyên (mirror ClientGroup).
 */
export function PositionStatusForm({ positionId, status }: { positionId: string; status: string }) {
  const t = useTranslations("settings.recruit");
  const [state, formAction, pending] = useActionState<PositionState, FormData>(setPositionStatus, {});

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="positionId" value={positionId} />
      <span className="text-xs font-medium text-muted-foreground">{t("statusLabel")}</span>
      <select
        name="status"
        defaultValue={status}
        className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        {POSITION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`status${s}`)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-lg border border-border-strong px-3 text-xs font-semibold text-foreground hover:bg-surface-2 disabled:opacity-50"
      >
        {pending ? "..." : t("applyStatus")}
      </button>
      {state.ok && <span className="text-xs text-success">{t("saved")}</span>}
    </form>
  );
}
