import "server-only";

import ExcelJS from "exceljs";
import { MONTHS, spendTotal, type OverheadRequestKind } from "./overhead";

/**
 * Đọc file chi phí văn phòng thật (`2026_HR_Chi phi van phong thực tế.xlsx`).
 *
 * HAI sheet, hai vai trò khác hẳn nhau:
 *   · "Total {năm}"        → NGÂN SÁCH: mỗi dòng 1 khoản chi (mã PID) + 12 con số theo tháng.
 *   · "Chi tiết {năm}-BOD" → THỰC CHI: mỗi dòng 1 lần chi, có tháng + tách VAT/TNCN/TNDN.
 *
 * Theo khuôn `parseClientsExcel` (src/lib/clients-import.ts) và `parseCtvExcel` (src/lib/ctv.ts):
 * hàm này CHỈ ĐỌC và trả về dữ liệu + cảnh báo. Ghi DB là việc của action, sau khi người dùng xem
 * trước và bấm xác nhận — không bao giờ import thẳng.
 */

export type ParsedOverheadItem = {
  pidCode: string;
  name: string;
  categoryLabel: string;
  requestKind: OverheadRequestKind;
  /** 12 phần tử, chỉ số 0 = tháng 1. */
  months: number[];
  /** Cột "TỔNG ĐÃ SỬ DỤNG" của file — KHÔNG ghi vào DB, chỉ để đối chiếu sau khi import thực chi. */
  usedInFile: number;
  note: string | null;
};

export type ParsedOverheadSpend = {
  pidCode: string;
  month: number;
  name: string;
  amountNet: number;
  vat: number;
  tncn: number;
  tndn: number;
  amountTotal: number;
  note: string | null;
};

export type ParseOverheadResult = {
  items: ParsedOverheadItem[];
  spends: ParsedOverheadSpend[];
  warnings: string[];
};

function cellNum(c: ExcelJS.Cell | undefined): number {
  if (!c) return 0;
  const v = c.value;
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    const r = (v as { result?: unknown }).result;
    if (typeof r === "number") return r;
  }
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cellText(c: ExcelJS.Cell | undefined): string {
  if (!c) return "";
  const v = c.value;
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join("").trim();
    if (o.text !== undefined) return String(o.text).trim();
    if (o.result !== undefined) return String(o.result).trim();
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return "";
  }
  return String(v).trim();
}

/** "Hàng tháng" | "Khi phát sinh" | "1 năm/lần" → mã nội bộ. */
function toRequestKind(raw: string): OverheadRequestKind {
  const s = raw.toLowerCase();
  if (s.includes("phát sinh")) return "ON_DEMAND";
  if (s.includes("năm")) return "YEARLY";
  return "MONTHLY";
}

/** "01/2026" | "6/2026" | Date → số tháng 1..12. Trả 0 nếu không đọc được. */
function toMonth(raw: string): number {
  const m = /^(\d{1,2})\s*\/\s*\d{4}$/.exec(raw.trim());
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= 12 ? n : 0;
  }
  const iso = /^\d{4}-(\d{2})-\d{2}/.exec(raw.trim());
  if (iso) return Number(iso[1]);
  return 0;
}

