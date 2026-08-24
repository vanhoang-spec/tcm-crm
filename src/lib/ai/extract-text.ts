import "server-only";

/**
 * Trích xuất TEXT THUẦN từ file đính kèm (mời thầu/khách gửi, export insights MKT) để nhét vào
 * prompt DeepSeek.
 *
 * Best-effort: PDF/DOCX/TXT/CSV/XLSX đọc được nội dung; DOC/PPT/hình ảnh trả về null (không có OCR/
 * parser trong repo) — chỗ gọi vẫn liệt kê tên file cho model biết là có tài liệu, chỉ là không đọc
 * được nội dung. KHÔNG throw — 1 file lỗi/hỏng không được làm sập cả yêu cầu AI.
 *
 * HTML thêm ở MEET-2 (18/08/2026): dashboard họp tuần của Claude Project là HTML một trang. Bóc bằng
 * regex chứ không kéo thêm thư viện — chỗ này chỉ cần TEXT cho prompt, không cần cây DOM.
 *
 * CSV + XLSX thêm ở MKT-1 (04/08/2026) để đọc file export Meta/LinkedIn. Thuần THÊM NHÁNH: không
 * đổi hành vi của 3 nhánh cũ, và `exceljs` vốn đã là dependency (dùng ở costsheet-export.ts).
 */

const MAX_CHARS_PER_FILE = 6000; // chặn 1 file quá dài nuốt hết ngân sách token của prompt

/**
 * Trần ký tự cho MỘT lần đọc. Mặc định 6000 (giữ nguyên hành vi của 5 chỗ gọi cũ); MEET-2 truyền trần
 * riêng vì biên bản họp tuần thật dài 8–15k ký tự — cắt ở 6000 là mất nửa cuộc họp.
 */
export type ExtractOptions = { maxChars?: number };

function truncate(text: string, maxChars: number = MAX_CHARS_PER_FILE): { text: string; truncated: boolean } {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= maxChars) return { text: cleaned, truncated: false };
  return { text: cleaned.slice(0, maxChars), truncated: true };
}

/**
 * Bảng tính → text dạng TSV, mỗi sheet một header `[Sheet: tên]`.
 *
 * Dừng sớm khi đã đủ `MAX_CHARS_PER_FILE`: file export insights có thể hàng chục nghìn dòng, đọc
 * hết rồi mới cắt là đốt bộ nhớ vô ích. Ô rỗng ở cuối dòng bị bỏ để đỡ tốn token.
 */
/**
 * HTML → text thuần: bỏ hẳn script/style/head (nội dung máy, không phải nội dung họp), đổi thẻ khối và
 * `<br>` thành xuống dòng để giữ ranh giới dòng cho model, rồi gỡ thẻ và giải mã vài entity hay gặp.
 * Không dùng DOM parser: chạy phía server, đầu vào là file người dùng tải lên, giữ phụ thuộc tối thiểu.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|section|article|table|thead|tbody)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * RTF → text. RTF là văn bản thuần có chèn "control word" (`\b`, `\par`, `\'e1`…), nên bóc bằng
 * chuỗi phép thay thế là đủ — kéo cả một thư viện RTF về chỉ để đọc CV là không đáng.
 * ⚠ Đọc buffer bằng `latin1` chứ KHÔNG phải utf-8: RTF mã hoá ký tự ngoài ASCII bằng escape
 * `\'xx` (một byte), đọc utf-8 là hỏng byte trước khi kịp giải mã escape.
 */
function rtfToText(rtf: string): string {
  return rtf
    .replace(/\{\\\*[\s\S]*?\}/g, " ")   // nhóm bỏ qua được (font table, colortbl…)
    .replace(/\\par[d]?\b/g, "\n")
    .replace(/\\line\b/g, "\n")
    .replace(/\\tab\b/g, "\t")
    .replace(/\\'([0-9a-fA-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u(-?\d+)\s?\??/g, (_m, d) => String.fromCharCode(((Number(d) % 65536) + 65536) % 65536))
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, " ")   // control word còn lại
    .replace(/[{}]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * ODT (LibreOffice/OpenOffice) → text. ODT là file ZIP chứa `content.xml`; `pizzip` vốn đã là
 * dependency (dùng ở `docx-builder.ts`) nên không thêm phụ thuộc mới.
 */
async function odtToText(buffer: Buffer): Promise<string> {
  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip(buffer);
  const xml = zip.file("content.xml")?.asText() ?? "";
  return xml
    .replace(/<text:tab\/>/g, "\t")
    .replace(/<text:line-break\/>/g, "\n")
    .replace(/<\/text:(p|h)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function xlsxToText(buffer: Buffer, maxChars: number = MAX_CHARS_PER_FILE): Promise<string> {
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
      if (size > maxChars) return parts.join("\n");
    }
  }
  return parts.join("\n");
}

export async function extractTextFromFile(buffer: Buffer, mime: string, opts?: ExtractOptions): Promise<{ text: string; truncated: boolean } | null> {
  const maxChars = opts?.maxChars ?? MAX_CHARS_PER_FILE;
  try {
    if (mime === "application/pdf") {
      // pdf-parse v2 là API class (khác v1 dùng default function) — new PDFParse({data}).getText().
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text.trim() ? truncate(result.text, maxChars) : null;
    }
    if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim() ? truncate(result.value, maxChars) : null;
    }
    if (mime === "text/html" || mime === "application/xhtml+xml") {
      return truncate(htmlToText(buffer.toString("utf8")), maxChars);
    }
    if (mime === "text/plain" || mime === "text/csv" || mime === "text/markdown") {
      return truncate(buffer.toString("utf-8"), maxChars);
    }
    if (mime === "application/rtf" || mime === "text/rtf") {
      return truncate(rtfToText(buffer.toString("latin1")), maxChars);
    }
    if (mime === "application/vnd.oasis.opendocument.text") {
      return truncate(await odtToText(buffer), maxChars);
    }
    if (
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mime === "application/vnd.ms-excel"
    ) {
      return truncate(await xlsxToText(buffer, maxChars), maxChars);
    }
    // .doc/.ppt/.pptx/hình ảnh: không có parser nội dung — chỉ đính kèm tên file.
    return null;
  } catch (e) {
    console.error("[AI] extractTextFromFile lỗi (bỏ qua, chỉ đính kèm tên file):", e);
    return null;
  }
}
