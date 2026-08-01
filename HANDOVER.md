# BÀN GIAO DỰ ÁN — TCM CRM

> Cập nhật: 25/07/2026. Tài liệu dành cho người tiếp nhận code + trợ lý AI (Claude Code) làm tiếp.
> Đọc hết mục 1 trước khi làm bất cứ việc gì.

---

## 1. ⚠️ VIỆC PHẢI LÀM TRƯỚC KHI BÀN GIAO (chặn)

**Tình trạng git hiện tại KHÔNG dùng để bàn giao được.**

```
Commit cuối:  3b8df48  "Add Bidding & Contract, Project Management, and Creative modules"
Chưa commit:  171 file  (52 sửa + 119 mới)
Migration:    33 trên đĩa — chỉ 3 có trong git
```

Nghĩa là: nếu đồng nghiệp `git clone` repo này, họ **mất khoảng 80% codebase**. Toàn bộ các module sau đây chỉ tồn tại trên ổ đĩa máy hiện tại, chưa vào git:

`finance` · `chat` · `inventory` · `staff` (chấm công) · `kpi` · `planning` · `orgchart` · `kb` · `ai` · `act-as` · `profile` · `(auth)` · `api/` · phần lớn `settings/` · 30 migration · toàn bộ `src/lib` mới (47 file)

### Cách xử lý (chạy trên máy hiện tại, TRƯỚC khi giao máy/repo)

```bash
cd D:/TCM/TCM_AI_CRM/TCM_CRM
git status                 # xem lại lần cuối, chắc chắn không có file lạ
git add -A
git commit -m "Toàn bộ module còn lại: Finance, Chat, Inventory, Staff, KPI, Planning, Auth, AI, Dashboard, Org chart, KB, CTV Operations"
```

`.gitignore` đã loại đúng các thứ không nên commit (`.env`, `prisma/dev.db`, `/storage`, `node_modules`) nên `git add -A` an toàn. **Kiểm lại `git status` sau khi add** để chắc chắn không có file bí mật nào lọt vào.

### Bàn giao thêm ngoài git

| Thứ | Vì sao cần | Ghi chú |
|---|---|---|
| File `.env` | Chứa `DATABASE_URL`, 2 secret ký cookie, API key DeepSeek/Tavily | **Gửi riêng qua kênh bảo mật**, không commit |
| `prisma/dev.db` | Dữ liệu thật đang làm việc (42 nhân sự, khách hàng, CO/CE đã nhập) | Copy tay nếu muốn giữ dữ liệu; nếu không thì seed lại từ đầu |
| `~/.ssh/tcm_deploy` | Key SSH deploy lên server công ty | Gửi riêng, hoặc tạo key mới cho người tiếp nhận |
| `docs/PLAN-HISTORY.md` | Toàn bộ lịch sử thiết kế + lý do từng quyết định (300KB) | Đã copy vào repo (xem mục 9) |

---

## 2. Dự án này là gì

**Nền tảng vận hành nội bộ** (không chỉ CRM) cho **TCM** — agency event & activation, ~42 nhân sự, 3 team Account (A1/A2/A3), ~250 dự án/năm. Thay thế 3 board monday.com đang dùng rời rạc.

Mục tiêu nghiệp vụ: một nguồn dữ liệu duy nhất, chuẩn hoá 3 team, chặn các chỗ chảy máu tiền (28,4 tỷ công nợ, 20,78 tỷ nghiệm thu chưa thu), tự động cảnh báo.

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · Prisma 6 + SQLite · next-intl (vi/en) · Tailwind 4 · Zod 4. Node v24, npm 11.

---

## 3. Chạy được trong 5 phút

```bash
npm install
# Đặt file .env vào thư mục gốc (nhận riêng — xem mục 1)
npx prisma migrate deploy      # dựng schema (KHÔNG dùng migrate dev nếu đã có dev.db thật)
npx prisma generate
npm run db:seed                # seed 42 nhân sự thật + danh mục + dữ liệu mẫu
npm run dev                    # http://localhost:3000
```

**Đăng nhập:** email công ty `@tcmbtl.com`, hoặc TÊN TÀI KHOẢN nội bộ cho nhân sự vận hành không có email (gõ `thukho` → hệ thống hiểu là `thukho@tcm.local`). Tài khoản admin: `nvhoang@tcmbtl.com`.
Mật khẩu chung ban đầu: **`TCM123456`** (setting `auth.default_password`) — hệ thống bắt đổi ngay lần đầu.

Nếu DB hỏng/muốn làm lại sạch: `npx prisma migrate reset --force` rồi `npm run db:seed`.

---

## 4. Quy ước BẮT BUỘC (giữ đúng để code không phân mảnh)

Đây là những luật đã áp dụng nhất quán toàn repo. Vi phạm sẽ tạo ra vùng code lệch chuẩn rất khó gỡ về sau.

### 4.1 Kiến trúc
- **Hàm thuần tách khỏi IO.** Mọi công thức nghiệp vụ nằm ở `src/lib/*.ts` (47 file), nhận/trả số thuần, **không** gọi Prisma. Server Action chỉ nạp dữ liệu → gọi hàm thuần → ghi DB. Ví dụ chuẩn: `src/lib/bidding.ts`, `src/lib/kpi.ts`, `src/lib/creative-cost.ts`.
- **Không tin số từ client.** Server Action **luôn tính lại** tổng tiền từ payload thô (xem `saveCostSheet` trong `src/app/(app)/bidding/actions.ts`).
- **Tiền = `BigInt` (VND) trong DB**, `Number` khi tính (VND < 2^53 nên an toàn), `toNum()` ở biên. Không dùng float cho tiền trong DB.
- **Enum "mềm" đi qua `OptionSet`/`OptionItem`** để admin tự sửa trong Settings (trạng thái dự án, loại task, nhóm hàng...). Chỉ hard-code khi state machine phụ thuộc (`code` cố định, label lấy từ DB qua `pickLabel`).

### 4.2 i18n — luật cứng
- Mọi chuỗi hiển thị đều qua `next-intl`. **`messages/vi.json` và `messages/en.json` phải khớp key tuyệt đối** (hiện 2751 key mỗi bên).
- Kiểm tra trước mỗi lần giao việc:
```bash
node -e "const vi=require('./messages/vi.json'),en=require('./messages/en.json');function f(o,p=''){let k=[];for(const x in o){const q=p?p+'.'+x:x;if(o[x]&&typeof o[x]==='object')k=k.concat(f(o[x],q));else k.push(q)}return k}const V=new Set(f(vi)),E=new Set(f(en));console.log('only vi:',[...V].filter(k=>!E.has(k)).length,'only en:',[...E].filter(k=>!V.has(k)).length)"
```
Kết quả phải là `only vi: 0 only en: 0`.
- **Ngoại lệ đã thống nhất:** tiêu đề Notification hardcode tiếng Việt (vì `src/lib/reminders.ts` không có `getTranslations`). Đừng "sửa" chỗ này.

### 4.3 Ngày tháng — chỗ dễ sai nhất
Toàn app dùng quy ước **UTC midnight**: `dateOrNull()` parse `"YYYY-MM-DD"` → `new Date(...)` → UTC.
Khi viết script nhập liệu, **phải** dựng ngày bằng `Date.UTC(y, m, d)`. Dùng `new Date(y, m, d)` sẽ lệch đúng 7 tiếng (múi giờ Asia/Saigon) → hiển thị lùi 1 ngày. *(Lỗi này đã xảy ra một lần khi nhập timeline KUN và đã sửa.)*

### 4.4 UI
- Bảng nhiều dòng: pattern lưới dày inline-edit, wrapper `overflow-x-auto overflow-y-auto max-h-[70vh]` + header `sticky top-0` (25 bảng đang theo pattern này).
- Mobile: `sm:hidden` card song song với bảng desktop; bảng rộng thì cuộn ngang trong wrapper riêng, **body không bao giờ cuộn ngang**.
- Dùng lại component có sẵn: `DateField` (nhập dd/mm/yyyy), `SearchableSelect`, `StaffAvatar`, `Badge`, `StatRatio`.
- **Drawer/dialog `position: fixed` không được đặt bên trong phần tử có `backdrop-blur`/`transform`/`filter`** — sẽ bị nhốt trong khung cha (đã từng làm vỡ menu mobile toàn app).

### 4.5 Migration
Dev DB là SQLite. Thêm cột → `npx prisma migrate dev --name <tên>`. **Không reset DB** khi đã có dữ liệu thật; migration mới phải additive (cột nullable hoặc có default).

---

## 5. Bản đồ module

| # | Module | Route | Trạng thái |
|---|---|---|---|
| ① | Khách hàng | `/clients` | Xong (import Excel thật + báo cáo chăm sóc) + **Nhóm khách hàng** (`/clients/groups` — gom pháp nhân cùng tập đoàn, cảnh báo tập trung tính theo nhóm; xem mục 10.12) + **Kho kiến thức theo khách — XONG TOÀN BỘ** (`/clients/[id]/kb` — thông tin chung / tài liệu nguồn / bài học theo chủ đề + AI sinh dàn bài, nội dung, đề kiểm tra + chấm điểm + bảng tuân thủ; neo vào NHÓM khi khách có nhóm; xem mục 10.13 và 10.14) |
| ② | Bidding & Hợp đồng | `/bidding` | Xong (CO/CE builder, make-up, margin gate, duyệt) |
| ③ | Quản lý dự án | `/projects/[id]` | Xong — 9 tab: Tổng quan, Timeline, ORDER, CO/CE, Planning, Vận hành, Sản xuất, Thu mua, Nghiệm thu |
| ④ | Chi phí & Công nợ | `/finance` | Xong (tạm ứng, thanh toán NCC, công nợ, cashflow) |
| ⑤ | Nhân sự — chấm công | `/staff` | Xong (lịch tuần, chấm công, phép năm, xuất Excel) |
| ⑥ | KPI 75/25 | `/kpi` | Xong (quỹ performance, matrix chấm điểm, chốt kỳ, xuất Excel) |
| ⑦ | Lương | `/payroll` | **Chưa làm** (nav đang `status: "soon"`) |
| ⑧ | Kho | `/inventory` | Nền v1 xong (ledger, trả đồ) + **Kho v2 K1** (cây danh mục 7 nhóm, mã lô 5 khối, chuyển đổi lô, xuất hủy, chặn hàng hết hạn, CSV theo lô) + **K2** (role Thủ kho, đề xuất xuất kho có duyệt, báo hàng về chờ thủ kho — tab `/inventory/requests`) + **K3** (giữ chỗ tồn kho → dòng CO giá 0, trần xuất OPE, gộp dòng báo giá) + **K4** (kỳ chiến dịch ≤15 ngày, phiếu báo mất, chuyển đồ hiện trường A→B, điều chuyển kho có duyệt, thang cảnh báo hạn dùng, bảng tiêu hao) + **K5** (trả về kho khai lại trạng thái/tình trạng → lô mới) — **XONG TOÀN BỘ**, xem mục 10.11 |
| ⑨ | Chat nội bộ | `/chat` | Xong (1-1, group, file/ảnh/voice, reaction, poll, pin) |
| ✦ | Creative | `/creative` | Xong (task board + cost-per-task kế hoạch vs thực tế) |
| — | Dashboard | `/` | Xong (KPI kinh doanh theo team, cashflow MTD, tiến độ bộ phận) |
| — | AI | `/ai` | Xong (rà soát CO/CE, brainstorm, báo cáo BGĐ — DeepSeek + Tavily) |
| — | KB / Org chart | `/kb`, `/orgchart` | Xong |
| — | Settings | `/settings` | Xong (~18 trang con) |

**Quy mô:** 94 model Prisma · 55 migration · 61 file `src/lib` · 2964 key i18n × 2 ngôn ngữ · 117 route.

---

## 6. Nghiệp vụ cốt lõi cần hiểu trước khi sửa

### CO/CE (còn gọi CECO) — trái tim hệ thống
- **CO** = chi phí nội bộ (giá vốn). **CE** = giá chào khách.
- Cấu trúc: `CostSheet` → `CostSheetSection` (hạng mục, **lồng tối đa 4 cấp**) → `CostLine`.
- `margin% = (CE − CO) / CE`, **ngưỡng tối thiểu 31%** (setting `bidding.min_margin_pct`). Dưới ngưỡng → bắt buộc nhập lý do override.
- **"Chi hộ"** (`Section.isProxy`) = tiền chi hộ khách, **nằm hoàn toàn ngoài margin**, có phí dịch vụ riêng. Section con nằm dưới section Chi hộ tự kế thừa tính chất này.
- **Thuế theo từng dòng:** `VAT` (khấu trừ, không cộng vào CO) · `TNCN` (÷0,9) · `TNDN` (÷0,8) · `OTHER` (nhập tay số tiền thuế, không gross-up %).
- **Dòng âm tiền** được phép (đơn giá/số tiền cố định âm) — dùng cho khoản giảm trừ, thu hồi thanh lý.
- **Phí agency % + cờ "TCM hỗ trợ"** (27/07/2026, theo form BM02 thật): `CostSheet.agencyFeePct` và `CostLine.isSponsored` CHỈ phục vụ TRÌNH BÀY bản xuất báo giá (chuỗi Σ dòng → +phí → +VAT = ceTotal; dòng tài trợ hiện đơn giá nhưng không tính tiền) — KHÔNG tham gia coTotal/ceTotal/margin/trần hóa đơn. Bộ xuất: `lib/costsheet-quotation.ts` (thuần, một nguồn số cho cả Excel lẫn trang in /projects/[id]/co-ce/print).
- Mỗi lần lưu tạo 1 `CostSheetRevision` bất biến (snapshot JSON) → tab "So sánh" diff từng dòng giữa 2 phiên bản.

