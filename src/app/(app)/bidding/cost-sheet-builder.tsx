"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2, Wand2, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import { computeMarginPct, computeMakeupCe, computeCostSheetTotals, LINE_TYPES, type LineType } from "@/lib/bidding";
import { SECTION_COLOR_TONE } from "@/lib/bidding-ui";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/locales";
import { saveCostSheet, type ProjectFormState } from "./actions";

export type LineData = {
  itemName: string;
  specs: string;
  lineType: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  fixedAmount: number | null;
  percentVal: number | null;
  vendorId: string;
  isLocked: boolean;
  maxMarkupPct: string; // "" = không giới hạn
  note: string;
};

export type SectionData = {
  code: string;
  icon: string;
  nameVi: string;
  nameEn: string;
  colorSlot: string;
  isProxy: boolean;
  proxyFeeType: string | null;
  proxyFeeVal: number | null;
  lines: LineData[];
};

export type CostSheetData = {
  scenario: string;
  vatPct: number;
  mgmtFeePct: number;
  contingencyPct: number;
  discountPct: number;
  ceTotal: number;
  templateId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  overrideNote: string | null;
  sections: SectionData[];
};

export type TemplateOption = { id: string; name: string; sections: SectionData[] };

type Line = LineData & { key: string; sectionKey: string };
type Section = Omit<SectionData, "lines"> & { key: string };

let uid = 0;
function nextKey(prefix: string) {
  uid += 1;
  return `${prefix}${uid}`;
}

function blankLine(sectionKey: string): Line {
  return {
    key: nextKey("l"),
    sectionKey,
    itemName: "",
    specs: "",
    lineType: "QTY_PRICE",
    quantity: 1,
    unit: "",
    unitPrice: 0,
    fixedAmount: null,
    percentVal: null,
    vendorId: "",
    isLocked: false,
    maxMarkupPct: "",
    note: "",
  };
}

function blankSection(isProxy = false): Section {
  return {
    key: nextKey("s"),
    code: isProxy ? "PROXY" : "SECTION",
    icon: isProxy ? "🤝" : "📦",
    nameVi: "",
    nameEn: "",
    colorSlot: "neutral",
    isProxy,
    proxyFeeType: isProxy ? "PCT" : null,
    proxyFeeVal: isProxy ? 0 : null,
  };
}

function hydrate(sections: SectionData[]): { sections: Section[]; lines: Line[] } {
  const outSections: Section[] = [];
  const outLines: Line[] = [];
  for (const s of sections) {
    const sKey = nextKey("s");
    outSections.push({ ...s, key: sKey });
    for (const l of s.lines) outLines.push({ ...l, key: nextKey("l"), sectionKey: sKey });
  }
  return { sections: outSections, lines: outLines };
}

