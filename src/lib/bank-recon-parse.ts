import ExcelJS from "exceljs";
import { foldText, type PlanRow, type StatementRow } from "./bank-recon";

/**
 * Đọc 2 file Excel cho công cụ đối chiếu chi ngân hàng.
 *
 * ⚠ File này kéo theo exceljs (Node-only) — KHÔNG import vào component `"use client"`, đúng như
 * `lib/ctv.ts`. Phần khớp số nằm ở `bank-recon.ts` (thuần) để test được độc lập.
 *
 * ⚠ DÒ DÒNG TIÊU ĐỀ chứ không khoá cứng vị trí: file kế hoạch chi có 4 dòng tiêu đề + ô gộp phía
 * trên bảng, và số dòng đó đổi theo tháng. Khoá cứng "bảng bắt đầu ở dòng 6" là hỏng ngay tháng sau.
 */

const txt = (c: ExcelJS.Cell | undefined): string => {
  let v = c?.value as unknown;
  if (v && typeof v === "object") {
    if ("richText" in (v as object)) v = (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    else if ("result" in (v as object)) v = (v as { result: unknown }).result;
    else if ("text" in (v as object)) v = (v as { text: unknown }).text;
    else if (v instanceof Date) v = v.toISOString().slice(0, 10);
  }
  return v == null ? "" : String(v).replace(/\s+/g, " ").trim();
};

const num = (c: ExcelJS.Cell | undefined): number | null => {
  let v = c?.value as unknown;
  if (v && typeof v === "object" && "result" in (v as object)) v = (v as { result: unknown }).result;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Sao kê tải về đôi khi để số dạng chuỗi "385,043,407.00"
  const s = String(v ?? "").replace(/[^\d.-]/g, "");
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Tìm dòng tiêu đề: dòng đầu tiên chứa ĐỦ các nhãn yêu cầu. Trả số dòng + bản đồ nhãn → cột. */
function findHeader(ws: ExcelJS.Worksheet, required: string[], maxScan = 30): { row: number; col: (label: string) => number | null } | null {
  for (let r = 1; r <= Math.min(maxScan, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const map = new Map<string, number>();
    row.eachCell({ includeEmpty: false }, (c, i) => {
      const t = foldText(txt(c));
      if (t) map.set(t, i);
    });
    const hit = (label: string) => {
      const f = foldText(label);
      for (const [k, v] of map) if (k === f || k.startsWith(f)) return v;
      return null;
    };
    if (required.every((l) => hit(l) != null)) return { row: r, col: hit };
  }
  return null;
}

/**
 * Ngày duyệt lệnh của một sheet kế hoạch chi.
 * ⚠ KHÔNG lấy cột "Ngày nhận hồ sơ" — đó là ngày nhận chứng từ, khác hẳn ngày đi lệnh. Ngày đúng
 * nằm ở TIÊU ĐỀ bảng ("DANH SÁCH DUYỆT CHI NGÀY 17/8/2026"); không có thì rơi về TÊN SHEET ("17.08")
 * ghép với năm lấy từ tiêu đề/sheet khác.
 */
export function resolveApprovedDate(sheetName: string, titleText: string): string {
  const m = titleText.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
  const s = sheetName.match(/(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?/);
  if (s) {
    const year = s[3] ? (s[3].length === 2 ? `20${s[3]}` : s[3]) : "";
    return year ? `${s[1].padStart(2, "0")}/${s[2].padStart(2, "0")}/${year}` : `${s[1].padStart(2, "0")}/${s[2].padStart(2, "0")}`;
  }
  return sheetName;
}

/** Đọc file KẾ HOẠCH CHI — mỗi sheet là một ngày duyệt lệnh. */
export async function parsePlanWorkbook(buffer: Buffer): Promise<{ rows: PlanRow[]; sheets: string[]; skipped: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(buffer) as unknown as ArrayBuffer);
  const rows: PlanRow[] = [];
  const sheets: string[] = [];
  const skipped: string[] = [];

  for (const ws of wb.worksheets) {
    const h = findHeader(ws, ["Đối tượng chi", "Số tiền"]);
    if (!h) {
      skipped.push(ws.name);
      continue;
    }
    // tiêu đề bảng = toàn bộ text phía trên dòng header, để lấy ngày duyệt lệnh
    let title = "";
    for (let r = 1; r < h.row; r++) ws.getRow(r).eachCell({ includeEmpty: false }, (c) => (title += " " + txt(c)));
    const approvedDate = resolveApprovedDate(ws.name, title);

    const cSttP = h.col("Stt");
    const cDoc = h.col("Mã tìm HS");
    const cDesc = h.col("Diễn giải");
    const cBen = h.col("Đối tượng chi");
    const cAcc = h.col("Số tài khoản");
    const cBank = h.col("Tên ngân hàng");
    const cCode = h.col("Code");
    const cAmt = h.col("Số tiền");
    if (cBen == null || cAmt == null) {
      skipped.push(ws.name);
      continue;
    }

    let count = 0;
    for (let r = h.row + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const ben = cBen ? txt(row.getCell(cBen)) : "";
      const amt = num(row.getCell(cAmt));
      const desc = cDesc ? txt(row.getCell(cDesc)) : "";
      // dòng "TỔNG CỘNG" có tiền nhưng không có bên thụ hưởng → dừng đọc phần dữ liệu
      if (!ben || !amt || amt <= 0) {
        if (foldText(desc).includes("TONG CONG")) break;
        continue;
      }
      rows.push({
        stt: cSttP ? txt(row.getCell(cSttP)) || String(count + 1) : String(count + 1),
        docCode: cDoc ? txt(row.getCell(cDoc)) || null : null,
        approvedDate,
        description: desc,
        beneficiary: ben,
        bankAccount: cAcc ? txt(row.getCell(cAcc)) || null : null,
        bankName: cBank ? txt(row.getCell(cBank)) || null : null,
        projectCode: cCode ? txt(row.getCell(cCode)) || null : null,
        amount: amt,
      });
      count++;
    }
    if (count > 0) sheets.push(ws.name);
    else skipped.push(ws.name);
  }
  return { rows, sheets, skipped };
}

/**
 * Đọc file SAO KÊ NGÂN HÀNG.
 * ⚠ CHỈ lấy dòng có "Số tiền rút ra" — sao kê có cả tiền khách chuyển vào (file mẫu 17.08 có dòng
 * Colgate 48.988.800). Đưa tiền vào danh sách đối chiếu là khớp nhầm lung tung.
 */
export async function parseStatementWorkbook(buffer: Buffer): Promise<{ rows: StatementRow[]; creditCount: number } | null> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(buffer) as unknown as ArrayBuffer);
  for (const ws of wb.worksheets) {
    const h = findHeader(ws, ["Nội dung giao dịch", "Số tiền rút ra"]);
    if (!h) continue;
    const cDate = h.col("Ngày giao dịch") ?? h.col("Ngày hiệu lực");
    const cRef = h.col("Số GD");
    const cContent = h.col("Nội dung giao dịch")!;
    const cOut = h.col("Số tiền rút ra")!;

    const rows: StatementRow[] = [];
    let creditCount = 0;
    for (let r = h.row + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const out = num(row.getCell(cOut));
      const content = txt(row.getCell(cContent));
      if (!content) continue;
      if (!out || out <= 0) {
        creditCount++;
        continue;
      }
      rows.push({
        ref: cRef ? txt(row.getCell(cRef)) || null : null,
        date: cDate ? txt(row.getCell(cDate)) || null : null,
        content,
        amount: out,
      });
    }
    if (rows.length) return { rows, creditCount };
  }
  return null;
}