### Bất biến không được phá
1. Margin gate 31% + override có lý do.
2. Chi hộ ngoài margin.
3. Mọi thứ mới phải cộng vào `coTotal` hoặc chỉ tác động lúc suy ra `ceTotal` — **không tạo hệ thống tổng tiền song song**.
4. Chặn Finished nếu **chưa phát hành hóa đơn nào** (`ClientInvoice`) — đã thực thi trong `markFinished`. Chỉ đòi ĐÃ PHÁT HÀNH, không đòi thu đủ (khoản giữ lại bảo hành 5–10% là bình thường). Phần "CECO Liquid" (`CostSheet.version="LIQUID"`) vẫn **chưa lập trình** — hiện dùng con trỏ `sentToLiquidationRevisionId` làm mốc đối chiếu. Chặn chuyển Processing nếu thiếu confirm email/PO/HĐ.
   - Hóa đơn có MỘT nguồn sự thật là `ClientInvoice`, phát hành ở tab Nghiệm thu (`createLiquidationInvoice`) với trần = CE + Chi hộ của bản đã chuyển nghiệm thu. Cặp ô `Contract.invoiceNo/invoiceDate` cũ đã bỏ khỏi UI (cột còn trong DB, không ai đọc/ghi).

### Từ vựng
| Từ | Nghĩa |
|---|---|
| Nghiệm thu / Liquidation | Bàn giao & quyết toán cuối dự án |
| Thực Chi | Chi phí thực tế đã chi |
| Make-up | Suy CE từ CO bằng markup để đạt margin tối thiểu |
| CTV | Cộng tác viên (nhân sự thuê ngoài chạy event) |
| PIC | Người phụ trách |
| Chi hộ | Chi hộ khách hàng, ngoài margin |

---

## 7. Quy trình verify BẮT BUỘC trước khi coi là xong

```bash
npx tsc --noEmit          # phải sạch
npx eslint src --quiet    # phải sạch
# i18n parity — xem lệnh ở mục 4.2, phải 0/0
npx next build            # phải sạch, kiểm route list không mất route nào
```

Sau đó verify trên browser thật (dev server) với đúng nghiệp vụ vừa sửa. Với thay đổi liên quan tiền/công thức: kiểm chứng bằng số cụ thể, đối chiếu kỳ vọng — đừng chỉ xem "trang không lỗi".

---

## 8. Deploy

Server công ty: `192.168.1.111` (LAN) — domain `app.tcmbtl.com`. User `tcm`, key `~/.ssh/tcm_deploy`. Chạy bằng **pm2**.

### 8.1 Vào server — HAI đường, tuỳ mạng đang đứng

| Mạng | Lệnh |
|---|---|
| Trong LAN công ty (`192.168.1.x`) | `ssh tcm@192.168.1.111` |
| Ngoài công ty | `ssh -p 2222 tcm@115.79.195.150` |

Không chắc đang ở mạng nào thì xem IP máy mình (`ipconfig`), hoặc thử lần lượt cả hai.

⚠️ **CỔNG 2222, KHÔNG PHẢI 22.** Cổng 22 ở IP public `115.79.195.150` là THIẾT BỊ KHÁC (router/modem của nhà mạng), không phải server CRM — nó trả về host key khác nên đừng tưởng server bị đổi khoá rồi bỏ qua cảnh báo. Cổng 2222 mới là cổng NAT về đúng máy chủ.
*(Bản HANDOVER trước ghi "chỉ deploy khi ở trong LAN" vì lúc đó chưa biết cổng 2222 — cảnh báo đó không sai, chỉ thiếu. Nay đường ngoài dùng được.)*

⚠️ **Bắt buộc đối chiếu fingerprint trước khi đẩy bất cứ thứ gì**, nhất là lần đầu đi đường 2222: cùng một server đi hai đường phải trình ra **cùng một khoá**. Khác là dừng ngay, không nhập gì, không đẩy gì.

- Fingerprint server thật (ED25519, đúng cho CẢ hai đường): `SHA256:EWU4YXJM5NoE01QTVwLnXV2ao1Q1TG7fwvabxf39CfU`
- Kiểm nhanh: `ssh-keyscan -p 2222 -t ed25519 115.79.195.150 | ssh-keygen -lf -`

🔑 **Mật khẩu server KHÔNG nằm trong repo này** — nhận riêng qua kênh bảo mật, cùng nhóm với `.env` và `~/.ssh/tcm_deploy` (mục 1). Deploy bình thường dùng key, không cần mật khẩu. Nếu key báo `UNPROTECTED PRIVATE KEY FILE` thì siết quyền file trước: `chmod 600 ~/.ssh/tcm_deploy`.

### 8.2 Quy trình deploy

**Đã gói thành MỘT lệnh — chạy từ máy dev (Git Bash):**

```bash
bash scripts/deploy.sh          # deploy thật
bash scripts/deploy.sh --check  # chỉ kiểm tiền trạm + kết nối, không ghi gì lên server
```

Script tự làm đúng thứ tự: tiền trạm local (repo phải sạch git + tsc + i18n parity) → tự chọn đường LAN/cổng 2222 **theo fingerprint** (sai fingerprint là dừng, không đẩy gì) → backup DB+code về CẢ máy dev → sync code (tar) → **so cây file & xoá file mồ côi** → `npm ci` nếu lockfile đổi → `prisma generate` → `next build` khi app cũ còn chạy (hỏng build thì app cũ nguyên vẹn) → `pm2 stop` → `migrate deploy` → `db:seed` → `pm2 start` → health check (HTTP + dòng `[jobs] scheduler bật`). Commit đang chạy ghi ở `~/tcm-crm/.deployed-commit`; bản build trước giữ ở `~/tcm-crm/.next-prev` để rollback; hỏng giữa chừng thì script IN SẴN lệnh khôi phục từ backup.

⚠ **Script KHÔNG BAO GIỜ đụng `dev.db` / `.env` / `storage` trên server.** Từ 28/07/2026 dữ liệu thật sống trên production — lần đè DB ngày 28/07 (mục 11) là LẦN CUỐI; `dev.db` local từ nay chỉ là sandbox.

Các bẫy mà script đã né sẵn (đọc để hiểu, không cần làm tay):

- ⚠ **`npm run db:seed` là BẮT BUỘC sau `migrate deploy`**, không được bỏ: `migrate deploy` chỉ tạo bảng `role_permission` RỖNG → mọi role trừ ADMIN mất sạch quyền. Chi tiết ở mục 10.1 (BẪY DEPLOY).
- Luôn **backup DB production trước** mọi thao tác ghi đè.
- ⚠ **Dừng pm2 TRƯỚC khi đè `dev.db`** (`pm2 stop` → đè → build → `pm2 start`): đè lúc app còn chạy sẽ sinh lỗi `malformed database schema (orphan index)` thoáng qua — xem mục 11.
- ⚠ **Giải nén tar KHÔNG xoá file mà local đã xoá** — sau khi sync code phải so cây file hai bên (`find src -type f | LC_ALL=C sort` + `comm`) và xoá file mồ côi, không thì build hỏng vì trang cũ tham chiếu type đã gỡ (đã xảy ra 28/07 với 2 trang gỡ ở K2/K4).
- **Bộ hẹn giờ nhắc việc chạy TRONG tiến trình Next** (`src/instrumentation.ts`, chu kỳ 5 phút) — `pm2 restart` là đủ, KHÔNG cần cron của OS. Sau khi restart, kiểm `pm2 logs` phải thấy dòng `[jobs] scheduler bật`.
- ⚠ **Server phải đặt `TZ=Asia/Ho_Chi_Minh`** (hoặc set trong env của pm2): mốc giờ 8/9/10h của `src/lib/occasions.ts` đọc bằng `now.getHours()` = giờ local của tiến trình, sai TZ là lệch 7 tiếng. Kho v2 K4 cũng dựa vào đây (xem mục 10.11, bug lệch ngày đã vá).

---

## 9. Lịch sử thiết kế — đọc khi cần hiểu "vì sao lại làm thế này"

`docs/PLAN-HISTORY.md` (~300KB) chứa toàn bộ blueprint + kế hoạch từng batch, kèm **lý do** của mỗi quyết định kiến trúc, các phương án đã cân nhắc và bị loại, ràng buộc nghiệp vụ đã chốt với BoD.

Trước khi sửa một module lạ, tìm phần tương ứng trong file này — phần lớn câu hỏi "tại sao không làm cách đơn giản hơn?" đã có câu trả lời sẵn.

---

## 10. Hạn chế đã biết / nợ kỹ thuật (cố ý, không phải bug)

1. **RBAC đã chặn thật toàn app bằng ma trận quyền.** Không còn là "nominal".
   - **danh mục 114 quyền nằm ở CODE** (`src/lib/permission-catalog.ts`), **grant nằm ở DB** (bảng `role_permission`), sửa ở `/settings/roles` tab **"Ma trận quyền"**. Danh mục để ở code vì mỗi mã phải có một chỗ `requirePermission()` tương ứng — thêm dòng vào DB sẽ tạo quyền không ai kiểm.
     Ngoại lệ (kiểm bằng `hasPermission()` **bên trong** action đã có `requirePermission` khác ở đầu — đừng đi tìm `requirePermission` tương ứng): `finance.vendor_payment.over_cap` trong `createVendorPayment` VÀ trong `createCtvBatchPayments` (đề xuất thanh toán đợt CTV, operations/actions.ts); `finance.invoice.over_cap` trong `createClientInvoice` (trần mềm theo CO/CE sống — cửa Nghiệm thu vẫn trần cứng).
   - **~316 điểm chặn**: ~220 server action + 79 page + 9 route API (27/07 đợt 3+4: PO 4 action + kế hoạch thu 2 + NCC 2 + trang P&L/Vendors; 27–28/07 Kho v2: 2 action + 1 trang danh mục cây, rồi 7 action đề xuất + 3 trang `/inventory/requests`). Biên bản nghiệm thu làm NGOÀI hệ thống bằng Word (quyết định chủ dự án 27/07) — flow trong app dừng ở "Chuyển sang Nghiệm thu" (Account) → kế toán xuất hóa đơn; bản in-app cũ nằm ở commit eb76699 nếu cần khôi phục. Guard là `requirePermission("<mã>")` ở **câu lệnh đầu tiên** của mỗi page/action; route API dùng `hasPermission()` rồi trả 403.
   - **Role `ADMIN` là sàn cứng trong code** — luôn đủ 114 quyền, không có dòng grant nào trong DB. Cố ý, để không ai tự khoá mình ra khỏi chính trang sửa ma trận.
   - **Cố ý KHÔNG gác**: 11 action (đăng nhập/đổi mật khẩu, cổng khách, avatar & thông báo của chính mình), 9 trang (`(auth)`, `(guest)`, `/profile`, `/reminders`, `/orgchart`, `/ai` — trang AI tự lọc từng tính năng bên trong), 2 route API (`notifications/poll`, `staff-avatar`).
   - Ba cơ chế cũ **đã bị thay**: `requireAdmin()` (xoá hẳn), `getDashboardScope()` và `getAiVisibility()` nay đọc từ ma trận thay vì phòng ban/danh sách email cứng.
   - **Tài khoản VẬN HÀNH không có email** (thủ kho, bảo vệ — chốt 28/07/2026): `Staff.email` ở hệ này là TÊN ĐĂNG NHẬP chứ không phải hộp thư, nên KHÔNG cần cột mới. Người dùng gõ tên ngắn (`thukho`), `normalizeLoginId()` tự ghép `@tcm.local` (`lib/auth-session.ts`); `isAllowedLoginDomain` cho phép `@tcmbtl.com` + `tcm.local`/`tcm.internal`, còn `isMailableDomain` (chỉ `@tcmbtl.com`) gác "Quên mật khẩu" — tài khoản nội bộ không có hộp thư nên admin cấp lại mật khẩu ở `/settings/staff`. Ô đăng nhập là `type="text"` (để `type="email"` thì trình duyệt chặn tên không có `@`).
   - **Role vận hành hẹp KHÔNG nhận bộ quyền mặc định**: `EXPLICIT_GRANTS` trong seed (vòng 4) — `WAREHOUSE_KEEPER` đúng 13 mã (12 kho + chat), `SECURITY_GUARD` 2 mã. Nguyên tắc "grant mặc định = quyền mọi người đang có" chỉ đúng với phòng ban CŨ; role sinh ra SAU khi có ma trận không có quyền cũ nào để bảo toàn (K2 lỡ cấp 66 mã cho thủ kho, gồm duyệt tạm ứng + phát hành hóa đơn — **vòng 4c** đã reset một lần, marker `20260728_narrow_roles_reset`).
   - ⚠ **`requirePermission` KHÔNG đá về `/` nữa** mà về trang hạ cánh hợp vai (`SAFE_LANDING` trong `lib/permissions.ts`), cuối cùng là `/no-access`. Lý do: chính `/` gác `dashboard.view`, nên tài khoản hẹp quyền bị `/` → `/` → **vòng lặp 307 vô hạn**, không vào được app. Trang `/no-access` CỐ Ý không gọi `requirePermission` — gác ở đó là dựng lại đúng vòng lặp vừa phá.
   - **Form thêm nhân sự nay có ô "nhóm quyền" + ô "TCM không trả lương"**: trước đây `createStaff` không gán `roleId` → user mới 0 quyền → rơi thẳng vào vòng lặp trên. Sau khi tạo, nút **"Sửa tài khoản"** ở mỗi hàng `/settings/staff` sửa được tài khoản đăng nhập + cờ không-trả-lương (`updateStaffLogin`, có audit cũ→mới, chặn trùng + chặn tên miền lạ). Phòng ban / chức danh / quản lý vẫn CHƯA sửa được trong app.
   - ⚠ **Nhãn nhóm role sinh động** `t(\`group${groupCode}\`)` ở `/settings/roles` — thêm `groupCode` mới vào `ROLE_GROUP_ORDER` mà quên key `settings.roles.group<CODE>` là trang ném MISSING_MESSAGE, và **script kiểm i18n parity KHÔNG bắt được** (key ghép chuỗi lúc chạy). Đã xảy ra một lần với `groupWAREHOUSE`.
   - ⚠ **Không gate bằng `layout.tsx`**: layout không re-render khi điều hướng phía client và không chặn được server action — xem `node_modules/next/dist/docs/01-app/02-guides/authentication.md` dòng 1350 và 1446. Ẩn mục khỏi menu chỉ là trang trí.
   - ⚠ **BẪY DEPLOY**: `prisma migrate deploy` chỉ tạo bảng `role_permission` **rỗng** → mọi role trừ ADMIN mất sạch quyền. Quy trình mục 8 **không có bước seed**. Nếu deploy code lên DB production đang chạy thì **bắt buộc chạy `npm run db:seed` sau `migrate deploy`** (seed chỉ điền cho role chưa có grant nào, không đè chỉnh sửa tay; riêng **Vòng 4b backfill** cấp mã quyền MỚI cho role ĐANG có grant đúng một lần mỗi đợt — đánh dấu vào bảng `setting` module `seed`, chạy lại không đè việc admin đã bỏ tick). Nếu đè `dev.db` lên production thì grant đi kèm sẵn, không cần làm gì.
   - Grant mặc định do seed dựng = **đúng quyền mọi người có trước khi bật ma trận** (nay 1358 dòng / 21 role, thêm role `WAREHOUSE_KEEPER`), cố tình không siết sẵn — chính sách thật do BGĐ tick trong ma trận. Hai mã vượt trần (`finance.vendor_payment.over_cap`, `finance.invoice.over_cap`) đã backfill cho **BGĐ + CFO** theo quyết định chủ dự án 27/07/2026. Kho v2 K2 backfill 4 đợt (`20260728_kho_k2_*`): đề xuất cho mọi role, duyệt cho Account+BGĐ, duyệt-mọi-dự-án cho AD/AM+BGĐ, xác nhận kho cho Thủ kho + OPE Manager (tạm).
   - Chưa làm: `payroll.manage` chưa gắn chỗ nào (module ⑦ chưa có). Quyền theo **nhóm role**, chưa có ngoại lệ theo từng người.
