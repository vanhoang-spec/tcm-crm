// PUR-1 — hằng + hàm THUẦN dùng chung cho sub-module Thu mua (RFQ + hồ sơ NCC).
// KHÔNG import prisma / fs / server-only: client component (ô chọn tệp, form) import được.
// Hằng MIME/size ở đây, storage (rfq-storage.ts) chỉ RE-EXPORT — bài học client-kb (HANDOVER 10.13):
// storage import fs/promises, kéo vào client là `next build` hỏng mà tsc/eslint không bắt.

export const RFQ_STATUSES = ["DRAFT", "SENT", "COMPARING", "SUBMITTED", "CONFIRMED", "CANCELED"] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

/** Trạng thái RFQ còn "sống" — NCC còn gửi/gửi lại được báo giá qua cổng. */
export const RFQ_OPEN_FOR_QUOTES: readonly RfqStatus[] = ["SENT", "COMPARING"];

export const RFQ_VENDOR_STATUSES = ["INVITED", "SUBMITTED", "DECLINED"] as const;
export type RfqVendorStatus = (typeof RFQ_VENDOR_STATUSES)[number];

export const RFQ_SUBMIT_VIA = ["PORTAL", "MANUAL", "FILE"] as const;
export type RfqSubmitVia = (typeof RFQ_SUBMIT_VIA)[number];

export const VENDOR_DOC_KINDS = ["QUOTE", "PO", "CONTRACT", "OTHER"] as const;
export type VendorDocKind = (typeof VENDOR_DOC_KINDS)[number];

/**
 * File báo giá / hợp đồng NCC. `.pdf`, `.docx`, `.xlsx`, `.csv`, `.txt` bóc text được qua
 * `ai/extract-text.ts`. `.xls` (Excel 97-2003) và `.doc` VẪN cho tải lên để lưu hồ sơ nhưng bộ trích
 * text KHÔNG đọc được (repo chỉ có exceljs/mammoth) — nút AI sẽ báo "không đọc được nội dung", PUR
 * nhập tay hoặc nhờ NCC lưu lại thành .xlsx. Cố ý cho tải lên chứ không chặn: hồ sơ phải lưu được.
 */
export const RFQ_FILE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "image/jpeg",
  "image/png",
] as const;

export const MAX_RFQ_FILE_BYTES = 15 * 1024 * 1024;

/** Trần ký tự text file NCC gửi sang DeepSeek — cùng dải với CV/tài liệu KB (24.000). */
export const MAX_RFQ_TEXT_CHARS = 24000;

/** Token cổng NCC sống thêm bao lâu sau HẠN báo giá (NCC hay trễ vài ngày). */
export const RFQ_TOKEN_GRACE_DAYS = 7;

/** Không có hạn thì token sống bấy nhiêu ngày kể từ lúc phát. */
export const RFQ_TOKEN_DEFAULT_DAYS = 30;

/** Mã RFQ: {mã dự án}-RFQ{n} — cùng khuôn PO `{project.code}-PO{n}`. */
export function makeRfqCode(projectCode: string, seq: number): string {
  return `${projectCode}-RFQ${seq}`;
}

/**
 * Gợi ý mã NCC ĐÚNG 3 ký tự từ tên (PUR-2: khuôn Client.code): chữ cái đầu của tối đa 3 từ chính,
 * thiếu thì lấy tiếp chữ của từ cuối. Chỉ là GỢI Ý trên form tạo — PUR sửa lại được; server vẫn kiểm
 * VENDOR_CODE_RE + trùng.
 */
export function suggestVendorCode(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .trim();
  const words = ascii.split(/\s+/).filter(Boolean);
  const stop = new Set(["CTY", "CONG", "TY", "TNHH", "CP", "DV", "TM", "DICH", "VU", "THUONG", "MAI", "SX", "MTV", "CO", "LTD"]);
  const core = words.filter((w) => !stop.has(w));
  const pick = (core.length ? core : words).slice(0, 3);
  let code = pick.map((w) => w[0]).join("");
  if (code.length < 3 && pick.length) code = (code + pick[pick.length - 1].slice(1)).slice(0, 3);
  return code.length === 3 ? code : "";
}

/** Cửa sổ hết hạn token: hạn báo giá + grace, hoặc mặc định N ngày từ hôm nay. */
export function tokenExpiryFor(deadline: Date | null, now: Date): Date {
  const base = deadline ? new Date(deadline.getTime()) : new Date(now.getTime());
  base.setUTCDate(base.getUTCDate() + (deadline ? RFQ_TOKEN_GRACE_DAYS : RFQ_TOKEN_DEFAULT_DAYS));
  return base;
}

export type RfqLineForMatch = { id: string; itemName: string; specs?: string | null };

/** Bỏ dấu + thường hoá để so tên dòng. */
export function foldName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
