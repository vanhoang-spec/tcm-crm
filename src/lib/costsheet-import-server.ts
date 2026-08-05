import "server-only";

// CE-4 — phần IO của luồng import: nạp "bảng hiện tại dưới dạng HÀNG CE" và đọc lại file đã lưu.
//
// ⚠ Tách khỏi file `"use server"`: mọi export của file action đều là endpoint gọi được từ client và
// phải serialize được, mà hai hàm này trả `Set` — để chung sẽ vỡ khi có ai lỡ gọi từ client.

import { readAiFile } from "./ai-file-storage";
import { loadQuotationSource, buildQuotationModel } from "./costsheet-export";
import { parseClientQuotationFile, matchImportedLines, type CurrentCeRow, type ImportMatchResult } from "./costsheet-import";

export type CurrentCeSnapshot = {
  current: CurrentCeRow[];
  /** Dòng khối Chi hộ — có trong file khách nhưng ngoài phạm vi mặc cả CE. */
  ignore: { keys: Set<string>; names: Set<string> };
  lineCeMode: boolean;
};

/**
 * Bảng CO/CE hiện tại nhìn dưới dạng HÀNG CE (đã gộp) — đúng thứ khách nhìn thấy trong file xuất,
 * nên cũng là đúng thứ để khớp ngược lại. Dùng chung cho lúc import và lúc trang dựng bản nháp.
 */
export async function loadCurrentCeRows(projectId: string): Promise<CurrentCeSnapshot | null> {
  const src = await loadQuotationSource(projectId);
  if (!src) return null;
  const model = buildQuotationModel(src, "client");
  const current: CurrentCeRow[] = model.rows
    .filter((r) => r.kind === "line")
    .map((r) => {
      const l = r as { stableKey?: string | null; name: string; qty: number | null; unitPrice: number | null; total: number | null };
      return { stableKey: l.stableKey ?? "", name: l.name, ceQuantity: l.qty, ceUnitPrice: l.unitPrice, ceAmount: l.total ?? 0 };
    })
    .filter((r) => r.stableKey);
  const proxyLines = model.proxyRows.filter((r) => r.kind === "line") as { stableKey?: string | null; name: string }[];
  return {
    current,
    ignore: {
      keys: new Set(proxyLines.map((r) => r.stableKey).filter((x): x is string => !!x)),
      names: new Set(proxyLines.map((r) => r.name)),
    },
    lineCeMode: model.lineCeMode,
  };
}

/**
 * CE-5 — dựng payload `{ sections, lines }` ĐÚNG SHAPE mà `costSheetPayloadSchema` đòi, đọc thẳng
 * từ DB. Mirror `co-ce/page.tsx` (khối dựng CostSheetData cho builder) nhưng KHÔNG mirror quirk
 * `maxMarkupPct → chuỗi rỗng` của nó: `z.coerce.number("")` cho ra **0** chứ không phải null, tức
 * sẽ âm thầm đặt trần markup = 0% cho mọi dòng.
 *
 * Dùng để áp phản hồi của khách rồi gọi lại chính `saveCostSheet` — một đường ghi duy nhất.
 */
export async function buildSheetPayloadFromDb(projectId: string): Promise<{
  sheet: { id: string; scenario: string; vatPct: number; agencyFeePct: number; mgmtFeePct: number; contingencyPct: number; discountPct: number; templateId: string | null };
  payload: { sections: unknown[]; lines: unknown[] };
} | null> {
  const { prisma } = await import("./prisma");
  const { toNum } = await import("./utils");
  const sheet = await prisma.costSheet.findFirst({
    where: { projectId, version: "CTRACT" },
    orderBy: { createdAt: "desc" },
    include: { sections: { orderBy: { sort: "asc" }, include: { lines: { orderBy: { sort: "asc" } } } } },
  });
  if (!sheet) return null;

  const sections = sheet.sections.map((s) => ({
    key: s.id,
    parentKey: s.parentSectionId,
    code: s.code,
    icon: s.icon ?? "",
    nameVi: s.nameVi,
    nameEn: s.nameEn ?? "",
    colorSlot: s.colorSlot ?? "neutral",
    isProxy: s.isProxy,
    departmentCode: s.departmentCode ?? "",
    proxyFeeType: s.proxyFeeType,
    proxyFeeVal: s.proxyFeeVal,
    clientFeePct: s.clientFeePct,
  }));
  const lines = sheet.sections.flatMap((s) =>
    s.lines.map((l) => ({
      sectionKey: s.id,
      stableKey: l.stableKey ?? "",
      itemName: l.itemName,
      specs: l.specs ?? "",
      lineType: l.lineType,
      quantity: l.quantity,
      unit: l.unit ?? "",
      unitPrice: toNum(l.unitPrice),
      fixedAmount: l.fixedAmount == null ? null : toNum(l.fixedAmount),
      percentVal: l.percentVal,
      taxType: l.taxType,
      customTaxAmount: l.customTaxAmount == null ? null : toNum(l.customTaxAmount),
      vendorId: l.vendorId ?? "",
      isLocked: l.isLocked,
      maxMarkupPct: l.maxMarkupPct, // number | null — KHÔNG đổi sang chuỗi (xem chú thích trên)
      isSponsored: l.isSponsored,
      stockResvLineId: l.stockResvLineId,
      stockRefUnitPrice: l.stockRefUnitPrice == null ? null : toNum(l.stockRefUnitPrice),
      legCode: l.legCode ?? "",
      note: l.note ?? "",
      ceQuantity: l.ceQuantity,
      ceUnitPrice: l.ceUnitPrice == null ? null : toNum(l.ceUnitPrice),
      ceGroupKey: l.ceGroupKey,
      ceName: l.ceName ?? "",
      vatPct: l.vatPct,
      ceDropped: l.ceDropped,
    })),
  );

  return {
    sheet: {
      id: sheet.id,
      scenario: sheet.scenario,
      vatPct: sheet.vatPct,
      agencyFeePct: sheet.agencyFeePct,
      mgmtFeePct: sheet.mgmtFeePct,
      contingencyPct: sheet.contingencyPct,
      discountPct: sheet.discountPct,
      templateId: sheet.templateId,
    },
    payload: { sections, lines },
  };
}

/** Đọc lại file đã lưu rồi khớp — trang gọi khi URL có `?import=<key>`. Lỗi đọc → null, không ném. */
export async function matchSavedImport(projectId: string, fileKey: string): Promise<ImportMatchResult | null> {
  const base = await loadCurrentCeRows(projectId);
  if (!base) return null;
  try {
    const buf = await readAiFile(fileKey);
    const parsed = await parseClientQuotationFile(buf);
    return matchImportedLines(parsed.lines, base.current, base.ignore);
  } catch {
    return null;
  }
}
