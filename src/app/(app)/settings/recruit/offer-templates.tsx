"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, AlertTriangle, Save, ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";
import { saveOfferTemplate, approveOfferTemplate, type OfferState } from "@/app/(app)/staff/recruit/offer-actions";
import { OFFER_VARS } from "@/lib/recruit-offer";

export type OfferTemplateView = {
  deptKey: string;
  label: string;
  body: string;
  approvedAt: string | null;
  isDefault: boolean;
};

const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";

/**
 * Mẫu THƯ MỜI NHẬN VIỆC theo phòng ban (TD-2d).
 *
 * ⚠ Cùng luật với mẫu thư điện tử: lưu là gỡ duyệt, chưa duyệt thì không gửi được.
 * ⚠ Form lưu và form duyệt là HAI form riêng, không lồng nhau (HTML cấm form lồng form).
 */
export function OfferTemplates({ templates }: { templates: OfferTemplateView[] }) {
  const t = useTranslations("recruit.offer");
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("tplTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("tplHint")}</p>
      </div>
      <div className="space-y-2">
        {templates.map((tpl) => (
          <OfferCard key={tpl.deptKey} tpl={tpl} open={open === tpl.deptKey} onToggle={() => setOpen(open === tpl.deptKey ? null : tpl.deptKey)} />
        ))}
      </div>
    </section>
  );
}

function OfferCard({ tpl, open, onToggle }: { tpl: OfferTemplateView; open: boolean; onToggle: () => void }) {
  const t = useTranslations("recruit.offer");
  const tEmail = useTranslations("recruit.email");
  const [saveState, saveAction, saving] = useActionState<OfferState, FormData>(saveOfferTemplate, {});
  const [aprState, aprAction, approving] = useActionState<OfferState, FormData>(approveOfferTemplate, {});
  // Ô CHỮ controlled — React 19 requestFormReset xoá textarea sau mỗi lần action chạy (HANDOVER 10.37).
  const [body, setBody] = useState(tpl.body);

  return (
    <div className={"rounded-xl border bg-surface " + (tpl.approvedAt ? "border-success/40" : "border-border")}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-medium text-foreground">{tpl.isDefault ? t("tplDefault") : tpl.label}</span>
        <span className="ml-auto text-[11px]">
          {tpl.approvedAt ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("tplApproved", { at: tpl.approvedAt })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("tplNotApprovedShort")}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            {tEmail("varsHint")} {OFFER_VARS.map((v) => `{{${v}}}`).join("  ")}
          </p>
          <form action={saveAction} onReset={(e) => e.preventDefault()} className="space-y-2">
            <input type="hidden" name="deptKey" value={tpl.deptKey} />
            <textarea
              name="body"
              rows={16}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg border border-border-strong bg-surface p-2.5 font-mono text-xs leading-relaxed outline-none focus:border-brand-400"
              required
            />
            <button type="submit" disabled={saving} className={btn}>
              <Save className="h-3.5 w-3.5" /> {saving ? "…" : t("tplSave")}
            </button>
          </form>
          {!tpl.approvedAt && (
            <form action={aprAction} className="border-t border-border pt-3">
              <input type="hidden" name="deptKey" value={tpl.deptKey} />
              <button
                type="submit"
                disabled={approving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-success px-4 text-xs font-semibold text-white disabled:opacity-50"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> {approving ? "…" : t("tplApprove")}
              </button>
            </form>
          )}
          {(saveState.error || aprState.error) && <p className="text-xs text-danger">{t("errGeneric")}</p>}
        </div>
      )}
    </div>
  );
}
