import "server-only";

/**
 * Trích xuất TEXT THUẦN từ file đính kèm (mời thầu/khách gửi, export insights MKT) để nhét vào
 * prompt DeepSeek.
 *
 * Best-effort: PDF/DOCX/TXT/CSV/XLSX đọc được nội dung; DOC/PPT/hình ảnh trả về null (không có OCR/
 * parser trong repo) — chỗ gọi vẫn liệt kê tên file cho model biết là có tài liệu, chỉ là không đọc
 * được nội dung. KHÔNG throw — 1 file lỗi/hỏng không được làm sập cả yêu cầu AI.
 *
 * CSV + XLSX thêm ở MKT-1 (04/08/2026) để đọc file export Meta/LinkedIn. Thuần THÊM NHÁNH: không
 * đổi hành vi của 3 nhánh cũ, và `exceljs` vốn đã là dependency (dùng ở costsheet-export.ts).
 */

const MAX_CHARS_PER_FILE = 6000; // chặn 1 file quá dài nuốt hết ngân sách token của prompt

function truncate(text: string): { text: string; truncated: boolean } {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= MAX_CHARS_PER_FILE) return { text: cleaned, truncated: false };
  return { text: cleaned.slice(0, MAX_CHARS_PER_FILE), truncated: true };
}

/**
 * Bảng tính → text dạng TSV, mỗi sheet một header `[Sheet: tên]`.
 *
 * Dừng sớm khi đã đủ `MAX_CHARS_PER_FILE`: file export insights có thể hàng chục nghìn dòng, đọc
 * hết rồi mới cắt là đốt bộ nhớ vô ích. Ô rỗng ở cuối dòng bị bỏ để đỡ tốn token.
 */
async function xlsxToText(buffer: Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const parts: string[] = [];
  let size = 0;
  for (const ws of wb.worksheets) {
    parts.push(`[Sheet: ${ws.name}]`);
    for (let r = 1; r <= ws.rowCount; r++) {
      const cells: string[] = [];
      ws.getRow(r).eachCell({ includeEmpty: false }, (c) => {
        const v = c.value;
        if (v == null) return;
        if (typeof v === "object") {
          const o = v as { result?: unknown; text?: string; richText?: { text: string }[] };
          if (o.result !== undefined) cells.push(String(o.result));
          else if (o.richText) cells.push(o.richText.map((t) => t.text).join(""));
          else if (o.text) cells.push(o.text);
          return;
        }
        cells.push(String(v));
      });
      if (cells.length === 0) continue;
      const line = cells.join("\t");
      parts.push(line);
      size += line.length + 1;
      if (size > MAX_CHARS_PER_FILE) return parts.join("\n");
    }
  }
  return parts.join("\n");
}

export async function extractTextFromFile(buffer: Buffer, mime: string): Promise<{ text: string; truncated: boolean } | null> {
  try {
    if (mime === "application/pdf") {
      // pdf-parse v2 là API class (khác v1 dùng default function) — new PDFParse({data}).getText().
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text.trim() ? truncate(result.text) : null;
    }
    if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim() ? truncate(result.value) : null;
    }
    if (mime === "text/plain" || mime === "text/csv") {
      return truncate(buffer.toString("utf-8"));
    }
    if (
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mime === "application/vnd.ms-excel"
    ) {
      return truncate(await xlsxToText(buffer));
    }
    // .doc/.ppt/.pptx/hình ảnh: không có parser nội dung — chỉ đính kèm tên file.
    return null;
  } catch (e) {
    console.error("[AI] extractTextFromFile lỗi (bỏ qua, chỉ đính kèm tên file):", e);
    return null;
  }
}
