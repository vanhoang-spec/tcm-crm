"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import { RFQ_TEMPLATES, suggestRfqTemplate, type RfqTemplateCode } from "@/lib/rfq-templates";
import type { Locale } from "@/i18n/locales";
import { createRfq, type RfqFormState } from "../actions";

export type NewRfqLine = {
  stableKey: string;
  sectionCode: string;
  sectionName: string;
  itemName: string;
  specs: string | null;
  unit: string | null;
  quantity: number;
  refUnitPrice: number;
  isProxy: boolean;
};
export type NewRfqVendor = { id: string; name: string; code: string; groupCodes: string[] };

const input = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const ERR_KEY: Record<string, string> = {
  NO_PROJECT: "errNoProject",
  NO_LINES: "errNoLines",
  NO_TEMPLATE: "errNoTemplate",
  NO_VENDORS: "errNoVendors",
  NO_TITLE: "errNoTitle",
  NOT_FOUND: "errNotFound",
};

export function RfqNewForm({
  projectId,
  taskId,
  taskTitle,
  lines,
  vendors,
  suggestedTemplate,
  locale,
}: {
  projectId: string;
  taskId: string | null;
  taskTitle: string | null;
  lines: NewRfqLine[];
  vendors: NewRfqVendor[];
  suggestedTemplate: RfqTemplateCode | null;
  locale: Locale;
}) {
  const t = useTranslations("purchasing.rfq");
  const [state, formAction, pending] = useActionState<RfqFormState, FormData>(createRfq, {});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState<RfqTemplateCode | "">(suggestedTemplate ?? "");
  const [showAll, setShowAll] = useState(false);
  const [title, setTitle] = useState(taskTitle ?? "");
  const [note, setNote] = useState("");

  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  /** Tick/bỏ tick CẢ hạng mục trong MỘT lần setState — gọi toggle từng dòng sẽ so với snapshot cũ và lệch. */
  const setMany = (keys: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const k of keys) on ? n.add(k) : n.delete(k);
      return n;
    });
  const liveSuggest = useMemo(() => {
    const names = lines.filter((l) => selected.has(l.stableKey)).map((l) => l.itemName);
    return names.length ? suggestRfqTemplate(names) : null;
  }, [selected, lines]);
  const tpl = RFQ_TEMPLATES.find((x) => x.code === template) ?? null;
  const visibleVendors = showAll || !template ? vendors : vendors.filter((v) => v.groupCodes.includes(template));
  const gLabel = (code: string) => {
    const x = RFQ_TEMPLATES.find((tp) => tp.code === code);
    return x ? (locale === "en" ? x.labelEn : x.labelVi) : code;
  };

  // Gom dòng theo hạng mục để tick theo cụm
  const bySection = useMemo(() => {
    const m = new Map<string, { code: string; name: string; lines: NewRfqLine[] }>();
    for (const l of lines) {
      const k = l.sectionCode + "|" + l.sectionName;
      if (!m.has(k)) m.set(k, { code: l.sectionCode, name: l.sectionName, lines: [] });
      m.get(k)!.lines.push(l);
    }
    return [...m.values()];
  }, [lines]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      {taskId && <input type="hidden" name="departmentTaskId" value={taskId} />}
      {[...selected].map((k) => (
        <input key={k} type="hidden" name="lineKey" value={k} />
      ))}

      {/* 1. Dòng CO */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("linesTitle")}</h2>
          <span className="text-xs text-muted-foreground">{t("selectedCount", { n: selected.size })}</span>
        </div>
        <div className="mt-2 overflow-x-auto overflow-y-auto max-h-[50vh]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs text-muted-foreground">
                <th className="w-8 py-2" />
                <th className="py-2 pr-3">{t("colLine")}</th>
                <th className="py-2 pr-3">{t("colSpecs")}</th>
                <th className="py-2 pr-3 text-right">{t("colQty")}</th>
                <th className="py-2 pr-3">{t("colUnit")}</th>
                <th className="py-2 pr-3 text-right">{t("colRefPrice")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bySection.map((sec) => (
                <SectionRows key={sec.code + sec.name} sec={sec} selected={selected} toggle={toggle} setMany={setMany} locale={locale} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Mẫu form */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("templateTitle")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("templateSuggested")}
          {liveSuggest && liveSuggest !== template && (
            <button type="button" onClick={() => setTemplate(liveSuggest)} className="ml-2 text-brand-600 hover:underline">
              → {gLabel(liveSuggest)}
            </button>
          )}
        </p>
        <input type="hidden" name="groupCode" value={template} />
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {RFQ_TEMPLATES.map((x) => (
            <button
              key={x.code}
              type="button"
              onClick={() => setTemplate(x.code)}
              className={
                "rounded-lg border p-2.5 text-left text-xs hover:bg-surface-2 " + (template === x.code ? "border-brand-400 bg-brand-50" : "border-border")
              }
            >
              <p className="font-medium text-foreground">{locale === "en" ? x.labelEn : x.labelVi}</p>
              <p className="mt-0.5 text-muted-foreground">{locale === "en" ? x.descEn : x.descVi}</p>
            </button>
          ))}
        </div>
      </section>

      {/* 3. NCC */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("vendorsTitle")}</h2>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-3.5 w-3.5" />
            {t("showAllVendors")}
          </label>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("vendorsHint")}</p>
        {visibleVendors.length === 0 ? (
          <p className="mt-2 text-xs text-warning">{t("vendorsEmpty")}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {visibleVendors.map((v) => (
              <label key={v.id} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50">
                <input type="checkbox" name="vendorId" value={v.id} className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{v.name}</span>
                <span className="font-mono text-muted-foreground">{v.code}</span>
                {v.groupCodes.filter((g) => g !== template).slice(0, 2).map((g) => (
                  <Badge key={g} tone="neutral">
                    {gLabel(g)}
                  </Badge>
                ))}
              </label>
            ))}
          </div>
        )}
      </section>

      {/* 4. Thông tin chung */}
      <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("rfqTitleLabel")}</span>
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} className={input} placeholder={t("rfqTitlePlaceholder")} required />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[200px_1fr]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("deadlineLabel")}</span>
            <DateField name="deadline" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("noteLabel")}</span>
            <input name="note" value={note} onChange={(e) => setNote(e.target.value)} className={input} placeholder={t("notePlaceholder")} />
          </label>
        </div>
        {tpl && (
          <p className="text-[11px] text-muted-foreground">
            {locale === "en" ? tpl.unitPriceLabelEn : tpl.unitPriceLabelVi} · {tpl.lineColumns.map((c) => (locale === "en" ? c.labelEn : c.labelVi)).join(" · ")}
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          <button type="submit" disabled={pending || selected.size === 0 || !template} className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {pending ? "..." : t("createBtn")}
          </button>
          {state.error && <span className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</span>}
        </div>
      </section>
    </form>
  );
}

