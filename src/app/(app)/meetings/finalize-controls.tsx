"use client";

import { useTranslations } from "next-intl";
import { finalizeMeeting, reopenMeeting } from "./actions";

/** Chốt biên bản (khoá dòng + việc của tuần này) / Mở lại. Việc tồn vẫn đánh dấu xong được từ tuần sau. */
export function FinalizeControls({ meetingId, finalized }: { meetingId: string; finalized: boolean }) {
  const t = useTranslations("meetings");
  const action = finalized ? reopenMeeting.bind(null, meetingId) : finalizeMeeting.bind(null, meetingId);
  return (
    <form
      action={action}
      className="ml-auto"
      onSubmit={(e) => {
        if (!window.confirm(finalized ? t("confirmReopen") : t("confirmFinalize"))) e.preventDefault();
      }}
    >
      <button type="submit" className="h-8 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
        {finalized ? t("reopen") : t("finalize")}
      </button>
    </form>
  );
}