2. **Chat dùng polling ~4s**, chưa realtime (đủ cho nội bộ ~42 người).
3. **KPI phase 1 zero-sum:** hệ số margin cố định 1.0 (floor=cap=1), margin chỉ hiển thị chứ chưa gắn tiền. BoD bật co giãn sau bằng Settings, không cần sửa code.
4. **`Staff.payrollExempt` = TCM không trả lương người này** (thủ kho/bảo vệ điểm kho do bên thứ ba trả — chốt 28/07/2026). VẪN xếp ca và VẪN hiện trên bảng công tháng + Excel (có nhãn "Không tính lương") để tham chiếu, nhưng bị loại khỏi: quỹ KPI (`lib/kpi.ts`), quỹ lương Creative (`lib/creative-cost.ts`), phép năm (`lib/timekeeping.ts` — phép là phúc lợi có lương).
   ⚠ **ĐỪNG thay bằng cách nhập lương 0** ở PositionSalary: `kpi.ts` chỉ loại khi `salary == null`, nên 0 ≠ null → người đó vẫn nằm trong nhóm đủ điều kiện và VẪN ĂN share thật của quỹ do đồng đội đóng góp.
5. **Lương theo VỊ TRÍ, không theo cá nhân.** (Lý do cũ "chưa có RBAC" nay đã hết — `/creative/cost` được gác bằng quyền `creative.cost.view`; giữ theo vị trí là lựa chọn nghiệp vụ.) `positionTitle` là free-text khớp `Staff.title` — nợ: nên chuyển thành option_set + `Staff.titleId`.
6. **Cost-per-task "thực tế" là PHÂN BỔ theo giờ, không phải tiền đã chi.** Đừng đọc thành chi phí thực.
7. **Chưa có test tự động.** Verify hiện làm bằng tsc/eslint/build + browser thủ công.
8. **CO/CE chỉ có CE tổng ở cấp bảng**, chưa có CE theo từng dòng (Phase 2 đã bàn: CE-per-line + gom N dòng CO → 1 dòng CE + make-up theo dòng + AI gợi ý markup — **chưa làm**).
9. SQLite single-writer: giữ transaction ngắn, fan-out notification **sau** commit.
10. **Nhắc việc nay có bộ hẹn giờ thật** (`src/instrumentation.ts` + `src/lib/job-runner.ts`) — không còn phụ thuộc "có người mở app". Hạn chế còn lại: tick 5 phút chứ không phải cron theo giờ chính xác; nếu pm2 chạy cluster thì mỗi instance có một timer, nhưng "vé chạy" (bảng `setting`, module `jobs`) bảo đảm mỗi chu kỳ chỉ một lượt chạy thật. Layout render vẫn gọi `runDueJobs()` làm lưới an toàn.
11. **Kho v2 đang làm theo ĐỢT** (spec + 7 quyết định chủ dự án chốt 27/07/2026 — chi tiết ở PLAN-HISTORY, mục "Kho v2 — K1"). **K1 ĐÃ XONG:** cây danh mục 7 nhóm (`inventory_category_node`, node gốc mang 1 ký tự đi vào mã; admin sửa ở `/settings/inventory-categories`); item = **LÔ đồng nhất** với mã `{Nhóm}.{TrạngThái}.{TìnhTrạng}.{KH 3 ký tự}.{seq 3 số}` sinh tự động (phần thuần ở `lib/inventory-lot.ts`, seq theo tổ hợp qua `nextItemSeq`); trạng thái R/P/C/W/L/D + tình trạng B/P/S **không sửa tay** — đổi bằng phiếu CHUYỂN ĐỔI LÔ (`CONVERT`/CD, chạy số lượng giữa 2 mã, lô đích tự tìm/tạo, bộ tách phần chuyển cả bộ); phiếu XUẤT HỦY (`DESTROY`/XH, bắt buộc lý do) là đường ra duy nhất cho hàng hết hạn — ISSUE chặn hàng quá `expiryDate`; CSV import gom dòng theo lô (1 mã nhiều kho), không còn cột "Mã". **K2 ĐÃ XONG** (migration `20260728010000_kho_v2_k2_stock_requests`): bảng `StockRequest`/`StockRequestLine` = tầng ĐỀ XUẤT đặt TRÊN sổ cái — tồn kho **chỉ đổi khi thủ kho xác nhận**, lúc đó mới sinh StockDocument và gắn `documentId` làm mốc đối chiếu.
   - **Xuất kho (DX)**: OPE đề xuất → **Account PIC/Leader của ĐÚNG dự án** (hoặc AD/AM có `inventory.request.approve_any`) duyệt → thủ kho chốt số thực xuất (≤ số duyệt) → phiếu XE + trừ tồn + cộng holding. Chặn: hàng hết hạn, lô ràng dự án khác, hàng của khách khác, vượt **khả dụng = tồn − đã duyệt chưa xuất** (giữ chỗ mềm, kiểm lại lần nữa lúc duyệt).
   - **Báo hàng về (DN)**: PUR/OPE/Account báo (gắn PO nếu có) → **không có bước duyệt** (spec workflow c) → thủ kho chốt số thực nhập → phiếu NK. Dùng cho cả 3 nguồn: PO, hàng khách gửi, đồ site quay về (khai lại trạng thái/tình trạng lúc về = tạo lô mới ở tab Danh mục trước).
   - **Role mới `WAREHOUSE_KEEPER`** (nhóm `WAREHOUSE`) + 6 mã quyền (**109 mã**): `inventory.request.create` (mọi role) · `.approve` (Account + BGĐ) · `.approve_any` (AD/AM + BGĐ) · `issue.confirm` + `intake.confirm` + `lot.convert` + `destroy` (Thủ kho; **OPERATIONS_MANAGER giữ tạm** tới khi chủ dự án gán người thật ở `/settings/staff` rồi bỏ tick).
   - Xuất kho 1 bước cũ **đã gỡ** (`createIssueDoc` + `/documents/new/issue`); nhập kho trực tiếp `/documents/new/import` nay gác `inventory.intake.confirm` (chỉ thủ kho, dùng cho kiểm kê/tồn đầu kỳ).
   - ⚠ Dự án **chưa gán PIC/Leader** thì chỉ người có `approve_any` duyệt được — cố ý (21 dự án cũ đang trống PIC; gán ở form sửa dự án).
   **K3 ĐÃ XONG** (migration `20260728140000_kho_v2_k3_costline_stock_link`): đề xuất GIỮ CHỖ dùng lại bảng StockRequest với `type="RESERVE"` (mã GC, vòng đời dừng ở APPROVED, KHÔNG đụng sổ cái); CostLine +2 cột `stockResvLineId` (khoá cặp, đặt trên CẢ HAI dòng) + `stockRefUnitPrice` (giá tham chiếu, khác null = dòng kho). Dòng kho có `unitPrice=0` THẬT (CO=0 do số học) — saveCostSheet CHUẨN HOÁ lại phía server (ép QTY_PRICE/VAT, xoá customTaxAmount) vì taxType OTHER vẫn cộng tiền vào base; chặn dòng kho nằm trong Chi hộ. Báo giá BM02: trọng số chia tiền khách = CO + giá tham chiếu (`lineWeight`), cặp dòng GỘP thành một dòng khách nhìn — chứng minh Σ dòng in = serviceSubtotal và TỔNG = ceTotal tuyệt đối (test thuần: 193.500.000 → 212.850.000 → 229.878.000). Trần xuất kho của OPE = SL giữ chỗ − phần đã đòi, CHỈ áp cho item CÓ giữ chỗ (item khác giữ nguyên hành vi cũ, tránh chặn đứng 21 dự án chưa từng giữ chỗ). Tồn khả dụng trừ giữ chỗ CÒN TRỐNG của dự án KHÁC (`availableToRequest` 3 tham số + `remainingReserve`). Dòng kho KHÔNG sinh FinanceCostLine (trần chi 0 sẽ làm phiếu chi báo "vượt trần" oan). Quyền mới `inventory.reservation.approve` (**109 mã**) backfill FINANCE + HR_MANAGER + BGĐ — "một trong hai duyệt là đủ" đạt bằng cùng một mã quyền. ⚠ GIỮ CHỖ LÀ MỀM: phiếu ADJUST/TRANSFER/DESTROY/CONVERT vẫn rút được hàng đã giữ chỗ. **K4 ĐÃ XONG** (migration `20260729000000_kho_v2_k4`): 4 mảng, tất cả đã verify bằng số thật trên browser.
   - **KỲ CHIẾN DỊCH** (`Project.stockCampaignOpenedAt`, setting `inventory.campaign_max_days` = 15): mở tự động ở lần đầu thủ kho chốt xuất hàng TÁI SỬ DỤNG; **đóng tự động** khi holding của dự án về 0 (`closeCampaignIfSettled`, gọi ở CUỐI mọi transaction làm giảm holding). Quá ngưỡng thì chặn lệnh xuất MỚI cho dự án đó — kiểm hai lần, cả lúc lập và lúc DUYỆT (đề xuất ngày 14 duyệt ngày 17 phải rớt). CỐ Ý chỉ chặn đường RA: chặn cả đường về là nhốt hàng ngoài site, người dùng sẽ lách bằng phiếu điều chỉnh.
   - **PHIẾU BÁO MẤT (`LOSS`/BM)** là LỐI THOÁT BẮT BUỘC của kỳ: đồ mất ở site không trả về được, thiếu phiếu này thì holding không bao giờ về 0 và dự án bị khoá vĩnh viễn. Trừ holding, **KHÔNG cộng lại kho** (khác hẳn RETURN), bắt buộc lý do, gác `inventory.destroy`.
   - **CHUYỂN ĐỒ HIỆN TRƯỜNG A→B (`HOLDING`/CH)**: 2 bước, gửi trừ holding A ngay, B xác nhận mới cộng; nhận ĐỦ hoặc huỷ (phần hụt phải đi qua phiếu BM của bên gửi). ⚠ `projectId` của phiếu CH là dự án NHẬN và `expectedReturnAt` MỚI là **bắt buộc** — bộ nhắc trả đồ neo vào phiếu, không làm vậy thì hàng chuyển đi rơi khỏi radar vĩnh viễn; `getInventoryReturnReminders` đã mở rộng sang `type IN (ISSUE, HOLDING)`. ⚠ Bên gửi **không** chốt kỳ lúc phiếu còn PENDING — chốt sớm rồi huỷ sẽ mở lại kỳ bằng ngày hôm nay = reset đồng hồ 15 ngày.
   - **ĐIỀU CHUYỂN KHO NAY PHẢI QUA DUYỆT**: `StockRequest.type="TRANSFER"` (mã DK) → duyệt bằng quyền MỚI `inventory.transfer.approve` (**109 mã**, backfill `20260729_kho_k4_transfer_approve` cho OPE Manager + BGĐ) → thủ kho chốt số thực xuất, lúc đó mới sinh phiếu CK PENDING + trừ kho nguồn; kho đích nhận bằng luồng cũ. Chuyển kho 1 bước **đã gỡ** (`createTransferDoc` + `/inventory/documents/new/transfer`) đúng như K2 đã gỡ xuất kho 1 bước — để cả hai đường thì bước duyệt chỉ là trang trí. Giữ chỗ mềm mở rộng: `approvedNotIssuedByItem` đếm cả TRANSFER APPROVED.
   - **THANG CẢNH BÁO HẠN DÙNG** vào bộ hẹn giờ (`checkExpiryWarnings` trong `JOBS`): vàng 90 / cam 60 / đỏ 30 / hết hạn. `InventoryItem.expiryReminderLevel` + `EXPIRY_RANK` là **thang bậc**, không phải cờ một-lần: một lô bắn đúng 4 lần ở 4 mức, cùng mức không bắn lại. Người nhận = ai có `inventory.intake.confirm` **HOẶC role ADMIN** (ADMIN là sàn cứng trong code, không có dòng grant nào trong DB — truy vấn theo quyền mà quên điều này là admin không nhận được gì). Sửa `expiryDate` ở form mặt hàng thì XOÁ mốc đã cảnh báo.
   - **BẢNG TIÊU HAO** `/inventory/consumption/[projectId]`, tính LẠI TỪ SỔ CÁI: tiêu hao thật = giao − trả − chuyển đi − mất − còn ở site. Trừ cả "mất" và "còn ở site" là cố ý; hàng dùng một lần không có holding nên hai khoản đó = 0 và công thức rút về (giao − trả − chuyển đi).
   - ⚠ **BUG NGÀY ĐÃ VÁ (đọc trước khi viết code có ngày)**: `utcMidnightToday()` và `utcDayDiff()` từng đọc `getUTCDate()`. Mốc UTC-midnight của app khi xem ở Asia/Saigon là **07:00 đúng ngày đó**, còn `new Date()` lúc 0–7h sáng lại rơi vào ngày UTC HÔM TRƯỚC → mọi so sánh với "bây giờ" trong khung giờ đó lệch đúng 1 ngày (bắt được lúc verify: kỳ chiến dịch mở lúc 02:41 sáng 28/07 bị đóng dấu 27/07). Nay cả hai đọc thành phần ĐỊA PHƯƠNG. Server bắt buộc `TZ=Asia/Ho_Chi_Minh` — xem mục 8.

   **K5 ĐÃ XONG — KHO V2 HOÀN TẤT** (migration `20260730000000_kho_v2_k5`): hiện thực hoá quyết định Câu 6
   ("hết event mang về mới nhập — thủ kho khai đúng trạng thái/tình trạng THỰC TẾ lúc về, MÃ LÔ MỚI").
   - **Phiếu TRẢ VỀ KHO (TH) nay khai lại được từng dòng.** Dòng nào khai khác lúc xuất thì số lượng cộng vào
     LÔ ĐÍCH (tìm-hoặc-tạo theo tổ hợp, mã kế tiếp) chứ không quay lại mã cũ — đúng Câu 2, không sửa trạng thái
     tại chỗ. Khai trùng trạng thái nguồn = trả nguyên lô, hành vi y hệt trước K5.
   - ⚠ **BẤT BIẾN SỐNG CÒN: `StockDocumentLine.itemId` LUÔN là lô NGUỒN, lô đích ghi ở `convertToItemId`.**
     Ba hệ thống hạ nguồn khoá cứng vào đó và sẽ sai THẦM LẶNG nếu ai đó đảo hai vế: (a) nhả trần giữ chỗ K3
     (`reserveFreeByItem` trừ dòng RETURN theo cặp dự án+itemId — đảo vế thì trần cạn vĩnh viễn, OPE bị chặn
     xuất vòng hai dù hàng đầy kho); (b) cột "đã trả kho" của bảng tiêu hao K4 (`getProjectConsumption` gom
     theo itemId — đảo vế thì lô nguồn báo tiêu hao 100% còn lô đích báo âm); (c) `debitHolding` khoá theo
     (dự án, itemId). Cả ba đã verify bằng số sau khi K5 chạy: giữ chỗ 50 → xuất 50 → trả 30 nguyên + 20 khai
     lại ⇒ trần nhả đủ 50, tiêu hao "giao 50 · trả 50 · tiêu hao 0".
   - **Quyền: KHÔNG có mã mới (vẫn 109).** `createReturnDoc` giữ `requirePermission("inventory.doc.create")` ở
     đầu — đường TRẢ NGUYÊN LÔ phải mở cho mọi vai vì đó là lối thoát kỳ chiến dịch 15 ngày và người bị nhắc
     quá hạn phải tự bấm được. Riêng phần ĐỔI LÔ kiểm thêm `hasPermission("inventory.lot.convert")` BÊN TRONG
     action (mirror mẫu `finance.vendor_payment.over_cap`, xem mục 10.1). Không làm vậy là nới ngầm đặc quyền
     phân loại lại của thủ kho từ 2 vai lên 21 vai và biến phiếu chuyển đổi thành trang trí. Đã verify: đóng vai
     Account Staff, nhét tay `toStatus/toCond` vào payload → server chặn, sổ cái không đụng; cùng vai đó trả
     nguyên lô vẫn chạy bình thường.
   - ⚠ **Đã BỎ `@@unique([documentId, itemId])` trên `stock_document_line`** (thay bằng `@@index`). Ca dùng
     chính của K5 là MỘT lô về thành NHIỀU tình trạng = nhiều dòng cùng itemId nguồn, ràng buộc cũ chặn thẳng.
     Chống trùng chuyển lên `parseLines`: theo CẶP (item, trạng thái đích, tình trạng đích) với phiếu trả, theo
     item với mọi phiếu khác — chặt hơn ràng buộc cũ ở ca mới, y hệt ở ca cũ. Đừng khôi phục ràng buộc này.
   - **`resolveTargetLot()` là MỘT nguồn sự thật** cho việc tìm-hoặc-tạo lô đích: phiếu CD (tồn→tồn cùng kho)
     và phiếu TH (holding→tồn) cùng gọi. Tách ra từ khối inline cũ trong `createConvertDoc` (hồi quy đã verify:
     CD vẫn sinh lô đích mới và chạy số đúng). Sửa quy tắc sinh mã thì sửa đúng một chỗ.
   - **Giới hạn CỐ Ý:** phần con của bộ tách phần (`parentItemId != null`) KHÔNG khai lại lẻ được — phải chuyển
     cả bộ bằng phiếu CD, giống guard sẵn có của CONVERT. Form hiện nhắc rõ thay vì im lặng.
   - **Form trả đồ tách thành `return-form.tsx`** (đúng tiền lệ `convert-form.tsx` của K1); `doc-form.tsx` nay
     chỉ còn IMPORT/ADJUST/DESTROY/LOSS và GỌN HƠN trước.

   **HAI THỨ CÒN NỢ, ĐÃ BÁO CHỦ DỰ ÁN (không thuộc phạm vi K5):**
   1. `confirmIntakeRequest` (báo hàng về DN) chỉ `creditBalance`, KHÔNG `debitHolding`. Ai còn làm theo quy
      trình cũ ("đồ site quay về = tạo lô mới ở tab Danh mục rồi báo hàng về") sẽ cộng tồn lên lô mới trong khi
      holding lô cũ treo vĩnh viễn → sau 15 ngày dự án bị khoá xuất. **Từ K5, đồ từ site về PHẢI đi phiếu TH;**
      DN chỉ dùng cho hàng PO / hàng khách gửi / tồn đầu kỳ.
   2. `requests/load.ts` (màn hình lập đề xuất) KHÔNG trừ phiếu RETURN khi tính tồn khả dụng, trong khi
      `requests/actions.ts` (server) CÓ trừ — lệch có từ K3, không phải do K5. Hệ quả: form hiện số khả dụng
      rộng hơn thực tế rồi server mới báo lỗi. Nên gom hai bên về một hàm dùng chung.

   **Kho v2 KHÔNG CÒN đợt nào.** Những thứ đã cân nhắc và CẮT theo nguyên tắc "không thêm thứ không ai yêu
   cầu" (muốn làm phải xin chủ dự án trước): tiêu hao quy ra tiền, model `Campaign` riêng, nhận thiếu trên
   phiếu CH, ngưỡng 90/60/30 cấu hình được, khoá cứng giữ chỗ trước ADJUST/DESTROY/CONVERT, tự sinh dòng CO
   cho dự án nhận, chặn `markFinished` khi holding > 0. OptionSet `inventory_category` cũ deprecated (cột
   `categoryId` còn trong DB, không ai ghi).

