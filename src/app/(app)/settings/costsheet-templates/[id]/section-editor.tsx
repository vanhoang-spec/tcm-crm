"use client";

import { useState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { deleteSection, moveSection, updateSection, createLine, updateLine, deleteLine } from "../actions";

type SectionData = {
  id: string;
  code: string;
  icon: string;
  nameVi: string;
  nameEn: string;
  colorSlot: string;
  isProxy: boolean;
  proxyFeeType: string | null;
  proxyFeeVal: number | null;
};

type LineData = {
  id: string;
  itemName: string;
  lineType: string;
  defaultQty: number;
  defaultUnit: string;
  defaultUnitPrice: number;
  fixedAmount: number | null;
  percentVal: number | null;
  isLocked: boolean;
  maxMarkupPct: number | null;
};

export function SectionEditor({
  templateId,
  section,
  lines,
  isFirst,
  isLast,
}: {
  templateId: string;
  section: SectionData;
  lines: LineData[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("settings.costsheetTemplates");
  const [isProxy, setIsProxy] = useState(section.isProxy);
  const updateBound = updateSection.bind(null, templateId, section.id);
  const deleteBound = deleteSection.bind(null, templateId, section.id);
  const moveUpBound = moveSection.bind(null, templateId, section.id, "up");
  const moveDownBound = moveSection.bind(null, templateId, section.id, "down");

  return (
    <div className="rounded-xl border border-border bg-surface">
      <form action={updateBound} className="grid grid-cols-1 gap-2 border-b border-border p-3 sm:grid-cols-[60px_1fr_1fr_1fr_auto]">
        <input name="icon" defaultValue={section.icon} placeholder={t("sectionIcon")} className={inputClass} />
        <input name="code" defaultValue={section.code} placeholder={t("sectionCode")} className={inputClass} />
        <input name="nameVi" defaultValue={section.nameVi} placeholder={t("sectionNameVi")} className={inputClass} />
        <input name="nameEn" defaultValue={section.nameEn} placeholder={t("sectionNameEn")} className={inputClass} />
        <div className="flex items-center gap-1">
          <form action={moveUpBound}>
            <button type="submit" disabled={isFirst} className="h-9 w-8 rounded-lg border border-border-strong text-xs hover:bg-surface-2 disabled:opacity-30">{t("moveUp")}</button>
          </form>
          <form action={moveDownBound}>
            <button type="submit" disabled={isLast} className="h-9 w-8 rounded-lg border border-border-strong text-xs hover:bg-surface-2 disabled:opacity-30">{t("moveDown")}</button>
          </form>
          <form action={deleteBound}>
            <button type="submit" className="flex h-9 w-8 items-center justify-center rounded-lg border border-danger/40 text-danger hover:bg-danger-bg">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
        <select name="colorSlot" defaultValue={section.colorSlot} className={inputClass}>
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
            <select name="proxyFeeType" defaultValue={section.proxyFeeType ?? "PCT"} className={inputClass}>
              <option value="PCT">{t("proxyFeePct")}</option>
              <option value="FIXED">{t("proxyFeeFixed")}</option>
            </select>
            <NumberField decimals={2} name="proxyFeeVal" defaultValue={section.proxyFeeVal ?? 0} placeholder={t("proxyFeeVal")} className={inputClass} />
          </>
        )}
        <div className="sm:col-span-5">
          <button type="submit" className="h-8 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">{t("saveSection")}</button>
        </div>
      </form>

      <LinesEditor templateId={templateId} sectionId={section.id} lines={lines} />
    </div>
  );
}

function LinesEditor({ templateId, sectionId, lines }: { templateId: string; sectionId: string; lines: LineData[] }) {
  const t = useTranslations("settings.costsheetTemplates");
  const locale = useLocale() as Locale;
  const createBound = createLine.bind(null, templateId, sectionId);

  return (
    <div className="p-3">
      <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{t("linesTitle")}</h3>
      <div className="space-y-2">
        {lines.map((l) => (
          <LineRow key={l.id} templateId={templateId} line={l} locale={locale} t={t} />
        ))}
        {lines.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
      </div>
      <details className="mt-2 rounded-lg border border-dashed border-border-strong p-2.5">
        <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("addLine")}</summary>
        <LineFields action={createBound} t={t} submitLabel={t("saveLine")} />
      </details>
    </div>
  );
}

function LineRow({ templateId, line, locale, t }: { templateId: string; line: LineData; locale: Locale; t: (k: string) => string }) {
  const updateBound = updateLine.bind(null, templateId, line.id);
  const deleteBound = deleteLine.bind(null, templateId, line.id);
  const amount =
    line.lineType === "FIXED" ? line.fixedAmount ?? 0 : line.lineType === "PERCENT_OF_TOTAL" ? 0 : line.defaultQty * line.defaultUnitPrice;

  return (
    <details className="rounded-lg border border-border p-2.5">
      <summary className="flex cursor-pointer items-center justify-between text-xs">
        <span className="font-medium text-foreground">{line.itemName || "—"}</span>
        <span className="text-muted-foreground">{t(`lineType${lineTypeSuffix(line.lineType)}`)} · {formatNumber(amount, locale)}</span>
      </summary>
      <LineFields action={updateBound} t={t} submitLabel={t("saveLine")} initial={line} deleteAction={deleteBound} />
    </details>
  );
}

function lineTypeSuffix(lineType: string) {
  if (lineType === "FIXED") return "Fixed";
  if (lineType === "PERCENT_OF_TOTAL") return "Percent";
  return "QtyPrice";
}

function LineFields({
  action,
  t,
  submitLabel,
  initial,
  deleteAction,
}: {
  action: (formData: FormData) => void;
  t: (k: string) => string;
  submitLabel: string;
  initial?: LineData;
  deleteAction?: (formData: FormData) => void;
}) {
  const [lineType, setLineType] = useState(initial?.lineType ?? "QTY_PRICE");

  return (
    <form action={action} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <input name="itemName" defaultValue={initial?.itemName} placeholder={t("lineItemName")} className={cn2("sm:col-span-2")} />
      <select name="lineType" value={lineType} onChange={(e) => setLineType(e.target.value)} className={cn2()}>
        <option value="QTY_PRICE">{t("lineTypeQtyPrice")}</option>
        <option value="FIXED">{t("lineTypeFixed")}</option>
        <option value="PERCENT_OF_TOTAL">{t("lineTypePercent")}</option>
      </select>
      {lineType === "QTY_PRICE" && (
        <>
          <NumberField decimals={2} name="defaultQty" defaultValue={initial?.defaultQty ?? 1} placeholder={t("lineDefaultQty")} className={cn2()} />
          <input name="defaultUnit" defaultValue={initial?.defaultUnit} placeholder={t("lineDefaultUnit")} className={cn2()} />
          <NumberField name="defaultUnitPrice" defaultValue={initial?.defaultUnitPrice ?? 0} placeholder={t("lineDefaultUnitPrice")} className={cn2()} />
        </>
      )}
      {lineType === "FIXED" && (
        <NumberField name="fixedAmount" defaultValue={initial?.fixedAmount ?? 0} placeholder={t("lineFixedAmount")} className={cn2()} />
      )}
      {lineType === "PERCENT_OF_TOTAL" && (
        <NumberField decimals={2} name="percentVal" defaultValue={initial?.percentVal ?? 0} placeholder={t("linePercentVal")} className={cn2()} />
      )}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="isLocked" defaultChecked={initial?.isLocked} className="h-3.5 w-3.5 rounded border-border-strong" />
        {t("lineLocked")}
      </label>
      <NumberField name="maxMarkupPct" defaultValue={initial?.maxMarkupPct ?? ""} placeholder={t("lineMaxMarkup")} className={cn2()} />
      <div className="flex items-center gap-2 sm:col-span-3">
        <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">{submitLabel}</button>
        {deleteAction && (
          <form action={deleteAction}>
            <button type="submit" className="h-8 rounded-lg border border-danger/40 px-3 text-xs font-medium text-danger hover:bg-danger-bg">
              {t("removeLine")}
            </button>
          </form>
        )}
      </div>
    </form>
  );
}

function cn2(extra?: string) {
  return `h-8 w-full rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 ${extra ?? ""}`;
}

const inputClass = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
