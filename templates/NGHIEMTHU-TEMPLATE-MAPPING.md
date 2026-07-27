# Mẫu biên bản nghiệm thu — `templates/nghiem-thu.docx`

> ⚠ **File hiện tại là BẢN NHÁP** do trợ lý AI soạn (sinh bằng `scripts/build-nghiemthu-draft-template.js`)
> để chạy được luồng xuất. Biên bản nghiệm thu là **văn bản pháp lý ký với khách** — trước khi dùng
> thật, chủ dự án duyệt nội dung hoặc **đè file này bằng mẫu chính thức của TCM** đã chèn placeholder
> theo bảng dưới. Luồng code (`fillAcceptanceDocx`, route `/api/costsheet/[projectId]/acceptance`)
> giữ nguyên, không cần sửa gì.

Cách chèn vào mẫu Word thật: gõ đúng chuỗi `{TenPlaceholder}` (một mạch, đừng để Word tách đoạn —
gõ ở Notepad rồi dán vào là chắc nhất). Tiền đã được format sẵn kiểu `1.234.567` — trong mẫu chỉ
cần thêm chữ "đ" phía sau nếu muốn.

| Placeholder | Nghĩa |
|---|---|
| `{NgayLap}` | Ngày xuất biên bản (dd/mm/yyyy) |
| `{MaDuAn}` / `{TenDuAn}` | Mã + tên dự án |
| `{SoRev}` | Số phiên bản CO/CE đã chuyển nghiệm thu (nguồn số liệu) |
| `{TenKhachHang}` / `{DiaChiKH}` / `{MSTKH}` | Bên A (khách hàng) |
| `{TenCongTy}` / `{NguoiKy}` / `{ChucDanh}` | Bên B — đọc từ setting `company.legal_name_vi` / `company.signer_name` / `company.signer_title` |
| `{#HangMuc}` … `{/HangMuc}` | Vòng lặp bảng hạng mục (mỗi mục CẤP 1 của CO/CE một dòng), bên trong dùng `{STT}`, `{Ten}`, `{ThanhTien}` |
| `{TongDichVu}` | Σ hạng mục (TRƯỚC phí agency, TRƯỚC VAT) |
| `{PhiAgencyPct}` / `{PhiAgency}` | % và tiền phí agency |
| `{VatPct}` / `{ThueGTGT}` | % và tiền thuế GTGT |
| `{TongGomVAT}` | Tổng đã gồm VAT — **đúng bằng CE của bản đã chuyển nghiệm thu** |
| `{#CoChiHo}` … `{/CoChiHo}` | Khối chỉ hiện khi có Chi hộ; bên trong dùng `{ChiHo}`, `{TongThanhToan}` |

Nguyên tắc số liệu (đừng đổi khi thay mẫu): số lấy từ **bản đã chuyển nghiệm thu**
(`sentToLiquidationRevision`), giá từng mục là phân bổ từ tổng dịch vụ theo tỉ trọng CO
(cùng nguyên tắc với báo giá BM02), chuỗi tổng cộng khớp tuyệt đối CE + Chi hộ của revision.
