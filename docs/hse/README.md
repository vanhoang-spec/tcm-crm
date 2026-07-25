# Sổ tay HS&E TCM — bộ sinh tài liệu (Word + PDF)

Trình sinh **Sổ tay An toàn – Sức khỏe – Môi trường (HS&E)** song ngữ cho TCM (Marketing agency — Below The Line), mang brand kit + logo TCM. **Độc lập hoàn toàn** với app CRM (có `node_modules` riêng, không đụng `package.json` gốc).

## File đầu ra (đã tạo)
| File | Mô tả |
|------|-------|
| `TCM-HSE-Manual.docx` | Bản Word **nguồn, sửa được** — dùng để ban hành, ký, phát hành, lưu hồ sơ ISO. Có mục lục (bấm *Update Field* để cập nhật số trang), header logo, footer số trang. |
| `TCM-HSE-Manual.pdf` | Bản **in sẵn** (A4, ~46 trang), khóa layout. |
| `TCM-HSE-Manual.html` | Bản HTML in-sẵn (nguồn của PDF, cũng là fallback: mở trình duyệt → In → Lưu PDF). |

## Cách sinh lại
```bash
cd docs/hse
npm install          # docx (+ puppeteer cho PDF)
npm run build        # sinh cả .docx, .html, .pdf
# hoặc từng phần:
npm run build:docx   # chỉ Word
npm run build:html   # chỉ HTML
npm run build:pdf    # HTML → PDF (cần puppeteer/Chromium)
```

## Kiến trúc
- **`content.mjs`** — NGUỒN NỘI DUNG DUY NHẤT (toàn bộ Sổ tay dưới dạng dữ liệu block: chương, đoạn, bảng, callout, "English summary", phụ lục, glossary). **Sửa nội dung ở đây.**
- **`build-docx.mjs`** — renderer Word (thư viện `docx`, thuần Node).
- **`build-html.mjs`** — renderer HTML in-sẵn (CSS `@page`, logo base64).
- **`build-pdf.mjs`** — Puppeteer render HTML → PDF.

## Brand kit áp dụng
Logo `public/brand/logo.png` (bìa) + `public/brand/mark.png` (header). Màu xanh brand `#0068E6`, ramp `#EEF6FF→#0A3269`; cảnh báo `#B45309`, nguy hiểm `#B91C1C`, tốt `#15803D`. Font Nunito (fallback Arial). Trích từ `src/app/globals.css` của CRM để nhất quán thương hiệu.

## Trước khi ban hành chính thức
Điền các chỗ `[…]` / dấu `…` (ngày hiệu lực, danh bạ khẩn cấp, tên người ký) và cho Ban Giám đốc + HR rà soát theo pháp luật ATVSLĐ hiện hành. Nội dung hiện tại là **khung best-practice ngành BTL** tham chiếu Luật 84/2015/QH13, ISO 45001 & ISO 14001.
