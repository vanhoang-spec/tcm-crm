"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2, Wand2, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import { NumberField } from "@/components/ui/number-field";
import {
  computeMarginPct,
  computeMakeupCe,
  clientBillableTotal,
  computeCostSheetTotals,
  flattenSectionTree,
  taxGrossUp,
  LINE_TYPES,
  TAX_TYPES,
  MAX_SECTION_DEPTH,
  type LineType,
  type TaxType,
} from "@/lib/bidding";
import { SECTION_COLOR_TONE } from "@/lib/bidding-ui";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { Locale } from "@/i18n/locales";
import { saveCostSheet, type ProjectFormState } from "./actions";

export type LineData = {
  /**
   * Khoá BỀN của dòng — module ④ (Chi phí & Công nợ) khoá tạm ứng/thanh toán vào đây.
   * Builder SINH khoá ngay khi dòng ra đời (newStableKey) và gửi lại y nguyên ở mọi lần lưu.
   *
   * ĐỪNG quay lại kiểu cũ "để rỗng cho server sinh": state builder khởi tạo một lần bằng useState
   * nên props mới sau khi lưu không chảy ngược vào state → lần lưu thứ 2 trong cùng phiên lại gửi
   * rỗng, server sinh BỘ KHOÁ MỚI, và syncFinanceCostLines tạo dòng chi phí mới (mở lại trần chi
   * đầy đủ) trong khi dòng cũ đang giữ tạm ứng bị đánh stale → chi tiền hai lần cho cùng một khoản.
   */
  stableKey: string;
  itemName: string;
  specs: string;
  lineType: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  fixedAmount: number | null;
  percentVal: number | null;
  taxType: string;
  customTaxAmount: number | null; // chỉ dùng khi taxType="OTHER" — số tiền thuế nhập tay
  vendorId: string;
  isLocked: boolean;
  maxMarkupPct: string; // "" = không giới hạn
  /** Cờ "TCM hỗ trợ" (form BM02): báo giá hiện đơn giá nhưng không tính tiền dòng này (CE dòng = 0).
   *  Chỉ tác động cách TRÌNH BÀY bản xuất; CO của dòng vẫn tính bình thường. */
  isSponsored: boolean;
  /** K3 — id dòng giữ chỗ kho đã duyệt; đặt trên CẢ HAI dòng của cặp (kho + mua bù). */
  stockResvLineId: string | null;
  /** K3 — đơn giá tham chiếu của hàng lấy từ kho. Khác null = DÒNG KHO: SL khoá, đơn giá thật = 0. */
  stockRefUnitPrice: number | null;
  note: string;
};

export type SectionData = {
  id: string | null; // DB id (null = section mới, chưa lưu) — dùng để dựng lại quan hệ cha-con khi hydrate
  parentId: string | null; // trỏ tới SectionData.id của section cha (N-cấp, xem lib/bidding.ts flattenSectionTree)
  code: string;
  icon: string;
  nameVi: string;
  nameEn: string;
  colorSlot: string;
  isProxy: boolean;
  /** Phòng ban phụ trách (Department.code) — quyết định prefix mã của mọi dòng trong hạng mục. */
  departmentCode: string;
  proxyFeeType: string | null;
  proxyFeeVal: number | null;
  lines: LineData[];
};

export type StockReservationOption = {
  /** StockRequestLine.id — khoá liên kết đặt lên cả hai dòng của cặp. */
  resvLineId: string;
  requestCode: string;
  itemCode: string;
  itemName: string;
  unit: string | null;
  approvedQty: number;
  warehouseName: string;
};

