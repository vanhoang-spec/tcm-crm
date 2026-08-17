"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { updateMyDates, type DatesFormState } from "./actions";

const inputClass =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/**
 * Nhân sự tự bổ sung ngày sinh / ngày đi làm đầu tiên — CHỈ hiện ô cho ngày còn trống; ngày đã có
 * hiển thị chỉ-đọc ở card bên trên (sửa thì HR làm ở /settings/staff). Server cũng chỉ ghi ô còn trống.
 */
export function ProfileDatesForm({ needDob, needFirstWorkDate }: { needDob: boolean; needFirstWorkDate: boolean }) {
  const t = useTranslations("profile");
  const [state, formAction, pending] = useActionState<DatesFormState, FormData>(updateMyDates, {});
  // Ô CHỮ controlled — React 19 requestFormReset chạy sau MỌI lần gọi action, kể cả khi trả lỗi.
  const [dob, setDob] = useState("");
  const [first, setFirst] = useState("");

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {needDob && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("dob")}</span>
            <input name="dateOfBirth" value={dob} onChange={(e) => setDob(e.target.value)} placeholder="DD/MM/YYYY" pattern="\d{2}/\d{2}/\d{4}" className={inputClass} />
          </label>
        )}
        {needFirstWorkDate && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("firstWorkDate")}</span>
            <input name="firstWorkDate" value={first} onChange={(e) => setFirst(e.target.value)} placeholder="DD/MM/YYYY" pattern="\d{2}/\d{2}/\d{4}" className={inputClass} />
          </label>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {pending ? "..." : t("saveDates")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{t("datesSaved")}</span>}
      </div>
    </form>
  );
}
