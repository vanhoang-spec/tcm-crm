// CE-4 — ĐỌC FILE BÁO GIÁ KHÁCH TRẢ VỀ và khớp lại với bảng CO/CE đang có.
//
// Vòng thật: xuất báo giá (CE-3) → khách sửa SL/đơn giá, xoá dòng, thêm dòng → gửi lại → Account
// import vào đây → builder mở BẢN NHÁP có đánh dấu thay đổi → Account rà rồi bấm Lưu (thành một
// revision mới). Import KHÔNG bao giờ tự ghi DB.
//
// Khớp dòng HAI LƯỢT, đúng tinh thần `pairSnapshotLines` của costsheet-diff.ts:
//   lượt 1 — theo cột ẩn `__key` (stableKey) nếu file còn giữ;
//   lượt 2 — phần còn lại theo TÊN dòng.
// Khách xoá cột ẩn thì cả file rơi về lượt 2; dòng không khớp được nằm ở `unmatchedInFile` cho
// người rà, KHÔNG đoán bừa.
//
// ⚠ Một dòng trong file khách = MỘT HÀNG CE (đã gộp). Hàng gộp mang stableKey của dòng ĐẠI DIỆN,
// nên thay đổi áp vào CE của cả nhóm; CO chi tiết bên dưới KHÔNG đụng tới.

import ExcelJS from "exceljs";

/** Tiêu đề cột ẩn trong file xuất — phải khớp `STABLE_KEY_HEADER` của costsheet-export.ts. */
export const IMPORT_KEY_HEADER = "__key";

/** Một dòng đọc được từ file khách. */
export type ImportedLine = {
  stableKey: string | null;
  name: string;
  qty: number | null;
  unitPrice: number | null;
  total: number | null;
  /** Sheet + số dòng — để báo cho người rà biết dòng lạ nằm ở đâu trong file. */
  sheet: string;
  row: number;
};

export type ImportParseResult = {
  lines: ImportedLine[];
  /** File có cột khoá ẩn không — không có thì mọi thứ khớp theo tên, độ tin cậy thấp hơn. */
  hasKeyColumn: boolean;
  sheetsRead: string[];
};

const MONEY_HEADERS = ["thành tiền", "thanh tien"];
const PRICE_HEADERS = ["đơn giá", "don gia"];
const QTY_HEADERS = ["khối lượng", "khoi luong", "số lượng", "so luong", "sl"];
const NAME_HEADERS = ["hạng mục", "hang muc", "diễn giải", "dien giai", "nội dung", "noi dung"];

const norm = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toLowerCase();

/** Ô Excel có thể là số, chuỗi có dấu phân cách, hoặc công thức đã tính sẵn. */
function cellNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "result" in (v as object)) {
    const r = (v as { result: unknown }).result;
    return typeof r === "number" ? r : null;
  }
  const s = String(v).replace(/[^\d,.-]/g, "");
  if (!s) return null;
  // Số kiểu vi-VN: "1.234.567,5" → bỏ dấu chấm ngăn nghìn, đổi phẩy thành chấm thập phân.
  const cleaned = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}\b)/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ô STT — CHỈ nhận số thật hoặc chuỗi toàn chữ số.
 *
 * ⚠ ĐỪNG dùng `cellNumber` ở đây: nó bóc mọi ký tự không phải chữ số, nên nhãn footer
 * "PHÍ QUẢN LÝ DỰ ÁN (10%)" ra 10 và "Thuế GTGT (0%)" ra 0 ⇒ dòng phí, dòng VAT và cả câu điều
 * khoản bị đọc thành HẠNG MỤC. Đã tái hiện: bản một sheet đọc ra 42 dòng thay vì 32.
 */
function sttNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("");
    if (typeof o.text === "string") return o.text;
    if (o.result != null) return String(o.result);
  }
  return String(v);
}

/**
 * Đọc file khách trả về. Nhận CẢ HAI bố cục: một sheet, hoặc nhiều sheet (bỏ qua sheet TỔNG HỢP vì
 * ở đó mỗi dòng là MỘT MỤC chứ không phải một hạng mục — gộp vào sẽ đếm tiền hai lần).
 */