export type CostSheetData = {
  scenario: string;
  vatPct: number;
  /** % phí agency trên báo giá (BM02) — chỉ trình bày bản xuất, không đụng margin. */
  agencyFeePct: number;
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
type Section = Omit<SectionData, "lines"> & { key: string; parentKey: string | null };

let uid = 0;
function nextKey(prefix: string) {
  uid += 1;
  return `${prefix}${uid}`;
}

/**
 * Khoá bền cho dòng chi phí, sinh ngay lúc dòng ra đời.
 *
 * KHÔNG dùng `crypto.randomUUID`: đó là API [SecureContext], mà production chạy HTTP trong LAN
 * công ty nên nó `undefined` ở trình duyệt. Thời điểm + số ngẫu nhiên là đủ: khoá chỉ cần duy nhất
 * trong phạm vi một bảng CO/CE, và server vẫn khử trùng lần cuối trước khi ghi.
 */
function newStableKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function blankLine(sectionKey: string): Line {
  return {
    key: nextKey("l"),
    sectionKey,
    stableKey: newStableKey(),
    itemName: "",
    specs: "",
    lineType: "QTY_PRICE",
    quantity: 1,
    unit: "",
    unitPrice: 0,
    fixedAmount: null,
    percentVal: null,
    taxType: "VAT",
    customTaxAmount: null,
    vendorId: "",
    isLocked: false,
    maxMarkupPct: "",
    isSponsored: false,
    stockResvLineId: null,
    stockRefUnitPrice: null,
    note: "",
  };
}

/** Cặp dòng cho một mục giữ chỗ kho đã duyệt: dòng LẤY TỪ KHO (đơn giá 0) + dòng MUA BÙ phần thiếu. */
function stockPairLines(
  sectionKey: string,
  resv: { resvLineId: string; itemName: string; unit: string | null; approvedQty: number }
): [Line, Line] {
  const base = blankLine(sectionKey);
  const stockLine: Line = {
    ...base,
    itemName: resv.itemName,
    unit: resv.unit ?? "",
    quantity: resv.approvedQty,
    unitPrice: 0, // hàng đã tính tiền ở hợp đồng trước — CO của dòng này bằng 0
    stockResvLineId: resv.resvLineId,
    stockRefUnitPrice: 0, // Account gõ giá tham chiếu; 0 = chưa gõ
  };
  const buyLine: Line = {
    ...blankLine(sectionKey),
    itemName: resv.itemName,
    unit: resv.unit ?? "",
    quantity: 0, // Account nhập số phải mua thêm
    stockResvLineId: resv.resvLineId,
    stockRefUnitPrice: null, // null = dòng mua bù, tính tiền như dòng thường
  };
  return [stockLine, buyLine];
}

/** parentKey=null → mục gốc. Mục Chi hộ (isProxy) luôn ở gốc — không truyền parentKey cho isProxy=true.
 *  `nameVi` phải truyền sẵn cho mục Chi hộ: khối đó hiển thị nhãn cố định, KHÔNG có ô nhập tên, mà
 *  validator lại đòi tên khác rỗng — để trống là cả bảng không lưu được. */
function blankSection(isProxy = false, parentKey: string | null = null, nameVi = ""): Section {
  return {
    key: nextKey("s"),
    parentKey: isProxy ? null : parentKey,
    id: null,
    parentId: null,
    code: isProxy ? "PROXY" : "SECTION",
    icon: isProxy ? "🤝" : "📦",
    nameVi,
    nameEn: "",
    colorSlot: "neutral",
    isProxy,
    departmentCode: "",
    proxyFeeType: isProxy ? "PCT" : null,
    proxyFeeVal: isProxy ? 0 : null,
  };
}

/** 2 lượt: (1) sinh key mới cho mọi section + map id(DB)→key, (2) resolve parentKey qua map đó —
 * không cần payload sắp theo thứ tự cha-trước-con. */
function hydrate(sections: SectionData[]): { sections: Section[]; lines: Line[] } {
  const keys = sections.map(() => nextKey("s"));
  const idToKey = new Map<string, string>();
  sections.forEach((s, i) => {
    if (s.id) idToKey.set(s.id, keys[i]);
  });
  const outSections: Section[] = sections.map((s, i) => ({
    ...s,
    key: keys[i],
    parentKey: s.parentId ? (idToKey.get(s.parentId) ?? null) : null,
  }));
  const outLines: Line[] = [];
  sections.forEach((s, i) => {
    // `stableKey || newStableKey()` bao luôn 2 đường nạp có khoá rỗng: dựng từ mẫu (template) và
    // dữ liệu cũ lưu trước khi có trường này — khỏi phải vá riêng ở từng trang gọi builder.
    for (const l of s.lines) outLines.push({ ...l, stableKey: l.stableKey || newStableKey(), key: nextKey("l"), sectionKey: keys[i] });
  });
  return { sections: outSections, lines: outLines };
}

/** Tất cả section con/cháu/... của `key` (dùng để cascade-xóa cả nhánh). */
function descendantKeys(key: string, sections: Section[]): Set<string> {
  const out = new Set<string>();
  let frontier = [key];
  while (frontier.length > 0) {
    const children = sections.filter((s) => s.parentKey && frontier.includes(s.parentKey)).map((s) => s.key);
    for (const c of children) out.add(c);
    frontier = children;
  }
  return out;
}

/** Section tự đánh dấu Chi hộ HOẶC nằm dưới 1 tổ tiên Chi hộ (kế thừa) — dùng loại khỏi make-up. */
function effectiveProxyKeys(sections: Section[]): Set<string> {
  const byKey = new Map(sections.map((s) => [s.key, s]));
  const out = new Set<string>();
  for (const s of sections) {
    let cur: Section | undefined = s;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.key)) {
      if (cur.isProxy) {
        out.add(s.key);
        break;
      }
      seen.add(cur.key);
      cur = cur.parentKey ? byKey.get(cur.parentKey) : undefined;
    }
  }
  return out;
}

