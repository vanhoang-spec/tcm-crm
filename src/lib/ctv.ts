import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { CTV_COLUMNS } from "./ctv-columns";

/**
 * Import bảng thuê ngoài (BM08/QT.TCM.16) từ Excel + điền mẫu Word BM06/BM09 cho từng CTV.
 * Xem `templates/CTV-TEMPLATE-MAPPING.md` cho bảng đối chiếu tag Word ↔ cột Excel ↔ field.
 * Quyết định đã chốt: Thuế TNCN/Thực nhận LẤY NGUYÊN từ Excel, không tự tính lại; hồ sơ CTV chỉ
 * lưu phẳng theo dự án (không dedupe theo CCCD).
 *
 * File này kéo theo exceljs/pizzip/docxtemplater (Node-only) — KHÔNG import vào component
 * "use client" (xem src/lib/ctv-columns.ts nếu chỉ cần CTV_COLUMNS ở phía client).
 */

const SHEET_NAME = "BM8_TT";
// Dòng 14 = tiêu đề cột (STT/Họ và tên/.../Ghi chú) — không đọc trực tiếp, chỉ để tham chiếu vị trí.
const FIRST_DATA_ROW = 15;
const LAST_DATA_ROW = 72; // "Tổng cộng:" ở dòng 73 — không đọc quá dòng này

export { CTV_COLUMNS };
export type CtvColumnKey = (typeof CTV_COLUMNS)[number]["key"];

export type CtvRowInput = {
  sort: number;
  fullName: string;
} & Partial<Record<Exclude<CtvColumnKey, "fullName">, string | number | null>>;

export type CtvBatchHeader = {
  programFrom: string | null;
  programTo: string | null;
  teamLeader: string | null;
  workLocation: string | null;
};

function cellToString(value: ExcelJS.CellValue): string | null {
  if (value == null) return null;
  if (value instanceof Date) return formatSerialDate(value);
  if (typeof value === "object") {
    // formula cell: { formula, result } | rich text: { richText: [...] } | hyperlink: { text }
    const v = value as { result?: ExcelJS.CellValue; richText?: { text: string }[]; text?: string };
    if (v.richText) return v.richText.map((r) => r.text).join("").trim() || null;
    if (typeof v.text === "string") return v.text.trim() || null;
    if (v.result !== undefined) return cellToString(v.result);
    return null;
  }
  const s = String(value).trim();
  return s === "" ? null : s;
}

function cellToNumber(value: ExcelJS.CellValue): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object") {
    const v = value as { result?: ExcelJS.CellValue };
    if (v.result !== undefined) return cellToNumber(v.result);
    return null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[.,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cellToMoney(value: ExcelJS.CellValue): bigint | null {
  const n = cellToNumber(value);
  return n == null ? null : BigInt(Math.round(n));
}

/** Excel lưu ngày lẫn lộn: có ô text ("01/02/2000"), có ô serial Date (exceljs trả về `Date`). */
function formatSerialDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export type ParseCtvExcelResult = {
  header: CtvBatchHeader;
  rows: CtvRowInput[];
};

/** Đọc file `Bang chi tiet thanh toan thue ngoai.xlsx` (form BM08/QT.TCM.16), sheet `BM8_TT`. */
export async function parseCtvExcel(buffer: Buffer): Promise<ParseCtvExcelResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`SHEET_NOT_FOUND:${SHEET_NAME}`);

  const readHeaderValue = (row: number): string | null => {
    // Nhãn nằm ở ô gộp A:B (VD "Tên dự án:") — đọc ô A/B chỉ trả về CHÍNH cái nhãn đó (merged cell),
    // không phải giá trị. Giá trị thật nằm ở cột C (đã xác nhận: dòng 7 "Tên dự án" có C7=`=M4`,
    // 1 công thức trỏ tới ô nhập ở khối header phía trên — cùng cấu trúc cho dòng 8-11).
    return cellToString(sheet.getCell(`C${row}`).value);
  };

  const header: CtvBatchHeader = {
    programFrom: readHeaderValue(8),
    programTo: readHeaderValue(9),
    teamLeader: readHeaderValue(10),
    workLocation: readHeaderValue(11),
  };

  const rows: CtvRowInput[] = [];
  for (let r = FIRST_DATA_ROW; r <= LAST_DATA_ROW; r++) {
    const fullName = cellToString(sheet.getCell(`B${r}`).value);
    if (!fullName) continue; // dòng trống (template chừa sẵn tới dòng 72) — bỏ qua

    const row: CtvRowInput = { sort: rows.length + 1, fullName };
    for (const col of CTV_COLUMNS) {
      if (col.key === "fullName") continue;
      const raw = sheet.getCell(`${col.excelCol}${r}`).value;
      if (col.type === "money") {
        const money = cellToMoney(raw);
        row[col.key] = money == null ? null : Number(money);
      } else if (col.type === "number") {
        row[col.key] = cellToNumber(raw);
      } else {
        row[col.key] = cellToString(raw);
      }
    }
    rows.push(row);
  }

  return { header, rows };
}

