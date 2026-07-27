// ─────────────────────────────────────────────────────────
// CSV import danh mục kho — parser thuần, KHÔNG IO, không dep ngoài.
// Hỗ trợ: BOM UTF-8, CRLF/LF, field trong ngoặc kép (kèm "" escape),
// sniff delimiter `,` vs `;` (Excel VN hay xuất `;`).
// INVENTORY_CSV_COLUMNS là nguồn sự thật duy nhất cho cả parser lẫn file mẫu.
// Kho v2 (27/07/2026): KHÔNG còn cột "Mã" — mã lô sinh tự động {G}.{ST}.{TT}.{KH3}.{seq3};
// mỗi dòng là (lô × kho); action gom các dòng cùng lô thành MỘT item, nhiều kho nhiều phiếu NK.
// ─────────────────────────────────────────────────────────

import { ITEM_CONDITION_CODES, ITEM_STATUS_CODES } from "./inventory-lot";

export const INVENTORY_CSV_COLUMNS = [
  "Tên",
  "Nhóm",
  "Trạng thái",
  "Tình trạng",
  "Mã KH",
  "Hạn dùng",
  "Số phiếu KH",
  "ĐVT",
  "Tái sử dụng (Y/N)",
  "Số phần tách",
  "Kho",
  "Số lượng",
  "Ghi chú",
] as const;

export type ParsedInventoryRow = {
  line: number; // số dòng trong file (1-based, tính cả header)
  name: string;
  /** Khớp code node GỐC (1 ký tự) hoặc TÊN node bất kỳ trong cây (resolve ở action; trùng tên → lỗi) */
  categoryRef: string;
  statusCode: string; // R|P|C|W|L|D — bắt buộc khai (không mặc định ngầm)
  conditionCode: string; // B|P|S
  clientCode: string; // "" = hàng TCM
  /** "YYYY-MM-DD" — UTC midnight theo quy ước app; "" = không có hạn dùng */
  expiryRaw: string;
  clientDocNo: string;
  unit: string;
  isReusable: boolean;
  /** 1 = item thường; 2..4 = bộ tách phần (Số lượng = số BỘ đủ → credit cho TỪNG phần con) */
  partCount: number;
  warehouseCode: string;
  quantity: number;
  note: string;
};

export type CsvRowError = { line: number; message: string };

/** Parser CSV tối giản theo RFC-4180: quote, "" escape, CRLF. Trả mảng dòng × mảng ô. */
export function parseCsv(text: string): string[][] {
  // BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // Sniff delimiter trên dòng đầu (ngoài ngoặc kép): `;` thắng nếu nhiều hơn `,`
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let commas = 0;
  let semis = 0;
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch === ",") commas++;
    else if (!inQ && ch === ";") semis++;
  }
  const delim = semis > commas ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Bỏ dòng trống hoàn toàn
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const YES_VALUES = new Set(["y", "yes", "1", "true", "có", "co"]);
const NO_VALUES = new Set(["n", "no", "0", "false", "không", "khong"]);

/**
 * Parse + validate file CSV danh mục. All-or-nothing: có lỗi → errors đầy đủ theo dòng,
 * caller KHÔNG import gì. Không kiểm tra DB (nhóm/khách/kho hợp lệ) — việc của action.
 */
