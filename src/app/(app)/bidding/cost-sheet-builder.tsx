"use client";

// Builder CO/CE MỘT MÀN HÌNH (CE-2, 05/08/2026) — giao diện theo ĐÚNG mockup v4 đã chốt với chủ
// dự án (scratchpad/coce-v2-mockup.html): CE trái / CO phải trên cùng một lưới, thuế theo dòng,
// Total CO + Trần chi NCC theo quyền, phí quản lý theo mục L1, header tổng realtime.
//
// GIỮ NGUYÊN contract với server: state PHẲNG sections[]+lines[], payload sectionsJson + các input
// scalar, đường lưu saveCostSheet. Chỉ phần TRÌNH BÀY viết lại.
//
// HAI CHẾ ĐỘ trên cùng một component:
// - Chế độ CŨ (ceTotal nhập tổng): lưới chỉ có khối CO; panel ceTotal/margin/make-up như trước.
//   Banner "Chuyển sang CE theo dòng" đổ CE từng dòng bằng đúng phép phân bổ BM02.
// - Chế độ MỚI (CE theo dòng): cột CE sửa từng dòng, ceTotal server TỰ suy — ô nhập tay biến mất.
// Nhận diện = sheetHasLineCe (dữ liệu, không cột cờ); bảng mới trống bật tay bằng nút.

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Wand2, CheckCircle2, ChevronDown, ChevronRight, Link2, Unlink, Settings2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import { NumberField } from "@/components/ui/number-field";
import {
  computeMarginPct,
  computeMakeupCe,
  computeCostSheetTotals,
  computeLineAmount,
  computeLineNetAmount,
  computeCeAggregates,
  ceRowsOf,
  ceGroupHeirIndex,
  sheetHasLineCe,
  sectionNumber,
  payCapFor,
  taxDisplayAmount,
  clientBillableTotal,
  flattenSectionTree,
  VAT_PCT_OPTIONS,
  LINE_TYPES,
  TAX_TYPES,
  REVISION_KINDS,
  MAX_SECTION_DEPTH,
  type CeLineCalcInput,
  type CeSectionInput,
  type LineType,
  type TaxType,
} from "@/lib/bidding";
import { quotationChain } from "@/lib/costsheet-quotation";
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
  /** LOF-V1 — nhãn CHẶNG (tỉnh/điểm/đợt) để gom khi xuất bản nghiệm thu. Thuần nhãn, không tính tiền. */
  legCode: string;
  note: string;
  // ── CO/CE v3 (CE-1/CE-2) — CE theo dòng ──
  ceQuantity: number | null;
  ceUnitPrice: number | null;
  /** Khoá GỘP N dòng CO → 1 dòng CE khách nhìn; chỉ dòng ĐẠI DIỆN (đầu nhóm) mang ceName/ceQ/ceP. */
  ceGroupKey: string | null;
  /** CE-5 — khách yêu cầu bỏ dòng: hiện gạch ngang, CE = 0, có nút Khôi phục. */
  ceDropped: boolean;
  ceName: string;
  /** % VAT theo dòng (8|10) — CHỈ dòng VAT; null = chưa chọn (trần chi giữ = net, Q4). */
  vatPct: number | null;
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
  /** CO/CE v3 — phí quản lý BÁO KHÁCH của mục L1 (10/5/nhập tay); null = chưa áp ("thiếu mục"). */
  clientFeePct: number | null;
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
    legCode: "",
    note: "",
    ceQuantity: null,
    ceUnitPrice: null,
    ceGroupKey: null,
    ceDropped: false,
    ceName: "",
    vatPct: null,
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
    // Mặc định 10% cho mục GỐC dịch vụ (quyết định chủ dự án 26/08/2026): bảng bình thường chỉ có
    // MỘT dòng phí quản lý 10%, ai cần mức khác thì sửa ở panel phí — thay vì phải áp thủ công
    // từng mục rồi mới xuất được báo giá.
    // ⚠ CHỈ mục gốc không Chi hộ. Validator CHẶN mục con / mục Chi hộ mang phí (costsheet.ts:136)
    // — để `10` ở đây cho mọi loại là mọi lần thêm mục con đều không lưu được bảng.
    clientFeePct: isProxy || parentKey ? null : 10,
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

/** Section tự đánh dấu Chi hộ HOẶC nằm dưới 1 tổ tiên Chi hộ (kế thừa) — dùng loại khỏi make-up/CE. */
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

