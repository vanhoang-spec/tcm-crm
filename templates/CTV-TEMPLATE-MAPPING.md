# Mapping: tag mẫu `ctv-bien-ban.docx` ↔ cột Excel ↔ field `CtvContract`

Mẫu `templates/ctv-bien-ban.docx` là bản đã chuẩn hoá từ file gốc
`templates/source/BM06-BM09-goc.docx` (giữ nguyên 100% bố cục/nội dung/điều khoản/chữ ký), sinh ra
bởi `scripts/build-ctv-template.js`. Không sửa tay file `.docx` này — muốn đổi nội dung thì sửa
`templates/source/BM06-BM09-goc.docx` rồi chạy lại script (xem ghi chú "GHI NHẬN CHỈNH SỬA" bên dưới
nếu số lượng/tên placeholder trong file gốc thay đổi).

Runtime (`src/lib/ctv.ts::fillCtvDocx`) dùng docxtemplater với delimiter mặc định `{ }` để điền tag
dưới đây bằng giá trị từ 1 dòng `CtvContract` + header `CtvBatch`/`Project`.

| Tag trong template | Cột Excel (BM8_TT) | Field `CtvContract` / nguồn khác |
|---|---|---|
| `{HoVaTen}` | Họ và tên | `fullName` |
| `{NgaySinh}` | Ngày sinh | `dateOfBirth` |
| `{GioiTinh}` | Giới tính | `gender` |
| `{DiaChiThuongTru}` | Địa chỉ thường trú | `permanentAddress` |
| `{SoCCCDPassport}` | Số CCCD/Passport | `idNumber` |
| `{NgayCap}` | Ngày cấp | `idIssueDate` |
| `{NoiCap}` | Nơi cấp | `idIssuePlace` |
| `{SDT}` | SĐT | `phone` |
| `{MaSoThue}` | Mã số thuế | `taxCode` |
| `{SoTKNH}` | Số TK NH | `bankAccountNo` |
| `{TenNganHang}` | Tên ngân hàng | `bankName` |
| `{ChiNhanh}` | Chi nhánh | `bankBranch` |
| `{HangMucCongViec}` | Hạng mục công việc | `workItem` |
| `{DonViTinh}` | ĐVT | `unit` |
| `{SoLuong}` | Số lượng | `quantity` |
| `{DonGia}` | Đơn giá | `unitPrice` (format `formatNumber`) |
| `{ThanhTien}` | Thành tiền | `amount` (format `formatNumber`) |
| `{ThueTNCN}` | Thuế TNCN | `pitTax` (format `formatNumber`, lấy nguyên từ Excel) |
| `{ThucNhan}` | Thực nhận | `netReceived` (format `formatNumber`, lấy nguyên từ Excel) |
| `{NgayThucHien}` | Ngày thực hiện | `executionDate` |
| `{NgayNghiemThu}` | Ngày nghiệm thu | `acceptanceDate` |
| `{DiaDiemLamViec}` | *(header Excel)* "Địa điểm làm việc" | `CtvBatch.workLocation` |
| `{Code}` | *(header Excel)* "Code" | `Project.code` |

Không map vào template (chỉ lưu trong `CtvContract` để tra cứu/tính tổng nội bộ, không in ra biên
bản — vì file gốc không có chỗ cho các cột này): `Quốc tịch`, `Tên event`, `Địa điểm thực hiện`,
`Ghi chú`.

## GHI NHẬN CHỈNH SỬA so với file gốc

Duy nhất 1 chỗ khác nội dung gốc: ô "ĐVT" trong bảng công việc của file gốc đang là **text tĩnh
"Gói"** (không phải placeholder — rõ ràng là dữ liệu mẫu còn sót lại từ lần điền trước, không phải
cố ý để cứng). Nếu giữ nguyên, mọi biên bản xuất ra sẽ luôn in "Gói" kể cả khi dịch vụ thật tính theo
"Ngày" → sai dữ liệu. Đã thay bằng `{DonViTinh}` để lấy đúng theo từng dòng CTV. Toàn bộ chữ, điều
khoản, bố cục, chữ ký, font (Nunito), logo header — giữ nguyên 100%.

## Nếu cần sửa lại mẫu gốc

1. Sửa `templates/source/BM06-BM09-goc.docx` bằng Word như bình thường (thêm/bớt điều khoản, đổi
   chữ ký...). Nếu KHÔNG đổi/thêm/bớt placeholder `[{...}]` nào → chạy lại
   `node scripts/build-ctv-template.js` là xong, không cần sửa gì thêm.
2. Nếu đổi/thêm placeholder mới trong Word: mở `templates/source/BM06-BM09-goc.docx`, xác nhận
   placeholder mới dùng đúng cú pháp `[{Ten_field_moi}]`. Chạy lại script — nếu script báo lỗi
   "Thiếu mapping cho placeholder raw" thì thêm dòng tương ứng vào `RAW_TO_CANONICAL` trong
   `scripts/build-ctv-template.js`, map sang 1 tên tag PascalCase mới, rồi bổ sung field đó vào
   `CtvContract` (schema) + `CTV_COLUMNS`/`fillCtvDocx` (`src/lib/ctv.ts`) nếu cần lấy dữ liệu từ
   Excel/lưới.
3. Chạy lại `node scripts/build-ctv-template.js`, kiểm log "Pass-2 tag còn lại" khớp danh sách trên.