export function CostSheetBuilder({
  projectId,
  minMarginPct,
  data,
  matchingTemplates,
  allTemplates,
  vendors,
}: {
  projectId: string;
  minMarginPct: number;
  data: CostSheetData | null;
  matchingTemplates: TemplateOption[];
  allTemplates: TemplateOption[];
  vendors: { id: string; label: string }[];
}) {
  const t = useTranslations("bidding.costsheet");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const action = saveCostSheet.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(action, {});

  const initial = hydrate(data?.sections ?? []);
  const [scenario, setScenario] = useState(data?.scenario ?? "COST_UP");
  const [vatPct, setVatPct] = useState(data?.vatPct ?? 0);
  const [mgmtFeePct, setMgmtFeePct] = useState(data?.mgmtFeePct ?? 0);
  const [contingencyPct, setContingencyPct] = useState(data?.contingencyPct ?? 0);
  const [discountPct, setDiscountPct] = useState(data?.discountPct ?? 0);
  const [ceTotal, setCeTotal] = useState(data?.ceTotal ?? 0);
  const [overrideNote, setOverrideNote] = useState(data?.overrideNote ?? "");
  const [templateId, setTemplateId] = useState(data?.templateId ?? "");
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [sections, setSections] = useState<Section[]>(initial.sections);
  const [lines, setLines] = useState<Line[]>(initial.lines);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const templates = showAllTemplates ? allTemplates : matchingTemplates;

  const totals = useMemo(
    () =>
      computeCostSheetTotals(
        sections.map((s) => ({
          isProxy: s.isProxy,
          proxyFeeType: s.proxyFeeType,
          proxyFeeVal: s.proxyFeeVal,
          lines: lines
            .filter((l) => l.sectionKey === s.key)
            .map((l) => ({ lineType: l.lineType, quantity: l.quantity, unitPrice: l.unitPrice, fixedAmount: l.fixedAmount, percentVal: l.percentVal })),
        })),
        mgmtFeePct,
        contingencyPct,
      ),
    [sections, lines, mgmtFeePct, contingencyPct],
  );
  const marginPct = computeMarginPct(ceTotal, totals.coTotal);
  const marginOk = marginPct >= minMarginPct;

  function updateSection(key: string, patch: Partial<Section>) {
    setSections((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }
  function addSection(isProxy = false) {
    setSections((ss) => [...ss, blankSection(isProxy)]);
  }
  function removeSection(key: string) {
    setSections((ss) => ss.filter((s) => s.key !== key));
    setLines((ls) => ls.filter((l) => l.sectionKey !== key));
  }
  function updateLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine(sectionKey: string) {
    setLines((ls) => [...ls, blankLine(sectionKey)]);
  }
  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }
  function loadTemplate() {
    const tpl = templates.find((x) => x.id === templateId);
    if (!tpl) return;
    const h = hydrate(tpl.sections);
    setSections(h.sections);
    setLines(h.lines);
  }
  function runMakeup() {
    // Markup-eligible: QTY_PRICE/FIXED, không thuộc hạng mục Chi hộ. FIXED coi qty=1×fixedAmount.
    const eligible = sections
      .filter((s) => !s.isProxy)
      .flatMap((s) => lines.filter((l) => l.sectionKey === s.key))
      .filter((l) => l.lineType !== "PERCENT_OF_TOTAL")
      .map((l) => ({
        quantity: l.lineType === "FIXED" ? 1 : l.quantity,
        unitPrice: l.lineType === "FIXED" ? (l.fixedAmount ?? 0) : l.unitPrice,
        isLocked: l.isLocked,
        maxMarkupPct: l.maxMarkupPct === "" ? null : Number(l.maxMarkupPct),
      }));
    const res = computeMakeupCe(eligible, minMarginPct);
    setCeTotal(res.suggestedCe);
  }
  function suggestCe() {
    setCeTotal(Math.round(totals.coTotal * (1 + vatPct / 100) * (1 - discountPct / 100)));
  }

  const payload = { sections, lines };

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</div>
      )}

      <input type="hidden" name="sectionsJson" value={JSON.stringify(payload)} />
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="vatPct" value={vatPct} />
      <input type="hidden" name="mgmtFeePct" value={mgmtFeePct} />
      <input type="hidden" name="contingencyPct" value={contingencyPct} />
      <input type="hidden" name="discountPct" value={discountPct} />

      {/* Scenario + template */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("scenario")}</label>
          <div className="flex flex-wrap gap-2">
            {(["COST_UP", "BUDGET_DOWN"] as const).map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50">
                <input type="radio" name="scenario" value={s} checked={scenario === s} onChange={() => setScenario(s)} />
                {t(s === "COST_UP" ? "scenarioCostUp" : "scenarioBudgetDown")}
              </label>
            ))}
          </div>
        </div>
        {sections.length === 0 && templates.length > 0 && (
          <div className="flex items-end gap-2">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-xs">
              <option value="">{t("selectTemplate")}</option>
              {templates.map((tp) => (
                <option key={tp.id} value={tp.id}>{tp.name}</option>
              ))}
            </select>
            <button type="button" onClick={loadTemplate} className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
              {t("fromTemplate")}
            </button>
          </div>
        )}
      </div>
      {sections.length === 0 && !showAllTemplates && allTemplates.length > matchingTemplates.length && (
        <button type="button" onClick={() => setShowAllTemplates(true)} className="text-xs font-medium text-brand-600 hover:underline">
          {t("showAllTemplates")}
        </button>
      )}

      {/* Sections */}
      <div className="space-y-3">
        {sections
          .filter((s) => !s.isProxy)
          .map((s) => (
            <SectionCard
              key={s.key}
              section={s}
              lines={lines.filter((l) => l.sectionKey === s.key)}
              vendors={vendors}
              locale={locale}
              t={t}
              percentBase={totals.directCo}
              collapsedState={collapsed}
              setCollapsedState={setCollapsed}
              updateSection={updateSection}
              removeSection={removeSection}
              updateLine={updateLine}
              addLine={addLine}
              removeLine={removeLine}
            />
          ))}
      </div>
      <button type="button" onClick={() => addSection(false)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
        <Plus className="h-3.5 w-3.5" />
        {t("addSection")}
      </button>

      {/* Proxy section (Chi hộ) — tách riêng cuối bảng */}
      <div className="space-y-2 rounded-lg border border-dashed border-border-strong p-3">
        {sections
          .filter((s) => s.isProxy)
          .map((s) => (
            <ProxySectionCard
              key={s.key}
              section={s}
              lines={lines.filter((l) => l.sectionKey === s.key)}
              vendors={vendors}
              locale={locale}
              t={t}
              percentBase={0}
              updateSection={updateSection}
              removeSection={removeSection}
              updateLine={updateLine}
              addLine={addLine}
              removeLine={removeLine}
            />
          ))}
        {sections.filter((s) => s.isProxy).length === 0 && (
          <button type="button" onClick={() => addSection(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
            <Plus className="h-3.5 w-3.5" />
            {t("proxySectionTitle")}
          </button>
        )}
      </div>

      {/* Header settings: mgmt fee / contingency / discount / VAT */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 sm:grid-cols-4">
        <PctField label={t("mgmtFeePct")} hint={t("mgmtFeePctHint")} value={mgmtFeePct} onChange={setMgmtFeePct} />
        <PctField label={t("contingencyPct")} hint={t("contingencyPctHint")} value={contingencyPct} onChange={setContingencyPct} />
        <PctField label={t("discountPct")} hint={t("discountPctHint")} value={discountPct} onChange={setDiscountPct} />
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">VAT (%)</label>
          <input type="number" step="any" value={vatPct} onChange={(e) => setVatPct(Number(e.target.value) || 0)} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm tabular-nums" />
        </div>
      </div>

      {/* Totals + margin */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-2 p-4 sm:grid-cols-4">
        <Stat label={t("coTotal")} value={formatNumber(totals.coTotal, locale)} />
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("ceTotal")}</label>
          <input name="ceTotal" type="number" step="any" value={ceTotal} onChange={(e) => setCeTotal(Number(e.target.value) || 0)} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm tabular-nums" />
        </div>
        <Stat label={t("chiHo")} value={formatNumber(totals.chiHo, locale)} />
        <div>
          <span className="mb-1 block text-xs font-medium text-foreground">{t("margin")}</span>
          <div className={cn("flex h-9 items-center rounded-lg px-2.5 text-sm font-semibold", marginOk ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
            {formatPercent(marginPct, locale)}% · {marginOk ? t("marginOk") : t("marginLow", { pct: formatNumber(minMarginPct, locale) })}
          </div>
        </div>
      </div>
      <Stat label={t("grandTotalForClient")} value={formatNumber(ceTotal + totals.chiHo, locale)} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={runMakeup} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-100">
          <Wand2 className="h-3.5 w-3.5" />
          {t("makeup")}
        </button>
        <button type="button" onClick={suggestCe} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-xs font-medium hover:bg-surface-2">
          {t("suggestCe")}
        </button>
        <span className="text-xs text-muted-foreground">{t("makeupHint")}</span>
      </div>

      {/* Override khi margin thấp */}
      {!marginOk && (
        <div>
          <label className="mb-1 block text-xs font-medium text-danger">{t("overrideNote")}</label>
          <input name="overrideNote" value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} className={cn("h-10 w-full rounded-lg border bg-surface px-3 text-sm", state.fieldErrors?.overrideNote ? "border-danger" : "border-border-strong")} />
          {state.fieldErrors?.overrideNote && <p className="mt-1 text-xs text-danger">{state.fieldErrors.overrideNote}</p>}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-3">
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
          {pending ? tCommon("saving") : t("submitApprove")}
        </button>
        {data?.approvedByName && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-4 w-4" />
            {t("approved")} — {t("approvedBy", { name: data.approvedByName, date: data.approvedAt ?? "" })}
          </span>
        )}
      </div>
    </form>
  );
}

type SectionCardProps = {
  section: Section;
  lines: Line[];
  vendors: { id: string; label: string }[];
  locale: Locale;
  t: (key: string, values?: Record<string, string | number>) => string;
  percentBase: number;
  updateSection: (key: string, patch: Partial<Section>) => void;
  removeSection: (key: string) => void;
  updateLine: (key: string, patch: Partial<Line>) => void;
  addLine: (sectionKey: string) => void;
  removeLine: (key: string) => void;
};

function SectionCard({
  section,
  lines,
  vendors,
  locale,
  t,
  percentBase,
  collapsedState,
  setCollapsedState,
  updateSection,
  removeSection,
  updateLine,
  addLine,
  removeLine,
}: SectionCardProps & { collapsedState: Record<string, boolean>; setCollapsedState: (fn: (s: Record<string, boolean>) => Record<string, boolean>) => void }) {
  const isCollapsed = !!collapsedState[section.key];
  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l, percentBase), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-2 bg-surface-2 px-3 py-2">
        <button type="button" onClick={() => setCollapsedState((s) => ({ ...s, [section.key]: !s[section.key] }))} className="text-muted-foreground">
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <input value={section.icon} onChange={(e) => updateSection(section.key, { icon: e.target.value })} className="h-8 w-10 rounded border border-transparent bg-transparent text-center text-sm hover:border-border-strong" />
        <input
          value={locale === "vi" ? section.nameVi : section.nameEn || section.nameVi}
          onChange={(e) => updateSection(section.key, locale === "vi" ? { nameVi: e.target.value } : { nameEn: e.target.value })}
          placeholder={t("sectionNameVi")}
          className="h-8 flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-medium hover:border-border-strong"
        />
        <Badge tone={SECTION_COLOR_TONE[section.colorSlot] ?? "neutral"}>{formatNumber(subtotal, locale)}</Badge>
        <button type="button" onClick={() => removeSection(section.key)} className="text-danger hover:text-danger/80">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {!isCollapsed && (
        <>
          <LinesTable lines={lines} vendors={vendors} locale={locale} t={t} percentBase={percentBase} updateLine={updateLine} removeLine={removeLine} />
          <button type="button" onClick={() => addLine(section.key)} className="flex w-full items-center gap-1.5 border-t border-dashed border-border px-3 py-2 text-xs font-medium text-brand-600 hover:bg-surface-2">
            <Plus className="h-3.5 w-3.5" />
            {t("addLine")}
          </button>
        </>
      )}
    </div>
  );
}

function ProxySectionCard({
  section,
  lines,
  vendors,
  locale,
  t,
  updateSection,
  removeSection,
  updateLine,
  addLine,
  removeLine,
}: SectionCardProps) {
  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l, 0), 0);
  const feeAmt = section.proxyFeeType === "FIXED" ? (section.proxyFeeVal ?? 0) : Math.round((subtotal * (section.proxyFeeVal ?? 0)) / 100);

  return (
    <div className="overflow-hidden rounded-xl border border-border-strong">
      <div className="flex flex-wrap items-center gap-2 bg-surface-2 px-3 py-2">
        <span className="text-sm">{section.icon}</span>
        <span className="text-sm font-medium text-foreground">{t("proxySectionTitle")}</span>
        <button type="button" onClick={() => removeSection(section.key)} className="ml-auto text-danger hover:text-danger/80">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <LinesTable lines={lines} vendors={vendors} locale={locale} t={t} percentBase={0} updateLine={updateLine} removeLine={removeLine} hidePercent />
      <button type="button" onClick={() => addLine(section.key)} className="flex w-full items-center gap-1.5 border-t border-dashed border-border px-3 py-2 text-xs font-medium text-brand-600 hover:bg-surface-2">
        <Plus className="h-3.5 w-3.5" />
        {t("addLine")}
      </button>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2 text-xs">
        <span className="text-muted-foreground">{t("proxySubtotal")}: {formatNumber(subtotal, locale)}</span>
        <label className="flex items-center gap-1.5">
          {t("proxyFeeType")}:
          <select value={section.proxyFeeType ?? "PCT"} onChange={(e) => updateSection(section.key, { proxyFeeType: e.target.value })} className="h-7 rounded border border-border-strong bg-surface px-1.5">
            <option value="PCT">{t("proxyFeePct")}</option>
            <option value="FIXED">{t("proxyFeeFixed")}</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          {t("proxyFeeVal")}:
          <input
            type="number"
            step="any"
            value={section.proxyFeeVal ?? 0}
            onChange={(e) => updateSection(section.key, { proxyFeeVal: Number(e.target.value) || 0 })}
            className="h-7 w-24 rounded border border-border-strong bg-surface px-1.5 tabular-nums"
          />
        </label>
        <span className="font-medium text-foreground">= {formatNumber(feeAmt, locale)}</span>
      </div>
    </div>
  );
}