12. **NHÓM KHÁCH HÀNG — H1 XONG** (migration `20260731000000_client_groups`). Bài toán thật: AEON có 4 pháp
    nhân (AHD/AHL/ALB ở team A2, AHP ở A3), mỗi bên tự ký hợp đồng — mất cả nhóm là mất 60% doanh thu nhưng
    từng pháp nhân chỉ ~15% nên cảnh báo tập trung không bao giờ bật.
    - **CỐ Ý chọn 1 tầng + nhóm, KHÔNG làm cây cha–con.** Nghiệp vụ thật không có công ty mẹ đứng tên ký
      thay con. Cây cha–con sẽ buộc phải đổi ≥10 quy tắc đang chạy: kiểm sở hữu hàng kho (`ownerClientId`
      so bằng `project.clientId`), mã lô kho, `client-status.ts` (cha không có dự án → mãi "Tiềm năng"),
      `client-profile.ts` (cha không có MST → banner "hồ sơ thiếu" bật vĩnh viễn), đếm client ở dashboard,
      `transferClient`, mọi picker khách. Nhóm chỉ đụng thêm mà không sửa quy tắc nào — trừ đúng 1 chỗ dưới.
    - ⚠ **`ClientGroup.code` 2–10 ký tự và KHÔNG vào bất kỳ mã sinh nào.** Đừng nhầm với `Client.code` 3 ký
      tự — mã đó nằm trong mã lô kho (`lib/inventory-lot.ts`) và mã dự án (`lib/bidding.ts`), đổi là hỏng
      dữ liệu cũ. Nhóm thuần tuý là nhãn gom + (đợt sau) chỗ neo Knowledge Base dùng chung.
    - **Cảnh báo tập trung nay gom theo ĐỐI TƯỢNG** = nhóm nếu có nhóm, ngược lại là chính khách
      (`lib/client-concentration.ts`). ⚠ **Mẫu số đổi nghĩa khi nhóm vắt nhiều team**: nhóm nằm gọn 1 team
      thì mẫu số vẫn là doanh thu team (nghĩa cũ); nhóm vắt ≥2 team (đúng ca AEON) thì mẫu số là doanh thu
      TOÀN CÔNG TY và `teamCode = null`. Hai loại % KHÁC mẫu số nên banner dùng hai câu i18n riêng
      (`rowTeam` / `rowCompany`) — đừng gộp lại thành một câu.
    - Nhóm chỉ bật/tắt (`isActive`), **không có đường xoá**: xoá nhóm đang được khách trỏ vào là mất dấu vết
      gom. Tắt = ẩn khỏi ô chọn khi gán mới, khách cũ giữ nguyên nhóm (mirror Vendor).
    - Quản trị ở `/clients/groups`, dùng lại quyền `clients.manage` — **không mã quyền mới**. Seed nhóm AEON
      chỉ gán khi `groupId == null` nên chạy lại trên production không đè chỉnh tay của admin.
    - **CHƯA LÀM (cố ý):** lọc danh sách khách theo nhóm; gán nhóm trong import Excel; nhóm lồng nhóm.
    - ⚠ **Gán nhóm KHÔNG đi qua form sửa khách.** Form đó bắt hồ sơ đầy đủ (MST, địa chỉ…), mà **64/68
      khách đang thiếu hồ sơ** — gồm cả 4 pháp nhân AEON, đúng những khách cần gom nhóm nhất. Nên có
      action hẹp `assignClientGroup` (ô chọn ngay trên trang chi tiết khách), theo đúng tiền lệ
      `transferClient`. Đừng gỡ nó đi để "gom về một form".