export async function parseClientQuotationFile(buffer: Buffer): Promise<ImportParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const lines: ImportedLine[] = [];
  const sheetsRead: string[] = [];
  let hasKeyColumn = false;

  for (const ws of wb.worksheets) {
    if (norm(ws.name).startsWith("tổng hợp") || norm(ws.name).startsWith("tong hop")) continue;

    // Tìm HÀNG TIÊU ĐỀ: hàng có ô "STT" và ít nhất một ô tiền.
    let headerRow = 0;
    const col: { key?: number; name?: number; qty?: number; price?: number; total?: number } = {};
    ws.eachRow((row, rowNo) => {
      if (headerRow) return;
      const texts = new Map<number, string>();
      row.eachCell({ includeEmpty: false }, (c, n) => texts.set(n, norm(cellText(c.value))));
      const values = [...texts.values()];
      if (!values.includes("stt")) return;
      if (!values.some((t) => MONEY_HEADERS.includes(t))) return;
      headerRow = rowNo;
      for (const [n, t] of texts) {
        if (t === IMPORT_KEY_HEADER) col.key = n;
        else if (NAME_HEADERS.includes(t)) col.name ??= n;
        else if (QTY_HEADERS.includes(t)) col.qty ??= n;
        else if (PRICE_HEADERS.includes(t)) col.price ??= n;
        else if (MONEY_HEADERS.includes(t)) col.total ??= n;
      }
    });
    if (!headerRow || col.name == null) continue;
    if (col.key != null) hasKeyColumn = true;
    sheetsRead.push(ws.name);

    ws.eachRow((row, rowNo) => {
      if (rowNo <= headerRow) return;
      // Dòng HẠNG MỤC (section) và dòng footer đều gộp ô từ cột 1 → ô STT không phải số.
      const stt = sttNumber(row.getCell(1).value);
      if (stt == null) return;
      const name = cellText(row.getCell(col.name!).value).trim();
      if (!name) return;
      lines.push({
        stableKey: col.key != null ? cellText(row.getCell(col.key).value).trim() || null : null,
        name,
        qty: col.qty != null ? cellNumber(row.getCell(col.qty).value) : null,
        unitPrice: col.price != null ? cellNumber(row.getCell(col.price).value) : null,
        total: col.total != null ? cellNumber(row.getCell(col.total).value) : null,
        sheet: ws.name,
        row: rowNo,
      });
    });
  }

  return { lines, hasKeyColumn, sheetsRead };
}

// ── Khớp file ↔ bảng đang có ────────────────────────────────────────────────────────────────────

/** Một HÀNG CE của bảng hiện tại — bên nhận thay đổi. */
export type CurrentCeRow = {
  /** stableKey của dòng ĐẠI DIỆN (hàng gộp) — cũng là khoá ghi ngược vào builder. */
  stableKey: string;
  name: string;
  ceQuantity: number | null;
  ceUnitPrice: number | null;
  ceAmount: number;
};

export type MatchedChange = {
  stableKey: string;
  name: string;
  /** Tên khách gõ trong file (khác `name` = khách đổi tên dòng). */
  fileName: string;
  matchedBy: "key" | "name";
  before: { qty: number | null; unitPrice: number | null; amount: number };
  after: { qty: number | null; unitPrice: number | null; amount: number };
  /** Hướng thay đổi TIỀN của dòng — quyết định màu ở giao diện. */
  direction: "up" | "down" | "same";
};

export type ImportMatchResult = {
  /** Dòng khớp được VÀ có thay đổi (dòng y nguyên không nằm ở đây). */
  changed: MatchedChange[];
  /** Dòng trong file không khớp được dòng nào — khách thêm mới, hoặc sửa tên khi không có khoá. */
  unmatchedInFile: ImportedLine[];
  /** Dòng của bảng KHÔNG còn trong file — khách đã xoá. */
  missingInFile: CurrentCeRow[];
  matchedCount: number;
};

/** Bằng nhau trên tiền: coi null như "không đổi" (khách để trống ô thì giữ số cũ). */
function pick(fileVal: number | null, cur: number | null): number | null {
  return fileVal == null ? cur : fileVal;
}

/**
 * Khớp HAI LƯỢT: theo khoá ẩn trước, rồi theo tên. Trả về danh sách thay đổi để builder áp vào CE;
 * KHÔNG tự tính lại tổng — tổng do engine dựng lại từ dòng như mọi khi.
 *
 * Tiền của một hàng ưu tiên đọc THÀNH TIỀN của file; nếu khách chỉ sửa đơn giá thì thành tiền trong
 * file (nếu có) vẫn là con số khách CHỐT, nên lấy nó làm chuẩn và suy ngược đơn giá theo SL.
 */