function LinesTable({
  lines,
  vendors,
  locale,
  t,
  percentBase,
  updateLine,
  removeLine,
  hidePercent,
}: {
  lines: Line[];
  vendors: { id: string; label: string }[];
  locale: Locale;
  t: (key: string, values?: Record<string, string | number>) => string;
  percentBase: number;
  updateLine: (key: string, patch: Partial<Line>) => void;
  removeLine: (key: string) => void;
  hidePercent?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-xs">
        <thead className="bg-surface text-left text-muted-foreground">
          <tr>
            <th className="px-2 py-2">{t("colType")}</th>
            <th className="px-2 py-2">{t("colItem")}</th>
            <th className="px-2 py-2">{t("colQty")}</th>
            <th className="px-2 py-2">{t("colUnit")}</th>
            <th className="px-2 py-2 text-right">{t("colUnitPrice")}</th>
            <th className="px-2 py-2 text-right">{t("colAmount")}</th>
            <th className="px-2 py-2">{t("colVendor")}</th>
            <th className="px-2 py-2 text-center">{t("colLock")}</th>
            <th className="px-2 py-2">{t("colMaxMarkup")}</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.map((l) => {
            return (
              <LineRow key={l.key} line={l} vendors={vendors} locale={locale} t={t} percentBase={percentBase} updateLine={updateLine} removeLine={removeLine} hidePercent={hidePercent} />
            );
          })}
          {lines.length === 0 && (
            <tr>
              <td colSpan={10} className="px-2 py-4 text-center text-muted-foreground">{t("none")}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function LineRow({
  line: l,
  vendors,
  locale,
  t,
  percentBase,
  updateLine,
  removeLine,
  hidePercent,
}: {
  line: Line;
  vendors: { id: string; label: string }[];
  locale: Locale;
  t: (key: string, values?: Record<string, string | number>) => string;
  percentBase: number;
  updateLine: (key: string, patch: Partial<Line>) => void;
  removeLine: (key: string) => void;
  hidePercent?: boolean;
}) {
  const amount = lineAmount(l, percentBase);
  const availableTypes = hidePercent ? LINE_TYPES.filter((lt) => lt !== "PERCENT_OF_TOTAL") : LINE_TYPES;

  return (
    <tr>
      <td className="px-1 py-1">
        <select value={l.lineType} onChange={(e) => updateLine(l.key, { lineType: e.target.value })} className={cn(cellInput, "min-w-[110px]")}>
          {availableTypes.map((lt) => (
            <option key={lt} value={lt}>
              {t(lineTypeLabelKey(lt as LineType))}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1 py-1">
        <input value={l.itemName} onChange={(e) => updateLine(l.key, { itemName: e.target.value })} className={cn(cellInput, "min-w-[130px]")} />
      </td>
      {l.lineType === "QTY_PRICE" ? (
        <>
          <td className="px-1 py-1">
            <input type="number" step="any" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: Number(e.target.value) || 0 })} className={cn(cellInput, "w-16")} />
          </td>
          <td className="px-1 py-1">
            <input value={l.unit} onChange={(e) => updateLine(l.key, { unit: e.target.value })} className={cn(cellInput, "w-16")} />
          </td>
          <td className="px-1 py-1">
            <input type="number" step="any" value={l.unitPrice} onChange={(e) => updateLine(l.key, { unitPrice: Number(e.target.value) || 0 })} className={cn(cellInput, "w-28 text-right")} />
          </td>
        </>
      ) : l.lineType === "FIXED" ? (
        <>
          <td className="px-1 py-1 text-center text-muted-foreground" colSpan={2}>—</td>
          <td className="px-1 py-1">
            <input type="number" step="any" value={l.fixedAmount ?? 0} onChange={(e) => updateLine(l.key, { fixedAmount: Number(e.target.value) || 0 })} className={cn(cellInput, "w-28 text-right")} />
          </td>
        </>
      ) : (
        <>
          <td className="px-1 py-1 text-center text-muted-foreground" colSpan={2}>—</td>
          <td className="px-1 py-1">
            <input type="number" step="any" value={l.percentVal ?? 0} onChange={(e) => updateLine(l.key, { percentVal: Number(e.target.value) || 0 })} className={cn(cellInput, "w-20 text-right")} />
          </td>
        </>
      )}
      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{formatNumber(amount, locale)}</td>
      <td className="px-1 py-1">
        <select value={l.vendorId} onChange={(e) => updateLine(l.key, { vendorId: e.target.value })} className={cn(cellInput, "min-w-[90px]")}>
          <option value="">—</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </td>
      <td className="px-1 py-1 text-center">
        <input type="checkbox" checked={l.isLocked} onChange={(e) => updateLine(l.key, { isLocked: e.target.checked })} />
      </td>
      <td className="px-1 py-1">
        <input type="number" step="any" placeholder="∞" value={l.maxMarkupPct} onChange={(e) => updateLine(l.key, { maxMarkupPct: e.target.value })} className={cn(cellInput, "w-14")} disabled={l.isLocked} />
      </td>
      <td className="px-1 py-1 text-center">
        <button type="button" onClick={() => removeLine(l.key)} className="text-danger hover:text-danger/80">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function PctField({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground">{label}</label>
      <input type="number" step="any" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm tabular-nums" />
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      <div className="flex h-9 items-center rounded-lg bg-surface px-2.5 text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function lineAmount(l: LineData, percentBase: number): number {
  if (l.lineType === "FIXED") return Math.round(l.fixedAmount ?? 0);
  if (l.lineType === "PERCENT_OF_TOTAL") return Math.round(((l.percentVal ?? 0) / 100) * percentBase);
  return Math.round(l.quantity * l.unitPrice);
}

function lineTypeLabelKey(lt: LineType): string {
  if (lt === "FIXED") return "lineTypeFixed";
  if (lt === "PERCENT_OF_TOTAL") return "lineTypePercent";
  return "lineTypeQtyPrice";
}

const cellInput = "h-8 w-full rounded border border-border-strong bg-surface px-1.5 text-xs outline-none focus:border-brand-400";