13. **KHO KIẾN THỨC THEO KHÁCH — H2 XONG** (migration `20260801000000_client_kb`, 4 bảng `client_kb_*`,
    toàn bảng MỚI). Mục tiêu: nhân viên — nhất là người mới — đọc/học về khách TRƯỚC khi nhận việc;
    PIC/Account leader nạp dần theo thời gian. Khung ĐỒNG NHẤT cho mọi khách, chỉ dữ liệu khác nhau:
    (a) thông tin chung · (b) tài liệu nguồn (brand guideline, brief) · (c) bài học chia theo chủ đề.
    - ⚠ **KHÔNG liên quan gì tới `/kb`** (thư viện tài liệu chung toàn công ty, model `KbDocument`).
      Hai module trùng tên gọi nhưng khác hoàn toàn về dữ liệu, quyền và mục đích.
    - **KB neo vào ĐỐI TƯỢNG, không neo vào khách**: `resolveKbAnchor()` trả nhóm nếu khách có nhóm,
      ngược lại trả chính khách. Nhóm AEON học MỘT lần cho cả 4 pháp nhân. ⚠ Anchor **suy lại ở mọi
      request**, KHÔNG cache vào cột nào — khách được gán nhóm là lập tức thấy kho nhóm, gỡ khỏi nhóm
      là quay về kho riêng cũ (vẫn nguyên trong DB, không merge tự động).
    - ⚠ **Bất biến XOR** (đúng một trong `clientId`/`groupId` có giá trị) chỉ được ép ở **một đường ghi
      duy nhất** là `getOrCreateKbSpace()` — SQLite coi nhiều NULL là khác nhau nên `@unique` trên từng
      cột KHÔNG tự ép được. Tạo space ở chỗ khác là phá bất biến trong im lặng.
    - ⚠ **Bản nháp lọc ở TẦNG TRUY VẤN** (`loadKbSpaceView(anchor, canManage)`), không phải ở giao diện.
      Lọc bằng CSS/JSX thì nội dung mật vẫn nằm trong HTML thô. Đã verify bằng cách đóng vai
      Planning Executive: tiêu đề lẫn nội dung bài nháp KHÔNG có trong HTML, URL bài nháp trả 404.
    - **Chống đọc/sửa chéo giữa các khách**: mọi action nhận `lessonId`/`topicId`/`sourceId` đều kiểm
      lại nó thuộc đúng anchor đang mở (`lessonBelongsToAnchor`, `assertTopicInAnchor`). Không có bước
      này thì đoán id là đọc được KB khách khác.
    - **Nội dung bài = JSON BLOCK có cấu trúc** (heading/paragraph/bullets/terms), KHÔNG markdown/HTML —
      repo cố ý không có markdown renderer. Render bằng JSX text node (React tự escape), Zod validate
      lại ở mọi đường ghi. Cấu trúc này cũng để H3 cho AI sinh thẳng JSON đúng khuôn.
    - **Quyền: 2 mã mới (109 → 111)** — `clients.kb.view` (mọi role TRỪ Thủ kho + Bảo vệ) và
      `clients.kb.manage` (nhóm ACCOUNT + BGĐ). Backfill 2 marker `20260801_client_kb_h2_*`.
    - ⚠ **`next.config.ts` nay khai `serverActions.bodySizeLimit: "30mb"` — ĐỪNG GỠ.** Trước H2 file này
      KHÔNG có mục experimental, nên trần Server Action là mặc định **1MB** và MỌI trần upload khai
      trong code chỉ là con số trên giấy: chat 10MB, KB chung 25MB, file AI 15MB, avatar 3MB. Vượt 1MB
      là Next ném 413 TRƯỚC khi code mình chạy → người dùng thấy TRANG VỠ chứ không thấy thông báo lỗi.
      Để 30MB chứ không phải đúng 25MB vì trần tính trên RAW body (gồm đệm multipart) — chừa dư để
      guard trong code là chỗ báo lỗi tử tế. Nâng trần ở storage nào thì nhớ nâng cả ở đây.
    - ⚠ **`isRestricted` trong seed PHẢI chứa `clients.kb.manage`.** Thiếu dòng đó thì mã này rơi vào
      `baseGrantCodes` và một lần `migrate reset` + `db:seed` (hoặc dựng lại production sau sự cố) cấp
      quyền SOẠN cho cả 20 role có base grant — ngược hẳn chính sách mà backfill đang thực thi, và
      backfill KHÔNG siết lại được vì nó chỉ THÊM cho role đã có grant. Đã đo trên DB seed mới:
      `clients.kb.manage` = 4 role, `clients.kb.view` = 20 role. `clients.kb.view` thì CỐ Ý nằm trong
      base — thủ kho/bảo vệ đã bị chặn bằng `EXPLICIT_GRANTS`.
    - ⚠ **Hằng dùng chung với ô chọn tệp (`CLIENT_KB_MIME_TYPES`, `MAX_CLIENT_KB_FILE_BYTES`) nằm ở
      `client-kb.ts`, KHÔNG ở `client-kb-storage.ts`.** Storage import `fs/promises`; ô upload là client
      component, kéo storage vào là build hỏng ngay (`Module not found: Can't resolve 'fs/promises'`).
      Lỗi này **tsc và eslint đều KHÔNG bắt được** — chỉ `next build` bắt. Storage re-export lại 2 hằng
      đó để các chỗ import cũ không phải đổi.
    - **Bốn bẫy mất dữ liệu đã bịt** (soát nghịch trước khi commit, mỗi cái verify trên browser):
      (a) 3 nút xoá nay đều `window.confirm` theo đúng tiền lệ `kb-panel.tsx:129`;
      (b) `readLessonBlocks()` trả thêm cờ `corrupt` — trang SỬA hiện banner đỏ thay vì mở trình soạn
      thảo trắng rồi để người dùng bấm Lưu ghi đè `[]` lên nội dung không đọc được;
      (c) ô tiêu đề bài là **controlled** — React 19 gọi `requestFormReset` sau MỌI lần chạy form action
      kể cả khi action trả lỗi, để `defaultValue` là tiêu đề vừa gõ bị trả về giá trị cũ;
      (d) khách được gán vào nhóm mà trước đó đã có kho riêng: trang KB hiện banner đếm rõ "còn N chủ
      đề, M tài liệu đang bị ẩn" (`countHiddenClientSpace`) thay vì im lặng như mất dữ liệu.
    - **Ba chỗ làm module dùng được thật**: link "Sửa bài" ngay trên danh sách (trước phải đi 2 hop qua
      trang xem) · ngày cập nhật bài + ngày tải tài liệu (dữ liệu đã nạp sẵn, trước bỏ không dùng) ·
      `setLessonStatus` chặn ĐĂNG bài rỗng — bài mới tạo là bài rỗng và nút duy nhất trên danh sách là
      "Đăng", không chặn thì nhân viên mở ra chỉ đọc được "Bài này chưa có nội dung".
    - **Trình soạn thảo tự bỏ khối/ô rỗng khi gửi** (`pruneBlocks`): Zod bắt mọi trường `min(1)` mà chính
      trình soạn thảo lại tạo khối rỗng — một ô để trống ở khối thứ 12 làm hỏng cả lần lưu với đúng một
      câu "Nội dung bài không hợp lệ". Ô chưa điền = chưa phải nội dung. Verify: 3 khối trên màn hình
      (1 có nội dung + 1 tiêu đề trống + 1 gạch đầu dòng trống) → payload đúng 1 khối → lưu thành công.
    - **BIẾT VÀ CHẤP NHẬN (không vá ở H2):**
      · `/api/client-kb/[id]` không kiểm tài liệu thuộc khách nào — HÔM NAY không phải lỗ hổng vì
        `clients.kb.view` là quyền phẳng toàn cục và trang KB cũng nhận mọi `clientId`. Nhưng đây là
        đường đọc DUY NHẤT không chạm `spaceId`: **ngày nào siết phạm vi theo team thì phải vá nó
        trước** (3 dòng, dùng lại phép so neo của `lessonBelongsToAnchor`).
      · `bodySizeLimit: "30mb"` áp cho TOÀN BỘ server action, và Next parse xong body RỒI mới gọi hàm
        nên `requirePermission` chạy SAU khi 30MB đã nằm trong RAM. Người đã đăng nhập (kể cả 0 quyền
        KB) bắn 20 request song song là ~600MB RSS trên tiến trình pm2 đơn lẻ. Đổi lại: không có dòng
        này thì MỌI đường upload của app vỡ ở 1MB. Muốn cả hai thì phải chuyển 5 đường upload sang
        route handler đọc stream — việc riêng, không thuộc H2.
      · Ghi đè trọn bài, không kiểm phiên bản: hai người soạn cùng một bài thì người lưu sau xoá việc
        của người lưu trước, im lặng. Rủi ro tăng đúng ở kho DÙNG CHUNG của nhóm.
      · Xoá `Client`/`ClientGroup` bằng tay ở DB cuốn theo bản ghi tài liệu nhưng **để lại file trên
        đĩa** (app không có đường xoá khách nên chưa gặp).
      · **Không sắp xếp lại được thứ tự chủ đề/bài** — cột `sort` có sẵn nhưng chưa có giao diện, nên
        thứ tự đọc = thứ tự gõ. Với KB "nạp dần theo thời gian" thì chủ đề nhập môn dễ nằm cuối. Đây là
        thứ đáng làm sớm nhất ở H3.
    - **H3 ĐÃ XONG** — xem ngay dưới đây.

