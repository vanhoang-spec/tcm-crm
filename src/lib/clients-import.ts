import "server-only";
import ExcelJS from "exceljs";

/**
 * Đọc file "Danh sách khách hàng" thật của TCM (Sales) — sheet "KH", header ở dòng 2, dữ liệu từ
 * dòng 3. Mirror pattern hard-code vị trí cột kiểu src/lib/ctv.ts (1 định dạng công ty cố định,
 * không phải parser CSV tổng quát).
 *
 * CHỈ đọc PIC1 (cột H-K). PIC 2/3/4 (cột L-W) trong file này bị lệch dòng so với tên khách hàng ở
 * cột B (đã kiểm bằng domain email — xem báo cáo rà soát) nên KHÔNG đọc ở đây; xem
 * clients-review-export.ts để xuất file cho team Account tự đối chiếu.
 *
 * 2 tầng vấn đề khi đọc:
 *  - `fatalError`: sai định dạng file (thiếu sheet/header) → KHÔNG import được gì, chặn cứng.
 *  - `warnings`: dữ liệu 1 dòng cụ thể không rõ ràng (vd trạng thái dự án lạ) → vẫn import với giá
 *    trị mặc định an toàn, chỉ cảnh báo để người duyệt xem lại ở màn hình xem trước.
 */

const SHEET_NAME = "KH";
const HEADER_ROW = 2;
const HEADER_CLIENT_LABEL = "Client";
const FIRST_DATA_ROW = 3;

const COL = {
  client: 2,
  shorten: 3,
  legalNameVi: 4,
  legalNameEn: 5,
  team: 7,
  pic1Name: 8,
  pic1Title: 9,
  pic1Phone: 10,
  pic1Email: 11,
  projectName: 25,
  projectStatus: 26,
  projectDetail: 27,
  projectNextStep: 28,
} as const;

export type ImportTeamCode = "A1" | "A2" | "A3" | null;
export type ImportProjectStatus = "BIDDING" | "PROCESSING" | "LIQUIDATION";

export type ParsedProjectRow = {
  sourceLine: number;
  name: string;
  statusCode: ImportProjectStatus;
  detail: string | null;
  nextStep: string | null;
};

export type ParsedContact1 = {
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
};

export type ParsedClientRow = {
  sourceLine: number;
  name: string;
  code: string; // đã dedupe trong file, 3 ký tự alnum in hoa
  legalNameVi: string | null;
  legalNameEn: string | null;
  teamCode: ImportTeamCode;
  pic1: ParsedContact1 | null;
  projects: ParsedProjectRow[];
};

export type ClientImportWarning = { line: number; message: string };

export type ParseClientsExcelResult = {
  fatalError: string | null;
  clients: ParsedClientRow[];
  warnings: ClientImportWarning[];
};

function cellText(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = ws.getRow(row).getCell(col).value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const anyV = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (v instanceof Date) return v.toISOString();
    if (anyV.richText) return anyV.richText.map((t) => t.text).join("");
    if (anyV.text !== undefined) return String(anyV.text);
    if (anyV.result !== undefined) return String(anyV.result);
    return "";
  }
  return String(v);
}

function orNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

/** Giá trị sentinel "không có dự án đang chạy" trong cột "on going project" — không phải tên dự án thật. */
const NO_PROJECT_SENTINELS = new Set(["ko", "không", "khong", "no", "none", "n/a", "-"]);
function isNoProjectSentinel(s: string): boolean {
  return NO_PROJECT_SENTINELS.has(s.trim().toLowerCase());
}

/** Ô có nhiều giá trị cách nhau bằng xuống dòng/dấu `;` (vd 2-3 PIC gộp 1 ô) — chỉ lấy giá trị đầu. */
function firstValue(raw: string): string {
  return raw.split(/[\n;]/)[0]?.trim() ?? "";
}

function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizeTeam(raw: string): ImportTeamCode {
  const t = stripDiacritics(raw.trim().toUpperCase()).replace(/\s+/g, "");
  if (t === "ACC1") return "A1";
  if (t === "ACC2") return "A2";
  if (t === "ACC3") return "A3";
  return null; // BOD, trống, hoặc giá trị lạ → khách chưa giao team ACC cụ thể
}