export async function parseOverheadExcel(buffer: Buffer, fiscalYear: number): Promise<ParseOverheadResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const warnings: string[] = [];

  const budgetSheet =
    wb.getWorksheet(`Total ${fiscalYear}`) ?? wb.worksheets.find((w) => w.name.toLowerCase().startsWith("total"));
  if (!budgetSheet) {
    return { items: [], spends: [], warnings: [`Không tìm thấy sheet "Total ${fiscalYear}".`] };
  }

  // ── Sheet ngân sách ──
  // Dòng nào có PID CODE (cột 3) mới là khoản chi; dòng tiêu đề nhóm (STT = I, II…) không có mã.
  const items: ParsedOverheadItem[] = [];
  const seen = new Set<string>();
  budgetSheet.eachRow({ includeEmpty: false }, (row, rowNo) => {
    if (rowNo <= 4) return; // 4 dòng đầu là tiêu đề (file gốc có 2 dòng tiêu đề chồng nhau)
    const pidCode = cellText(row.getCell(3));
    if (!pidCode) return;
    if (seen.has(pidCode)) {
      warnings.push(`Mã ${pidCode} xuất hiện nhiều lần trong sheet ngân sách — chỉ lấy dòng đầu.`);
      return;
    }
    seen.add(pidCode);

    const name = cellText(row.getCell(2));
    if (!name) warnings.push(`Mã ${pidCode} không có tên chi phí.`);

    // Cột 5..16 = tháng 1..12
    const months = MONTHS.map((m) => Math.round(cellNum(row.getCell(4 + m))));
    items.push({
      pidCode,
      name: name || pidCode,
      categoryLabel: cellText(row.getCell(4)),
      requestKind: toRequestKind(cellText(row.getCell(21))),
      months,
      usedInFile: Math.round(cellNum(row.getCell(18))),
      note: cellText(row.getCell(20)) || null,
    });
  });
  if (items.length === 0) warnings.push("Sheet ngân sách không có dòng nào có PID CODE.");

  // ── Sheet thực chi ──
  const detailSheet =
    wb.getWorksheet(`Chi tiết ${fiscalYear}-BOD`) ?? wb.worksheets.find((w) => w.name.toLowerCase().startsWith("chi tiết"));
  const spends: ParsedOverheadSpend[] = [];
  if (!detailSheet) {
    warnings.push(`Không tìm thấy sheet "Chi tiết ${fiscalYear}-BOD" — chỉ import ngân sách, chưa có thực chi.`);
  } else {
    detailSheet.eachRow({ includeEmpty: false }, (row, rowNo) => {
      if (rowNo <= 3) return;
      const pidCode = cellText(row.getCell(3));
      if (!pidCode) return;
      if (!seen.has(pidCode)) {
        warnings.push(`Dòng ${rowNo}: mã ${pidCode} có ở sheet chi tiết nhưng KHÔNG có trong ngân sách — bỏ qua.`);
        return;
      }
      const month = toMonth(cellText(row.getCell(4)));
      if (month === 0) {
        warnings.push(`Dòng ${rowNo} (${pidCode}): không đọc được "THÁNG CHI" — bỏ qua.`);
        return;
      }
      const amountNet = Math.round(cellNum(row.getCell(8)));
      const vat = Math.round(cellNum(row.getCell(9)));
      const tncn = Math.round(cellNum(row.getCell(10)));
      const tndn = Math.round(cellNum(row.getCell(11)));
      spends.push({
        pidCode,
        month,
        name: cellText(row.getCell(7)) || pidCode,
        amountNet,
        vat,
        tncn,
        tndn,
        // Tính LẠI thay vì tin cột 12 của file: cột đó là công thức, có dòng để trống.
        amountTotal: spendTotal(amountNet, vat, tncn, tndn),
        note: cellText(row.getCell(13)) || null,
      });
    });
  }

  return { items, spends, warnings };
}

/**
 * Đối chiếu tổng thực chi đọc từ sheet CHI TIẾT với cột "TỔNG ĐÃ SỬ DỤNG" của sheet TỔNG.
 *
 * ⚠ KẾT QUẢ ĐO TRÊN FILE THẬT 2026: hai bên KHÔNG khớp nhau, và đó là lỗi của file chứ không phải
 * của bộ đọc. Đã thử đủ 4 tổ hợp (net/tổng × luỹ kế tới T6/T7) trên 50 khoản:
 *   so bằng TỔNG tới T6 → 26 khớp · so bằng NET tới T6 → 14 khớp · các tổ hợp khác tệ hơn.
 * Nghĩa là (a) cơ sở so sánh đúng là TỔNG, và (b) cột tóm tắt được cập nhật tay nên trôi khỏi sheet
 * chi tiết — có khoản dừng ở T6, có khoản tới T7, có khoản tính kiểu khác.
 *
 * VÌ VẬY: sau khi import, "đã dùng" của app tính LẠI TỪ DANH SÁCH LẦN CHI, không lấy cột tóm tắt.
 * Hàm này chỉ để hiện bảng "chỗ nào file tự mâu thuẫn" cho kế toán xem lúc import — đó chính là thứ
 * module này sinh ra để chấm dứt.
 */
export function reconcileImport(items: ParsedOverheadItem[], spends: ParsedOverheadSpend[]) {
  const byPid = new Map<string, number>();
  for (const s of spends) byPid.set(s.pidCode, (byPid.get(s.pidCode) ?? 0) + s.amountTotal);
  return items
    .map((it) => {
      const parsed = byPid.get(it.pidCode) ?? 0;
      return { pidCode: it.pidCode, name: it.name, usedInFile: it.usedInFile, parsedFromDetail: parsed, diff: parsed - it.usedInFile };
    })
    .filter((r) => r.diff !== 0);
}