/** Input tính CE cho một dòng builder — dùng chung mọi chỗ gọi engine ở file này. */
function ceInput(l: Line): CeLineCalcInput {
  return {
    lineType: l.lineType,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    fixedAmount: l.fixedAmount,
    percentVal: l.percentVal,
    taxType: l.taxType,
    customTaxAmount: l.customTaxAmount,
    ceQuantity: l.ceQuantity,
    ceUnitPrice: l.ceUnitPrice,
    ceGroupKey: l.ceGroupKey,
    ceName: l.ceName,
    vatPct: l.vatPct,
    isSponsored: l.isSponsored,
    itemName: l.itemName,
    stockRefUnitPrice: l.stockRefUnitPrice,
    stockResvLineId: l.stockResvLineId,
    // ⚠ THIẾU DÒNG NÀY LÀ MÀN HÌNH LỆCH VỚI SERVER: `ceRowsOf` cho CE = 0 ở dòng khách yêu cầu bỏ,
    // nên không truyền cờ thì dải tổng của builder vẫn cộng dòng đó trong khi bảng đã lưu thì không.
    // Đã đo: builder hiện 326.816.369 còn server lưu ra tổng ứng với 323.441.451 — lệch đúng phần
    // của một dòng khách bỏ (3.374.918).
    ceDropped: l.ceDropped,
  };
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
  canViewCost = true,
  canViewPaycap = true,
  canEdit = true,
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
  /** Gate cột theo quyền — trang server TÍNH và TƯỚC dữ liệu trước khi truyền (số bị gate không vào HTML). */
  canViewCost?: boolean;
  canViewPaycap?: boolean;
  canEdit?: boolean;
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
  const [view, setView] = useState<"both" | "ce" | "co">("both");
  const [showUtil, setShowUtil] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [makeupFactor, setMakeupFactor] = useState(() => Math.round((1 / (1 - minMarginPct / 100)) * 100) / 100);
  // Chế độ CE theo dòng: khởi tạo từ dữ liệu; bảng cũ bật lên bằng nút convert / bảng trống bật tay.
  const proxyKeys = useMemo(() => effectiveProxyKeys(sections), [sections]);
  const [ceMode, setCeMode] = useState(() => {
    const svc = initial.lines.filter((l) => {
      const s = initial.sections.find((x) => x.key === l.sectionKey);
      return s && !effectiveProxyKeys(initial.sections).has(s.key);
    });
    return svc.length > 0 && sheetHasLineCe(svc.map(ceInput));
  });
  // Mức phí "Khác" — dựng từ các % đã lưu ngoài {10, 5}; mặc định một bucket 8%.
  const [customRates, setCustomRates] = useState<number[]>(() => {
    const seen = new Set<number>();
    for (const s of initial.sections) {
      if (!s.isProxy && !s.parentKey && s.clientFeePct != null && s.clientFeePct !== 10 && s.clientFeePct !== 5) seen.add(s.clientFeePct);
    }
    return seen.size > 0 ? [...seen] : [8];
  });

  const templates = showAllTemplates ? allTemplates : matchingTemplates;

  // ── Tổng CO (giữ nguyên đường cũ — percentBase cho dòng %) ──
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
  const percentBase = totals.directCo;

  // ── Bộ tổng CE chế độ mới — client mirror của computeCeAggregates (server tính lại khi lưu) ──
  const ceAgg = useMemo(() => {
    const ceSections: CeSectionInput[] = sections.map((s) => ({
      key: s.key,
      parentKey: s.parentKey,
      isProxy: proxyKeys.has(s.key),
      clientFeePct: s.clientFeePct,
      lines: lines.filter((l) => l.sectionKey === s.key).map(ceInput),
    }));
    return computeCeAggregates(ceSections, vatPct, totals.coTotal);
  }, [sections, lines, proxyKeys, vatPct, totals.coTotal]);

  const payTotal = useMemo(
    () => lines.filter((l) => !proxyKeys.has(l.sectionKey)).reduce((sum, l) => sum + payCapFor(ceInput(l), percentBase), 0),
    [lines, proxyKeys, percentBase],
  );

  const marginPct = ceMode ? ceAgg.marginPctNew : computeMarginPct(ceTotal, totals.coTotal);
  const marginOk = marginPct >= minMarginPct;
  const effectiveCeTotal = ceMode ? ceAgg.ceTotalDerived : ceTotal;

  // ── Mutators ──
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
  /** Xoá dòng — nếu là ĐẠI DIỆN của nhóm CE gộp thì bầu dòng kế tiếp làm đại diện, CHUYỂN ceName/ceQ/ceP
   *  sang nó (quyết định vòng 5: không để nhóm mồ côi mất CE). */
  function removeLine(key: string) {
    setLines((ls) => {
      const idx = ls.findIndex((l) => l.key === key);
      if (idx < 0) return ls;
      const dead = ls[idx];
      const heir = ceGroupHeirIndex(ls, idx);
      const heirKey = heir == null ? null : ls[heir].key;
      return ls
        .filter((l) => l.key !== key)
        .map((l) => (l.key === heirKey ? { ...l, ceName: dead.ceName || dead.itemName, ceQuantity: dead.ceQuantity, ceUnitPrice: dead.ceUnitPrice } : l));
    });
    setSelected((s) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });
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

  // ── Gộp / tách nhóm CE ──
  const selectedLines = lines.filter((l) => selected.has(l.key));
  const mergeSameSection = selectedLines.length >= 2 && selectedLines.every((l) => l.sectionKey === selectedLines[0].sectionKey);
  function mergeSelected() {
    if (!mergeSameSection) return;
    const groupKey = newStableKey();
    const keys = new Set(selectedLines.map((l) => l.key));
    // Dòng ĐẠI DIỆN + giá CE của nhóm chốt TRƯỚC updater (updater phải THUẦN — StrictMode gọi nó
    // hai lần ở dev; dùng cờ "first" bên ngoài thì lượt hai coi mọi dòng là thành viên và cả nhóm
    // MẤT giá CE, tổng báo khách tụt đúng phần của nhóm. Cùng lý do với addLine ở trên).
    const leaderKey = lines.find((l) => keys.has(l.key))!.key;
    // Mặc định CE của hàng gộp = Σ CE các dòng đang gộp, để tổng KHÔNG đổi ngay lúc gộp; Account
    // sửa lại sau nếu muốn chào khách con số khác.
    const ceSum = selectedLines.reduce((s, l) => s + Math.round((l.ceQuantity ?? 0) * (l.ceUnitPrice ?? 0)), 0);
    setLines((ls) =>
      ls.map((l) => {
        if (!keys.has(l.key)) return l;
        if (l.key === leaderKey) {
          return { ...l, ceGroupKey: groupKey, ceName: l.ceName || l.itemName, ceQuantity: 1, ceUnitPrice: ceSum };
        }
        return { ...l, ceGroupKey: groupKey, ceQuantity: null, ceUnitPrice: null, ceName: "" };
      }),
    );
    setSelected(new Set());
  }
  function ungroup(groupKey: string) {
    setLines((ls) =>
      ls.map((l) => (l.ceGroupKey === groupKey ? { ...l, ceGroupKey: null, ceQuantity: l.ceQuantity ?? (l.lineType === "QTY_PRICE" ? l.quantity : 1), ceUnitPrice: l.ceUnitPrice ?? null } : l)),
    );
  }

  // ── Make-up chế độ mới: đổ CE = Total CO nhóm × hệ số (toàn bảng hoặc các dòng đã chọn) ──
  function fillCeByFactor(onlySelected: boolean) {
    const targetKeys = onlySelected ? new Set(selectedLines.map((l) => l.key)) : null;
    setLines((ls) => {
      const bySection = new Map<string, Line[]>();
      for (const l of ls) {
        if (proxyKeys.has(l.sectionKey)) continue;
        (bySection.get(l.sectionKey) ?? bySection.set(l.sectionKey, []).get(l.sectionKey)!).push(l);
      }
      const patch = new Map<string, Partial<Line>>();
      for (const [, sectionLines] of bySection) {
        for (const row of ceRowsOf(sectionLines.map((l) => ({ ...ceInput(l), key: l.key })), percentBase)) {
          const leader = sectionLines.find((l) => l.key === (row.leader as { key: string }).key)!;
          if (targetKeys && !row.coLines.some((c) => targetKeys.has((c as { key: string }).key))) continue;
          const q = leader.ceQuantity ?? (leader.lineType === "QTY_PRICE" && leader.quantity > 0 ? leader.quantity : 1);
          patch.set(leader.key, { ceQuantity: q, ceUnitPrice: Math.round((row.coSum * makeupFactor) / q) });
        }
      }
      return ls.map((l) => (patch.has(l.key) ? { ...l, ...patch.get(l.key) } : l));
    });
    setCeMode(true);
  }

  // ── Convert bảng cũ → CE theo dòng: đúng phép phân bổ BM02 (factor + residual dồn dòng lớn nhất) ──
  function convertToLineCe() {
    const chain = quotationChain(ceTotal, vatPct, agencyFeePct);
    const svc = lines.filter((l) => !proxyKeys.has(l.sectionKey));
    // Trọng số = CO gross-up + giá trị tham chiếu kho (K3) — y hệt lineWeight của buildQuotationModel.
    const weight = (l: Line) => computeLineAmount(ceInput(l), percentBase) + (l.stockRefUnitPrice ? Math.round(l.quantity * l.stockRefUnitPrice) : 0);
    // Phân bổ theo HÀNG CE (nhóm kho tự gộp), bỏ dòng tài trợ khỏi phần chia tiền khách.
    const rows = ceRowsOf(svc.map((l) => ({ ...ceInput(l), key: l.key })), percentBase).map((r) => ({
      leaderKey: (r.leader as { key: string }).key,
      sponsored: !!r.leader.isSponsored,
      w: r.coLines.reduce((sum, c) => sum + weight(svc.find((l) => l.key === (c as { key: string }).key)!), 0),
    }));
    const chargeable = rows.filter((r) => !r.sponsored && r.w > 0);
    const totalW = chargeable.reduce((s, r) => s + r.w, 0);
    const factor = totalW > 0 ? chain.serviceSubtotal / totalW : 0;
    const alloc = new Map<string, number>();
    let given = 0;
    for (const r of chargeable) {
      const a = Math.round(r.w * factor);
      alloc.set(r.leaderKey, a);
      given += a;
    }
    // Residual dồn vào hàng lớn nhất — Σ phân bổ = serviceSubtotal TUYỆT ĐỐI.
    const largest = chargeable.reduce<(typeof chargeable)[number] | null>((m, r) => (m == null || r.w > m.w ? r : m), null);
    if (largest) alloc.set(largest.leaderKey, (alloc.get(largest.leaderKey) ?? 0) + (chain.serviceSubtotal - given));
    setLines((ls) =>
      ls.map((l) => {
        if (!alloc.has(l.key) && !rows.some((r) => r.leaderKey === l.key)) return l;
        const a = alloc.get(l.key);
        const q = l.lineType === "QTY_PRICE" && l.quantity > 0 ? l.quantity : 1;
        if (a == null) {
          // hàng tài trợ: hiện đơn giá would-be, engine tự tính tiền = 0
          const w = weight(l);
          return { ...l, ceQuantity: q, ceUnitPrice: Math.round((w * factor) / q) };
        }
        // Giữ Σ CE = serviceSubtotal tuyệt đối: nếu chia không tròn theo SL thì hàng đó chuyển SL=1.
        const p = Math.round(a / q);
        return p * q === a ? { ...l, ceQuantity: q, ceUnitPrice: p } : { ...l, ceQuantity: 1, ceUnitPrice: a };
      }),
    );
    // Phí theo mục kế thừa % phí agency của bảng cũ — chỉnh lại từng mục sau nếu muốn.
    setSections((ss) => ss.map((s) => (!s.isProxy && !s.parentKey && s.clientFeePct == null ? { ...s, clientFeePct: agencyFeePct } : s)));
    if (agencyFeePct !== 10 && agencyFeePct !== 5 && !customRates.includes(agencyFeePct)) setCustomRates((r) => [...r, agencyFeePct]);
    setCeMode(true);
  }

  function runMakeup() {
    // Markup-eligible: QTY_PRICE/FIXED, không thuộc hạng mục Chi hộ (kể cả nằm dưới 1 tổ tiên Chi hộ).
    // FIXED coi qty=1×fixedAmount.
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

  // ── Cột hiển thị (gate theo quyền + seg CE/CO) ──
  const showCE = ceMode && canViewCost && view !== "co";
  const showCO = view !== "ce" || !canViewCost;
  const showTot = canViewCost && view !== "ce";
  const showPay = canViewPaycap && view !== "ce";
  const showMg = canViewCost && ceMode && view !== "ce";
  // Đơn vị nằm trong khối CE khi khối đó hiện, ngược lại chuyển sang khối CO — luôn có đúng một cột.
  const unitInCo = !showCE;
  const colCount =
    2 + (showCE ? 4 : 0) + (showCO ? 4 + (unitInCo ? 1 : 0) : 0) + (showTot ? 1 : 0) + (showPay ? 1 : 0) + (showMg ? 1 : 0) + (showUtil ? 6 : 0) + (canEdit ? 1 : 0);

  // ── Danh sách mục theo cây (thứ tự render + indexPath cho STT) ──
  const serviceRoots = sections.filter((s) => !s.isProxy && !s.parentKey);
  const proxyRoots = sections.filter((s) => s.isProxy);
  const childrenOf = (key: string) => sections.filter((s) => s.parentKey === key);

  /** Tổng cả nhánh của một mục — CE gộp theo hàng, CO/thuế/trần theo dòng. */
  function branchStats(key: string): { ce: number; pre: number; tax: number; tot: number; pay: number } {
    const own = lines.filter((l) => l.sectionKey === key);
    const stats = {
      ce: ceRowsOf(own.map(ceInput), percentBase).reduce((s, r) => s + r.ceAmount, 0),
      pre: own.reduce((s, l) => s + computeLineNetAmount(ceInput(l), percentBase), 0),
      tax: own.reduce((s, l) => s + taxDisplayAmount(ceInput(l), percentBase), 0),
      tot: own.reduce((s, l) => s + computeLineAmount(ceInput(l), percentBase), 0),
      pay: own.reduce((s, l) => s + payCapFor(ceInput(l), percentBase), 0),
    };
    for (const c of childrenOf(key)) {
      const cs = branchStats(c.key);
      stats.ce += cs.ce;
      stats.pre += cs.pre;
      stats.tax += cs.tax;
      stats.tot += cs.tot;
      stats.pay += cs.pay;
    }
    return stats;
  }

  function setCollapseLevel(maxDepth: number) {
    const next: Record<string, boolean> = {};
    const walk = (list: Section[], depth: number) => {
      for (const s of list) {
        if (depth >= maxDepth) next[s.key] = true;
        walk(childrenOf(s.key), depth + 1);
      }
    };
    walk(serviceRoots, 1);
    walk(proxyRoots, 1);
    setCollapsed(next);
  }

  // ── Thanh cuộn ngang NỔI đáy khung, đồng bộ 2 chiều với lưới ──
  const gridRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [scrollW, setScrollW] = useState(0);
  const syncing = useRef(false);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const table = el.querySelector("table");
    if (!table) return;
    const ro = new ResizeObserver(() => setScrollW(table.scrollWidth));
    ro.observe(table);
    setScrollW(table.scrollWidth);
    return () => ro.disconnect();
  }, [sections.length, lines.length, colCount]);
  function syncScroll(from: "grid" | "bar") {
    if (syncing.current) return;
    syncing.current = true;
    const g = gridRef.current, b = barRef.current;
    if (g && b) {
      if (from === "grid") b.scrollLeft = g.scrollLeft;
      else g.scrollLeft = b.scrollLeft;
    }
    syncing.current = false;
  }

  const payload = { sections, lines };
  const l1Names = new Map(serviceRoots.map((s, i) => [s.key, `${sectionNumber([i])} — ${s.nameVi || t("untitledSection")}`]));
  const feeBuckets: { rate: number; fixed: boolean }[] = [{ rate: 10, fixed: true }, { rate: 5, fixed: true }, ...customRates.map((r) => ({ rate: r, fixed: false }))];

  // CE-5 — hai danh sách cho dải cảnh báo: dòng khách yêu cầu bỏ, và dòng có tiền báo khách nhưng
  // chưa có giá vốn (thường là dòng khách tự thêm khi import). Suy từ state, không lưu cột nào.
  const proxyKeySet = effectiveProxyKeys(sections);
  const droppedLines = lines.filter((l) => l.ceDropped).map((l) => l.itemName || t("colItem"));
  const ceNoCoLines = lines
    .filter(
      (l) =>
        !proxyKeySet.has(l.sectionKey) &&
        !l.ceDropped &&
        l.stockRefUnitPrice == null &&
        Math.round((l.ceQuantity ?? 0) * (l.ceUnitPrice ?? 0)) > 0 &&
        computeLineAmount(ceInput(l), totals.directCo) === 0,
    )
    .map((l) => l.itemName || t("colItem"));

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
      {/* Chế độ mới: ceTotal chỉ để server đối chiếu — server TỰ suy lại từ dòng (bỏ qua input này). */}
      {ceMode && <input type="hidden" name="ceTotal" value={effectiveCeTotal} />}

      {!canEdit && (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{t("readOnlyNote")}</p>
      )}

      {/* Scenario + template */}
      {canEdit && (
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
      )}
      {canEdit && sections.length === 0 && !showAllTemplates && allTemplates.length > matchingTemplates.length && (
        <button type="button" onClick={() => setShowAllTemplates(true)} className="text-xs font-medium text-brand-600 hover:underline">
          {t("showAllTemplates")}
        </button>
      )}

      {/* Banner convert bảng cũ → CE theo dòng (tự nguyện — Q2) */}
      {canEdit && !ceMode && lines.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-brand-700">{t("convertTitle")}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("convertBody")}</p>
          </div>
          <button type="button" onClick={convertToLineCe} disabled={ceTotal <= 0} className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50" title={ceTotal <= 0 ? t("convertNeedsCe") : undefined}>
            {t("convertBtn")}
          </button>
        </div>
      )}
      {canEdit && !ceMode && lines.length === 0 && (
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-brand-600">
          <input type="checkbox" checked={ceMode} onChange={(e) => setCeMode(e.target.checked)} />
          {t("enableCeMode")}
        </label>
      )}

      {/* KPI header realtime (chế độ mới) — sticky, cùng nguồn recalc với lưới */}
      {ceMode && canViewCost && (
        <div className="sticky top-0 z-30 grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface/95 p-2 backdrop-blur-sm sm:grid-cols-4 lg:grid-cols-7">
          <Kpi hero label={t("kpiSub")} value={formatNumber(ceAgg.ceService, locale)} />
          <Kpi label={t("kpiFee")} value={`+${formatNumber(ceAgg.feeTotal, locale)}`} />
          <Kpi label={t("kpiPreVat")} value={formatNumber(ceAgg.cePreVat, locale)} />
          <Kpi label={t("kpiCo")} value={formatNumber(totals.coTotal, locale)} accent="indigo" />
          {canViewPaycap && <Kpi label={t("kpiPay")} value={formatNumber(payTotal, locale)} accent="green" />}
          <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
            <p className="text-[10px] text-muted-foreground">{t("kpiMargin", { pct: formatNumber(minMarginPct, locale) })}</p>
            <p className={cn("text-sm font-bold tabular-nums", marginOk ? "text-success" : "text-danger")}>{formatPercent(marginPct, locale)}%</p>
          </div>
          <Kpi label={t("kpiProxy")} value={formatNumber(totals.chiHo, locale)} />
        </div>
      )}

      {/* Thanh chế độ xem + thu gọn cấp + cột phụ + gộp CE */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {canViewCost && ceMode && (
          <Seg
            options={[{ v: "both", label: t("viewBoth") }, { v: "ce", label: t("viewCe") }, { v: "co", label: t("viewCo") }]}
            value={view}
            onChange={(v) => setView(v as typeof view)}
            label={t("viewLabel")}
          />
        )}
        <Seg
          options={[{ v: "1", label: t("level1") }, { v: "2", label: t("level12") }, { v: "3", label: t("level123") }, { v: "all", label: t("levelAll") }]}
          value=""
          onChange={(v) => (v === "all" ? setCollapsed({}) : setCollapseLevel(Number(v)))}
          label={t("levelLabel")}
        />
        <button type="button" onClick={() => setShowUtil((x) => !x)} className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-medium", showUtil ? "border-brand-400 bg-brand-50 text-brand-700" : "border-border-strong text-muted-foreground hover:bg-surface-2")}>
          <Settings2 className="h-3.5 w-3.5" /> {t("utilToggle")}
        </button>
        {canEdit && ceMode && selected.size >= 2 && (
          <button type="button" onClick={mergeSelected} disabled={!mergeSameSection} title={mergeSameSection ? undefined : t("mergeHintSameSection")} className="inline-flex items-center gap-1 rounded-lg border border-brand-300 bg-brand-50 px-2 py-1 font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50">
            <Link2 className="h-3.5 w-3.5" /> {t("mergeBtn", { n: selected.size })}
          </button>
        )}
        {canEdit && ceMode && (
          <span className="ml-auto inline-flex items-center gap-1.5">
            <label className="text-muted-foreground">{t("makeupFactor")}</label>
            <NumberField decimals={2} value={makeupFactor} onChange={setMakeupFactor} className="h-7 w-16 rounded border border-border-strong bg-surface px-1.5 text-right text-xs" />
            <button type="button" onClick={() => fillCeByFactor(false)} className="rounded-lg border border-border-strong px-2 py-1 font-medium hover:bg-surface-2">
              {t("makeupFillAll")}
            </button>
            {selected.size > 0 && (
              <button type="button" onClick={() => fillCeByFactor(true)} className="rounded-lg border border-border-strong px-2 py-1 font-medium hover:bg-surface-2">
                {t("makeupFillSelected", { n: selected.size })}
              </button>
            )}
          </span>
        )}
      </div>

      {/* ── LƯỚI CHÍNH ── */}
      <div>
        <div ref={gridRef} onScroll={() => syncScroll("grid")} className="overflow-x-auto overflow-y-scroll max-h-[72vh] rounded-xl border border-border">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 z-10 w-12 border-b border-border bg-surface-2 px-2 py-1.5" />
                <th className="sticky left-12 z-10 min-w-[240px] border-b border-border bg-surface-2 px-2 py-1.5" />
                {showCE && <th colSpan={4} className="border-b border-l-2 border-border border-l-success/40 px-2 py-1.5 text-center font-semibold text-success">{t("gridCeHeader")}</th>}
                {showCO && <th colSpan={4 + (unitInCo ? 1 : 0)} className="border-b border-l-2 border-border border-l-brand-400/40 px-2 py-1.5 text-center font-semibold text-brand-600">{t("gridCoHeader")}</th>}
                {showTot && <th className="border-b border-l-2 border-border border-l-border-strong px-2 py-1.5 text-center font-semibold text-brand-700">{t("colTotalCo")}</th>}
                {showPay && <th className="border-b border-border px-2 py-1.5 text-center font-semibold text-success" title={t("colPayCapHint")}>{t("colPayCap")}</th>}
                {showMg && <th className="border-b border-border px-2 py-1.5 text-center">{t("colMargin")}</th>}
                {showUtil && <th colSpan={6} className="border-b border-l-2 border-border border-l-border-strong px-2 py-1.5 text-center">{t("utilToggle")}</th>}
                {canEdit && <th className="border-b border-border px-1 py-1.5" />}
              </tr>
              <tr className="bg-surface-2 text-left text-muted-foreground">
                <th className="sticky left-0 z-10 border-b border-border bg-surface-2 px-2 py-1.5">{t("colStt")}</th>
                <th className="sticky left-12 z-10 border-b border-border bg-surface-2 px-2 py-1.5">{t("colDesc")}</th>
                {showCE && (
                  <>
                    <th className="border-b border-l-2 border-border border-l-success/40 px-2 py-1.5 text-right">{t("colQty")}</th>
                    <th className="border-b border-border px-2 py-1.5">{t("colUnit")}</th>
                    <th className="border-b border-border px-2 py-1.5 text-right">{t("colUnitPrice")}</th>
                    <th className="border-b border-border px-2 py-1.5 text-right">{t("colCeAmount")}</th>
                  </>
                )}
                {showCO && (
                  <>
                    <th className="border-b border-l-2 border-border border-l-brand-400/40 px-2 py-1.5 text-right">{t("colQty")}</th>
                    {unitInCo && <th className="border-b border-border px-2 py-1.5">{t("colUnit")}</th>}
                    <th className="border-b border-border px-2 py-1.5 text-right">{t("colUnitPrice")}</th>
                    <th className="border-b border-border px-2 py-1.5 text-right">{t("colCoPre")}</th>
                    <th className="border-b border-border px-2 py-1.5 text-right">{t("colCoTax")}</th>
                  </>
                )}
                {showTot && <th className="border-b border-l-2 border-border border-l-border-strong px-2 py-1.5 text-right font-semibold text-brand-700" title={t("colTotalCoHint")}>{t("colTotalCo")}</th>}
                {showPay && <th className="border-b border-border px-2 py-1.5 text-right font-semibold text-success">{t("colPayCap")}</th>}
                {showMg && <th className="border-b border-border px-2 py-1.5 text-right">{t("colMargin")}</th>}
                {showUtil && (
                  <>
                    <th className="border-b border-l-2 border-border border-l-border-strong px-2 py-1.5">{t("colType")}</th>
                    <th className="border-b border-border px-2 py-1.5">{t("colVendor")}</th>
                    <th className="border-b border-border px-2 py-1.5 text-center">{t("colLock")}</th>
                    <th className="border-b border-border px-2 py-1.5">{t("colMaxMarkup")}</th>
                    <th className="border-b border-border px-2 py-1.5 text-center" title={t("colSponsoredHint")}>{t("colSponsored")}</th>
                    <th className="border-b border-border px-2 py-1.5" title={t("colLegHint")}>{t("colLeg")}</th>
                  </>
                )}
                {canEdit && <th className="border-b border-border px-1 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {serviceRoots.map((s, i) => (
                <SectionRows key={s.key} section={s} depth={1} indexPath={[i]} ctx={rowCtx()} />
              ))}
              {proxyRoots.map((s) => (
                <SectionRows key={s.key} section={s} depth={1} indexPath={[]} ctx={rowCtx()} proxyRoot />
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-2 py-6 text-center text-muted-foreground">{t("none")}</td>
                </tr>
              )}
              {/* Dòng phí QL + tổng cuối bảng — đúng vị trí quen trong file Excel (chế độ mới) */}
              {ceMode && canViewCost && (
                <>
                  {feeBuckets.map((b) => {
                    const members = serviceRoots.filter((s) => s.clientFeePct === b.rate);
                    if (members.length === 0 && !b.fixed) return null;
                    const amt = members.reduce((sum, s) => sum + (ceAgg.feeBySection.get(s.key) ?? 0), 0);
                    const roms = members.map((s) => sectionNumber([serviceRoots.indexOf(s)])).join(", ");
                    return (
                      <SummaryTableRow
                        key={`fee-${b.rate}`}
                        colCount={colCount}
                        showCE={showCE}
                        label={members.length > 0 ? t("feeRowLabel", { rate: formatNumber(b.rate, locale), sections: roms }) : t("feeRowLabelEmpty", { rate: formatNumber(b.rate, locale) })}
                        value={members.length > 0 ? formatNumber(amt, locale) : "—"}
                      />
                    );
                  })}
                  <SummaryTableRow label={t("grandRowLabel")} value={formatNumber(ceAgg.cePreVat, locale)} colCount={colCount} showCE={showCE} strong />
                  <SummaryTableRow label={t("vatRowLabel", { pct: formatNumber(vatPct, locale) })} value={formatNumber(ceAgg.ceTotalDerived - ceAgg.cePreVat, locale)} colCount={colCount} showCE={showCE} />
                  <SummaryTableRow label={t("totalRowLabel")} value={formatNumber(ceAgg.ceTotalDerived, locale)} colCount={colCount} showCE={showCE} strong />
                </>
              )}
            </tbody>
          </table>
        </div>
        {/* Bar cuộn ngang NỔI — sticky đáy viewport, đồng bộ 2 chiều với lưới */}
        <div ref={barRef} onScroll={() => syncScroll("bar")} className="sticky bottom-0 z-30 mt-0.5 h-3.5 overflow-x-auto overflow-y-hidden rounded bg-surface-2">
          <div style={{ width: scrollW, height: 1 }} />
        </div>
      </div>

      {canEdit && (
        <button type="button" onClick={() => addSection(false, null)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
          <Plus className="h-3.5 w-3.5" />
          {t("addSection")}
        </button>
      )}
      {canEdit && proxyRoots.length === 0 && (
        <button type="button" onClick={() => addSection(true)} className="ml-4 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
          <Plus className="h-3.5 w-3.5" />
          {t("proxySectionTitle")}
        </button>
      )}

      {/* K3 — Kho đã duyệt: chèn CẶP dòng (hàng lấy từ kho giá 0 + hàng mua bù) vào một hạng mục. */}
      {canEdit && stockReservations.length > 0 && (
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

      {/* Phí DỊCH VỤ của khối Chi hộ — RIÊNG, nằm ngoài margin và ngoài phí quản lý báo khách
          (bất biến #2). Mỗi mục Chi hộ gốc một dòng cấu hình. */}
      {canViewCost &&
        proxyRoots.map((s) => {
          const sub = lines.filter((l) => l.sectionKey === s.key).reduce((sum, l) => sum + computeLineAmount(ceInput(l), percentBase), 0);
          const feeAmt = s.proxyFeeType === "FIXED" ? (s.proxyFeeVal ?? 0) : Math.round((sub * (s.proxyFeeVal ?? 0)) / 100);
          return (
            <div key={s.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border-strong px-3 py-2 text-xs">
              <span className="font-medium text-foreground">{t("proxySectionTitle")}</span>
              <span className="text-muted-foreground">{t("proxySubtotal")}: {formatNumber(sub, locale)}</span>
              <label className="flex items-center gap-1.5">
                {t("proxyFeeType")}:
                <select value={s.proxyFeeType ?? "PCT"} disabled={!canEdit} onChange={(e) => updateSection(s.key, { proxyFeeType: e.target.value })} className="h-7 rounded border border-border-strong bg-surface px-1.5">
                  <option value="PCT">{t("proxyFeePct")}</option>
                  <option value="FIXED">{t("proxyFeeFixed")}</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                {t("proxyFeeVal")}:
                <NumberField decimals={2} value={s.proxyFeeVal ?? 0} disabled={!canEdit} onChange={(v) => updateSection(s.key, { proxyFeeVal: v })} className="h-7 w-24 rounded border border-border-strong bg-surface px-1.5" />
              </label>
              <span className="font-medium text-foreground">= {formatNumber(feeAmt, locale)}</span>
            </div>
          );
        })}

      {/* Panel PHÍ QUẢN LÝ theo mục L1 (chế độ mới) — cùng nguồn recalc với dòng phí trong lưới */}
      {ceMode && canViewCost && (
        <section className="space-y-2 rounded-xl border border-border bg-surface p-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("feeCardTitle")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("feeCardHint")}</p>
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            {feeBuckets.map((b, bi) => {
              const members = serviceRoots.filter((s) => s.clientFeePct === b.rate);
              const amt = members.reduce((sum, s) => sum + (ceAgg.feeBySection.get(s.key) ?? 0), 0);
              return (
                <div key={`${b.rate}-${bi}`} className="rounded-lg border border-border bg-surface-2 p-2">
                  <div className="flex items-center gap-2 text-xs">
                    {b.fixed ? (
                      <span className="font-bold text-foreground">{formatNumber(b.rate, locale)}%</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-bold text-foreground">
                        {t("feeBucketOther")}
                        <NumberField
                          decimals={2}
                          value={b.rate}
                          onChange={(v) => {
                            const nv = Math.max(0, Math.min(100, v));
                            setSections((ss) => ss.map((s) => (!s.isProxy && !s.parentKey && s.clientFeePct === b.rate ? { ...s, clientFeePct: nv } : s)));
                            setCustomRates((rs) => rs.map((r) => (r === b.rate ? nv : r)));
                          }}
                          disabled={!canEdit}
                          className="h-6 w-14 rounded border border-border-strong bg-surface px-1 text-right text-xs"
                        />
                        %
                      </span>
                    )}
                    {canEdit && (
                      <span className="ml-auto flex gap-1 text-[10px]">
                        <button type="button" className="text-brand-600 hover:underline" onClick={() => setSections((ss) => ss.map((s) => (!s.isProxy && !s.parentKey && s.clientFeePct == null ? { ...s, clientFeePct: b.rate } : s)))}>
                          {t("feeSelectAll")}
                        </button>
                        <button type="button" className="text-muted-foreground hover:underline" onClick={() => setSections((ss) => ss.map((s) => (!s.isProxy && !s.parentKey && s.clientFeePct === b.rate ? { ...s, clientFeePct: null } : s)))}>
                          {t("feeClearAll")}
                        </button>
                      </span>
                    )}
                    {amt > 0 && <span className="text-[11px] font-semibold tabular-nums text-success">+{formatNumber(amt, locale)}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {serviceRoots.map((s, i) => {
                      const mine = s.clientFeePct === b.rate;
                      const other = s.clientFeePct != null && !mine;
                      return (
                        <label key={s.key} title={other ? t("feeTakenHint") : s.nameVi} className={cn("cursor-pointer rounded border px-1.5 py-0.5 text-[11px]", mine ? "border-brand-400 bg-brand-50 font-semibold text-brand-700" : other ? "cursor-not-allowed border-border text-muted-foreground opacity-50" : "border-border-strong text-foreground hover:bg-surface")}>
                          <input type="checkbox" className="sr-only" disabled={!canEdit || other} checked={mine} onChange={(e) => updateSection(s.key, { clientFeePct: e.target.checked ? b.rate : null })} />
                          {sectionNumber([i])}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {ceAgg.missingFeeSectionKeys.length > 0 ? (
            <p className="rounded-lg border border-warning/40 bg-warning-bg px-2.5 py-1.5 text-[11px] font-medium text-warning">
              {t("feeMissing", { names: ceAgg.missingFeeSectionKeys.map((k) => l1Names.get(k) ?? "?").join(" · ") })}
            </p>
          ) : (
            <p className="text-[11px] font-medium text-success">{t("feeOk")}</p>
          )}
          {/* CE-5 — dòng khách tự thêm: có tiền báo khách mà chưa có giá vốn ⇒ margin của bảng đang
              đẹp GIẢ. Cảnh báo mềm (không chặn lưu) vì Account có thể đang nhập dở. */}
          {ceNoCoLines.length > 0 && (
            <p className="rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1.5 text-[11px] font-medium text-brand-700">
              {t("ceNoCoWarn", { n: ceNoCoLines.length, names: ceNoCoLines.slice(0, 3).join(" · ") })}
            </p>
          )}
          {droppedLines.length > 0 && (
            <p className="rounded-lg border border-danger/40 bg-danger-bg px-2.5 py-1.5 text-[11px] font-medium text-danger">
              {t("droppedWarn", { n: droppedLines.length, names: droppedLines.slice(0, 3).join(" · ") })}
            </p>
          )}
        </section>
      )}

      {/* Header settings: mgmt fee / contingency / discount / VAT / phí agency (báo giá) */}
      {canViewCost && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 sm:grid-cols-5">
          <PctField label={t("mgmtFeePct")} hint={t("mgmtFeePctHint")} value={mgmtFeePct} onChange={setMgmtFeePct} disabled={!canEdit} />
          <PctField label={t("contingencyPct")} hint={t("contingencyPctHint")} value={contingencyPct} onChange={setContingencyPct} disabled={!canEdit} />
          <PctField label={t("discountPct")} hint={t("discountPctHint")} value={discountPct} onChange={setDiscountPct} disabled={!canEdit} />
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">VAT (%)</label>
            <NumberField decimals={2} value={vatPct} onChange={setVatPct} disabled={!canEdit} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
          </div>
          <PctField label={t("agencyFeePct")} hint={t("agencyFeePctHint")} value={agencyFeePct} onChange={setAgencyFeePct} disabled={!canEdit} />
        </div>
      )}

      {/* Totals + margin — chế độ CŨ nhập ceTotal tay; chế độ MỚI hiện số suy ra (khoá) */}
      {canViewCost && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-2 p-4 sm:grid-cols-4">
          <Stat label={t("coTotal")} value={formatNumber(totals.coTotal, locale)} />
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">{t("ceTotal")}</label>
            {ceMode ? (
              <div className="flex h-9 items-center rounded-lg bg-surface px-2.5 text-sm font-semibold tabular-nums text-foreground" title={t("ceTotalDerivedHint")}>
                {formatNumber(effectiveCeTotal, locale)}
              </div>
            ) : (
              <NumberField name="ceTotal" value={ceTotal} onChange={setCeTotal} disabled={!canEdit} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
            )}
          </div>
          <Stat label={t("chiHo")} value={formatNumber(totals.chiHo, locale)} />
          <div>
            <span className="mb-1 block text-xs font-medium text-foreground">{t("margin")}</span>
            <div className={cn("flex h-9 items-center rounded-lg px-2.5 text-sm font-semibold", marginOk ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
              {formatPercent(marginPct, locale)}% · {marginOk ? t("marginOk") : t("marginLow", { pct: formatNumber(minMarginPct, locale) })}
            </div>
          </div>
        </div>
      )}
      {canViewCost && <Stat label={t("grandTotalForClient")} value={formatNumber(clientBillableTotal(effectiveCeTotal, totals.chiHo), locale)} />}

      {canEdit && !ceMode && (
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
      )}

      {/* Override khi margin thấp */}
      {canEdit && !marginOk && (
        <div>
          <label className="mb-1 block text-xs font-medium text-danger">{t("overrideNote")}</label>
          <input name="overrideNote" value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} className={cn("h-10 w-full rounded-lg border bg-surface px-3 text-sm", state.fieldErrors?.overrideNote ? "border-danger" : "border-border-strong")} />
          {state.fieldErrors?.overrideNote && <p className="mt-1 text-xs text-danger">{state.fieldErrors.overrideNote}</p>}
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {pending ? tCommon("saving") : t("submitApprove")}
          </button>
          {/* Đánh dấu VAI TRÒ của bản lưu này. Không chọn = bản làm việc nội bộ (đa số) — cố ý để
              trống mặc định, ép chọn sẽ khiến người dùng gắn bừa và bản xuất nghiệm thu lấy nhầm bản.
              KHÔNG dùng state: người dùng chọn xong bấm Lưu ngay, và React 19 tự reset ô sau mỗi lần
              chạy action — reset về "bản nội bộ" ở đây là hành vi ĐÚNG cho lần lưu kế tiếp. */}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {t("revisionKindLabel")}
            <select name="revisionKind" defaultValue="" className="h-9 rounded-lg border border-border-strong bg-surface px-2 text-xs">
              <option value="">{t("revisionKindNone")}</option>
              {REVISION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`revisionKind${k}` as "revisionKindQUOTE")}
                </option>
              ))}
            </select>
          </label>
          {data?.approvedByName && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <CheckCircle2 className="h-4 w-4" />
              {t("approved")} — {t("approvedBy", { name: data.approvedByName, date: data.approvedAt ?? "" })}
            </span>
          )}
        </div>
      )}
    </form>
  );

  // Bọc context cho các hàm render hàng — tránh truyền ~20 props qua từng cấp đệ quy.
  function rowCtx(): RowCtx {
    return {
      t, locale, lines, sections, vendors, departments, percentBase, collapsed, setCollapsed,
      view, showCE, showCO, showTot, showPay, showMg, showUtil, unitInCo, colCount, canEdit,
      ceMode, selected, setSelected, updateSection, removeSection, addSection, updateLine, addLine,
      removeLine, ungroup, branchStats, childrenOf, serviceRoots, minMarginPct,
    };
  }
}

type RowCtx = {
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: Locale;
  lines: Line[];
  sections: Section[];
  vendors: { id: string; label: string }[];
  departments: { code: string; name: string; costPrefix: string }[];
  percentBase: number;
  collapsed: Record<string, boolean>;
  setCollapsed: (fn: (s: Record<string, boolean>) => Record<string, boolean>) => void;
  view: "both" | "ce" | "co";
  showCE: boolean;
  showCO: boolean;
  showTot: boolean;
  showPay: boolean;
  showMg: boolean;
  showUtil: boolean;
  unitInCo: boolean;
  colCount: number;
  canEdit: boolean;
  ceMode: boolean;
  selected: Set<string>;
  setSelected: (fn: (s: Set<string>) => Set<string>) => void;
  updateSection: (key: string, patch: Partial<Section>) => void;
  removeSection: (key: string) => void;
  addSection: (isProxy?: boolean, parentKey?: string | null) => void;
  updateLine: (key: string, patch: Partial<Line>) => void;
  addLine: (sectionKey: string) => void;
  removeLine: (key: string) => void;
  ungroup: (groupKey: string) => void;
  branchStats: (key: string) => { ce: number; pre: number; tax: number; tot: number; pay: number };
  childrenOf: (key: string) => Section[];
  serviceRoots: Section[];
  minMarginPct: number;
};

/** Màu nền theo tầng — L1 đậm nhất, từ L4 trắng (mockup). KHÔNG đặt transition-colors cạnh các nền
 *  này (bug kẹt màu theme đã ghi ở HANDOVER 10.24). */
const LAYER_BG = ["bg-brand-100", "bg-brand-50", "bg-surface-2", "bg-surface"];
function layerBg(depth: number, proxy: boolean): string {
  if (proxy) return "bg-warning-bg";
  return LAYER_BG[Math.min(depth, 4) - 1];
}

function SectionRows({ section: s, depth, indexPath, ctx, proxyRoot = false, proxyBranch = false }: { section: Section; depth: number; indexPath: number[]; ctx: RowCtx; proxyRoot?: boolean; proxyBranch?: boolean }) {
  const { t, locale, lines, collapsed, setCollapsed, colCount, canEdit, showCE, showCO, showTot, showPay, showMg, showUtil, unitInCo } = ctx;
  const isCollapsed = !!collapsed[s.key];
  const stats = ctx.branchStats(s.key);
  // Chỉ MỤC GỐC Chi hộ mang nhãn "CH"; mục con bên dưới vẫn đánh số bình thường (nhưng kế thừa
  // tính chất Chi hộ: không CE, không margin) — đánh "CH" cho cả nhánh thì không phân biệt được mục nào.
  const proxy = proxyRoot || proxyBranch;
  const stt = proxyRoot ? t("sttProxy") : sectionNumber(indexPath);
  const bg = layerBg(depth, proxy);
  const mg = !proxy && stats.ce > 0 ? ((stats.ce - stats.tot) / stats.ce) * 100 : null;
  const ownLines = lines.filter((l) => l.sectionKey === s.key);
  const children = ctx.childrenOf(s.key);

  return (
    <>
      <tr className={cn(bg, "font-medium")}>
        <td className={cn("sticky left-0 z-10 px-2 py-1.5 text-[11px] font-bold", bg)}>
          <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [s.key]: !c[s.key] }))} className="inline-flex items-center gap-0.5 text-foreground">
            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {stt}
          </button>
        </td>
        <td className={cn("sticky left-12 z-10 px-2 py-1", bg)} style={{ paddingLeft: 8 + (depth - 1) * 14 }}>
          <span className="flex items-center gap-1.5">
            {canEdit && !proxyRoot ? (
              <input
                value={locale === "vi" ? s.nameVi : s.nameEn || s.nameVi}
                onChange={(e) => ctx.updateSection(s.key, locale === "vi" ? { nameVi: e.target.value } : { nameEn: e.target.value })}
                placeholder={t("sectionNameVi")}
                className="h-7 w-full min-w-[140px] rounded border border-transparent bg-transparent px-1 text-xs font-semibold hover:border-border-strong focus:border-brand-400 focus:outline-none"
              />
            ) : (
              <span className="text-xs font-semibold">{proxyRoot ? t("proxySectionTitle") : (locale === "vi" ? s.nameVi : s.nameEn || s.nameVi) || t("untitledSection")}</span>
            )}
            {proxyRoot && <span className="whitespace-nowrap rounded bg-warning/15 px-1 py-0.5 text-[9px] font-bold text-warning">{t("proxyTag")}</span>}
            {canEdit && !proxyRoot && (
              <select
                value={s.departmentCode}
                onChange={(e) => ctx.updateSection(s.key, { departmentCode: e.target.value })}
                title={t("sectionDepartmentHint")}
                aria-label={t("sectionDepartment")}
                className="h-6 rounded border border-transparent bg-transparent px-0.5 text-[10px] text-muted-foreground hover:border-border-strong"
              >
                <option value="">{t("sectionDepartmentNone")}</option>
                {ctx.departments.map((d) => (
                  <option key={d.code} value={d.code}>{d.costPrefix}</option>
                ))}
              </select>
            )}
          </span>
        </td>
        {showCE && (
          <>
            <td colSpan={3} />
            <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{proxy ? "—" : formatNumber(stats.ce, locale)}</td>
          </>
        )}
        {showCO && (
          <>
            <td colSpan={1 + (unitInCo ? 1 : 0)} />
            <td />
            <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatNumber(stats.pre, locale)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{formatNumber(stats.tax, locale)}</td>
          </>
        )}
        {showTot && <td className="px-2 py-1.5 text-right font-bold tabular-nums text-brand-700">{formatNumber(stats.tot, locale)}</td>}
        {showPay && <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-success">{formatNumber(stats.pay, locale)}</td>}
        {showMg && (
          <td className="px-2 py-1.5 text-right tabular-nums">
            {mg == null ? <span className="text-muted-foreground">—</span> : <span className={cn("font-semibold", mg >= ctx.minMarginPct ? "text-success" : "text-danger")}>{formatPercent(mg, locale)}%</span>}
          </td>
        )}
        {showUtil && <td colSpan={6} />}
        {canEdit && (
          <td className="whitespace-nowrap px-1 py-1.5 text-right">
            <button type="button" title={t("addLine")} onClick={() => ctx.addLine(s.key)} className="mr-1 text-brand-600 hover:text-brand-700"><Plus className="h-3.5 w-3.5" /></button>
            {!proxyRoot && depth < MAX_SECTION_DEPTH && (
              <button type="button" title={t("addSubsection")} onClick={() => ctx.addSection(false, s.key)} className="mr-1 text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /></button>
            )}
            <button type="button" title={tRemoveTitle(t, proxyRoot)} onClick={() => ctx.removeSection(s.key)} className="text-danger hover:text-danger/80"><Trash2 className="h-3.5 w-3.5" /></button>
          </td>
        )}
      </tr>
      {!isCollapsed && <SectionLineRows section={s} depth={depth} proxy={proxy} ctx={ctx} lines={ownLines} />}
      {!isCollapsed &&
        children.map((c, i) => (
          <SectionRows key={c.key} section={c} depth={depth + 1} indexPath={[...indexPath, i]} ctx={ctx} proxyBranch={proxy} />
        ))}
    </>
  );
}

function tRemoveTitle(t: RowCtx["t"], proxy: boolean): string {
  return proxy ? t("proxySectionTitle") : t("addSection");
}

/** Các hàng DÒNG của một mục — gộp theo hàng CE: nhóm N dòng in 1 hàng CE + các dòng CO con thụt vào. */
function SectionLineRows({ section: s, depth, proxy, ctx, lines: ownLines }: { section: Section; depth: number; proxy: boolean; ctx: RowCtx; lines: Line[] }) {
  const { percentBase } = ctx;
  const rows = ceRowsOf(ownLines.map((l) => ({ ...ceInput(l), key: l.key })), percentBase);
  const byKey = new Map(ownLines.map((l) => [l.key, l]));
  return (
    <>
      {rows.map((r, i) => {
        const leader = byKey.get((r.leader as { key: string }).key)!;
        if (r.coLines.length === 1) {
          return <LineRow key={leader.key} line={leader} stt={i + 1} depth={depth} proxy={proxy} ctx={ctx} ceRole="single" />;
        }
        const isStockGroup = !leader.ceGroupKey && !!leader.stockResvLineId;
        return (
          <GroupRows
            key={leader.key}
            leader={leader}
            members={r.coLines.map((c) => byKey.get((c as { key: string }).key)!)}
            stt={i + 1}
            depth={depth}
            proxy={proxy}
            ctx={ctx}
            coSum={r.coSum}
            ceAmount={r.ceAmount}
            isStockGroup={isStockGroup}
          />
        );
      })}
    </>
  );
}

/** Hàng CE GỘP: 1 hàng CE khách nhìn (đại diện) + các dòng CO chi tiết thụt dưới. */
function GroupRows({ leader, members, stt, depth, proxy, ctx, coSum, ceAmount, isStockGroup }: {
  leader: Line; members: Line[]; stt: number; depth: number; proxy: boolean; ctx: RowCtx; coSum: number; ceAmount: number; isStockGroup: boolean;
}) {
  const { t, locale, showCE, showCO, showTot, showPay, showMg, showUtil, unitInCo, canEdit, percentBase } = ctx;
  const pre = members.reduce((s, l) => s + computeLineNetAmount(ceInput(l), percentBase), 0);
  const tax = members.reduce((s, l) => s + taxDisplayAmount(ceInput(l), percentBase), 0);
  const pay = members.reduce((s, l) => s + payCapFor(ceInput(l), percentBase), 0);
  const mg = !proxy && ceAmount > 0 ? ((ceAmount - coSum) / ceAmount) * 100 : null;
  const bg = "bg-surface";
  return (
    <>
      <tr className={cn(bg, "border-t border-border")}>
        <td className={cn("sticky left-0 z-10 px-2 py-1 text-right tabular-nums text-muted-foreground", bg)}>{stt}</td>
        <td className={cn("sticky left-12 z-10 px-2 py-1", bg)} style={{ paddingLeft: 8 + depth * 14 }}>
          <span className="flex items-center gap-1.5">
            {canEdit && showCE ? (
              <input value={leader.ceName || leader.itemName} onChange={(e) => ctx.updateLine(leader.key, { ceName: e.target.value })} placeholder={t("ceNamePlaceholder")} className={cellInput} />
            ) : (
              <span className="text-xs font-medium">{leader.ceName || leader.itemName}</span>
            )}
            <Badge tone={isStockGroup ? "brand" : "neutral"}>{isStockGroup ? t("stockGroupBadge") : t("groupBadge", { n: members.length })}</Badge>
            {canEdit && !isStockGroup && leader.ceGroupKey && (
              <button type="button" title={t("ungroup")} onClick={() => ctx.ungroup(leader.ceGroupKey!)} className="text-muted-foreground hover:text-danger"><Unlink className="h-3 w-3" /></button>
            )}
          </span>
        </td>
        {showCE && (
          <>
            <td className="px-1 py-1 text-right">
              <NumberField decimals={2} value={leader.ceQuantity ?? 0} onChange={(v) => ctx.updateLine(leader.key, { ceQuantity: v })} disabled={!canEdit} className={cn(cellInput, "w-14 text-right")} />
            </td>
            <td className="px-1 py-1">
              <input value={leader.unit} onChange={(e) => ctx.updateLine(leader.key, { unit: e.target.value })} disabled={!canEdit} className={cn(cellInput, "w-14")} />
            </td>
            <td className="px-1 py-1 text-right">
              <NumberField value={leader.ceUnitPrice ?? 0} onChange={(v) => ctx.updateLine(leader.key, { ceUnitPrice: v })} disabled={!canEdit} className={cn(cellInput, "w-24 text-right")} />
            </td>
            <td className="px-2 py-1 text-right font-semibold tabular-nums">{leader.isSponsored ? <span className="text-[10px] text-muted-foreground">{t("colSponsored")}</span> : formatNumber(ceAmount, locale)}</td>
          </>
        )}
        {showCO && (
          <>
            <td colSpan={1 + (unitInCo ? 1 : 0)} />
            <td />
            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{formatNumber(pre, locale)}</td>
            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{formatNumber(tax, locale)}</td>
          </>
        )}
        {showTot && <td className="px-2 py-1 text-right font-semibold tabular-nums text-brand-700">{formatNumber(coSum, locale)}</td>}
        {showPay && <td className="px-2 py-1 text-right tabular-nums text-success">{formatNumber(pay, locale)}</td>}
        {showMg && (
          <td className="px-2 py-1 text-right tabular-nums">
            {mg == null ? "" : <span className={cn("font-semibold", mg >= ctx.minMarginPct ? "text-success" : "text-danger")}>{formatPercent(mg, locale)}%</span>}
          </td>
        )}
        {showUtil && <td colSpan={6} />}
        {canEdit && <td />}
      </tr>
      {members.map((m) => (
        <LineRow key={m.key} line={m} stt={null} depth={depth + 1} proxy={proxy} ctx={ctx} ceRole="member" />
      ))}
    </>
  );
}

function LineRow({ line: l, stt, depth, proxy, ctx, ceRole }: { line: Line; stt: number | null; depth: number; proxy: boolean; ctx: RowCtx; ceRole: "single" | "member" }) {
  const { t, locale, showCE, showCO, showTot, showPay, showMg, showUtil, unitInCo, canEdit, ceMode, percentBase } = ctx;
  const input = ceInput(l);
  const amount = computeLineAmount(input, percentBase);
  const net = computeLineNetAmount(input, percentBase);
  const tax = taxDisplayAmount(input, percentBase);
  const pay = payCapFor(input, percentBase);
  // CE-5 — dòng khách yêu cầu BỎ: CE về 0 (giống nếp dòng tài trợ), CO vẫn tính vì hàng vẫn phải
  // mua chừng nào Account chưa quyết xoá hẳn. Phải khớp `ceRowsOf` ở lib/bidding.ts.
  const ceA = l.isSponsored || l.ceDropped ? 0 : Math.round((l.ceQuantity ?? 0) * (l.ceUnitPrice ?? 0));
  const mg = ceRole === "single" && !proxy && ceA > 0 ? ((ceA - amount) / ceA) * 100 : null;
  /** Dòng khách tự thêm: có tiền báo khách nhưng CHƯA có giá vốn — tô xanh dương + vào dải cảnh báo. */
  // Loại trừ dòng LẤY TỪ KHO: nó có CO = 0 do SỐ HỌC (hàng đã trả tiền ở hợp đồng trước), không
  // phải do thiếu giá vốn — cảnh báo ở đó là cảnh báo oan.
  const ceNoCo = ceMode && !proxy && l.stockRefUnitPrice == null && !l.ceDropped && ceA > 0 && amount === 0;
  // K3 — dòng LẤY TỪ KHO: số lượng khoá theo mức đã duyệt, ô đơn giá nhập GIÁ THAM CHIẾU (giá thật
  // luôn = 0 nên Trước thuế hiện 0). Loại dòng/thuế/khoá/markup/tài trợ đều không áp dụng.
  const isStock = l.stockRefUnitPrice != null;
  const availableTypes = proxy ? LINE_TYPES.filter((lt) => lt !== "PERCENT_OF_TOTAL") : LINE_TYPES;
  const selectable = canEdit && ceMode && ceRole === "single" && !proxy && !l.stockResvLineId;
  // Nền dòng: khách bỏ → xám nhạt · khách thêm chưa có giá vốn → xanh DƯƠNG (cố ý khác xanh lá của
  // dòng tăng tiền, theo quyết định chủ dự án 05/08 để hai thứ không lẫn nhau).
  const bg = l.ceDropped ? "bg-surface-2" : ceNoCo ? "bg-brand-50" : "bg-surface";

  return (
    <tr className={cn(bg, "border-t border-border/60")}>
      <td className={cn("sticky left-0 z-10 px-2 py-1 text-right tabular-nums text-muted-foreground", bg)}>
        {selectable ? (
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={ctx.selected.has(l.key)}
              onChange={(e) =>
                ctx.setSelected((s) => {
                  const next = new Set(s);
                  if (e.target.checked) next.add(l.key);
                  else next.delete(l.key);
                  return next;
                })
              }
            />
            <span>{stt}</span>
          </label>
        ) : (
          <span>{stt ?? "·"}</span>
        )}
      </td>
      <td className={cn("sticky left-12 z-10 px-2 py-1", bg)} style={{ paddingLeft: 8 + depth * 14 }}>
        <input
          value={l.itemName}
          onChange={(e) => ctx.updateLine(l.key, { itemName: e.target.value })}
          disabled={!canEdit}
          placeholder={t("colItem")}
          className={cn(cellInput, "min-w-[150px] font-medium", l.ceDropped && "text-muted-foreground line-through")}
        />
        <input value={l.specs} onChange={(e) => ctx.updateLine(l.key, { specs: e.target.value })} disabled={!canEdit} placeholder={t("specsPlaceholder")} className={cn(cellInput, "mt-0.5 min-w-[150px] text-[10px] text-muted-foreground")} />
        {isStock && <Badge tone="brand">{t("stockLineBadge")}</Badge>}
        {/* CE-5 — khách yêu cầu bỏ dòng: Account tự quyết xoá hẳn hay thương lượng khôi phục. */}
        {l.ceDropped && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            <Badge tone="danger">{t("droppedBadge")}</Badge>
            {canEdit && (
              <button type="button" onClick={() => ctx.updateLine(l.key, { ceDropped: false })} className="text-[10px] font-medium text-brand-600 hover:underline">
                {t("droppedRestore")}
              </button>
            )}
          </span>
        )}
        {ceNoCo && <Badge tone="brand">{t("ceNoCoBadge")}</Badge>}
      </td>
      {showCE && (
        ceRole === "member" ? (
          <td colSpan={4} className="px-2 py-1 text-center text-[10px] text-muted-foreground">↳</td>
        ) : (
          <>
            <td className="px-1 py-1 text-right">
              <NumberField decimals={2} value={l.ceQuantity ?? 0} onChange={(v) => ctx.updateLine(l.key, { ceQuantity: v })} disabled={!canEdit} className={cn(cellInput, "w-14 text-right")} />
            </td>
            <td className="px-1 py-1">
              <input value={l.unit} onChange={(e) => ctx.updateLine(l.key, { unit: e.target.value })} disabled={!canEdit} className={cn(cellInput, "w-14")} />
            </td>
            <td className="px-1 py-1 text-right">
              <NumberField value={l.ceUnitPrice ?? 0} onChange={(v) => ctx.updateLine(l.key, { ceUnitPrice: v })} disabled={!canEdit} className={cn(cellInput, "w-24 text-right")} />
            </td>
            <td className="px-2 py-1 text-right tabular-nums">{l.isSponsored ? <span className="text-[10px] text-muted-foreground">{t("colSponsored")}</span> : formatNumber(ceA, locale)}</td>
          </>
        )
      )}
      {showCO && (
        <>
          {l.lineType === "QTY_PRICE" ? (
            <>
              <td className="px-1 py-1 text-right">
                <NumberField decimals={2} value={l.quantity} onChange={(v) => ctx.updateLine(l.key, { quantity: v })} disabled={!canEdit || isStock} title={isStock ? t("stockQtyLocked") : undefined} className={cn(cellInput, "w-14 text-right")} />
              </td>
              {unitInCo && (
                <td className="px-1 py-1">
                  <input value={l.unit} onChange={(e) => ctx.updateLine(l.key, { unit: e.target.value })} disabled={!canEdit} className={cn(cellInput, "w-14")} />
                </td>
              )}
              <td className="px-1 py-1 text-right">
                {isStock ? (
                  <NumberField value={l.stockRefUnitPrice ?? 0} onChange={(v) => ctx.updateLine(l.key, { stockRefUnitPrice: v })} disabled={!canEdit} title={t("stockRefPriceHint")} className={cn(cellInput, "w-24 text-right italic")} />
                ) : (
                  <NumberField value={l.unitPrice} onChange={(v) => ctx.updateLine(l.key, { unitPrice: v })} disabled={!canEdit} className={cn(cellInput, "w-24 text-right")} />
                )}
              </td>
            </>
          ) : l.lineType === "FIXED" ? (
            <>
              <td colSpan={1 + (unitInCo ? 1 : 0)} className="px-1 py-1 text-center text-muted-foreground">—</td>
              <td className="px-1 py-1 text-right">
                <NumberField value={l.fixedAmount ?? 0} onChange={(v) => ctx.updateLine(l.key, { fixedAmount: v })} disabled={!canEdit} className={cn(cellInput, "w-24 text-right")} />
              </td>
            </>
          ) : (
            <>
              <td colSpan={1 + (unitInCo ? 1 : 0)} className="px-1 py-1 text-center text-muted-foreground">—</td>
              <td className="px-1 py-1 text-right">
                <NumberField decimals={2} value={l.percentVal ?? 0} onChange={(v) => ctx.updateLine(l.key, { percentVal: v })} disabled={!canEdit} className={cn(cellInput, "w-16 text-right")} />
              </td>
            </>
          )}
          <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{formatNumber(net, locale)}</td>
          <td className="px-1 py-1 text-right">
            {l.lineType === "PERCENT_OF_TOTAL" ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="flex items-center justify-end gap-1">
                <span className="tabular-nums text-muted-foreground">{formatNumber(tax, locale)}</span>
                {/* Loại thuế đổi được từng dòng bất kỳ lúc nào — rời VAT thì xoá %; rời OTHER xoá tiền nhập tay. */}
                <select
                  value={l.taxType}
                  disabled={!canEdit || isStock}
                  onChange={(e) => {
                    const tx = e.target.value;
                    ctx.updateLine(l.key, { taxType: tx, ...(tx !== "VAT" ? { vatPct: null } : {}), ...(tx !== "OTHER" ? { customTaxAmount: null } : {}) });
                  }}
                  className={cn(cellInput, "w-[64px]")}
                >
                  {availableTypes.map((tx) => (
                    <option key={tx} value={tx}>{t(taxTypeLabelKey(tx as TaxType))}</option>
                  ))}
                </select>
                {l.taxType === "VAT" && (
                  <select
                    value={l.vatPct == null ? "" : String(l.vatPct)}
                    disabled={!canEdit || isStock}
                    onChange={(e) => ctx.updateLine(l.key, { vatPct: e.target.value === "" ? null : Number(e.target.value) })}
                    title={t("vatPctHint")}
                    className={cn(cellInput, "w-[52px]")}
                  >
                    <option value="">{t("vatPctNone")}</option>
                    {VAT_PCT_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}%</option>
                    ))}
                  </select>
                )}
                {l.taxType === "OTHER" && (
                  <NumberField placeholder={t("customTaxAmountPlaceholder")} value={l.customTaxAmount ?? 0} onChange={(v) => ctx.updateLine(l.key, { customTaxAmount: v })} disabled={!canEdit} className={cn(cellInput, "w-20 text-right")} />
                )}
              </span>
            )}
          </td>
        </>
      )}
      {showTot && <td className="px-2 py-1 text-right font-semibold tabular-nums text-brand-700">{formatNumber(amount, locale)}</td>}
      {showPay && <td className="px-2 py-1 text-right tabular-nums text-success">{formatNumber(pay, locale)}</td>}
      {showMg && (
        <td className="px-2 py-1 text-right tabular-nums">
          {mg == null ? "" : <span className={cn("font-semibold", mg >= ctx.minMarginPct ? "text-success" : "text-danger")}>{formatPercent(mg, locale)}%</span>}
        </td>
      )}
      {showUtil && (
        <>
          <td className="px-1 py-1">
            <select value={l.lineType} onChange={(e) => ctx.updateLine(l.key, { lineType: e.target.value })} disabled={!canEdit || isStock} className={cn(cellInput, "min-w-[96px]")}>
              {availableTypes.map((lt) => (
                <option key={lt} value={lt}>{t(lineTypeLabelKey(lt as LineType))}</option>
              ))}
            </select>
          </td>
          <td className="px-1 py-1">
            <SearchableSelect value={l.vendorId} onChange={(v) => ctx.updateLine(l.key, { vendorId: v })} options={ctx.vendors.map((v) => ({ value: v.id, label: v.label }))} className="min-w-[110px]" />
          </td>
          <td className="px-1 py-1 text-center">
            <input type="checkbox" checked={l.isLocked} disabled={!canEdit} onChange={(e) => ctx.updateLine(l.key, { isLocked: e.target.checked })} />
          </td>
          <td className="px-1 py-1">
            <input type="number" step="any" placeholder="∞" value={l.maxMarkupPct} disabled={!canEdit || l.isLocked} onChange={(e) => ctx.updateLine(l.key, { maxMarkupPct: e.target.value })} className={cn(cellInput, "w-14")} />
          </td>
          {/* "TCM hỗ trợ": báo giá hiện đơn giá nhưng KHÔNG tính tiền dòng này (CE dòng = 0). Chỉ đổi
              cách trình bày bản xuất — CO của dòng vẫn vào giá vốn bình thường. */}
          <td className="px-1 py-1 text-center">
            <input type="checkbox" checked={l.isSponsored} disabled={!canEdit} onChange={(e) => ctx.updateLine(l.key, { isSponsored: e.target.checked })} />
          </td>
          {/* Nhãn CHẶNG (tỉnh/điểm/đợt) — thuần nhãn, không vào một công thức tiền nào. Gõ tay: danh
              sách tỉnh của mỗi chiến dịch khác nhau, đẻ bảng danh mục cho nó là thêm màn quản trị mà
              không ai được lợi. Bản xuất nghiệm thu gom theo đúng chuỗi này. */}
          <td className="px-1 py-1">
            <input value={l.legCode} onChange={(e) => ctx.updateLine(l.key, { legCode: e.target.value })} disabled={!canEdit} placeholder={t("colLegPlaceholder")} maxLength={40} className={cn(cellInput, "w-20")} />
          </td>
        </>
      )}
      {canEdit && (
        <td className="px-1 py-1 text-center">
          <button type="button" onClick={() => ctx.removeLine(l.key)} className="text-danger hover:text-danger/80">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

/**
 * Hàng TỔNG HỢP cuối bảng (dòng phí QL, tổng trước VAT, VAT, số tiền thanh toán).
 * Số luôn nằm ở cột "Thành tiền CE" khi khối CE hiện; khối CE ẩn thì số về ngay sau cột diễn giải —
 * hai nhánh cùng đếm đủ `colCount` ô để bảng không bị lệch cột.
 */
function SummaryTableRow({ label, value, colCount, showCE, strong = false }: { label: string; value: string; colCount: number; showCE: boolean; strong?: boolean }) {
  const rest = colCount - (showCE ? 6 : 3);
  return (
    <tr className={cn("bg-surface-2", strong && "font-bold")}>
      <td className="sticky left-0 z-10 bg-surface-2 px-2 py-1.5" />
      <td className={cn("sticky left-12 z-10 bg-surface-2 px-2 py-1.5 text-[11px]", strong ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>{label}</td>
      {showCE && <td colSpan={3} />}
      <td className="px-2 py-1.5 text-right tabular-nums">{value}</td>
      {rest > 0 && <td colSpan={rest} />}
    </tr>
  );
}

function Kpi({ label, value, hero = false, accent }: { label: string; value: string; hero?: boolean; accent?: "indigo" | "green" }) {
  return (
    <div className={cn("rounded-lg px-2.5 py-1.5", hero ? "bg-brand-50 ring-1 ring-brand-300" : "bg-surface-2")}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums", hero ? "text-base font-extrabold text-foreground" : "text-sm font-bold", !hero && accent === "indigo" && "text-brand-700", !hero && accent === "green" && "text-success", !hero && !accent && "text-foreground")}>{value}</p>
    </div>
  );
}

function Seg({ options, value, onChange, label }: { options: { v: string; label: string }[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="inline-flex overflow-hidden rounded-lg border border-border-strong">
        {options.map((o) => (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} className={cn("px-2 py-1 font-medium", value === o.v ? "bg-brand-500 text-white" : "bg-surface text-muted-foreground hover:bg-surface-2")}>
            {o.label}
          </button>
        ))}
      </span>
    </span>
  );
}

function PctField({ label, hint, value, onChange, disabled = false }: { label: string; hint: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground">{label}</label>
      <NumberField decimals={2} value={value} onChange={onChange} disabled={disabled} className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
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

const cellInput = "h-7 w-full rounded border border-transparent bg-transparent px-1 text-xs outline-none hover:border-border-strong focus:border-brand-400 disabled:opacity-70";
