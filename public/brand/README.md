# Brand assets

Nguồn gốc: `Source/TCM_logo_vector.png` (PNG RGBA nền trong suốt, 3508×2481, cấp ngày 2026-07-13).
Đã tách bằng sharp (xem lịch sử trò chuyện) thành 3 file dùng trong app — không sửa tay các file dưới, nếu cần
crop lại thì làm lại từ file nguồn.

- `logo.png` (2189×923) — lockup đầy đủ: mark + "Est 2000" + tagline "TARGETED MARKETING". Dùng nơi có đủ
  chiều ngang (trang login, footer, tài liệu in).
- `mark.png` (2189×738) — mark + "Est 2000", không có tagline. Dùng cho header/sidebar (`Logo` component,
  chế độ mặc định).
- `icon-square.png` (512×512) — mark căn giữa trên canvas vuông, nền trong suốt. Dùng cho favicon
  (`src/app/icon.png` — quy ước Next.js App Router tự sinh favicon) và logo compact trên mobile
  (`Logo compact`).

Màu logo (`#0B84FA`-ish) là màu cố định trong file gốc, không đổi theo dark/light theme — đã kiểm tra vẫn nổi
tốt trên cả nền sáng và nền tối của app, nên không cần biến thể trắng riêng.
