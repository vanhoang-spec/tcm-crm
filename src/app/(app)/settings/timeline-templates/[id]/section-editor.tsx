"use client";

import { useTranslations } from "next-intl";
import {
  updateTimelineSection,
  deleteTimelineSection,
  moveTimelineSection,
  createTimelineTemplateItem,
  updateTimelineTemplateItem,
  deleteTimelineTemplateItem,
} from "../actions";

type DeptOpt = { code: string; name: string };
type ItemData = {
  id: string;
  title: string;
  parentLabel: string;
  defaultDepartmentCode: string;
  defaultDurationDays: number | null;
  defaultUnit: string;
  defaultQty: number | null;
};

const input =
  "h-8 w-full rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function TimelineSectionEditor({
  templateId,
  section,
  items,
  departments,
  isFirst,
  isLast,
}: {
  templateId: string;
  section: { id: string; code: string; nameVi: string; nameEn: string };
  items: ItemData[];
  departments: DeptOpt[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("settings.timelineTemplates");

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {/* Section fields */}
      <div className="flex flex-wrap items-end gap-2">
        <form action={updateTimelineSection.bind(null, templateId, section.id)} className="flex flex-1 flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            {t("sectionCode")}
            <input name="code" defaultValue={section.code} className={input + " w-28"} />
          </label>
          <label className="min-w-[140px] flex-1 text-xs text-muted-foreground">
            {t("sectionNameVi")}
            <input name="nameVi" defaultValue={section.nameVi} className={input} required />
          </label>
          <label className="min-w-[140px] flex-1 text-xs text-muted-foreground">
            {t("sectionNameEn")}
            <input name="nameEn" defaultValue={section.nameEn} className={input} />
          </label>
          <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
            {t("saveSection")}
          </button>
        </form>
        <div className="flex items-center gap-1">
          {!isFirst && (
            <form action={moveTimelineSection.bind(null, templateId, section.id, "up")}>
              <button className="h-8 rounded-lg border border-border-strong px-2 text-xs text-muted-foreground hover:bg-surface-2">{t("moveUp")}</button>
            </form>
          )}
          {!isLast && (
            <form action={moveTimelineSection.bind(null, templateId, section.id, "down")}>
              <button className="h-8 rounded-lg border border-border-strong px-2 text-xs text-muted-foreground hover:bg-surface-2">{t("moveDown")}</button>
            </form>
          )}
          <form action={deleteTimelineSection.bind(null, templateId, section.id)}>
            <button className="h-8 rounded-lg border border-danger/40 px-2 text-xs text-danger hover:bg-danger-bg">{t("removeSection")}</button>
          </form>
        </div>
      </div>

      {/* Items */}
      <div className="mt-3 space-y-2 border-l-2 border-border pl-3">
        <p className="text-xs font-medium text-muted-foreground">{t("itemsTitle")}</p>
        {items.map((it) => (
          <form
            key={it.id}
            action={updateTimelineTemplateItem.bind(null, templateId, it.id)}
            className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface-2/40 p-2"
          >
            <label className="min-w-[140px] flex-1 text-[11px] text-muted-foreground">
              {t("itemTitle")}
              <input name="title" defaultValue={it.title} className={input} required />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t("itemParentLabel")}
              <input name="parentLabel" defaultValue={it.parentLabel} className={input + " w-32"} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t("itemDept")}
              <select name="defaultDepartmentCode" defaultValue={it.defaultDepartmentCode} className={input + " w-28"}>
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.code} value={d.code}>{d.code}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t("itemDuration")}
              <input name="defaultDurationDays" type="number" defaultValue={it.defaultDurationDays ?? ""} className={input + " w-16"} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t("itemQty")}
              <input name="defaultQty" type="number" step="any" defaultValue={it.defaultQty ?? ""} className={input + " w-16"} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t("itemUnit")}
              <input name="defaultUnit" defaultValue={it.defaultUnit} className={input + " w-16"} />
            </label>
            <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
              {t("saveItem")}
            </button>
            <button
              type="submit"
              formAction={deleteTimelineTemplateItem.bind(null, templateId, it.id)}
              className="h-8 rounded-lg border border-danger/40 px-2 text-xs text-danger hover:bg-danger-bg"
            >
              {t("removeItem")}
            </button>
          </form>
        ))}

        {/* Add item */}
        <details className="rounded-lg border border-dashed border-border-strong p-2">
          <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("addItem")}</summary>
          <form action={createTimelineTemplateItem.bind(null, templateId, section.id)} className="mt-2 flex flex-wrap items-end gap-2">
            <input name="title" placeholder={t("itemTitle")} className={input + " min-w-[140px] flex-1"} required />
            <input name="parentLabel" placeholder={t("itemParentLabel")} className={input + " w-32"} />
            <select name="defaultDepartmentCode" className={input + " w-28"} defaultValue="">
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>{d.code}</option>
              ))}
            </select>
            <input name="defaultDurationDays" type="number" placeholder={t("itemDuration")} className={input + " w-20"} />
            <input name="defaultQty" type="number" step="any" placeholder={t("itemQty")} className={input + " w-16"} />
            <input name="defaultUnit" placeholder={t("itemUnit")} className={input + " w-16"} />
            <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
              {t("addItem")}
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}
