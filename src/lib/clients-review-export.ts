import "server-only";
import ExcelJS from "exceljs";
import { parseClientsExcel } from "@/lib/clients-import";

/**
 * Xuất file Excel rà soát cho PIC 2/3/4 — bị bỏ qua lúc import chính (xem clients-import.ts) vì lệch
 * dòng so với tên khách hàng ở cột B (đã kiểm bằng domain email). File này liệt kê từng người tìm
 * được kèm gợi ý khách hàng phù hợp nhất theo domain email (so khớp với domain PIC1 của các khách
 * ĐÃ import) để team Account tự xác nhận rồi thêm tay qua màn hình liên hệ khách hàng có sẵn.
 *
 * KHÔNG tự động gán — chỉ gợi ý, đúng quyết định đã chốt (an toàn tuyệt đối, không gán nhầm ai).
 */

const SHEET_NAME = "KH";
const FIRST_DATA_ROW = 3;
const CLIENT_COL = 2;

// 3 khối PIC2/3/4, mỗi khối 4 cột: Tên | Chức danh | SĐT | Email
const PIC_BLOCKS = [
  { label: "PIC2", nameCol: 12, titleCol: 13, phoneCol: 14, emailCol: 15 },
  { label: "PIC3", nameCol: 16, titleCol: 17, phoneCol: 18, emailCol: 19 },
  { label: "PIC4", nameCol: 20, titleCol: 21, phoneCol: 22, emailCol: 23 },
] as const;

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

function firstValue(raw: string): string {
  return raw.split(/[\n;]/)[0]?.trim() ?? "";
}

function emailDomain(email: string): string {
  return (email.split("@")[1] || "").trim().toLowerCase();
}

export async function buildPicReviewWorkbook(buffer: Buffer): Promise<{ error: string } | { buffer: Buffer }> {
  // Tái dùng chính parser import để có domain PIC1 của từng khách — nguồn gợi ý duy nhất, tránh 2 nơi tự suy luận khác nhau.
  const parsed = await parseClientsExcel(buffer);
  if (parsed.fatalError) return { error: parsed.fatalError };

  const domainToClientNames = new Map<string, string[]>();
  for (const c of parsed.clients) {
    const domain = c.pic1?.email ? emailDomain(c.pic1.email) : "";
    if (!domain) continue;
    const list = domainToClientNames.get(domain) ?? [];
    if (!list.includes(c.name)) list.push(c.name);
    domainToClientNames.set(domain, list);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = workbook.getWorksheet(SHEET_NAME);
  if (!ws) return { error: `SHEET_NOT_FOUND:${SHEET_NAME}` };

  const out = new ExcelJS.Workbook();
  const sheet = out.addWorksheet("Ra soat PIC2-3-4");
  sheet.columns = [
    { header: "Dòng gốc trong file", key: "line", width: 16 },
    { header: "Khách hàng ghi cùng dòng (cột B)", key: "sameRowClient", width: 30 },
    { header: "Khối", key: "block", width: 8 },
    { header: "Tên PIC", key: "name", width: 26 },
    { header: "Chức danh", key: "title", width: 24 },
    { header: "SĐT", key: "phone", width: 18 },
    { header: "Email", key: "email", width: 30 },
    { header: "Domain email", key: "domain", width: 20 },
    { header: "Gợi ý khách hàng phù hợp (theo domain)", key: "suggested", width: 34 },
  ];
  sheet.getRow(1).font = { bold: true };

  let currentClient = "";
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const clientName = cellText(ws, r, CLIENT_COL).trim();
    if (clientName) currentClient = clientName;

    for (const block of PIC_BLOCKS) {
      const name = firstValue(cellText(ws, r, block.nameCol));
      if (!name) continue;
      const email = firstValue(cellText(ws, r, block.emailCol));
      const domain = email ? emailDomain(email) : "";
      const suggested = domain ? (domainToClientNames.get(domain) ?? []).filter((n) => n !== currentClient) : [];

      sheet.addRow({
        line: r,
        sameRowClient: currentClient,
        block: block.label,
        name,
        title: firstValue(cellText(ws, r, block.titleCol)) || "",
        phone: firstValue(cellText(ws, r, block.phoneCol)) || "",
        email,
        domain,
        suggested: suggested.length > 0 ? suggested.join(" / ") : "",
      });
    }
  }

  const arrayBuffer = await out.xlsx.writeBuffer();
  return { buffer: Buffer.from(arrayBuffer) };
}