export function ctvBatchTotal(rows: { amount: bigint | number | null; netReceived: bigint | number | null }[]) {
  let amount = BigInt(0);
  let netReceived = BigInt(0);
  for (const r of rows) {
    if (r.amount != null) amount += BigInt(r.amount);
    if (r.netReceived != null) netReceived += BigInt(r.netReceived);
  }
  return { amount, netReceived };
}

export type CtvContractForFill = {
  fullName: string;
  gender: string | null;
  dateOfBirth: string | null;
  idNumber: string | null;
  idIssueDate: string | null;
  idIssuePlace: string | null;
  permanentAddress: string | null;
  taxCode: string | null;
  bankAccountNo: string | null;
  bankName: string | null;
  bankBranch: string | null;
  phone: string | null;
  workItem: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: bigint | number | null;
  amount: bigint | number | null;
  pitTax: bigint | number | null;
  netReceived: bigint | number | null;
  executionDate: string | null;
  acceptanceDate: string | null;
};

const moneyFmt = (v: bigint | number | null) => (v == null ? "" : new Intl.NumberFormat("vi-VN").format(Number(v)));

/**
 * Đổ 1 dòng CTV + thông tin dự án/đợt vào mẫu `templates/ctv-bien-ban.docx` (đã chuẩn hoá — xem
 * `scripts/build-ctv-template.js` + `templates/CTV-TEMPLATE-MAPPING.md`). Trả buffer .docx đã điền
 * (chứa cả BM06 + BM09 cho người đó).
 */
export function fillCtvDocx(templateBuffer: Buffer, row: CtvContractForFill, batchWorkLocation: string | null, projectCode: string): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });

  doc.render({
    HoVaTen: row.fullName ?? "",
    NgaySinh: row.dateOfBirth ?? "",
    GioiTinh: row.gender ?? "",
    DiaChiThuongTru: row.permanentAddress ?? "",
    SoCCCDPassport: row.idNumber ?? "",
    NgayCap: row.idIssueDate ?? "",
    NoiCap: row.idIssuePlace ?? "",
    SDT: row.phone ?? "",
    MaSoThue: row.taxCode ?? "",
    SoTKNH: row.bankAccountNo ?? "",
    TenNganHang: row.bankName ?? "",
    ChiNhanh: row.bankBranch ?? "",
    HangMucCongViec: row.workItem ?? "",
    DonViTinh: row.unit ?? "",
    SoLuong: row.quantity == null ? "" : String(row.quantity),
    DonGia: moneyFmt(row.unitPrice),
    ThanhTien: moneyFmt(row.amount),
    ThueTNCN: moneyFmt(row.pitTax),
    ThucNhan: moneyFmt(row.netReceived),
    NgayThucHien: row.executionDate ?? "",
    NgayNghiemThu: row.acceptanceDate ?? "",
    DiaDiemLamViec: batchWorkLocation ?? "",
    Code: projectCode,
  });

  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Gói nhiều file .docx đã điền thành 1 ZIP để tải "Tất cả" — dùng chính pizzip (đã có sẵn dep). */
export function zipCtvDocs(files: { name: string; buffer: Buffer }[]): Buffer {
  const zip = new PizZip();
  for (const f of files) zip.file(f.name, f.buffer);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