export function CostSheetBuilder({
  projectId,
  minMarginPct,
  data,
  matchingTemplates,
  allTemplates,
  vendors,
  departments,
  stockReservations = [],
}: {
  projectId: string;
  minMarginPct: number;
  data: CostSheetData | null;
  matchingTemplates: TemplateOption[];
  allTemplates: TemplateOption[];
  vendors: { id: string; label: string }[];
  /** Phòng ban có prefix mã chi phí — nguồn cho ô chọn ở đầu mỗi hạng mục. */
  departments: { code: string; name: string; costPrefix: string }[];
  /** K3 — các mục GIỮ CHỖ KHO đã duyệt của dự án này, chèn được vào bảng dưới dạng cặp dòng. */
  stockReservations?: StockReservationOption[];
}) {
  const t = useTranslations("bidding.costsheet");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const action = saveCostSheet.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(action, {});

  const initial = hydrate(data?.sections ?? []);
  const [scenario, setScenario] = useState(data?.scenario ?? "COST_UP");
  const [vatPct, setVatPct] = useState(data?.vatPct ?? 0);
  const [agencyFeePct, setAgencyFeePct] = useState(data?.agencyFeePct ?? 10);
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
        flattenSectionTree(
          sections.map((s) => ({
            key: s.key,
            parentKey: s.parentKey,
            isProxy: s.isProxy,
            proxyFeeType: s.proxyFeeType,
            proxyFeeVal: s.proxyFeeVal,
            lines: lines
              .filter((l) => l.sectionKey === s.key)
              .map((l) => ({ lineType: l.lineType, quantity: l.quantity, unitPrice: l.unitPrice, fixedAmount: l.fixedAmount, percentVal: l.percentVal, taxType: l.taxType, customTaxAmount: l.customTaxAmount })),
          })),
        ),
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
  function addSection(isProxy = false, parentKey: string | null = null) {
    setSections((ss) => [...ss, blankSection(isProxy, parentKey, isProxy ? t("proxySectionTitle") : "")]);
  }
  /** Xóa cả nhánh (section + mọi section con/cháu + toàn bộ dòng bên trong). */
  function removeSection(key: string) {
    const toRemove = new Set([key, ...descendantKeys(key, sections)]);
    setSections((ss) => ss.filter((s) => !toRemove.has(s.key)));
    setLines((ls) => ls.filter((l) => !toRemove.has(l.sectionKey)));
  }
  function updateLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine(sectionKey: string) {
    // Dựng dòng NGOÀI updater để updater giữ tính thuần: React StrictMode (bật mặc định ở dev) gọi
    // updater 2 lần, blankLine chạy 2 lần sẽ sinh 2 khoá và chỉ 1 khoá sống — gây nhiễu khi soi lỗi.
    const line = blankLine(sectionKey);
    setLines((ls) => [...ls, line]);
  }
  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }
  /** Chèn CẶP dòng cho một mục giữ chỗ kho đã duyệt (K3) — dựng ngoài updater, cùng lý do addLine. */
  function insertStockPair(sectionKey: string, resv: StockReservationOption) {
    const pair = stockPairLines(sectionKey, resv);
    setLines((ls) => [...ls, ...pair]);
  }
  function loadTemplate() {
    const tpl = templates.find((x) => x.id === templateId);
    if (!tpl) return;
    const h = hydrate(tpl.sections);
    setSections(h.sections);
    setLines(h.lines);
  }
  function runMakeup() {
    // Markup-eligible: QTY_PRICE/FIXED, không thuộc hạng mục Chi hộ (kể cả nằm dưới 1 tổ tiên Chi hộ).
    // FIXED coi qty=1×fixedAmount.
    const proxyKeys = effectiveProxyKeys(sections);
    const eligible = sections
      .filter((s) => !proxyKeys.has(s.key))
      .flatMap((s) => lines.filter((l) => l.sectionKey === s.key))
      .filter((l) => l.lineType !== "PERCENT_OF_TOTAL")
      .map((l) => ({
        quantity: l.lineType === "FIXED" ? 1 : l.quantity,
        unitPrice: l.lineType === "FIXED" ? (l.fixedAmount ?? 0) : l.unitPrice,
        isLocked: l.isLocked,
        maxMarkupPct: l.maxMarkupPct === "" ? null : Number(l.maxMarkupPct),
        taxType: l.taxType,
        customTaxAmount: l.customTaxAmount,
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
      <input type="hidden" name="agencyFeePct" value={agencyFeePct} />
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

      {/* Sections — cây N-cấp (Mục→Nhóm→Sub-nhóm→...), tối đa {MAX_SECTION_DEPTH} cấp */}
      <div className="space-y-3">
        {sections
          .filter((s) => !s.isProxy && !s.parentKey)
          .map((s) => (
            <SectionCard departments={departments}
              key={s.key}
              section={s}
              depth={1}
              allSections={sections}
              allLines={lines}
              vendors={vendors}
              locale={locale}
              t={t}
              percentBase={totals.directCo}
              collapsedState={collapsed}
              setCollapsedState={setCollapsed}
              updateSection={updateSection}
              removeSection={removeSection}
              addSection={addSection}
              updateLine={updateLine}
              addLine={addLine}
              removeLine={removeLine}
            />
          ))}
      </div>
      <button type="button" onClick={() => addSection(false, null)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
        <Plus className="h-3.5 w-3.5" />
        {t("addSection")}
      </button>

      {/* K3 — Kho đã duyệt: chèn CẶP dòng (hàng lấy từ kho giá 0 + hàng mua bù) vào một hạng mục. */}
      {stockReservations.length > 0 && (
        <section className="space-y-2 rounded-xl border border-border bg-surface p-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("stockPanelTitle")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("stockPanelHint")}</p>
          </div>
          <ul className="space-y-1.5">
            {stockReservations.map((r) => {
              const used = lines.some((l) => l.stockResvLineId === r.resvLineId);
              const targets = sections.filter((s) => !s.isProxy);
              return (
                <li key={r.resvLineId} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2">
                  <span className="font-mono text-xs text-muted-foreground">{r.itemCode}</span>
                  <span className="flex-1 text-xs font-medium text-foreground">{r.itemName}</span>
                  <Badge tone="neutral">
                    {t("stockPanelApproved", { qty: formatNumber(r.approvedQty, locale), unit: r.unit ?? "" })}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {r.requestCode} · {r.warehouseName}
                  </span>
                  {used ? (
                    <Badge tone="success">{t("stockPanelInserted")}</Badge>
                  ) : (
                    <select
                      defaultValue=""
                      aria-label={t("stockPanelInsertInto")}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        insertStockPair(e.target.value, r);
                        e.target.value = "";
                      }}
                      className="h-8 rounded-lg border border-border-strong bg-surface px-2 text-xs"
                    >
                      <option value="">{t("stockPanelInsertInto")}</option>
                      {targets.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.nameVi || t("untitledSection")}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

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

      {/* Header settings: mgmt fee / contingency / discount / VAT / phí agency (báo giá) */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 sm:grid-cols-5">
        <PctField label={t("mgmtFeePct")} hint={t("mgmtFeePctHint")} value={mgmtFeePct} onChange={setMgmtFeePct} />
        <PctField label={t("contingencyPct")} hint={t("contingencyPctHint")} value={contingencyPct} onChange={setContingencyPct} />
        <PctField label={t("discountPct")} hint={t("discountPctHint")} value={discountPct} onChange={setDiscountPct} />
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">VAT (%)</label>
          <NumberField decimals={2} value={vatPct} onChange={setVatPct} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
        </div>
        <PctField label={t("agencyFeePct")} hint={t("agencyFeePctHint")} value={agencyFeePct} onChange={setAgencyFeePct} />
      </div>

      {/* Totals + margin */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-2 p-4 sm:grid-cols-4">
        <Stat label={t("coTotal")} value={formatNumber(totals.coTotal, locale)} />
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("ceTotal")}</label>
          <NumberField name="ceTotal" value={ceTotal} onChange={setCeTotal} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
        </div>
        <Stat label={t("chiHo")} value={formatNumber(totals.chiHo, locale)} />
        <div>
          <span className="mb-1 block text-xs font-medium text-foreground">{t("margin")}</span>
          <div className={cn("flex h-9 items-center rounded-lg px-2.5 text-sm font-semibold", marginOk ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
            {formatPercent(marginPct, locale)}% · {marginOk ? t("marginOk") : t("marginLow", { pct: formatNumber(minMarginPct, locale) })}
          </div>
        </div>
      </div>
      <Stat label={t("grandTotalForClient")} value={formatNumber(clientBillableTotal(ceTotal, totals.chiHo), locale)} />

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
  depth: number;
  allSections: Section[];
  allLines: Line[];
  vendors: { id: string; label: string }[];
  departments: { code: string; name: string; costPrefix: string }[];
  locale: Locale;
  t: (key: string, values?: Record<string, string | number>) => string;
  percentBase: number;
  updateSection: (key: string, patch: Partial<Section>) => void;
  removeSection: (key: string) => void;
  addSection: (isProxy?: boolean, parentKey?: string | null) => void;
  updateLine: (key: string, patch: Partial<Line>) => void;
  addLine: (sectionKey: string) => void;
  removeLine: (key: string) => void;
};

/** Tổng tiền cả nhánh (dòng trực tiếp của section + đệ quy toàn bộ section con/cháu). */
function subtreeAmount(sectionKey: string, allSections: Section[], allLines: Line[], percentBase: number): number {
  const own = allLines.filter((l) => l.sectionKey === sectionKey).reduce((sum, l) => sum + lineAmount(l, percentBase), 0);
  const childrenTotal = allSections
    .filter((s) => s.parentKey === sectionKey)
    .reduce((sum, c) => sum + subtreeAmount(c.key, allSections, allLines, percentBase), 0);
  return own + childrenTotal;
}

function SectionCard({
  section,
  depth,
  allSections,
  allLines,
  vendors,
  departments,
  locale,
  t,
  percentBase,
  collapsedState,
  setCollapsedState,
  updateSection,
  removeSection,
  addSection,
  updateLine,
  addLine,
  removeLine,
}: SectionCardProps & { collapsedState: Record<string, boolean>; setCollapsedState: (fn: (s: Record<string, boolean>) => Record<string, boolean>) => void }) {
  const isCollapsed = !!collapsedState[section.key];
  const ownLines = allLines.filter((l) => l.sectionKey === section.key);
  const children = allSections.filter((s) => s.parentKey === section.key);
  // Badge = tổng cả nhánh (dòng trực tiếp + mọi mục con/cháu) — đầu mục thấy ngay tổng toàn nhóm.
  const subtotal = subtreeAmount(section.key, allSections, allLines, percentBase);

  return (
    <div className="overflow-hidden rounded-xl border border-border" style={{ marginLeft: depth > 1 ? 16 : 0 }}>
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
        {/* Phòng ban phụ trách — quyết định prefix mã của MỌI dòng trong hạng mục (ACC-001…).
            Mã do server đánh lúc lưu; đây chỉ chọn phòng. */}
        <select
          value={section.departmentCode}
          onChange={(e) => updateSection(section.key, { departmentCode: e.target.value })}
          title={t("sectionDepartmentHint")}
          aria-label={t("sectionDepartment")}
          className="h-8 rounded border border-transparent bg-transparent px-1 text-xs text-muted-foreground hover:border-border-strong"
        >
          <option value="">{t("sectionDepartmentNone")}</option>
          {departments.map((d) => (
            <option key={d.code} value={d.code}>
              {d.costPrefix} — {d.name}
            </option>
          ))}
        </select>
        <Badge tone={SECTION_COLOR_TONE[section.colorSlot] ?? "neutral"}>{formatNumber(subtotal, locale)}</Badge>
        <button type="button" onClick={() => removeSection(section.key)} className="text-danger hover:text-danger/80">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {!isCollapsed && (
        <>
          <LinesTable lines={ownLines} vendors={vendors} locale={locale} t={t} percentBase={percentBase} updateLine={updateLine} removeLine={removeLine} />
          <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-border px-3 py-2">
            <button type="button" onClick={() => addLine(section.key)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
              <Plus className="h-3.5 w-3.5" />
              {t("addLine")}
            </button>
            {depth < MAX_SECTION_DEPTH && (
              <button type="button" onClick={() => addSection(false, section.key)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
                <Plus className="h-3.5 w-3.5" />
                {t("addSubsection")}
              </button>
            )}
          </div>
          {children.length > 0 && (
            <div className="space-y-2 border-t border-dashed border-border bg-surface/60 p-2">
              {children.map((c) => (
                <SectionCard departments={departments}
                  key={c.key}
                  section={c}
                  depth={depth + 1}
                  allSections={allSections}
                  allLines={allLines}
                  vendors={vendors}
                  locale={locale}
                  t={t}
                  percentBase={percentBase}
                  collapsedState={collapsedState}
                  setCollapsedState={setCollapsedState}
                  updateSection={updateSection}
                  removeSection={removeSection}
                  addSection={addSection}
                  updateLine={updateLine}
                  addLine={addLine}
                  removeLine={removeLine}
                />
              ))}
            </div>
          )}
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
}: {
  section: Section;
  lines: Line[];
  vendors: { id: string; label: string }[];
  locale: Locale;
  t: (key: string, values?: Record<string, string | number>) => string;
  updateSection: (key: string, patch: Partial<Section>) => void;
  removeSection: (key: string) => void;
  updateLine: (key: string, patch: Partial<Line>) => void;
  addLine: (sectionKey: string) => void;
  removeLine: (key: string) => void;
}) {
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
          <NumberField
            decimals={2}
            value={section.proxyFeeVal ?? 0}
            onChange={(v) => updateSection(section.key, { proxyFeeVal: v })}
            className="h-7 w-24 rounded border border-border-strong bg-surface px-1.5"
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
    <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
      <table className="w-full min-w-[820px] text-xs">
        <thead className="sticky top-0 z-10 bg-surface text-left text-muted-foreground">
          <tr>
            <th className="px-2 py-2">{t("colType")}</th>
            <th className="px-2 py-2">{t("colItem")}</th>
            <th className="px-2 py-2">{t("colQty")}</th>
            <th className="px-2 py-2">{t("colUnit")}</th>
            <th className="px-2 py-2 text-right">{t("colUnitPrice")}</th>
            <th className="px-2 py-2">{t("colTax")}</th>
            <th className="px-2 py-2 text-right">{t("colAmount")}</th>
            <th className="px-2 py-2">{t("colVendor")}</th>
            <th className="px-2 py-2 text-center">{t("colLock")}</th>
            <th className="px-2 py-2">{t("colMaxMarkup")}</th>
            <th className="px-2 py-2 text-center" title={t("colSponsoredHint")}>{t("colSponsored")}</th>
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
              <td colSpan={12} className="px-2 py-4 text-center text-muted-foreground">{t("none")}</td>
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
  // K3 — dòng LẤY TỪ KHO: số lượng khoá theo mức đã duyệt, ô đơn giá nhập GIÁ THAM CHIẾU (giá thật
  // luôn = 0 nên Thành tiền hiện 0). Loại dòng/thuế/khoá/markup/tài trợ đều không áp dụng.
  const isStock = l.stockRefUnitPrice != null;

  return (
    <tr>
      <td className="px-1 py-1">
        <select value={l.lineType} onChange={(e) => updateLine(l.key, { lineType: e.target.value })} disabled={isStock} className={cn(cellInput, "min-w-[110px]")}>
          {availableTypes.map((lt) => (
            <option key={lt} value={lt}>
              {t(lineTypeLabelKey(lt as LineType))}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1 py-1">
        <input value={l.itemName} onChange={(e) => updateLine(l.key, { itemName: e.target.value })} className={cn(cellInput, "min-w-[130px]")} />
        {isStock && <Badge tone="brand">{t("stockLineBadge")}</Badge>}
      </td>
      {l.lineType === "QTY_PRICE" ? (
        <>
          <td className="px-1 py-1">
            <NumberField decimals={2} value={l.quantity} onChange={(v) => updateLine(l.key, { quantity: v })} disabled={isStock} title={isStock ? t("stockQtyLocked") : undefined} className={cn(cellInput, "w-16")} />
          </td>
          <td className="px-1 py-1">
            <input value={l.unit} onChange={(e) => updateLine(l.key, { unit: e.target.value })} className={cn(cellInput, "w-16")} />
          </td>
          <td className="px-1 py-1">
            {isStock ? (
              <NumberField
                value={l.stockRefUnitPrice ?? 0}
                onChange={(v) => updateLine(l.key, { stockRefUnitPrice: v })}
                title={t("stockRefPriceHint")}
                className={cn(cellInput, "w-28 text-right italic")}
              />
            ) : (
              <NumberField value={l.unitPrice} onChange={(v) => updateLine(l.key, { unitPrice: v })} className={cn(cellInput, "w-28 text-right")} />
            )}
          </td>
        </>
      ) : l.lineType === "FIXED" ? (
        <>
          <td className="px-1 py-1 text-center text-muted-foreground" colSpan={2}>—</td>
          <td className="px-1 py-1">
            <NumberField value={l.fixedAmount ?? 0} onChange={(v) => updateLine(l.key, { fixedAmount: v })} className={cn(cellInput, "w-28 text-right")} />
          </td>
        </>
      ) : (
        <>
          <td className="px-1 py-1 text-center text-muted-foreground" colSpan={2}>—</td>
          <td className="px-1 py-1">
            <NumberField decimals={2} value={l.percentVal ?? 0} onChange={(v) => updateLine(l.key, { percentVal: v })} className={cn(cellInput, "w-20 text-right")} />
          </td>
        </>
      )}
      <td className="px-1 py-1">
        {l.lineType === "PERCENT_OF_TOTAL" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            <select value={l.taxType} onChange={(e) => updateLine(l.key, { taxType: e.target.value })} className={cn(cellInput, "min-w-[92px]")}>
              {TAX_TYPES.map((tx) => (
                <option key={tx} value={tx}>
                  {t(taxTypeLabelKey(tx))}
                </option>
              ))}
            </select>
            {l.taxType === "OTHER" && (
              <NumberField
                placeholder={t("customTaxAmountPlaceholder")}
                value={l.customTaxAmount ?? 0}
                onChange={(v) => updateLine(l.key, { customTaxAmount: v })}
                className={cn(cellInput, "min-w-[92px] text-right")}
              />
            )}
          </div>
        )}
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{formatNumber(amount, locale)}</td>
      <td className="px-1 py-1">
        <SearchableSelect
          value={l.vendorId}
          onChange={(v) => updateLine(l.key, { vendorId: v })}
          options={vendors.map((v) => ({ value: v.id, label: v.label }))}
          className="min-w-[110px]"
        />
      </td>
      <td className="px-1 py-1 text-center">
        <input type="checkbox" checked={l.isLocked} onChange={(e) => updateLine(l.key, { isLocked: e.target.checked })} />
      </td>
      <td className="px-1 py-1">
        <input type="number" step="any" placeholder="∞" value={l.maxMarkupPct} onChange={(e) => updateLine(l.key, { maxMarkupPct: e.target.value })} className={cn(cellInput, "w-14")} disabled={l.isLocked} />
      </td>
      {/* "TCM hỗ trợ": báo giá hiện đơn giá nhưng KHÔNG tính tiền dòng này (CE dòng = 0). Chỉ đổi
          cách trình bày bản xuất — CO của dòng vẫn vào giá vốn bình thường. */}
      <td className="px-1 py-1 text-center">
        <input type="checkbox" checked={l.isSponsored} onChange={(e) => updateLine(l.key, { isSponsored: e.target.checked })} />
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
      <NumberField decimals={2} value={value} onChange={onChange} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
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
  // Gross-up thuế theo taxType (khớp computeLineAmount ở server). PERCENT_OF_TOTAL không gross-up.
  // OTHER: cộng thẳng customTaxAmount (nhập tay), không nhân hệ số gross-up %.
  if (l.lineType === "FIXED") {
    const base = l.fixedAmount ?? 0;
    return l.taxType === "OTHER" ? Math.round(base + (l.customTaxAmount ?? 0)) : Math.round(base * taxGrossUp(l.taxType));
  }
  if (l.lineType === "PERCENT_OF_TOTAL") return Math.round(((l.percentVal ?? 0) / 100) * percentBase);
  const base = l.quantity * l.unitPrice;
  return l.taxType === "OTHER" ? Math.round(base + (l.customTaxAmount ?? 0)) : Math.round(base * taxGrossUp(l.taxType));
}

function lineTypeLabelKey(lt: LineType): string {
  if (lt === "FIXED") return "lineTypeFixed";
  if (lt === "PERCENT_OF_TOTAL") return "lineTypePercent";
  return "lineTypeQtyPrice";
}

function taxTypeLabelKey(tx: TaxType): string {
  if (tx === "TNCN") return "taxTncn";
  if (tx === "TNDN") return "taxTndn";
  if (tx === "OTHER") return "taxOther";
  return "taxVat";
}

const cellInput = "h-8 w-full rounded border border-border-strong bg-surface px-1.5 text-xs outline-none focus:border-brand-400";
