"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, AlertTriangle, Save, ShieldCheck, ShieldOff, ChevronDown, ChevronRight } from "lucide-react";
import { saveEmailTemplate, approveEmailTemplate, unapproveEmailTemplate, type TemplateState } from "@/app/(app)/staff/recruit/email-actions";

export type EmailTemplateView = {
  code: string;
  label: string;
  audience: "CANDIDATE" | "INTERNAL";
  vars: string[];
  subject: string;
  body: string;
  approvedAt: string | null;
  approvedByName: string | null;
};

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";

const ERR: Record<string, string> = { BAD_CODE: "errGeneric", EMPTY: "errTplEmpty" };

/**
 * Mẫu thư gửi ứng viên (TD-2b) — "tạo một lần, duyệt một lần rồi dùng".
 *
 * ⚠ Mỗi mẫu là MỘT form riêng, KHÔNG lồng nhau (HTML cấm form lồng form — HANDOVER 10.39/10.60).
 * ⚠ Form chặn `reset`: React 19 gọi requestFormReset sau mọi lần chạy action kể cả khi trả lỗi, và
 * nó xoá cả textarea đang gõ dở (HANDOVER 10.37).
 */
export function EmailTemplates({ templates, resendConfigured }: { templates: EmailTemplateView[]; resendConfigured: boolean }) {
  const t = useTranslations("recruit.email");
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("tplTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("tplHint")}</p>
      </div>

      {!resendConfigured && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("notConfigured")}</span>
        </p>
      )}

      <div className="space-y-2">
        {templates.map((tpl) => (
          <TemplateCard key={tpl.code} tpl={tpl} open={open === tpl.code} onToggle={() => setOpen(open === tpl.code ? null : tpl.code)} />
        ))}
      </div>
    </section>
  );
}

function TemplateCard({ tpl, open, onToggle }: { tpl: EmailTemplateView; open: boolean; onToggle: () => void }) {
  const t = useTranslations("recruit.email");
  const [saveState, saveAction, saving] = useActionState<TemplateState, FormData>(saveEmailTemplate, {});
  const [aprState, aprAction, approving] = useActionState<TemplateState, FormData>(approveEmailTemplate, {});
  const [unaState, unaAction, unapproving] = useActionState<TemplateState, FormData>(unapproveEmailTemplate, {});
  // Ô CHỮ controlled — xem chú thích requestFormReset ở đầu file.
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);

  const err = [saveState, aprState, unaState].map((s) => (s.error ? t(ERR[s.error] ?? "errGeneric") : null)).find(Boolean);

  return (
    <div className={"rounded-xl border bg-surface " + (tpl.approvedAt ? "border-success/40" : "border-border")}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-medium text-foreground">{tpl.label}</span>
        {tpl.audience === "INTERNAL" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">{t("audienceInternal")}</span>}
        <span className="ml-auto text-[11px]">
          {tpl.approvedAt ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("approvedAt", { at: tpl.approvedAt, name: tpl.approvedByName ?? "—" })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("notApproved")}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            {t("varsHint")} {tpl.vars.map((v) => `{{${v}}}`).join("  ")}
          </p>

          <form action={saveAction} onReset={(e) => e.preventDefault()} className="space-y-2">
            <input type="hidden" name="code" value={tpl.code} />
            <label className="block text-[11px] text-muted-foreground">
              {t("fSubject")}
              <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={input + " mt-1"} required />
            </label>
            <label className="block text-[11px] text-muted-foreground">
              {t("fBody")}
              <textarea
                name="body"
                rows={14}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border-strong bg-surface p-2.5 font-mono text-xs leading-relaxed outline-none focus:border-brand-400"
                required
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={saving} className={btn}>
                <Save className="h-3.5 w-3.5" /> {saving ? "…" : t("saveTpl")}
              </button>
              <span className="text-[11px] text-muted-foreground">{t("saveClearsApproval")}</span>
            </div>
          </form>

          {/* ⚠ Form duyệt / gỡ duyệt đứng NGOÀI form lưu — HTML cấm form lồng form. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {tpl.approvedAt ? (
              <form action={unaAction} className="inline">
                <input type="hidden" name="code" value={tpl.code} />
                <button type="submit" disabled={unapproving} className={btn}>
                  <ShieldOff className="h-3.5 w-3.5" /> {unapproving ? "…" : t("unapprove")}
                </button>
              </form>
            ) : (
              <form action={aprAction} className="inline">
                <input type="hidden" name="code" value={tpl.code} />
                <button
                  type="submit"
                  disabled={approving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-success px-4 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> {approving ? "…" : t("approve")}
                </button>
              </form>
            )}
            <span className="text-[11px] text-muted-foreground">{t("approveHint")}</span>
          </div>

          {err && <p className="text-xs text-danger">{err}</p>}
          {(saveState.success || aprState.success || unaState.success) && <p className="text-xs text-success">{t("saved")}</p>}
        </div>
      )}
    </div>
  );
}
