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
