"use client";

import { useActionState, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { RFQ_TEMPLATES } from "@/lib/rfq-templates";
import { saveProductionSharing, type SharingFormState } from "./actions";

export type SharingVendor = { id: string; code: string; name: string; groupCodes: string[] };

/**
 * Tick nhóm hàng + NCC mà phòng Sản xuất được dùng chung với Thu mua.
 *
 * ⚠ Danh sách NCC lọc theo nhóm ĐANG TICK để khỏi phải cuộn qua 27 NCC không liên quan. NCC đã tick
 * nhưng nhóm của nó vừa bị bỏ tick thì VẪN HIỆN (mục "đã chọn nhưng ngoài nhóm") — không thì người
 * dùng vô tình bỏ tick nhóm là mất luôn danh sách NCC đã chọn mà không biết.
 *
 * ⚠ Ô chữ/checkbox giữ trong state React và form chặn reset (bẫy `requestFormReset` của React 19 —
 * HANDOVER mục 10.37: nó reset cả checkbox kể cả khi controlled).
 */
export function SharingForm({
  vendors,
  initialGroups,
  initialVendors,
}: {
  vendors: SharingVendor[];
  initialGroups: string[];
  initialVendors: string[];
}) {
  const t = useTranslations("settings.productionSharing");
  const locale = useLocale();
  const [state, action, pending] = useActionState<SharingFormState, FormData>(saveProductionSharing, {});
  const [groups, setGroups] = useState<Set<string>>(new Set(initialGroups));
  const [picked, setPicked] = useState<Set<string>>(new Set(initialVendors));

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  };

  const inGroup = vendors.filter((v) => v.groupCodes.some((g) => groups.has(g)));
  const outsideButPicked = vendors.filter((v) => picked.has(v.id) && !inGroup.some((x) => x.id === v.id));

  return (
    <form action={action} onReset={(e) => e.preventDefault()} className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-foreground">{t("groupsTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("groupsHint")}</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RFQ_TEMPLATES.map((tpl) => (
            <label key={tpl.code} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 hover:bg-surface-2">
              <input
                type="checkbox"
                name="group"
                value={tpl.code}
                checked={groups.has(tpl.code)}
                onChange={() => toggle(groups, tpl.code, setGroups)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{locale === "en" ? tpl.labelEn : tpl.labelVi}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{locale === "en" ? tpl.descEn : tpl.descVi}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">{t("vendorsTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("vendorsHint")}</p>

        {inGroup.length === 0 && outsideButPicked.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{t("noVendorForGroups")}</p>
        ) : (
          <div className="mt-3 space-y-1">
            {inGroup.map((v) => (
              <VendorRow key={v.id} v={v} checked={picked.has(v.id)} onToggle={() => toggle(picked, v.id, setPicked)} />
            ))}
            {outsideButPicked.length > 0 && (
              <>
                <p className="pt-3 text-[11px] font-medium text-warning">{t("pickedOutsideGroups")}</p>
                {outsideButPicked.map((v) => (
                  <VendorRow key={v.id} v={v} checked onToggle={() => toggle(picked, v.id, setPicked)} />
                ))}
              </>
            )}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("save")}
        </button>
        <span className="text-xs text-muted-foreground">{t("summary", { groups: groups.size, vendors: picked.size })}</span>
        {state.ok && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            {t("saved")}
          </span>
        )}
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

function VendorRow({ v, checked, onToggle }: { v: SharingVendor; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
      <input type="checkbox" name="vendor" value={v.id} checked={checked} onChange={onToggle} />
      <span className="font-mono text-[11px] text-muted-foreground">{v.code}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{v.name}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{v.groupCodes.length}</span>
    </label>
  );
}
