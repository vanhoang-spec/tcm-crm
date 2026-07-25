"use client";

import { useState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { createSection } from "../actions";

export function SectionCreateForm({ templateId }: { templateId: string }) {
  const bound = createSection.bind(null, templateId);
  const t = useTranslations("settings.costsheetTemplates");
  const [isProxy, setIsProxy] = useState(false);

  return (
    <details className="rounded-xl border border-dashed border-border-strong bg-surface p-4">
      <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("addSection")}</summary>
      <form action={bound} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input name="code" placeholder={t("sectionCode")} className={inputClass} />
        <input name="icon" placeholder={t("sectionIcon")} className={inputClass} />
        <input name="nameVi" placeholder={t("sectionNameVi")} className={inputClass} />
        <input name="nameEn" placeholder={t("sectionNameEn")} className={inputClass} />
        <select name="colorSlot" defaultValue="neutral" className={inputClass}>
          <option value="brand">{t("colorBrand")}</option>
          <option value="success">{t("colorSuccess")}</option>
          <option value="warning">{t("colorWarning")}</option>
          <option value="danger">{t("colorDanger")}</option>
          <option value="neutral">{t("colorNeutral")}</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isProxy" checked={isProxy} onChange={(e) => setIsProxy(e.target.checked)} className="h-3.5 w-3.5 rounded border-border-strong" />
          {t("isProxySection")}
        </label>
        {isProxy && (
          <>
            <select name="proxyFeeType" defaultValue="PCT" className={inputClass}>
              <option value="PCT">{t("proxyFeePct")}</option>
              <option value="FIXED">{t("proxyFeeFixed")}</option>
            </select>
            <NumberField decimals={2} name="proxyFeeVal" placeholder={t("proxyFeeVal")} className={inputClass} />
          </>
        )}
        <div className="sm:col-span-2">
          <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-medium text-white hover:bg-brand-600">
            {t("saveSection")}
          </button>
        </div>
      </form>
    </details>
  );
}

const inputClass = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