export function parseInventoryCsv(buffer: Buffer): { rows: ParsedInventoryRow[]; errors: CsvRowError[] } {
  const rows: ParsedInventoryRow[] = [];
  const errors: CsvRowError[] = [];
  const parsed = parseCsv(buffer.toString("utf8"));
  if (parsed.length === 0) return { rows, errors: [{ line: 1, message: "EMPTY" }] };

  const header = parsed[0].map((h) => h.trim());
  const expected = INVENTORY_CSV_COLUMNS as readonly string[];
  if (header.length < expected.length || expected.some((c, i) => header[i] !== c)) {
    return { rows, errors: [{ line: 1, message: "BAD_HEADER" }] };
  }

  for (let r = 1; r < parsed.length; r++) {
    const line = r + 1;
    const cells = parsed[r].map((c) => c.trim());
    const [name, categoryRef, statusRaw, condRaw, clientCode, expiryRaw, clientDocNo, unit, reusableRaw, partCountRaw, warehouseCode, quantityRaw, note] = [
      cells[0] ?? "",
      cells[1] ?? "",
      (cells[2] ?? "").toUpperCase(),
      (cells[3] ?? "").toUpperCase(),
      (cells[4] ?? "").toUpperCase(),
      cells[5] ?? "",
      cells[6] ?? "",
      cells[7] ?? "",
      (cells[8] ?? "").toLowerCase(),
      cells[9] ?? "",
      cells[10] ?? "",
      cells[11] ?? "",
      cells[12] ?? "",
    ];

    if (!name) {
      errors.push({ line, message: "MISSING_NAME" });
      continue;
    }
    if (!categoryRef) {
      errors.push({ line, message: "MISSING_CATEGORY" });
      continue;
    }
    if (!(ITEM_STATUS_CODES as readonly string[]).includes(statusRaw)) {
      errors.push({ line, message: "BAD_STATUS" });
      continue;
    }
    if (!(ITEM_CONDITION_CODES as readonly string[]).includes(condRaw)) {
      errors.push({ line, message: "BAD_CONDITION" });
      continue;
    }
    if (expiryRaw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(expiryRaw)) {
      errors.push({ line, message: "BAD_EXPIRY" });
      continue;
    }

    let isReusable = true;
    if (YES_VALUES.has(reusableRaw)) isReusable = true;
    else if (NO_VALUES.has(reusableRaw)) isReusable = false;
    else if (reusableRaw !== "") {
      errors.push({ line, message: "BAD_REUSABLE_FLAG" });
      continue;
    }

    let partCount = 1;
    if (partCountRaw !== "") {
      const n = Number(partCountRaw);
      if (!Number.isInteger(n) || n < 1 || n > 4) {
        errors.push({ line, message: "BAD_PART_COUNT" });
        continue;
      }
      partCount = n;
    }

    if (!warehouseCode) {
      errors.push({ line, message: "MISSING_WAREHOUSE" });
      continue;
    }
    const qty = Number(quantityRaw);
    if (quantityRaw === "" || !Number.isInteger(qty) || qty < 0) {
      errors.push({ line, message: "BAD_QUANTITY" });
      continue;
    }

    rows.push({
      line,
      name,
      categoryRef,
      statusCode: statusRaw,
      conditionCode: condRaw,
      clientCode,
      expiryRaw,
      clientDocNo,
      unit,
      isReusable,
      partCount,
      warehouseCode: warehouseCode.toUpperCase(),
      quantity: qty,
      note,
    });
  }
  return { rows, errors };
}

/** Khóa gom LÔ: các dòng cùng khóa = một item (nhiều kho → nhiều dòng nhập). */
export function lotKey(r: ParsedInventoryRow): string {
  return [r.name.toLowerCase(), r.categoryRef.toLowerCase(), r.statusCode, r.conditionCode, r.clientCode, r.expiryRaw, r.clientDocNo].join("‖");
}

/** File mẫu sinh từ chính INVENTORY_CSV_COLUMNS — 4 dòng đủ 4 kiểu (thường / second-hand / bộ 3 phần / hàng khách có date). */
export function buildSampleCsv(): string {
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const lines = [
    INVENTORY_CSV_COLUMNS.map(esc).join(","),
    ["Áo PG trắng size M", "C", "R", "B", "", "", "", "cái", "Y", "", "HCM", "50", ""].map(esc).join(","),
    ["Loa di động JBL", "Âm thanh", "R", "S", "", "", "", "cái", "Y", "", "HCM", "4", "Đã qua 2 event"].map(esc).join(","),
    ["Backdrop khung rời", "Backdrop", "R", "S", "", "", "", "bộ", "Y", "3", "HCM", "2", "Số lượng = số bộ đủ"].map(esc).join(","),
    ["Sữa mẫu 180ml", "Hàng hóa chạy project", "C", "B", "DHG", "2026-12-31", "PXK-0123", "thùng", "N", "", "HCM", "20", "Hàng khách gửi"].map(esc).join(","),
  ];
  return lines.join("\r\n") + "\r\n";
}