function SectionRows({
  sec,
  selected,
  toggle,
  setMany,
  locale,
}: {
  sec: { code: string; name: string; lines: NewRfqLine[] };
  selected: Set<string>;
  toggle: (k: string) => void;
  setMany: (keys: string[], on: boolean) => void;
  locale: Locale;
}) {
  const allOn = sec.lines.every((l) => selected.has(l.stableKey));
  return (
    <>
      <tr className="bg-surface-2/50">
        <td className="py-1.5 pl-1">
          <input
            type="checkbox"
            checked={allOn}
            onChange={() => setMany(sec.lines.map((l) => l.stableKey), !allOn)}
            className="h-3.5 w-3.5"
            title="chọn cả hạng mục"
          />
        </td>
        <td colSpan={5} className="py-1.5 pr-3 text-xs font-semibold text-foreground">
          {sec.code} · {sec.name}
          {sec.lines[0]?.isProxy && <span className="ml-2 text-[11px] font-normal text-muted-foreground">(Chi hộ)</span>}
        </td>
      </tr>
      {sec.lines.map((l) => (
        <tr key={l.stableKey} className={selected.has(l.stableKey) ? "bg-brand-50/40" : ""}>
          <td className="py-1.5 pl-1">
            <input type="checkbox" checked={selected.has(l.stableKey)} onChange={() => toggle(l.stableKey)} className="h-3.5 w-3.5" />
          </td>
          <td className="py-1.5 pr-3 text-foreground">{l.itemName}</td>
          <td className="py-1.5 pr-3 text-xs text-muted-foreground">{l.specs ?? "—"}</td>
          <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(l.quantity, locale)}</td>
          <td className="py-1.5 pr-3 text-xs text-muted-foreground">{l.unit ?? "—"}</td>
          <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{formatNumber(l.refUnitPrice, locale)}</td>
        </tr>
      ))}
    </>
  );
}