14. **KHO KIẾN THỨC — H3 XONG: AI sinh bài + bài kiểm tra + bảng tuân thủ** (migration
    `20260802000000_client_kb_quiz`, 2 bảng MỚI `client_kb_question` / `client_kb_attempt`).
    **Knowledge Base theo khách HOÀN TẤT — không còn đợt nào.**
    - **KHÔNG có model Quiz riêng**: "bài kiểm tra của chủ đề" = tập câu hỏi `isActive` của chủ đề đó.
    - ⚠ **`correctIndex` KHÔNG BAO GIỜ ra khỏi server trước khi nộp.** Đường render dùng
      `loadQuizQuestions` (không select cột đó); chấm điểm dùng `loadQuizAnswerKey`, CHỈ gọi trong
      `submitQuiz`. Thêm `correctIndex: true` vào select của đường render là đáp án đi thẳng vào HTML.
      Đã verify: HTML trang làm bài không chứa chuỗi `correctIndex` nào.
    - ⚠ **`isUsableQuestion` là MỘT nguồn sự thật cho "câu nào tính".** Cả trang làm bài lẫn bộ chấm
      phải lọc bằng đúng hàm này. Lệch nhau là người dùng trượt oan vì câu họ chưa từng nhìn thấy —
      đã tái hiện bằng số trước khi sửa: 1 câu `optionsJson` hỏng ⇒ hiện 4 câu, trả lời đúng cả 4,
      vẫn bị chấm **4/5 = 80%**. Sau khi gom về một hàm: **4/4 = 100%**.
    - ⚠ **`ClientKbAttempt.passPct` chốt ngưỡng TẠI THỜI ĐIỂM CHẤM.** BGĐ đổi setting
      `clients.kb_pass_pct` về sau KHÔNG chấm lại quá khứ. Verify bằng số: cùng bài 3/5 → ngưỡng 80
      trượt, ngưỡng 60 đạt; hai lượt cũ vẫn giữ nguyên `passPct: 80`.
    - **Câu dở thì TẮT (`isActive=false`), đừng xoá** — `answersJson` của lượt cũ trỏ theo id câu hỏi.
      Sinh lại bằng AI chỉ tắt câu `source="AI"`, câu nhập tay giữ nguyên. Verify: sinh 2 lần → 10
      dòng, 5 bật / 5 tắt.
    - **Bỏ trắng một câu = SAI**, cố ý: không cho lách bằng cách chỉ trả lời câu chắc chắn.
    - ⚠ **KHÔNG BAO GIỜ bọc `$transaction` quanh call AI.** SQLite single-writer, một lượt gọi tới
      90s — giữ writer suốt thời gian đó là treo cả app. Thứ tự đúng ở cả 3 action: đọc DB → gọi AI
      (ngoài transaction) → Zod → transaction NGẮN để ghi.
    - **`aiChatJson` chỉ ép kiểu `as T`, KHÔNG validate** (H3 là caller đầu tiên của nó trong repo).
      Mọi output AI phải qua Zod: `kbOutlineSchema` · `kbLessonContentSchema` · `quizQuestionsSchema`.
      Riêng `correctIndex` bị ép vào [0,3] ngay trong schema — model hay trả 1..4 theo thói quen người,
      để lọt là câu đó không ai trả lời đúng được và người học trượt oan.
    - **Mọi thứ AI sinh ra đều là BẢN NHÁP.** `generateLessonContent` ép `status="DRAFT"` kể cả khi
      bài đang PUBLISHED — nội dung vừa đổi thì bản đã đăng không còn đúng nữa.
    - **`generateOutline` chỉ chạy trên kho TRỐNG** (chặn ở cả UI lẫn server): chạy lại trên kho đã có
      nội dung sẽ đẻ chủ đề trùng mà không ai dọn.
    - **"Chủ đề phải đạt" = có ≥1 bài ĐÃ ĐĂNG **và** ≥1 câu hỏi đang bật.** Chủ đề soạn dở không được
      làm cả công ty đỏ rực. Kho chưa có chủ đề nào như vậy → trạng thái `NA`, card trên trang dự án
      TỰ ẨN. Verify: 3 chủ đề (1 đủ điều kiện, 1 thiếu câu hỏi, 1 chỉ có bài nháp) → mẫu số đúng 1.
    - **Card trên trang dự án là CẢNH BÁO MỀM** (quyết định chủ dự án) — không chặn nút nào. ⚠ Radar
      chỉ gồm **PIC + Leader + thành viên team** (3 nguồn người duy nhất có trên model `Project`).
      Nhân sự chạy hiện trường theo ca CHƯA vào đây vì task C2 chưa làm — đọc card như tham chiếu,
      không phải danh sách đầy đủ.
    - **Quyền: 3 mã mới (111 → 114)** — `clients.kb.quiz` (đi cùng người được xem: ai đọc được bài thì
      phải làm được bài) · `clients.kb.generate` (tách riêng vì AI tốn tiền theo LƯỢT, để BGĐ cắt chi
      phí mà không cắt luôn khả năng nhập tay) · `clients.kb.compliance`. Backfill 3 marker
      `20260802_client_kb_h3_*`. ⚠ `isRestricted` phải chứa `generate` + `compliance` (KHÔNG chứa
      `quiz`). Verify trên DB thật sau `db:seed`: 20 / 4 / 4 role.
    - **Hai setting ở `/settings/clients`**: `clients.kb_pass_pct` (mặc định 80, dải [1,100] — 0 thì ai
      cũng đạt kể cả bỏ trắng, >100 thì không ai đạt được) và `clients.kb_max_attempts_per_day`
      (mặc định 3, dải [1,20] — 0 thì không ai làm bài được bao giờ).
    - **Sáu bẫy đã bịt trong lúc soát nghịch trước khi commit** (mỗi cái tái hiện được bằng số):
      (a) ⚠ **Trang sửa bài phải có `key={lesson.updatedAt}` trên `LessonEditor`** — nút "AI viết nội
          dung" nằm ngay trên trang đó, mà editor giữ nội dung trong `useState` khởi tạo từ prop nên
          prop mới KHÔNG làm nó chạy lại. Không có key thì AI ghi xong màn hình vẫn hiện nội dung CŨ,
          PIC tưởng hỏng, sửa một chữ rồi bấm Lưu là ghi đè ngược lên bài AI vừa viết — mất trắng, im
          lặng, không có revision. Đã verify: sau khi vá, editor tự hiện nội dung AI mới.
      (b) Câu hỏi hỏng khuôn từng bị lọc ở trang mà KHÔNG lọc lúc chấm → xem `isUsableQuestion` ở trên.
      (c) `submitQuiz` chặn bài nộp thuộc BỘ ĐỀ CŨ (`errorQuizStale`): PIC bấm "AI ra đề" trong lúc có
          người đang làm dở thì mọi id câu đổi hết, không chặn là người đó bị chấm 0/5 và lưu thành
          một lượt TRƯỢT dù trả lời đúng hết. Phân biệt bằng CÓ GỬI ô nào hay không, để người thật sự
          bỏ trắng cả bài vẫn bị chấm bình thường.
      (d) `generateOutline` kiểm LẠI số chủ đề **bên trong transaction**: cửa sổ giữa lần đếm đầu và
          lúc ghi dài bằng cả lượt gọi AI (tới 90s), hai Account cùng nhóm bấm cách nhau 20 giây là
          kho có hai dàn bài chồng nhau.
      (e) `deleteTopic` nay chặn cả khi còn **câu hỏi** hoặc **lượt làm bài** — H3 treo hai thứ đó vào
          chủ đề với `onDelete: Cascade`, chỉ đếm bài học thì xoá một chủ đề trống bài là cuốn sạch
          lịch sử học của cả công ty cho chủ đề đó.
      (f) Ba action AI gác `requirePermission("clients.kb.manage")` rồi mới kiểm
          `hasPermission("clients.kb.generate")` bên trong — sinh bằng AI là ĐẶC QUYỀN THÊM chồng lên
          quyền soạn, không phải đường vòng thay thế nó (mirror mẫu `finance.vendor_payment.over_cap`).
    - ⚠ **Card tuân thủ trên trang dự án gác bằng `clients.kb.compliance`, KHÔNG phải `.view`** — nó
      liệt kê trạng thái học của từng người có tên, đúng thứ mà mã `compliance` sinh ra để giới hạn.
      Người học tự xem trạng thái của mình bằng nhãn "Đã học xong" trên trang kho kiến thức.
    - **ĐÃ SIẾT ĐỘ TIN CẬY CỦA BÀI KIỂM TRA** (quyết định chủ dự án 30/07/2026 — trước đó màn kết quả
      hiện đáp án và cho làm lại vô hạn, nộp bừa lần 1 để đọc đáp án rồi lần 2 đạt 100% mất 30 giây):
      · ⚠ **Đáp án bị cắt khỏi PAYLOAD, không phải khỏi JSX.** `QuizState.result.detail` chỉ còn
        `{questionId, prompt, chosen, ok}` — không `correctIndex`, không `explanation`. Bỏ khỏi giao
        diện mà vẫn trả về là mở DevTools thấy ngay. Người học vẫn biết SAI CÂU NÀO để quay lại đọc.
      · **Đảo thứ tự phương án mỗi lần tải trang** (`shuffleOptions`). ⚠ Ô radio gửi lên
        `originalIndex` — chỉ số trong `optionsJson` GỐC — nên bộ chấm không cần biết gì về việc đảo.
        Gửi chỉ số HIỂN THỊ là chấm sai toàn bộ; test thuần có hẳn một ca chứng minh điều đó.
      · **Trần số lượt theo NGÀY** (setting `clients.kb_max_attempts_per_day`, mặc định 3, dải 1–20).
        Theo NGÀY chứ không phải trần tuyệt đối: trần tuyệt đối khoá vĩnh viễn người trượt hết lượt
        và bắt phải đẻ thêm màn hình admin mở khoá. ⚠ Mốc "đầu ngày" dựng bằng giờ ĐỊA PHƯƠNG
        (`new Date(y,m,d)`) vì `createdAt` của lượt là mốc thời gian thật, KHÔNG theo quy ước
        UTC-midnight của các cột ngày nghiệp vụ — dùng UTC là khung 0–7h sáng tính nhầm sang hôm
        trước (đúng lỗi đã vá ở Kho v2 K4). Chặn ở CẢ trang lẫn server; đã verify server chặn độc
        lập bằng cách dùng hết lượt sau lưng một trang đã render → server từ chối, DB không tăng.
      · **Trang `/kb/quiz/[topicId]/review` gác `clients.kb.manage`** — hệ quả BẮT BUỘC của việc giấu
        đáp án: trước đây người học thấy "đáp án đúng là X" nên báo được câu AI ra sai; giấu đi là
        bịt luôn kênh phát hiện duy nhất. Trang này in `correctIndex` thẳng ra HTML — **đừng bao giờ
        hạ mã quyền xuống `.quiz` hay `.view`**, ai vào được là đạt 100% trong 10 giây.
      · ⚠ **Ranh giới còn lại:** với 3 lượt/ngày và 5 câu, người CỐ TÌNH vẫn dò được đáp án qua vài
        ngày bằng loại trừ, vì màn kết quả còn hiện đúng/sai từng câu. Giữ phần đúng/sai là cố ý —
        bỏ nốt thì người học mất hoàn toàn manh mối nên đọc lại bài nào. Bảng tuân thủ vẫn nên đọc
        là "đã làm bài đạt", không phải "đã đọc hết bài".
    - **Giới hạn khác đã biết:** câu hỏi KHÔNG có cổng duyệt DRAFT→PUBLISHED như bài học — AI ra đề
      xong là dùng ngay · sửa bài SAU khi đã ra đề thì câu hỏi thành lỗi thời mà không có cảnh báo,
      và lượt ĐÃ ĐẠT không bao giờ bị vô hiệu · `answersJson` là cột chỉ-ghi, chưa có màn hình xem
      lại bài đã làm · mỗi cú bấm AI đọc lại và parse lại TOÀN BỘ file nguồn (20 bài × 4 tài liệu =
      80 lượt parse), chưa cache text đã trích · chống bấm liên tục chỉ có ở client, chưa ghi nhận số
      lượt/token đã tiêu nên không truy được chi phí AI theo người.
    - ⚠ **Dữ liệu gửi ra DeepSeek:** KHÔNG có PII có cấu trúc (email/điện thoại/MST/lương/giá CO/CE
      đều không được select). Nhưng **hai kênh văn bản tự do đi nguyên văn**: "Thông tin chung" PIC
      viết (≤20.000 ký tự) và text trích từ tài liệu khách gửi (≤24.000 ký tự) — brief thật thường có
      tên/email/điện thoại người phụ trách phía khách và bảng ngân sách. Hộp xác nhận của cả 3 nút AI
      đã nói rõ "gửi sang DeepSeek" để người bấm biết mình đang gửi gì đi đâu.
    - **CẮT khỏi v1** (muốn thêm phải hỏi chủ dự án): sắp xếp lại thứ tự chủ đề/bài · theo dõi tiến độ
      đọc từng người · lịch sử phiên bản bài học · glossary riêng · nhắc học qua notification · gộp
      kho khách lẻ vào kho nhóm · nhập tay câu hỏi (hiện chỉ AI sinh) · cấu hình số câu mỗi đề (hằng 5) · sửa/xoá từng câu hỏi (sai thì ra đề lại).

15. **BỐN LỖ HỔNG PHÂN QUYỀN KHI DỰNG LẠI DB — ĐÃ VÁ 30/07/2026.** Chỉ bật khi `migrate reset` +
    `db:seed`, tức đúng lúc khôi phục sau sự cố; production đang chạy KHÔNG bị (đã đo). Vá xong thì
    một lần dựng lại từ đầu cho ra đúng chính sách hiện hành.

    Đo trên DB dựng-từ-đầu, TRƯỚC rồi SAU khi vá:

    | | seed cũ | seed đã vá | production |
    |---|---|---|---|
    | `bidding.costsheet.approve` | 20 role | **2** (BGĐ+CFO) | 2 |
    | `bidding.margin_override` | 20 role | **2** (BGĐ+CFO) | 2 |
    | `inventory.reservation.approve` | 20 role | **4** | 4 |
    | `inventory.transfer.approve` | 20 role | **2** | 2 |
    | `SECURITY_GUARD` | 11 mã | **2** | 2 |
    | `WAREHOUSE_KEEPER` | 17 mã | **13** | 13 |

    - ⚠ **`bidding.costsheet.approve` + `bidding.margin_override`** — DUYỆT CO/CE và PHÁ NGƯỠNG
      MARGIN 31%, tức bất biến số 1 ở mục 6. Thiết kế cũ để chúng trong grant mặc định rộng rồi trông
      cậy BGĐ siết tay trong ma trận; BGĐ đã siết còn 2 role, nhưng phần siết đó KHÔNG sống sót qua
      một lần dựng lại DB. Nay chốt cứng trong seed: hằng riêng `BIDDING_APPROVE_EXTRA` cấp cho
      đúng BGĐ + CFO. Cố ý KHÔNG nhét vào `EXEC_EXTRA` — ai đọc seed phải thấy ngay danh sách người
      giữ quyền phá ngưỡng margin.

    - `isRestricted` thiếu hai mã DUYỆT kho → chúng rơi vào `baseGrantCodes`. Đã thêm vào
      `isRestricted` **và** cấp lại đúng role qua `extraByGroup`/`extraByRole` (BGĐ + FINANCE +
      HR_MANAGER cho giữ chỗ; BGĐ + OPE Manager cho điều chuyển) — khớp đúng `roleFilter` của hai
      backfill tương ứng. ⚠ Thêm vào `isRestricted` mà quên cấp lại là role đích MẤT quyền.
    - `20260727_order_task_codes` không có `roleFilter` → nay loại thủ kho + bảo vệ.
    - ⚠ **`20260728_kho_k2_keeper` lọc theo NHÓM `groupCode === "WAREHOUSE"`** — mà
      `SECURITY_GUARD` cũng thuộc nhóm đó (bảo vệ tại điểm kho), nên **bảo vệ nhận cả 4 mã xác nhận
      thực xuất/thực nhập + chuyển lô + XUẤT HỦY**. Đây là chỗ nặng nhất trong ba chỗ và KHÔNG nằm
      trong báo cáo soát ban đầu — tìm ra lúc đo bản dựng-từ-đầu. Nay lọc theo MÃ ROLE.
      **Bài học: đừng lọc backfill theo `groupCode` khi trong nhóm có role hẹp quyền.**
    - `20260728_kho_k2_request_create` nay chỉ loại BẢO VỆ, KHÔNG loại thủ kho — mã này nằm trong
      13 mã `EXPLICIT_GRANTS` của thủ kho, lọc cả hai là siết oan.
    - ⚠ **Đã gỡ `WAREHOUSE: WAREHOUSE_EXTRA` khỏi `extraByGroup`** — cùng lỗ hổng "cấp theo NHÓM mà
      trong nhóm có bảo vệ", chỉ nằm ở đường Vòng 4 thay vì đường backfill. Trước đây vô hại nhờ MAY
      (cả hai role nhóm WAREHOUSE đều trong `EXPLICIT_GRANTS` nên `grantCodesFor` short-circuit,
      dòng đó là code chết). Thêm một role kho thứ ba mà quên khai `EXPLICIT_GRANTS` là mìn nổ. Đã
      đo: bỏ dòng này grant KHÔNG đổi (1349 → 1349 trên bản dựng mới).

    ⚠ **KHÔNG có kiểm tự động nào gác lớp lỗi này.** Chú thích ở `permission-catalog.ts` từng nói có
    `scripts/verify-permissions.mjs` đối chiếu hai chiều — **file đó chưa bao giờ tồn tại**; đã sửa
    chú thích cho đúng sự thật. `tsc`/`eslint`/`next build` đều SẠCH khi seed cấp nhầm quyền, vì đây
    là lỗi dữ liệu chứ không phải lỗi kiểu. Cách duy nhất hiện có là dựng DB tạm rồi đo (lệnh ở dưới).

    **Đối chiếu TOÀN BỘ grant giữa bản dựng-từ-đầu và production sau khi vá: còn đúng 5 mã lệch,
    16 dòng — và cả 16 đều giải thích được, không còn chỗ nào bí ẩn:**
    - CFO thừa 4 mã trên bản dựng mới (`inventory.request.approve`, `.approve_any`,
      `purchasing.po.manage`, `.receive`): `EXEC_EXTRA` cấp trọn gói cho CFO, nhưng `roleFilter` của
      các backfill tương ứng lại không có CFO — hai đường mâu thuẫn nhau. Chọn một đường; cần quyết
      định của chủ dự án về việc CFO có duyệt đề xuất kho và PO hay không.
    - `projects.invoice.edit`: production còn 20 dòng grant cho mã ĐÃ GỠ khỏi catalog (cặp ô
      `Contract.invoiceNo/invoiceDate` cũ). Dòng chết, không ai kiểm, dọn lúc nào cũng được.
    - ⚠ Ghi nhận thêm khi đo: **`bidding.approve` hiện KHÔNG ai có trên production** (0 role, kể cả
      BGĐ) — chỉ ADMIN dùng được nhờ sàn cứng trong code. Chưa rõ cố ý hay bị bỏ tick nhầm; kiểm lại
      xem cổng duyệt hồ sơ thầu có đang kẹt không.