/** null = không nhận diện được → caller mặc định BIDDING kèm warning, KHÔNG chặn import. */
function normalizeProjectStatus(raw: string): ImportProjectStatus | null {
  const s = stripDiacritics(raw.trim().toLowerCase()).replace(/\s+/g, "");
  if (!s) return null;
  if (s.startsWith("bidding")) return "BIDDING";
  if (s === "processing") return "PROCESSING";
  if (s.includes("nghiemthu") || s.includes("ngiemthu")) return "LIQUIDATION"; // kể cả lỗi chính tả thiếu "h"
  return null;
}

/** code 3 ký tự alnum in hoa từ Shorten (ưu tiên) hoặc tên KH; dedupe trong CHÍNH file này bằng hậu tố số. */
function buildCode(shorten: string, name: string, used: Set<string>): string {
  const raw = stripDiacritics(shorten || name)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  const base = (raw.length >= 3 ? raw.slice(0, 3) : (raw + "XXX").slice(0, 3)) || "XXX";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let suffix = 2; suffix <= 9; suffix++) {
    const candidate = base.slice(0, 2) + String(suffix);
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const fallback = base.slice(0, 1) + String(used.size).slice(-2).padStart(2, "0");
  used.add(fallback);
  return fallback;
}

export async function parseClientsExcel(buffer: Buffer): Promise<ParseClientsExcelResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { fatalError: "INVALID_FILE", clients: [], warnings: [] };
  }

  const ws = workbook.getWorksheet(SHEET_NAME);
  if (!ws) return { fatalError: `SHEET_NOT_FOUND:${SHEET_NAME}`, clients: [], warnings: [] };

  const headerLabel = cellText(ws, HEADER_ROW, COL.client).trim();
  if (headerLabel !== HEADER_CLIENT_LABEL) {
    return { fatalError: `HEADER_MISMATCH: dòng ${HEADER_ROW} cột B = "${headerLabel}", cần "${HEADER_CLIENT_LABEL}"`, clients: [], warnings: [] };
  }

  const warnings: ClientImportWarning[] = [];
  const clients: ParsedClientRow[] = [];
  const usedCodes = new Set<string>();
  let current: ParsedClientRow | null = null;

  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const name = cellText(ws, r, COL.client).trim();

    if (name) {
      const shorten = cellText(ws, r, COL.shorten).trim();
      const pic1Name = firstValue(cellText(ws, r, COL.pic1Name));
      current = {
        sourceLine: r,
        name,
        code: buildCode(shorten, name, usedCodes),
        legalNameVi: orNull(cellText(ws, r, COL.legalNameVi)),
        legalNameEn: orNull(cellText(ws, r, COL.legalNameEn)),
        teamCode: normalizeTeam(cellText(ws, r, COL.team)),
        pic1: pic1Name
          ? {
              name: pic1Name,
              title: orNull(firstValue(cellText(ws, r, COL.pic1Title))),
              phone: orNull(firstValue(cellText(ws, r, COL.pic1Phone))),
              email: orNull(firstValue(cellText(ws, r, COL.pic1Email))),
            }
          : null,
        projects: [],
      };
      clients.push(current);
    }

    const projectName = cellText(ws, r, COL.projectName).trim();
    if (!projectName || isNoProjectSentinel(projectName)) continue;

    if (!current) {
      warnings.push({ line: r, message: "PROJECT_WITHOUT_CLIENT: có dự án nhưng không thuộc khách hàng nào ở trên" });
      continue;
    }

    const rawStatus = cellText(ws, r, COL.projectStatus).trim();
    const statusCode = normalizeProjectStatus(rawStatus);
    if (!statusCode) {
      warnings.push({
        line: r,
        message: rawStatus
          ? `UNKNOWN_PROJECT_STATUS: "${rawStatus}" không nhận diện được, mặc định Bidding`
          : "EMPTY_PROJECT_STATUS: trạng thái để trống, mặc định Bidding",
      });
    }

    current.projects.push({
      sourceLine: r,
      name: projectName,
      statusCode: statusCode ?? "BIDDING",
      detail: orNull(cellText(ws, r, COL.projectDetail)),
      nextStep: orNull(cellText(ws, r, COL.projectNextStep)),
    });
  }

  return { fatalError: null, clients, warnings };
}
