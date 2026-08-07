# TCM Creative — bản mini

Module **Creative** của nền tảng vận hành nội bộ TCM, cắt ra chạy độc lập: nhận việc → điều phối về
team nhỏ → giao người → nộp thành phẩm → duyệt (một hoặc nhiều bên) → chi phí theo giờ. Kèm khung
nền tảng đủ dùng: đăng nhập, phân quyền theo ma trận, nhân sự & phòng ban, danh mục dùng chung,
thông báo, nhắc việc quá hạn, song ngữ vi/en.

Next.js 16 (App Router, Server Actions) · React 19 · Prisma 6 + SQLite · next-intl · Tailwind 4 · Zod 4.

> ⚠ **Đây KHÔNG phải bản TCM đầy đủ.** Bản đầy đủ có 113 model / 68 migration / 138 mã quyền và 17
> module (khách hàng, thầu & CO/CE, dự án, tài chính, kho, chấm công, KPI, chat, AI…). Bản mini có
> **19 model · 2 migration · 17 mã quyền · 1 module**, chạy trên CSDL riêng `prisma/creative.db`.

## Bắt đầu

```bash
npm install
# .env phải có DATABASE_URL="file:./creative.db" (nhận riêng — không commit)
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run dev          # http://localhost:3100
```

**Đăng nhập bằng tài khoản mẫu** — gõ tên ngắn là đủ (`admin`, `cd`, `art`, `3d`, `2d`, `account`;
hệ thống tự ghép `@tcm.local`). Mật khẩu chung nằm ở `prisma/seed.ts` (hằng `DEFAULT_PASSWORD`);
mọi tài khoản đều bị bắt đổi mật khẩu ngay lần đăng nhập đầu.

Vai trò của từng tài khoản mẫu, và vì sao "Quên mật khẩu" chưa dùng được: xem
[HANDOVER.md](HANDOVER.md) mục 3.

## ⚠ Ba điều phải biết trước khi gõ lệnh

1. **KHÔNG chạy `scripts/deploy.sh`** — script kế thừa từ bản đầy đủ, nó đẩy code lên **server
   production thật** của TCM và sẽ đè bản mini lên CRM đang phục vụ 36 người. Bản mini chưa có đích
   deploy nào.
2. Thư mục này là **git worktree** của repo chính (`TCM_CRM/.git/worktrees/…`), không phải bản clone
   riêng — commit ở đây hiện luôn trong repo chính.
3. CSDL là `prisma/creative.db`. **Đừng trỏ `DATABASE_URL` sang `dev.db`** của bản đầy đủ (và ngược
   lại) — hai bên có lịch sử migration khác hẳn nhau.

Chi tiết cả ba: [HANDOVER.md](HANDOVER.md) mục 1.

## Tài liệu

| File | Nội dung |
|---|---|
| **[HANDOVER.md](HANDOVER.md)** | **Đọc trước tiên** — bẫy cần tránh, cách chạy, quy ước bắt buộc, bản đồ code, nghiệp vụ Creative, phân quyền, quy trình verify, hạn chế đã biết |
| [CODING-RULES.md](CODING-RULES.md) | Cách làm việc trên codebase này (áp dụng cho cả người và trợ lý AI) |
| [AGENTS.md](AGENTS.md) | Lưu ý cho trợ lý AI về phiên bản Next.js |
| [docs/HANDOVER-TCM-FULL.md](docs/HANDOVER-TCM-FULL.md) | Bàn giao của bản TCM **đầy đủ** — tham chiếu lịch sử, **không mô tả codebase này** |
| [docs/PLAN-HISTORY.md](docs/PLAN-HISTORY.md) | Lịch sử thiết kế bản đầy đủ — lý do đằng sau mỗi quyết định kiến trúc |

## Lệnh kiểm tra trước khi giao việc

```bash
npx tsc --noEmit
npx eslint src --quiet
npx next build
```

Kèm kiểm khớp key i18n vi/en (phải `0/0`) — lệnh ở [HANDOVER.md](HANDOVER.md) mục 4.2. Sau đó verify
trên browser thật với đúng nghiệp vụ vừa sửa.
