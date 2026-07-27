/**
 * Dựng mẫu Word BẢN NHÁP cho BIÊN BẢN NGHIỆM THU — `templates/nghiem-thu.docx`.
 *
 * ⚠ ĐÂY LÀ BẢN NHÁP do trợ lý AI soạn để chủ dự án DUYỆT/THAY, KHÔNG phải mẫu chính thức của TCM.
 * Biên bản nghiệm thu là văn bản pháp lý ký với khách — khi có mẫu thật, đè file này bằng mẫu thật
 * (đã chèn placeholder theo templates/NGHIEMTHU-TEMPLATE-MAPPING.md) là toàn bộ luồng giữ nguyên.
 *
 * Kỹ thuật: dựng WordprocessingML tối thiểu bằng pizzip (không cần Word). Placeholder theo
 * docxtemplater mặc định `{Ten}`; bảng hạng mục dùng paragraph loop `{#HangMuc}…{/HangMuc}`
 * (fillAcceptanceDocx bật paragraphLoop — cùng cấu hình với fillCtvDocx).
 *
 * Chạy: node scripts/build-nghiemthu-draft-template.js
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const OUT = path.join(__dirname, "..", "templates", "nghiem-thu.docx");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const p = (text, opts = {}) => {
  const props = [];
  if (opts.center) props.push('<w:jc w:val="center"/>');
  if (opts.right) props.push('<w:jc w:val="right"/>');
  const rPr = [];
  if (opts.bold) rPr.push("<w:b/>");
  if (opts.size) rPr.push(`<w:sz w:val="${opts.size * 2}"/><w:szCs w:val="${opts.size * 2}"/>`);
  if (opts.italic) rPr.push("<w:i/>");
  return `<w:p><w:pPr>${props.join("")}</w:pPr><w:r><w:rPr>${rPr.join("")}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
};

const body = [
  p("CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM", { center: true, bold: true }),
  p("Độc lập - Tự do - Hạnh phúc", { center: true, italic: true }),
  p(""),
  p("BIÊN BẢN NGHIỆM THU VÀ THANH LÝ", { center: true, bold: true, size: 16 }),
  p("(BẢN NHÁP — chờ chủ dự án duyệt mẫu chính thức)", { center: true, italic: true, size: 9 }),
  p(""),
  p("Ngày lập: {NgayLap}"),
  p("Dự án: {MaDuAn} — {TenDuAn} (theo bảng CO/CE bản v{SoRev} đã chuyển nghiệm thu)"),
  p(""),
  p("BÊN A (Khách hàng): {TenKhachHang}", { bold: true }),
  p("Địa chỉ: {DiaChiKH}"),
  p("Mã số thuế: {MSTKH}"),
  p(""),
  p("BÊN B (Đơn vị thực hiện): {TenCongTy}", { bold: true }),
  p("Đại diện: {NguoiKy} — Chức danh: {ChucDanh}"),
  p(""),
  p("Hai bên thống nhất nghiệm thu khối lượng công việc đã hoàn thành như sau:", {}),
  p(""),
  p("{#HangMuc}"),
  p("{STT}. {Ten}: {ThanhTien} đ"),
  p("{/HangMuc}"),
  p(""),
  p("TỔNG GIÁ TRỊ DỊCH VỤ: {TongDichVu} đ", { bold: true }),
  p("PHÍ AGENCY ({PhiAgencyPct}%): {PhiAgency} đ"),
  p("Thuế GTGT ({VatPct}%): {ThueGTGT} đ"),
  p("TỔNG GIÁ TRỊ DỊCH VỤ (đã bao gồm thuế GTGT): {TongGomVAT} đ", { bold: true }),
  p("{#CoChiHo}"),
  p("Khoản chi hộ (theo thực tế): {ChiHo} đ"),
  p("TỔNG THANH TOÁN: {TongThanhToan} đ", { bold: true }),
  p("{/CoChiHo}"),
  p(""),
  p("Bên A xác nhận Bên B đã hoàn thành khối lượng công việc nêu trên đúng thoả thuận. Biên bản là căn cứ xuất hóa đơn và thanh toán theo hợp đồng."),
  p(""),
  p("ĐẠI DIỆN BÊN A                                          ĐẠI DIỆN BÊN B", { bold: true, center: true }),
  p("(Ký, ghi rõ họ tên)                                      (Ký, ghi rõ họ tên)", { italic: true, center: true, size: 9 }),
].join("");

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418"/></w:sectPr></w:body></w:document>`;

const zip = new PizZip();
zip.file(
  "[Content_Types].xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
);
zip.file(
  "_rels/.rels",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
);
zip.file("word/document.xml", documentXml);

fs.writeFileSync(OUT, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("Đã dựng mẫu NHÁP:", OUT);
