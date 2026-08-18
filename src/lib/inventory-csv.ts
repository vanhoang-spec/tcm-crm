// ─────────────────────────────────────────────────────────
// CSV import danh mục kho — parser thuần, KHÔNG IO, không dep ngoài.
// Hỗ trợ: BOM UTF-8, CRLF/LF, field trong ngoặc kép (kèm "" escape),
// sniff delimiter `,` vs `;` (Excel VN hay xuất `;`).
// INVENTORY_CSV_COLUMNS là nguồn sự thật duy nhất cho cả parser lẫn file mẫu.
// Mã lô v3 (18/08/2026): cột đầu là "Mã SP" (PO-0042, để trống = tạo sản phẩm mới theo nhóm+tên); mã LÔ PO-0042.01 sinh tự động;
// mỗi dòng là (lô × kho); action gom các dòng cùng lô thành MỘT item, nhiều kho nhiều phiếu NK.
// ─────────────────────────────────────────────────────────

import { ITEM_CONDITION_CODES, ITEM_STATUS_CODES } from "./inventory-lot";

export const INVENTORY_CSV_COLUMNS = [
  "Mã SP",
  "Tên",
  "Nhóm",
  "Trạng thái",
  "Tình trạng",
  "Mã KH",
  "Mã dự án",
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
  /**
   * Mã lô v3: mã SẢN PHẨM có sẵn (PO-0042) — có thì lô treo vào đúng sản phẩm đó và Tên/Nhóm/ĐVT/Tái sử
   * dụng/Số phần của dòng bị BỎ QUA (sản phẩm là nguồn sự thật). Rỗng = tìm sản phẩm theo (nhóm gốc, tên)
   * hoặc tạo mới.
   */
  productCode: string;
  name: string;
  /** Khớp code node GỐC (2 ký tự) hoặc TÊN node bất kỳ trong cây (resolve ở action; trùng tên → lỗi) */
  categoryRef: string;
  statusCode: string; // R|P|C|W|L|D — bắt buộc khai (không mặc định ngầm)
  conditionCode: string; // B|P|S
  clientCode: string; // "" = hàng TCM (hàng khách gửi: có thể để trống → suy từ dự án sở hữu)
  /** K6: mã DỰ ÁN SỞ HỮU (mua từ chi phí dự án đó / khách gửi cho dự án đó); "" = hàng chung TCM */
  projectCode: string;
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
    const [productCode, name, categoryRef, statusRaw, condRaw, clientCode, projectCode, expiryRaw, clientDocNo, unit, reusableRaw, partCountRaw, warehouseCode, quantityRaw, note] = [
      (cells[0] ?? "").toUpperCase(),
      cells[1] ?? "",
      cells[2] ?? "",
      (cells[3] ?? "").toUpperCase(),
      (cells[4] ?? "").toUpperCase(),
      (cells[5] ?? "").toUpperCase(),
      (cells[6] ?? "").toUpperCase(),
      cells[7] ?? "",
      cells[8] ?? "",
      cells[9] ?? "",
      (cells[10] ?? "").toLowerCase(),
      cells[11] ?? "",
      cells[12] ?? "",
      cells[13] ?? "",
      cells[14] ?? "",
    ];

    // Có Mã SP thì Tên/Nhóm không bắt buộc (lấy từ sản phẩm); không có thì phải khai để tìm/tạo sản phẩm.
    if (!productCode && !name) {
      errors.push({ line, message: "MISSING_NAME" });
      continue;
    }
    if (!productCode && !categoryRef) {
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
      productCode,
      name,
      categoryRef,
      statusCode: statusRaw,
      conditionCode: condRaw,
      clientCode,
      projectCode,
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

/**
 * Khóa gom LÔ: các dòng cùng khóa = một lô (nhiều kho → nhiều dòng nhập). `productKey` do action giải ra
 * (id sản phẩm có sẵn, hoặc khoá "mới" theo nhóm gốc + tên) — lô = sản phẩm + tổ hợp thuộc tính.
 */
export function lotKey(productKey: string, r: ParsedInventoryRow): string {
  return [productKey, r.statusCode, r.conditionCode, r.clientCode, r.projectCode, r.expiryRaw, r.clientDocNo].join("‖");
}

/** File mẫu sinh từ chính INVENTORY_CSV_COLUMNS — 5 dòng: hàng chung TCM / lô thứ hai cùng sản phẩm / mua từ chi phí dự án / bộ 3 phần / hàng khách gửi có date. Cột Mã SP để trống = tạo sản phẩm mới theo (nhóm, tên); điền mã có sẵn (PO-0042) = thêm lô vào sản phẩm đó. Cột Mã dự án = DỰ ÁN SỞ HỮU (K6); trống = hàng chung TCM. */
export function buildSampleCsv(): string {
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const lines = [
    INVENTORY_CSV_COLUMNS.map(esc).join(","),
    ["", "Áo PG trắng size M", "DP", "R", "B", "", "", "", "", "cái", "Y", "", "HCM", "50", "Hàng chung TCM — Mã dự án trống"].map(esc).join(","),
    ["", "Áo PG trắng size M", "DP", "R", "S", "", "", "", "", "cái", "Y", "", "HCM", "12", "Cùng sản phẩm dòng trên → lô thứ hai (.02)"].map(esc).join(","),
    ["", "Loa di động JBL", "Âm thanh", "R", "S", "", "T013LO226A3", "", "", "cái", "Y", "", "HCM", "4", "Mua từ chi phí dự án T013 → team dự án đó duyệt khi ai xin dùng"].map(esc).join(","),
    ["", "Backdrop khung rời", "Backdrop", "R", "S", "", "", "", "", "bộ", "Y", "3", "HCM", "2", "Số lượng = số bộ đủ"].map(esc).join(","),
    ["", "Sữa mẫu 180ml", "Hàng hóa chạy project", "C", "B", "", "T013LO226A3", "2026-12-31", "PXK-0123", "thùng", "N", "", "HCM", "20", "Hàng khách gửi: khách suy từ dự án"].map(esc).join(","),
  ];
  return lines.join("\r\n") + "\r\n";
}
