"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, FileDown, Copy, Check } from "lucide-react";
import type { MinutesParseState, PackState } from "./actions";

export type ParsedMinutes = NonNullable<MinutesParseState["parsed"]>;

const ERR_KEY: Record<string, string> = {
  NOT_FOUND: "errNotFound",
  NO_ACCESS: "errNoAccess",
  BAD_WEEK: "errBadWeek",
  NO_AI_PERM: "errNoAiPerm",
  AI_NOT_CONFIGURED: "errAiNotConfigured",
  NO_INPUT: "errNoInput",
  TOO_BIG: "errTooBig",
  BAD_TYPE: "errBadType",
  CANNOT_READ: "errCannotRead",
  AI_FAILED: "errAiFailed",
  AI_TOO_LONG: "errAiTooLong",
  AI_BAD_SHAPE: "errAiBadShape",
};

/**
 * ⚠ Panel này phải nằm NGOÀI <form> chính của biên bản — HTML cấm form lồng form (đã vấp: React ném
 * "A React form was unexpectedly submitted" và hydration error).
 * ⚠ `useActionState` của AI/gói họp nằm ở COMPONENT CHA (MeetingForm), không ở đây: áp kết quả AI là
 * setState của cha, mà "điều chỉnh state lúc render" chỉ hợp lệ khi setState là của CHÍNH component đang
 * render — gọi setState của cha lúc render con gây "Too many re-renders" (đã vấp).
 *
 * Hai chiều đồng bộ với Claude Project:
 *  ← "Nhập biên bản": dán/tải biên bản Claude xuất ra → AI bóc → TRẢ VỀ FORM để duyệt (không ghi thẳng DB).
 *  → "Xuất gói họp tuần": markdown để dán vào Claude Project trước buổi họp.
 * ⚠ Hộp xác nhận nói rõ nội dung biên bản đi ra DeepSeek (chuẩn CV / kho kiến thức / báo giá NCC).
 */
export function ImportMinutesPanel({
  teamId,
  weekKey,
  canWrite,
  canAi,
  aiState,
  aiAction,
  aiPending,
  packState,
  packAction,
  packPending,
}: {
  teamId: string;
  weekKey: string;
  canWrite: boolean;
  canAi: boolean;
  aiState: MinutesParseState;
  aiAction: (formData: FormData) => void;
  aiPending: boolean;
  packState: PackState;
  packAction: (formData: FormData) => void;
  packPending: boolean;
}) {
  const t = useTranslations("meetings");
  const [minutes, setMinutes] = useState("");
  const [open, setOpen] = useState<"none" | "import" | "pack">("none");
  const [copied, setCopied] = useState(false);

  const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2";

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold text-foreground">{t("syncTitle")}</h2>
        <button type="button" onClick={() => setOpen(open === "pack" ? "none" : "pack")} className={btn}>
          <FileDown className="h-3.5 w-3.5" /> {t("exportPack")}
        </button>
        {canWrite && (
          <button type="button" onClick={() => setOpen(open === "import" ? "none" : "import")} className={btn}>
            <Sparkles className="h-3.5 w-3.5" /> {t("importMinutes")}
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("syncHint")}</p>

      {open === "pack" && (
        <form action={packAction} className="mt-3 space-y-2">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="weekKey" value={weekKey} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={packPending} className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {packPending ? "..." : t("buildPack")}
            </button>
            {packState.markdown && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(packState.markdown!);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  }}
                  className={btn}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? t("copied") : t("copy")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = URL.createObjectURL(new Blob([packState.markdown!], { type: "text/markdown;charset=utf-8" }));
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `hop-tuan-${weekKey}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className={btn}
                >
                  {t("downloadMd")}
                </button>
              </>
            )}
            {packState.error && <span className="text-xs text-danger">{t(ERR_KEY[packState.error] ?? "errGeneric")}</span>}
          </div>
          {packState.markdown && (
            <textarea readOnly value={packState.markdown} rows={12} className="w-full rounded-lg border border-border-strong bg-surface-2 px-2 py-1.5 font-mono text-[11px]" />
          )}
        </form>
      )}

      {open === "import" && canWrite && (
        <form
          action={aiAction}
          onSubmit={(e) => {
            if (!window.confirm(t("confirmAi"))) e.preventDefault();
          }}
          onReset={(e) => e.preventDefault()}
          className="mt-3 space-y-2"
        >
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="weekKey" value={weekKey} />
          <textarea
            name="minutes"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            rows={6}
            placeholder={t("minutesPlaceholder")}
            className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" name="file" accept=".html,.htm,.md,.txt,.pdf,.docx,text/html,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="text-xs" />
            <button type="submit" disabled={aiPending || !canAi} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              <Sparkles className="h-3.5 w-3.5" /> {aiPending ? t("aiRunning") : t("runAi")}
            </button>
            {!canAi && <span className="text-xs text-muted-foreground">{t("errNoAiPerm")}</span>}
            {aiState.error && <span className="text-xs text-danger">{t(ERR_KEY[aiState.error] ?? "errGeneric")}{aiState.errorDetail ? ` (${aiState.errorDetail})` : ""}</span>}
          </div>
          <p className="text-[11px] text-muted-foreground">{t("aiFileHint")}</p>

          {aiState.parsed && (
            <div className="rounded-lg border border-border bg-surface-2 p-2 text-[11px]">
              <p className="font-medium text-foreground">
                {t("aiResult", { rows: aiState.parsed.rows.length, actions: aiState.parsed.actions.length })}
                {aiState.parsed.truncated ? ` · ${t("aiTruncated")}` : ""}
              </p>
              {aiState.parsed.unmatched.length > 0 && (
                <div className="mt-1">
                  <p className="font-medium text-warning">{t("aiUnmatched", { n: aiState.parsed.unmatched.length })}</p>
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {aiState.parsed.unmatched.map((u, i) => (
                      <li key={i}>{u.label}{u.update ? ` — ${u.update}` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiState.parsed.actions.some((a) => !a.assigneeStaffId) && (
                <p className="mt-1 text-warning">{t("aiNoAssignee", { n: aiState.parsed.actions.filter((a) => !a.assigneeStaffId).length })}</p>
              )}
            </div>
          )}
        </form>
      )}
    </section>
  );
}