export function matchImportedLines(
  file: ImportedLine[],
  current: CurrentCeRow[],
  /**
   * Dòng KHỐI CHI HỘ — có mặt trong file khách nhưng NẰM NGOÀI phạm vi mặc cả CE (khách trả đúng
   * chi phí thực, phí dịch vụ tính riêng). Bỏ qua hẳn thay vì báo "dòng lạ": báo lạ thì mỗi lần
   * import lại có 6 dòng nhiễu, người rà sẽ quen tay bỏ qua cả panel và bỏ sót dòng lạ THẬT.
   */
  ignore: { keys?: Set<string>; names?: Set<string> } = {},
): ImportMatchResult {
  const changed: MatchedChange[] = [];
  const usedCurrent = new Set<string>();
  const leftovers: ImportedLine[] = [];
  const ignoreNames = new Set([...(ignore.names ?? [])].map((n) => n.trim().toLowerCase()));
  const isIgnored = (f: ImportedLine) =>
    (f.stableKey != null && ignore.keys?.has(f.stableKey)) || ignoreNames.has(f.name.trim().toLowerCase());

  const byKey = new Map(current.map((r) => [r.stableKey, r]));
  const byName = new Map<string, CurrentCeRow[]>();
  for (const r of current) {
    const k = r.name.trim().toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(r);
  }

  const consider = (f: ImportedLine, cur: CurrentCeRow, matchedBy: "key" | "name") => {
    usedCurrent.add(cur.stableKey);
    const qty = pick(f.qty, cur.ceQuantity);
    // Thành tiền là con số khách chốt; thiếu nó thì suy từ SL × đơn giá.
    const price = pick(f.unitPrice, cur.ceUnitPrice);
    const amount = f.total != null ? f.total : Math.round((qty ?? 0) * (price ?? 0));
    // Đơn giá ghi lại theo tiền đã chốt để SL × đơn giá luôn khớp thành tiền của khách.
    const effPrice = qty && qty !== 0 ? Math.round(amount / qty) : price;
    const sameMoney = amount === cur.ceAmount && (qty ?? null) === (cur.ceQuantity ?? null) && (effPrice ?? null) === (cur.ceUnitPrice ?? null);
    // Khách ĐỔI TÊN mà không đổi tiền vẫn phải báo: đó là yêu cầu đổi cách gọi hạng mục trên báo
    // giá. Im lặng ở đây thì Account gửi lại bản dùng tên cũ và khách tưởng bị phớt lờ.
    const sameName = f.name.trim() === cur.name.trim();
    if (sameMoney && sameName) return;
    changed.push({
      stableKey: cur.stableKey,
      name: cur.name,
      fileName: f.name,
      matchedBy,
      before: { qty: cur.ceQuantity, unitPrice: cur.ceUnitPrice, amount: cur.ceAmount },
      after: { qty, unitPrice: effPrice, amount },
      direction: amount > cur.ceAmount ? "up" : amount < cur.ceAmount ? "down" : "same",
    });
  };

  for (const f of file) {
    if (isIgnored(f)) continue;
    const cur = f.stableKey ? byKey.get(f.stableKey) : undefined;
    if (cur && !usedCurrent.has(cur.stableKey)) consider(f, cur, "key");
    else if (cur) continue; // khoá trùng lặp trong file — bỏ qua lần thứ hai
    else leftovers.push(f);
  }

  const unmatchedInFile: ImportedLine[] = [];
  for (const f of leftovers) {
    const list = byName.get(f.name.trim().toLowerCase())?.filter((r) => !usedCurrent.has(r.stableKey));
    const cur = list?.[0];
    if (cur) consider(f, cur, "name");
    else unmatchedInFile.push(f);
  }

  // `consider` đánh dấu `usedCurrent` NGAY cả khi dòng không đổi gì, nên "khách đã xoá" = phần còn
  // lại của bảng. Đừng suy lại từ `changed` — dòng khách giữ nguyên sẽ bị báo nhầm là đã xoá.
  const missingInFile = current.filter((r) => !usedCurrent.has(r.stableKey));

  return { changed, unmatchedInFile, missingInFile, matchedCount: usedCurrent.size };
}
