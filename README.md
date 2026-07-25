# TCM CRM — Nền tảng vận hành nội bộ

Hệ thống vận hành nội bộ cho **TCM** (agency event & activation): khách hàng → bidding/CO-CE → quản lý dự án → chi phí & công nợ → nhân sự → KPI → kho, kèm chat nội bộ và trợ lý AI.

Next.js 16 (App Router) · React 19 · Prisma + SQLite · next-intl (vi/en) · Tailwind 4.

## Bắt đầu

```bash
npm install
# đặt file .env vào thư mục gốc (nhận riêng — không commit)
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run dev          # http://localhost:3000
```

Đăng nhập bằng email `@tcmbtl.com`; mật khẩu chung ban đầu `TCM123456` (bắt buộc đổi lần đầu).

## Tài liệu

| File | Nội dung |
|---|---|
| **[HANDOVER.md](HANDOVER.md)** | **Đọc trước tiên** — bàn giao, quy ước bắt buộc, bản đồ module, nghiệp vụ cốt lõi, deploy, hạn chế đã biết |
| [docs/PLAN-HISTORY.md](docs/PLAN-HISTORY.md) | Lịch sử thiết kế đầy đủ — lý do đằng sau mỗi quyết định kiến trúc |
| [AGENTS.md](AGENTS.md) | Lưu ý cho trợ lý AI về phiên bản Next.js |

## Lệnh kiểm tra trước khi giao việc

```bash
npx tsc --noEmit
npx eslint src --quiet
npx next build
```

Kèm kiểm tra khớp key i18n vi/en — xem mục 4.2 trong [HANDOVER.md](HANDOVER.md).
