import "server-only";

/**
 * Trích xuất TEXT THUẦN từ file đính kèm dự án (mời thầu/khách gửi) để nhét vào prompt DeepSeek.
 * Best-effort: PDF/DOCX/TXT đọc được nội dung; DOC/PPT/XLS/hình ảnh chỉ trả về null (không có OCR/
 * parser trong repo) — chỗ gọi vẫn liệt kê tên file cho model biết là có tài liệu, chỉ là không đọc
 * được nội dung. KHÔNG throw — 1 file lỗi/hỏng không được làm sập cả yêu cầu AI.
 */

const MAX_CHARS_PER_FILE = 6000; // chặn 1 file quá dài nuốt hết ngân sách token của prompt

function truncate(text: string): { text: string; truncated: boolean } {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= MAX_CHARS_PER_FILE) return { text: cleaned, truncated: false };
  return { text: cleaned.slice(0, MAX_CHARS_PER_FILE), truncated: true };
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
    if (mime === "text/plain") {
      return truncate(buffer.toString("utf-8"));
    }
    // .doc/.ppt/.pptx/.xls/.xlsx/hình ảnh: không có parser nội dung — chỉ đính kèm tên file.
    return null;
  } catch (e) {
    console.error("[AI] extractTextFromFile lỗi (bỏ qua, chỉ đính kèm tên file):", e);
    return null;
  }
}
