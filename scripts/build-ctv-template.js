/**
 * Chuẩn hoá mẫu Word BM06+BM09 (biên bản thoả thuận / xác nhận hoàn thành thuê ngoài).
 *
 * File gốc `templates/source/BM06-BM09-goc.docx` dùng placeholder dạng `[{Ten_truong}]`, nhưng
 * Word cắt vụn nhiều placeholder ra thành nhiều <w:r> run khác nhau (vd `[{`+`Ho_va_ten`+`}]` ở 3
 * run riêng biệt), và tên field không nhất quán giữa các lần xuất hiện (`S0_TK_NH` vs `So_TK_NH`,
 * dấu cách/dấu tiếng Việt thừa, dấu `/` trong `So_CCCD/Passport`) — không thể find-replace thô.
 *
 * Kỹ thuật: chạy docxtemplater PASS 1 trên chính file gốc với delimiter `[{ }]`, "render" mỗi
 * placeholder thành 1 chuỗi text thay thế `{TenChuan}` (delimiter mặc định `{ }`). Vì docxtemplater
 * luôn gộp các run bị cắt vụn thành 1 run sạch khi render, kết quả là 1 file .docx MỚI có placeholder
 * sạch, đặt tên nhất quán, mỗi cái nằm gọn trong 1 run — không cần sửa tay XML.
 * File output (`templates/ctv-bien-ban.docx`) sẽ được PASS 2 (runtime, xem src/lib/ctv.ts::fillCtvDocx)
 * dùng delimiter mặc định để đổ dữ liệu CTV thật vào.
 *
 * Chạy: node scripts/build-ctv-template.js
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const SOURCE_PATH = path.join(__dirname, "..", "templates", "source", "BM06-BM09-goc.docx");
const OUTPUT_PATH = path.join(__dirname, "..", "templates", "ctv-bien-ban.docx");

/**
 * Map: chuỗi RAW xuất hiện đúng nguyên văn giữa `[{` và `}]` trong file gốc (kể cả khoảng trắng/dấu
 * thừa) -> tên tag CHUẨN dùng ở PASS 2. Nhiều raw khác nhau có thể trỏ về cùng 1 tag chuẩn (gộp lỗi
 * đánh máy `S0_TK_NH`/`So_TK_NH`, và 2 biến thể `Ngay_thuc_hien`/`Ngay_thuc_hien ` dùng chung 1 field
 * vì cả 2 chỗ trong file gốc đều đang dùng chung giá trị "ngày thực hiện").
 */
const RAW_TO_CANONICAL = {
  "Ngay_thuc_hien ": "NgayThucHien",
  "Ngay_thuc_hien": "NgayThucHien",
  "Ngay_nghiệm_thu ": "NgayNghiemThu",
  "Ho_va_ten": "HoVaTen",
  "Ngay_sinh": "NgaySinh",
  "Gioi_tinh": "GioiTinh",
  "Dia_chi_thuong_tru": "DiaChiThuongTru",
  "So_CCCD/Passport": "SoCCCDPassport",
  "Ngay_cap": "NgayCap",
  "Noi_cap": "NoiCap",
  "SDT": "SDT",
  "Ma_so_thue": "MaSoThue",
  "S0_TK_NH": "SoTKNH",
  "So_TK_NH": "SoTKNH",
  "Ten_ngan_hang": "TenNganHang",
  "Chi_nhanh": "ChiNhanh",
  "Hang_muc_cong_viec": "HangMucCongViec",
  "So_luong": "SoLuong",
  "Don_gia": "DonGia",
  "Thanh_tien": "ThanhTien",
  "Thue_TNCN": "ThueTNCN",
  "Thuc_nhan": "ThucNhan",
  "Dia_diem_lam_viec": "DiaDiemLamViec",
  "Code": "Code",
  // Field mới thêm — xem ghi chú "GHI NHẬN CHỈNH SỬA" bên dưới.
  "Don_vi_tinh": "DonViTinh",
};

function main() {
  let xml = fs.readFileSync(SOURCE_PATH, "binary");

  // --- Sửa 1 chỗ trước khi render pass 1 ---
  // Cột "ĐVT" trong bảng công việc của file gốc đang là text TĨNH "Gói" (không phải placeholder) —
  // rõ ràng là dữ liệu mẫu còn sót lại chứ không phải cố ý. Nếu để nguyên, mọi biên bản xuất ra sẽ
  // LUÔN in "Gói" kể cả khi dịch vụ thật sự tính theo "Ngày" (sai dữ liệu). Thay bằng placeholder mới
  // `[{Don_vi_tinh}]` để ĐVT lấy đúng theo từng dòng CTV. Đây là sửa DUY NHẤT khác nội dung gốc —
  // toàn bộ chữ, điều khoản, bố cục, chữ ký giữ nguyên 100%.
  const zipForFix = new PizZip(xml, { binary: true });
  let docXml = zipForFix.files["word/document.xml"].asText();
  const before = docXml;
  docXml = docXml.replace("<w:t>Gói</w:t>", "<w:t>[{Don_vi_tinh}]</w:t>");
  if (docXml === before) {
    throw new Error('Không tìm thấy ô "Gói" cần thay — file gốc có thể đã đổi, kiểm tra lại thủ công.');
  }
  zipForFix.file("word/document.xml", docXml);
  xml = zipForFix.generate({ type: "nodebuffer" });

  // --- Pass 1: render [{...}] -> {TenChuan} ---
  const zip = new PizZip(xml);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "[{", end: "}]" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: (part) => {
      throw new Error(
        `Thiếu mapping cho placeholder raw: ${JSON.stringify(part.value)} — thêm vào RAW_TO_CANONICAL trong scripts/build-ctv-template.js`
      );
    },
  });

  const data = {};
  for (const [raw, canonical] of Object.entries(RAW_TO_CANONICAL)) {
    data[raw] = `{${canonical}}`;
  }

  doc.render(data);

  const outBuf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(OUTPUT_PATH, outBuf);
  console.log(`Đã ghi: ${OUTPUT_PATH} (${outBuf.length} bytes)`);

  // --- Sanity check: đảm bảo output không còn sót "[{" nào và mọi {Tag} pass-2 hợp lệ ---
  const checkZip = new PizZip(outBuf);
  const outXml = checkZip.files["word/document.xml"].asText();
  if (outXml.includes("[{") || outXml.includes("}]")) {
    throw new Error("CẢNH BÁO: output vẫn còn placeholder dạng [{...}] chưa được thay — kiểm tra lại RAW_TO_CANONICAL.");
  }
  const leftoverTags = outXml.match(/\{[A-Za-z0-9_]+\}/g) || [];
  const uniqueTags = [...new Set(leftoverTags)].sort();
  console.log(`Pass-2 tag còn lại trong template (sẽ được điền lúc runtime): ${uniqueTags.length}`);
  uniqueTags.forEach((t) => console.log("  " + t));
}

main();