16. **QUYỀN CHẠM TIỀN — ĐÃ SIẾT 30/07/2026** (quyết định chủ dự án, có bảng đối chiếu từng mã × vai).
    13 mã trước đó nằm trong grant mặc định rộng nên **20/23 nhóm quyền đều có** — nghĩa là gần như
    mọi nhân viên ghi được "khách đã thanh toán", phát hành được hoá đơn, sửa được giá trị hợp đồng.

    - ⚠ **`MONEY_POLICY` trong `prisma/seed.ts` là MỘT NGUỒN SỰ THẬT cho cả ba đường**: `isRestricted`
      (chặn rơi vào grant rộng) · `moneyCodesFor` trong Vòng 4 (cấp lại đúng vai trên DB dựng mới) ·
      **Vòng 4d** (XOÁ grant thừa trên DB đang chạy). Sửa bảng là cả ba đổi theo. ĐỪNG cấp mấy mã này
      ở chỗ nào khác — chính việc có hai đường cấp mâu thuẫn là nguồn của 5 lỗ hổng ở mục 10.15.
    - ⚠ **Vòng 4d là vòng DUY NHẤT trong seed XOÁ grant của role đang hoạt động** (mọi vòng khác chỉ
      THÊM). Bắt buộc phải có: `isRestricted` chỉ chặn DB dựng-từ-đầu, KHÔNG siết lại DB đang chạy vì
      Vòng 4 bỏ qua role đã có grant. Chạy đúng một lần theo marker `20260730_money_narrow`; sau đó
      BGĐ toàn quyền tick lại ở `/settings/roles` mà re-seed không đè.
    - Chốt giữ **`finance.advance.request` rộng cho 20 nhóm**: ai chạy hiện trường cũng phải ĐỀ NGHỊ
      được tạm ứng. Tách "đề nghị" khỏi "duyệt" chính là lý do hai mã đó tồn tại riêng.
    - Vòng đời dự án (`bidding.status.change`, `projects.liquidation.send`,
      `projects.acceptance.confirm`) giữ tới **Account Staff** — đây là việc họ bấm hằng ngày, siết là
      kẹt luồng. Các bất biến (chặn Finished khi chưa có hoá đơn…) vẫn chạy bên trong action.
    - `finance.view` nay 5 vai. Trước đó nó mở cho 20 trong khi `dashboard.cashflow` chỉ 2 — che khối
      dòng tiền ở Dashboard mà hở `/finance/cashflow` là vô nghĩa.

    **Kết quả đo (diễn tập trên BẢN SAO DB production trước, rồi mới chạy thật):**

    | | trước | sau |
    |---|---|---|
    | tổng dòng grant | 1365 | **1150** (−215) |
    | 13 mã tiền | 20 vai mỗi mã | 2–5 vai, khớp bảng duyệt, 0 mã sai |
    | `finance.advance.request` | 20 vai | 20 vai (cố ý giữ) |
    | nhân sự / khách / dự án / CO-CE | 42 / 68 / 25 / 4 | không đổi |

    Đã verify: chạy `db:seed` lần hai là **no-op** (1150 → 1150) · DB **dựng-từ-đầu** ra đúng trạng
    thái đã siết (Vòng 4d báo "xoá 0 dòng" vì `isRestricted` + `moneyCodesFor` đã cho kết quả đúng) —
    hai đường nhất trí tuyệt đối.

    **Muốn đảo lại:** tick lại ở `/settings/roles` (không cần deploy), hoặc khôi phục
    `~/backup/dev.db.bak-*` gần nhất trước 30/07 13:2x.

17. **KPI + CÀI ĐẶT — ĐÃ MỞ LẠI 30/07/2026** (quyết định chủ dự án). 23 mã `kpi.*` và `settings.*`
    trước đó nằm trong `isRestricted` mà KHÔNG có đường cấp lại nào ⇒ **0 vai**, chỉ ADMIN dùng được.
    Đó là tái hiện trung thành `requireAdmin()` thời trước ma trận, nhưng hệ quả thật: module ⑥ ghi
    "Xong" mà chỉ một tài khoản chấm được KPI, và chỉ một người tạo được tài khoản cho 42 nhân sự.

    - **`ADMIN_POLICY` là nguồn sự thật**, nuôi cả `adminCodesFor` (Vòng 4, DB dựng mới) lẫn
      **Vòng 4e** (cộng thêm trên DB đang chạy, marker `20260730_admin_open`). Cùng khuôn `MONEY_POLICY`.
    - Vòng 4e **thuần CỘNG THÊM**, không xoá của ai — ngược chiều hoàn toàn với Vòng 4d.
    - ⚠ **BA MÃ CỐ Ý GIỮ NGUYÊN CHỈ ADMIN — đừng cấp cho ai nếu chưa cân nhắc kỹ:**
      · `settings.permissions.manage` — sửa được ma trận quyền, tức **TỰ CẤP LẠI 13 mã tiền** vừa
        siết ở mục 10.16. Cấp mã này là vô hiệu hoá toàn bộ chính sách tiền, âm thầm.
      · `settings.roles.manage` — đổi được nhóm quyền của bất kỳ ai, gồm chính mình.
      · `settings.security.manage` — đổi mật khẩu chung của công ty.
    - ⚠ **Giới hạn phải nói thẳng:** `settings.staff.manage` (cấp cho HR Manager để hết cảnh một
      người duy nhất tạo tài khoản) vốn đã cho phép TẠO tài khoản mới KÈM chọn nhóm quyền và đặt mật
      khẩu — nên người giữ nó về lý thuyết vẫn dựng được tài khoản quyền cao. Đây là bản chất của
      "HR tạo tài khoản", không phải lỗ hổng của bảng; chốt chặn thật là audit log + đúng một người
      có tên giữ mã đó.
    - `settings.bidding.manage` chứa **ngưỡng margin 31%** (bất biến số 1 ở mục 6) → chỉ BGĐ + CFO.
    - `settings.options.manage` đụng danh mục dùng chung của MỌI module → giữ 1 vai (BGĐ).

    **Kết quả đo (diễn tập trên bản sao DB production trước):** 1365 → siết 215 → cộng **48** = **1198**.
    20/20 mã khớp bảng, 3 mã meta vẫn **0 vai**, 13 mã tiền vẫn siết nguyên. Chạy `db:seed` lần hai
    là no-op (1198 → 1198); DB dựng-từ-đầu báo cả hai vòng "0 dòng" — hai đường nhất trí tuyệt đối.

    **Cách verify lại nếu sửa tiếp seed** (không đụng `prisma/dev.db`):
    ```bash
    DB="file:$(cygpath -m /đường/dẫn/tạm.db)"
    DATABASE_URL="$DB" npx prisma migrate deploy && DATABASE_URL="$DB" npm run db:seed
    ```
    rồi đếm `rolePermission` theo mã và đối chiếu với production. Nhớ kiểm lại `prisma/dev.db` sau đó
    (bảo vệ phải vẫn 2 mã) để chắc biến môi trường đã có tác dụng.

