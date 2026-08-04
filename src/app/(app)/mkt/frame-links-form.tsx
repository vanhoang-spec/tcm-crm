"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveFrameLinks, type MktState } from "./actions";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/**
 * Sửa 2 link thư mục frame ngay tại chỗ (Creative giữ quyền `mkt.frames.manage`).
 *
 * ⚠ Ô nhập là CONTROLLED: React 19 gọi `requestFormReset` sau MỌI lần chạy form action, kể cả khi
 * action trả lỗi — để uncontrolled thì dán sai một URL là mất luôn URL kia vừa gõ.
 */
export function FrameLinksForm({ linkedinUrl, fanpageUrl }: { linkedinUrl: string; fanpageUrl: string }) {
  const t = useTranslations("mkt");
  const [state, formAction, pending] = useActionState<MktState, FormData>(saveFrameLinks, {});
  const [li, setLi] = useState(linkedinUrl);
  const [fp, setFp] = useState(fanpageUrl);

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <label className="block text-[11px] text-muted-foreground">
        {t("framesLinkedin")}
        <input name="linkedinUrl" value={li} onChange={(e) => setLi(e.target.value)} placeholder="https://…" className={input} />
      </label>
      <label className="block text-[11px] text-muted-foreground">
        {t("framesFanpage")}
        <input name="fanpageUrl" value={fp} onChange={(e) => setFp(e.target.value)} placeholder="https://…" className={input} />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : t("save")}
        </button>
        {state.success && <span className="text-[11px] text-success">{t("saved")}</span>}
        {state.error && <span className="text-[11px] text-danger">{t(`err${state.error}` as "errGeneric")}</span>}
      </div>
    </form>
  );
}