18. **PLANNING GIẢI THỂ + TÁI CƠ CẤU TEAM ACCOUNT — 01/08/2026** (quyết định chủ dự án).
    Bộ phận Planning thôi là phòng độc lập; luồng giao việc Planning trở thành việc NỘI BỘ trong mỗi
    team Account. Toàn bộ team Account 2 (5 người dưới Hứa Thị Trâm Anh) + nhân sự Planning duy nhất
    (Dương Mỹ Ngọc) nghỉ trong tháng 8 → **xoá vĩnh viễn**. 42 → 36 nhân sự.

    | | trước | sau |
    |---|---|---|
    | A1 | tắt, 0 người | **bật, 2 người** (Phước + Tươi) |
    | A2 | 7 người · 48 khách · 17 dự án | **0 / 0 / 0** |
    | A3 | 6 người | 6 người |
    | phòng Planning | 1 người, có lead | **0 người, lead trống, VẪN active** |
    | dự án mất PIC | 21 | **21 — không tăng** |

    - ⚠ **ĐỪNG tắt `Department.isActive` của PLANNING.** Phòng này không chỉ chứa headcount, nó còn
      là HẠNG MỤC CÔNG VIỆC: `costPrefix = "PLA"` sinh mã dòng chi phí, và `bidding/[id]/page.tsx`
      + `projects/[id]/co-ce/page.tsx` lọc phòng theo `costPrefix != null AND isActive = true`. Tắt
      là mất tiền tố PLA khỏi trình dựng CO/CE, và Planning cũng biến khỏi Master Timeline
      (`projects/[id]/timeline` + `settings/timeline-templates` cũng lọc theo `isActive`). Cột
      Planning trên org chart tự biến mất khi hết người — không cần tắt phòng để đạt điều đó.
    - ⚠ **Khối "Tái cơ cấu team Account (2026-07)" cũ đã bị THAY** — khối đó dồn A1→A2 và tắt A1
      **vô điều kiện mỗi lần seed**, không marker. Để nguyên thì mọi thay đổi team bị dồn lại lặng lẽ
      ngay lần `db:seed` kế tiếp (mà seed là BẮT BUỘC sau `migrate deploy`). Nay là 2 khối một-lần
      có marker: `20260801_a2_offboard` và `20260801_planning_dissolved`.
    - ⚠ **THỨ TỰ LÀ BẤT BIẾN: chuyển chủ TRƯỚC, xoá SAU.** Xoá trước thì `project.ownerId`/`leaderId`
      bị SET NULL ở tầng DB, và dự án trống PIC/Leader chỉ người có `inventory.request.approve_any`
      duyệt được đề xuất xuất kho (mục 10.11) → kẹt luồng kho.
    - **Ảnh chụp trước khi xoá** ghi vào `AuditLog` (`field = "offboard_snapshot"`): tạm ứng, revision
      CO/CE, order đã gửi, **số ca làm sẽ bị deleteMany**, **điểm KPI sẽ bị CASCADE**. Hai thứ cuối
      biến mất KHÔNG dấu vết ở tầng DB — production có ~205 ca làm (dev.db chỉ 20). `requestedById`
      CỐ Ý không trỏ sang người khác: ghi người còn ở lại đứng tên khoản tạm ứng họ không đề nghị là
      bịa lịch sử.
    - ⚠ **Gỡ người khỏi `STAFF_ROWS` thì phải trỏ lại mọi alias dùng họ.** `yen` (Trâm Anh, 31 chỗ) →
      Lê Huỳnh Kim Yến; `orderLeadByCode.PLANNING` (Mỹ Ngọc, 7 chỗ) → cùng người đó. KHÔNG trỏ `yen`
      về `thao` (Phước): hai biến này cùng vào một GROUP chat, `ConversationMember` có
      `@@unique([conversationId, staffId])` nên seed nổ P2002.
    - **`PLANNING` đã gỡ khỏi `deptLeads`** — gán một Account Manager làm "trưởng phòng Planning" sẽ
      hiện sai trên nhãn của tab Planning. FK optional nên xoá Ngọc tự SET NULL.

    **Ai làm Planning — cột mới `Staff.isPlanningStaff`** (migration `20260803000000_staff_is_planning_staff`,
    viết tay `ALTER TABLE` thay vì bản `prisma migrate diff` sinh ra, vì bản đó là `RedefineTables`
    = DROP TABLE staff rồi dựng lại, trên bảng có 82 cạnh FK trỏ tới).
    - ⚠ **`orderRecipientWhere()` trong `lib/planning.ts` là MỘT NGUỒN SỰ THẬT** cho cả 4 chỗ hỏi
      "ai nhận việc Planning": ô "Giao cho" tab Planning, board task bộ phận, và người nhận thông báo
      ORDER ở CẢ HAI đường gửi order. Lọc PLANNING theo `department.code` sẽ ra DANH SÁCH RỖNG — hệ
      quả im lặng là gửi order Planning mà KHÔNG AI nhận được thông báo.
    - **CỐ Ý không lọc cứng theo team** ở ô chọn người nhận: nhãn có kèm mã team để người giao biết
      đang mượn người team khác. Lọc cứng là team không có người Planning sẽ không giao được cho ai.
    - ⚠ **HIỆN 0 người có cờ này.** Order Planning gửi đi sẽ không báo cho ai và không tự gán được
      người làm cho tới khi tuyển người mới và tick cờ ở `/settings/staff`. Đúng thực tế, nhưng im lặng.

    **Bỏ bước chờ giao** (`spawnPlanningJobForOrder`): job sinh ra đã có người nhận cho cả 3 khâu và
    order tự chuyển ACCEPTED. `assignedById` = người GỬI ORDER nên khi nộp version thì thông báo bay
    thẳng về đúng Account đã đặt việc. `resolveAutoPlanner` CHỈ tự gán khi còn đúng MỘT ứng viên —
    nhiều hơn một là có lựa chọn thật, máy chọn hộ sẽ giao nhầm người mà không ai biết. Giờ làm ở
    version proposal đổi từ tuỳ chọn sang **BẮT BUỘC** (bội số 0.25), khớp 2 chỗ còn lại vốn đã bắt buộc.

    **Org chart:** thêm cột `ACCOUNT_A1` + `ACCOUNT_NOTEAM`. Trước đây `bucketOf` dùng "cái còn lại thì
    về A2" nên người team A1 **lẫn người chưa gán team** đều bị nhốt vào cột nhãn "Account 2", nhìn
    không ra là sai. Node giả "TBC (To Be Confirmed) — Planning Manager" đã gỡ: nó được `chart.push`
    vô điều kiện nên cột Planning LUÔN hiện dù không còn ai.

19. **i18N — ĐÃ VÁ 2 LỚP 01/08/2026, CÒN 4 LỚP.** Script parity ở mục 4.2 chỉ kiểm KEY khớp nhau
    (2988/2988, lệch 0/0) — nó KHÔNG bắt được chuỗi hardcode, key ghép lúc chạy, hay bản "dịch" en
    vẫn còn tiếng Việt. Đã soát cả 6 lớp, verify tận mắt trên browser ở chế độ EN.

    **Đã vá:**
    - ⚠ **3 chuỗi mặc định của `SearchableSelect`** (`— Chọn —` · `Tìm kiếm…` · `Không tìm thấy kết
      quả phù hợp.`) từng hardcode làm GIÁ TRỊ MẶC ĐỊNH CỦA PROP. Đo được: **38 lần dùng, 0 lần
      truyền `emptyText`/`searchPlaceholder`** ⇒ mọi ô chọn có tìm kiếm trong toàn app hiện tiếng
      Việt kể cả ở chế độ English. Nay đọc từ namespace `common`; chỗ nào đã truyền prop riêng vẫn giữ.
    - Toàn bộ thân trang `/settings/ai` (tiêu đề dịch, nội dung thì không) · link `→ Quản lý dự án ·
      CO/CE` ở `/finance` · `aria-label="Chọn ngày"` của `DateField` · 2 chỗ còn chữ "BGĐ" trong
      `messages/en.json`.

    **Chưa vá — xếp theo mức ảnh hưởng:**
    - ⚠ **Số và ngày chốt cứng `vi-VN`** (`NUMBER_LOCALE`/`DATE_LOCALE` ở `lib/utils.ts`). Bốn hàm
      `formatNumber`/`formatDecimal`/`formatDate`/`formatDateTime` NHẬN tham số `_locale` rồi BỎ QUA;
      252 chỗ gọi đang truyền locale vào chỗ không ai đọc. Ở chế độ English hiện `80.000.000` (người
      Anh đọc dấu chấm là dấu thập phân) và `11,25` (dấu phẩy bị đọc là dấu nghìn). Đây KHÔNG cùng
      loại với "chưa dịch" — người đọc **hiểu sai số tiền mà không biết mình sai**.
    - `Department` / `Team` / `Role` chỉ có MỘT cột `name`, không có `nameEn` như các bảng khác ⇒
      `Creative / Thiết kế`, `ACC 1 — Dự án/Đấu thầu đa ngành`, `Quản trị hệ thống (Admin)` hiện
      nguyên tiếng Việt ở org chart, `/settings/staff`, ma trận quyền và mọi ô chọn nhân sự.
    - ~40 tiêu đề Notification ở 8 file action + `mailer.ts` + thiệp sinh nhật/chào mừng. ⚠ Ngoại lệ
      ghi ở mục 4.2 chỉ nói về `reminders.ts` ("vì không có `getTranslations`") — thực tế nó đã lan
      sang những chỗ `getTranslations` dùng được bình thường.
    - File xuất Excel/CSV toàn tiếng Việt (KPI, bảng công, BM08, BM02, CSV kho). Nhiều khả năng CỐ Ý
      vì là biểu mẫu ISO thật, nhưng chưa thấy chỗ nào ghi rõ.
    - 5 thông báo Zod trong `validators/costsheet.ts`: hàm THUẦN, không có `getTranslations`. Dịch
      được thì phải truyền translator vào validator hoặc đổi sang mã lỗi — đụng đường lưu CO/CE, chỗ
      nhạy nhất app, để dịch 5 câu vốn là chốt chặn "đáng lẽ không chạm tới". Đánh đổi không đáng.

    **KHÔNG phải lỗ hổng** (đừng "sửa"): 103 key có en trùng hệt vi hầu hết là từ mượn mà bản tiếng
    Việt cũng dùng (`Team`, `Email`, `Creative`, `Project Owner`, `Master Timeline`) · `CostSheetSection`
    0/44 có `nameEn` vì đó là tên hạng mục do người dùng tự gõ · chữ `đ` trong 11 giá trị en là hậu tố
    tiền tệ, khớp với code · nội dung do người dùng nhập (tên đầu việc timeline, tên khách).

    **Key ghép lúc chạy đã kiểm hết** — đọc hằng thẳng từ source (`ITEM_STATUS_CODES`,
    `REQUEST_STATUSES`, `ADVANCE_STATUSES`, `ROLE_GROUP_ORDER`…) rồi đối chiếu: **51/51 phân giải
    được ở cả hai file**. Đây là lớp script parity mù, và repo đã từng vỡ trang vì nó (mục 10.1).

---

## 11. Trạng thái ngay tại thời điểm bàn giao

**ĐÃ DEPLOY 30/07/2026 lúc 11:15** — commit `d8f1603`, gói cả H1 (nhóm khách hàng) + H2 + H3 (kho kiến
thức theo khách, AI sinh bài, bài kiểm tra, bảng tuân thủ) + bản siết độ tin cậy bài kiểm tra. Chạy
bằng `bash scripts/deploy.sh` đường LAN, fingerprint khớp. 3 migration mới áp sạch
(`client_groups`, `client_kb`, `client_kb_quiz`).

Đối chiếu SAU deploy với backup TRƯỚC deploy — không mất gì:

| | backup trước | production sau |
|---|---|---|
| nhân sự / khách / dự án | 42 / 68 / 25 | 42 / 68 / 25 |
| CO/CE (sheet / dòng) | 4 / 327 | 4 / — |
| timeline / ca làm | 141 / 205 | giữ nguyên |
| dòng grant quyền | 1313 | 1365 (+52 = phần KB mới, đúng như dự kiến) |

Grant 5 mã KB trên production đo được **đúng chính sách**: `view` 20 · `manage` 4 · `quiz` 20 ·
`generate` 4 · `compliance` 4 role. Đủ 5 marker backfill `20260801_*` + `20260802_*`. Nhóm AEON có
sẵn với 4 pháp nhân. `PRAGMA integrity_check` = `ok`, `foreign_key_check` 0 dòng. Route mới trả 307
về login đúng như mong đợi, `/login` 200, không có 500 nào. Error log **không thêm dòng nào** sau
11:15 (mọi dòng `orphan index` và `Failed to find Server Action` trong đó có từ 19:39 ngày 29/07 —
xem ghi chú deploy 28/07 bên dưới).

⚠ Trên server còn một tiến trình pm2 thứ hai tên `tcm-crm-test` (online, uptime ~24h). Không phải
app production; kiểm lại xem còn cần không, đang chiếm RAM.

**Bảng kho v2 trên production đang TRỐNG** (0 mặt hàng, 0 phiếu) — module đã dựng xong toàn bộ K1–K5
nhưng chưa ai nhập liệu thật. Không phải mất dữ liệu: backup trước deploy cũng 0.

**Vừa xong (đã verify sạch, chưa deploy):**
- CO/CE hỗ trợ dòng âm tiền + thuế "Khác (nhập tay)" — migration `20260725010528_costline_custom_tax_amount`.

**Dữ liệu thật đã nhập trong `prisma/dev.db` (chỉ có ở local, chưa lên production):**
- CO/CE báo giá AMHL: T005 (Christmas Decor), T006 (Black Friday, có khối Chi hộ quà tặng)
- CO/CE nghiệm thu KUN: T013 "Phase 1: 5 tỉnh" — 3 revision (HĐ → Nghiệm thu → CO thật), CO 5,39 tỷ
- Master Timeline: T013 (5 tỉnh đầu, 64 dòng) và T025 "Phase 2: 5 tỉnh tiếp theo" (5 tỉnh cuối, 65 dòng)

**ĐÃ DEPLOY 28/07/2026 lúc ~08:00** (commit `01581ac` + HANDOVER `47f52ff`, đường cổng 2222): đè `dev.db` local lên production đúng phương án đã chọn. Hai DB seed độc lập (KHÔNG ID nào trùng) nên phần dữ liệu chỉ có trên production được CHUYỂN VỀ bằng script ánh xạ khoá nghiệp vụ: 5 tuần lịch + 145 ca làm của HR (khớp đủ 165 ca / 6 tuần / 0 bỏ qua sau import — anh Bình bảo vệ đổi email đăng nhập nên phải ánh xạ dự phòng theo MÃ nhân sự `TCM-0040`). Chat cũ trên production (2 hội thoại, 4 tin, 5 reaction) chấp nhận mất theo quyết định chủ dự án. Backup TRƯỚC khi đè giữ ở HAI nơi: `~/backup/` trên server và `D:/TCM/backup-prod-20260728-074255/` trên máy dev.

Hai bài học deploy lần này (đã thành quy trình ở mục 8.2):
- **Giải nén tar KHÔNG xoá file mà nguồn đã xoá.** Hai trang gỡ ở K2/K4 (`documents/new/issue`, `documents/new/transfer`) còn sót trên server làm build hỏng (`Type '"ISSUE"' is not assignable to type 'DocKind'`). Sau giải nén phải so cây file (`find src -type f | LC_ALL=C sort` hai bên rồi `comm`) và xoá file mồ côi.
- **Dừng pm2 TRƯỚC khi đè `dev.db`.** Lần này đè lúc app cũ còn chạy → cửa sổ vài phút tiến trình cũ mở file mới sinh ~12 lỗi `malformed database schema (orphan index)` thoáng qua trong error log. `PRAGMA integrity_check` sau đó = `ok` trên cả DB mới lẫn backup, số liệu khớp tuyệt đối — nhưng đừng lặp lại: thứ tự đúng là `pm2 stop` → đè DB → build → `pm2 start`.

**Việc lớn còn lại theo thứ tự ưu tiên gợi ý:** RBAC thật → module ⑦ Lương → CO/CE Phase 2 (CE theo dòng).
