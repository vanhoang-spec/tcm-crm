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
| ⑤ | Nhân sự — chấm công | `/staff` | Xong (lịch tuần, chấm công, phép năm, xuất Excel) + **Tuyển dụng** (`/staff/recruit` — vị trí & JD gắn org chart, nhận CV, AI đọc CV điền hồ sơ, lịch phỏng vấn 3 vòng có xác nhận + file lịch .ics, phiếu chấm điểm, kho hồ sơ; xem mục 10.31) |
| ⑥ | KPI 75/25 | `/kpi` | Xong (quỹ performance, matrix chấm điểm, chốt kỳ, xuất Excel) |
| ⑦ | Lương | `/payroll` | **Chưa làm** (nav đang `status: "soon"`) |
| ⑧ | Kho | `/inventory` | Nền v1 xong (ledger, trả đồ) + **Kho v2 K1** (cây danh mục 7 nhóm, mã lô 5 khối, chuyển đổi lô, xuất hủy, chặn hàng hết hạn, CSV theo lô) + **K2** (role Thủ kho, đề xuất xuất kho có duyệt, báo hàng về chờ thủ kho — tab `/inventory/requests`) + **K3** (giữ chỗ tồn kho → dòng CO giá 0, trần xuất OPE, gộp dòng báo giá) + **K4** (kỳ chiến dịch ≤15 ngày, phiếu báo mất, chuyển đồ hiện trường A→B, điều chuyển kho có duyệt, thang cảnh báo hạn dùng, bảng tiêu hao) + **K5** (trả về kho khai lại trạng thái/tình trạng → lô mới) — **XONG TOÀN BỘ**, xem mục 10.11 |
| — | Thu mua (PUR) | `/purchasing` | **XONG (PUR-1a + 1b, 16/08/2026)**: hồ sơ NCC theo 6 nhóm hàng + kho tài liệu HĐ/PO + lịch sử giá · RFQ từ dòng CO → 6 mẫu form → cổng NCC token / PUR nhập hộ / upload file + AI bóc → so sánh (số tính bằng code, AI nhận xét) → PUR chọn + lý do → trình Account → **Account chốt → ghi vào CO** (revision mới, chờ duyệt FIN-B) — xem mục 10.36 · **PUR-2**: hồ sơ NCC mở rộng (mã 3 ký tự, tên pháp nhân, N người liên hệ, trường tuỳ chỉnh khai ở `/settings/vendor-fields`) — mục 10.37 |
| ⑨ | Chat nội bộ | `/chat` | Xong (1-1, group, file/ảnh/voice, reaction, poll, pin) |
| ✦ | Creative | `/creative` | Xong (task board + cost-per-task kế hoạch vs thực tế) + **3 team nhỏ + điều phối + duyệt nhiều bên** (CR-1 + CR-1b: 3 team nhỏ, hạn bắt buộc, tab "Việc của tôi", một người duyệt rồi trả Account — xem mục 10.32) |
| — | Dashboard | `/` | Xong (KPI kinh doanh theo team, cashflow MTD, tiến độ bộ phận) |
| — | AI | `/ai` | Xong (rà soát CO/CE, brainstorm, báo cáo BGĐ — DeepSeek + Tavily) |
| — | KB / Org chart | `/kb`, `/orgchart` | Xong |
| — | Hồ sơ ISO | `/iso` | Xong (sổ đăng ký 25 loại hồ sơ / dự án, 8 loại app tự chấm, tab `/projects/[id]/iso`, xuất Excel 33 cột — xem mục 10.20) |
| — | Bài đăng MKT | `/mkt` | Xong (bài LinkedIn/Fanpage: Account nộp ý chính + ảnh → AI DeepSeek viết riêng từng kênh → HR duyệt, copy đăng tay; banner nhịp tuần; phân tích insights quý — xem mục 10.23) |
| — | Chi phí văn phòng | `/overhead` | Xong (ngân sách năm import/nhân bản + duyệt CFO→CEO, thực chi 3 làn, xuất Excel — xem mục 10.21) |
| — | Settings | `/settings` | Xong (~18 trang con) |

**Quy mô:** 120 model Prisma · 70 migration · 82 file `src/lib` · 4072 key i18n × 2 ngôn ngữ · 142 mã quyền.

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
- ⚠ **Production chạy `npm run start:server` (bind `127.0.0.1:3000`), KHÔNG phải `start:lan`** (từ 01/08/2026). Mọi đường vào đi qua nginx `app.tcmbtl.com` (TLS Let's Encrypt, ép 80→443, rate-limit `/login` + `/forgot-password`, `proxy_pass http://127.0.0.1:3000`). Bind `0.0.0.0` như trước là ai trong LAN cũng vào thẳng `:3000` được, bỏ qua toàn bộ TLS/rate-limit/log của nginx. Hai chỗ phải khớp nhau: định nghĩa pm2 đã `pm2 save`, và `~/start-tcm.sh` (chạy lúc `@reboot`). `deploy.sh` khởi động bằng `pm2 start tcm-crm` theo TÊN nên tự dùng lại định nghĩa đã lưu — đổi script thì nhớ `pm2 save`.
- ⚠ **`.env` production phải có `AUTH_COOKIE_SECURE="true"`.** Không có nó thì cookie phiên do app phát ra thiếu cờ `secure` (xem `lib/auth-session.ts`). Hiện nginx có `proxy_cookie_flags ~ secure httponly samesite=lax` nên đã vá ở tầng proxy, nhưng đó là lưới thứ hai — đặt đúng ở nguồn mới là chốt. **Chỉ bật khi HTTPS đã chạy**: cờ `secure` làm trình duyệt KHÔNG gửi cookie qua HTTP, bật lúc chưa có TLS là không ai đăng nhập được.
- ⚠ **Server phải đặt `TZ=Asia/Ho_Chi_Minh`** (hoặc set trong env của pm2): mốc giờ 8/9/10h của `src/lib/occasions.ts` đọc bằng `now.getHours()` = giờ local của tiến trình, sai TZ là lệch 7 tiếng. Kho v2 K4 cũng dựa vào đây (xem mục 10.11, bug lệch ngày đã vá).

---

## 9. Lịch sử thiết kế — đọc khi cần hiểu "vì sao lại làm thế này"

`docs/PLAN-HISTORY.md` (~300KB) chứa toàn bộ blueprint + kế hoạch từng batch, kèm **lý do** của mỗi quyết định kiến trúc, các phương án đã cân nhắc và bị loại, ràng buộc nghiệp vụ đã chốt với BoD.

Trước khi sửa một module lạ, tìm phần tương ứng trong file này — phần lớn câu hỏi "tại sao không làm cách đơn giản hơn?" đã có câu trả lời sẵn.

---

## 10. Hạn chế đã biết / nợ kỹ thuật (cố ý, không phải bug)

1. **RBAC đã chặn thật toàn app bằng ma trận quyền.** Không còn là "nominal".
   - **danh mục 129 quyền nằm ở CODE** (`src/lib/permission-catalog.ts`), **grant nằm ở DB** (bảng `role_permission`), sửa ở `/settings/roles` tab **"Ma trận quyền"**. Danh mục để ở code vì mỗi mã phải có một chỗ `requirePermission()` tương ứng — thêm dòng vào DB sẽ tạo quyền không ai kiểm.
     Ngoại lệ (kiểm bằng `hasPermission()` **bên trong** action đã có `requirePermission` khác ở đầu — đừng đi tìm `requirePermission` tương ứng): `finance.vendor_payment.over_cap` trong `createVendorPayment` VÀ trong `createCtvBatchPayments` (đề xuất thanh toán đợt CTV, operations/actions.ts); `finance.invoice.over_cap` trong `createClientInvoice` (trần mềm theo CO/CE sống — cửa Nghiệm thu vẫn trần cứng).
   - **~316 điểm chặn**: ~220 server action + 79 page + 9 route API (27/07 đợt 3+4: PO 4 action + kế hoạch thu 2 + NCC 2 + trang P&L/Vendors; 27–28/07 Kho v2: 2 action + 1 trang danh mục cây, rồi 7 action đề xuất + 3 trang `/inventory/requests`). Biên bản nghiệm thu làm NGOÀI hệ thống bằng Word (quyết định chủ dự án 27/07) — flow trong app dừng ở "Chuyển sang Nghiệm thu" (Account) → kế toán xuất hóa đơn; bản in-app cũ nằm ở commit eb76699 nếu cần khôi phục. Guard là `requirePermission("<mã>")` ở **câu lệnh đầu tiên** của mỗi page/action; route API dùng `hasPermission()` rồi trả 403.
   - **Role `ADMIN` là sàn cứng trong code** — luôn đủ 129 quyền, không có dòng grant nào trong DB. Cố ý, để không ai tự khoá mình ra khỏi chính trang sửa ma trận.
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

    **SỐ VÀ NGÀY CHỐT CỨNG `vi-VN` — QUYẾT ĐỊNH CÓ CHỦ Ý (chủ dự án xác nhận 01/08/2026). ĐỪNG "SỬA".**
    `NUMBER_LOCALE`/`DATE_LOCALE` ở `lib/utils.ts` là hằng, KHÔNG đọc ngôn ngữ giao diện. Bốn hàm
    `formatNumber`/`formatDecimal`/`formatDate`/`formatDateTime` vẫn nhận tham số `_locale` (gạch
    dưới = cố ý không dùng) chỉ để khỏi phải sửa ~252 chỗ gọi. **Ngày LUÔN LÀ `dd/mm/yyyy`, số luôn
    `1.234,5`, ở mọi ngôn ngữ.** Ô NHẬP theo cùng chuẩn: `number-field.tsx` cũng khoá `vi-VN`,
    `DateField` dùng mask `dd/mm/yyyy` cố định.
    - Lý do (đã ghi ở `utils.ts:14` và `:52`): app TỪNG chạy ngày theo locale, hệ quả là xem bằng
      tiếng Anh ra `MM/DD/YYYY` ⇒ hai người mở cùng một hợp đồng đọc ra hai ngày khác nhau
      (`07/05` là 7/5 hay 5/7?). Với mốc nghiệm thu và hạn thanh toán thì đó là lỗi nặng hơn hẳn
      việc người quen chuẩn Anh–Mỹ phải làm quen dấu phân cách.
    - Đánh đổi được chấp nhận: người đọc quen `en-US` nhìn `80.000.000` có thể hiểu nhầm là 80,0 và
      `11,25` thành 11250. Chấp nhận vì đây là app NỘI BỘ của công ty Việt Nam. (Ghi chú: phần NGÀY
      thực ra không lệch với người Anh — `en-GB` cũng là `dd/mm/yyyy`; chỉ `en-US` lệch.)
    - ⚠ Nếu ngày nào đó muốn đổi thì phải đổi **ĐỒNG THỜI hiển thị VÀ ô nhập**. Sửa mỗi phần hiển
      thị sẽ ra cảnh gõ `1,234.5` vào ô rồi lưu xong hiện `1.234,5` trong cùng một form.

    **Đã soát toàn app 01/08/2026 để bảo đảm "dd/mm/yyyy xuyên suốt" — 2 chỗ lệch, đã vá:**
    - `operations-grid.tsx` dùng `<input type="date">` THUẦN (đường duy nhất trong repo). Input
      native hiển thị theo locale HĐH/trình duyệt và Chromium bỏ qua `lang` — máy đặt tiếng Anh-Mỹ
      sẽ hiện `mm/dd/yyyy`. Đã thay bằng `DateField` (submit y hệt: cùng `name`, cùng ISO).
    - `bidding/order-actions.ts` dựng giờ họp brainstorm bằng `toLocaleString("vi-VN")` → cho ra
      `16:59:00 5/7/2026` (không đệm 0, có giây, giờ đứng trước). Đã đổi sang `formatDateTime`.

    **KHÔNG phải lệch, đừng đụng:** báo giá BM02 (`costsheet-quotation.ts`) dựng ngày `dd/mm/yyyy`
    bằng tay và CỐ Ý đọc thành phần **UTC** vì ngày sự kiện lưu UTC-midnight (mục 4.3) · `cellText`
    trong `clients-review-export.ts` gọi `toISOString()` nhưng đó là đường ĐỌC file Excel khách gửi,
    không phải định dạng hiển thị · `staff/page.tsx` đổi `Intl.DateTimeFormat` theo ngôn ngữ nhưng
    chỉ để lấy TÊN THỨ (`Th 2` / `Mon`) — phần số ngay sau đã là `dd/mm`, tên thứ là chữ nên dịch
    được là đúng.

    **Chưa vá — xếp theo mức ảnh hưởng:**
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

20. **HỒ SƠ ISO — ISO-1 XONG 02/08/2026** (migration `20260804000000_project_iso_docs`). Thay file
    `Các hồ sơ kiểm tra ISO.xlsx` (63 dự án, mới lấp 20%) bằng sổ đăng ký **25 loại hồ sơ cho MỖI
    dự án**: app tự chấm loại nào suy được, còn lại PIC đính file / dán link / đánh "không áp dụng"
    kèm lý do.
    - **Danh mục 25 loại để ở CODE** (`lib/iso-catalog.ts`), khuôn `permission-catalog.ts`: mã
      `ISO-01`…`ISO-25` bất biến, nhãn song ngữ đi qua `pickLabel()` — không đẻ ~50 key i18n.
    - ⚠ **Trạng thái AUTO TÍNH LÚC ĐỌC, KHÔNG LƯU** (`lib/iso-report.ts`, hàm thuần). Lưu là báo cáo
      nói dối ngay khi dữ liệu gốc đổi: xoá CO/CE đi mà ô ISO vẫn xanh thì kỳ kiểm ISO tin nhầm.
      Bảng `ProjectIsoDoc` **chỉ lưu phần TAY** (đính file / link / N/A + lý do).
    - Thứ tự ưu tiên trong `resolveIsoDocs` là CỐ Ý: **N/A do người đánh THẮNG mọi thứ** → rồi mới
      tới AUTO hoặc PRESENT do người đính → còn lại MISSING. Đảo lại là hồ sơ "không áp dụng" bị
      máy bật thành thiếu, người dùng đánh bao nhiêu lần cũng không tắt được.
    - `naReason` **bắt buộc khi N/A** — cột "Ghi chú về dự án" của biểu mẫu ISO gốc chính là chỗ này.
    - **Mở khoá `ProjectFile`**: hạ tầng lưu file đã có từ module AI nhưng bị nhốt trong đó, không có
      đường tải về. Route mới `api/project-file/[id]`. ⚠ Route này **KIỂM `projectId`** ngay từ đầu —
      cố ý KHÔNG lặp lại lỗ của `api/client-kb/[id]` (mục 10.13). Đã verify: lấy id file dự án A gọi
      dưới dự án B → 404.
    - **Quyền: 3 mã mới (114 → 117)** `iso.view` / `iso.manage` / `iso.export`. Backfill 2 marker
      `20260802_iso_view` + `20260802_iso_manage` (mã `export` đi CHUNG marker với `manage`). Đo
      trên DB dựng mới VÀ trên bản mô phỏng production: 20 / 5 / 5 vai, hai đường khớp nhau.
    - ⚠ **VẤN ĐỀ KHÔNG PHẢI CODE MÀ LÀ DỮ LIỆU: 0 mã dự án trùng nhau** giữa file ISO (63 dự án) và
      app (25). Trong 21 dự án thật của app: 3 có CO/CE, 2 có timeline, 0 có link brief. Quyết định
      chủ dự án: **app là nguồn sự thật cho dự án MỚI, không backfill 63 dự án cũ** — nên báo cáo ISO
      năm 2026 vẫn phải ghép tay với file cũ, từ 2027 mới đủ trong app.
    - **9/25 loại hiện chưa có chỗ chứa nào trong app** (Execution Plan, đăng ký thi công, báo giá
      NCC, Agenda, MC Script, Layout/Rundown, phiếu duyệt mẫu, bằng chứng email/ảnh, hình ảnh &
      report) → đính file tay. Biến chúng thành quy trình thật là đợt riêng, nên chờ xem PIC có dùng
      sổ đăng ký thật không đã.

21. **CHI PHÍ VĂN PHÒNG — OVH-1 XONG 02/08/2026** (migration `20260805000000_overhead_costs` +
    `20260805010000_overhead_spend_note`). Thay file `2026_HR_Chi phi van phong thực tế`: ngân sách
    BGĐ duyệt đầu năm + thực chi cập nhật liên tục, báo cáo realtime bất cứ lúc nào.
    - **Ba làn tiền dùng lại đúng nghĩa của `pnl.ts`**: KẾ HOẠCH · **ĐÃ CHI** (chỉ `PAID`) · **CAM
      KẾT** (`SCHEDULED` — tiền sẽ ra, CHƯA trừ vào "đã dùng"). Đã verify bằng số trên browser: tạo
      1 khoản 5.000.000đ ở trạng thái chờ ⇒ cam kết +5tr, "đã chi" và "còn lại" KHÔNG đổi.
    - ⚠ **`spendTotal` CỐ Ý KHÔNG cộng VAT**: `amountNet + tncn + tndn`. Đo trên file thật rồi mới
      chốt — VAT là thuế khấu trừ, cộng vào là mọi khoản có hoá đơn VAT bị thổi lên 10% và ngân sách
      báo vượt oan. Cùng nguyên tắc với hệ số VAT = 1 ở `lib/bidding.ts` (mục 6).
    - ⚠ **So với ngân sách bằng `amountTotal`, KHÔNG phải `amountNet`.** Kế hoạch ban đầu ghi
      `amountNet`; đo 4 tổ hợp giả thuyết trên file thật thì **TỔNG + tới T6 khớp 26 khoản, NET + tới
      T6 chỉ khớp 14** → đổi thiết kế theo số đo. Cũng là bài học `amount` vs `amountTotal` đã trả
      giá ở phiếu chi NCC.
    - ⚠ **File nguồn TỰ MÂU THUẪN: 25/50 khoản** có cột tóm tắt lệch với chính sheet chi tiết của
      nó (cột được cập nhật tay nên trôi — khoản dừng T6, khoản tới T7). Vì vậy sau import app
      **tính LẠI "đã dùng" từ danh sách lần chi**, KHÔNG lấy cột tóm tắt; `reconcileImport` chỉ hiện
      bảng "chỗ nào file tự lệch" cho kế toán xem lúc import. Đừng "sửa" thành tin cột tóm tắt.
    - **Ngân sách 2026 import Excel** (vào thẳng `LOCKED` vì BGĐ đã duyệt ngoài app) → **từ 2027 nhân
      bản trong app**: copy số **T12 của năm đang chạy** (thực chi T12 nếu có, chưa có thì kế hoạch
      T12) ra 12 tháng năm sau, mã tự đổi `TCM26-` → `TCM27-`; HR Manager sửa/thêm/bớt → **CFO
      duyệt** → **CEO duyệt = LOCKED**.
    - ⚠ **`approve_cfo` và `approve_ceo` PHẢI là hai mã khác nhau, và cấp cho hai vai khác nhau.**
      Đang là CFO = 1 vai, CEO(BGĐ) = 1 vai, KHÔNG chồng nhau. Cấp cả hai cho BGĐ là một người bấm
      hết hai cấp, cổng duyệt thành trang trí. Đã verify sống: đóng vai CFO, lấy `$ACTION_ID` của
      bước CEO rồi POST thẳng ⇒ redirect, DB vẫn `PENDING_CEO`, `ceoApprovedAt` vẫn trống.
    - ⚠ **Chỉ nhân bản được từ bản `LOCKED`** — chặn ở CẢ trang lẫn server (`SOURCE_NOT_LOCKED`).
      Bản mới tạo còn DRAFT mà trang vẫn mời "tạo năm sau" thì cả năm sau xây trên số chưa ai chốt.
    - **Vòng đời khoản chi mượn nguyên `VendorPayment`**: `updateMany` + guard status trong `where` +
      kiểm `count === 0` (chống double-click), đảo bắt buộc `reverseNote`, huỷ bắt buộc `cancelNote`,
      **không xoá bản ghi**. Verify: bắn 2 lần trong cùng một tick ⇒ **1 bản ghi, 2 dòng AuditLog**.
    - **Vượt ngân sách: CẢNH BÁO chứ không chặn** (quyết định chủ dự án) — nhưng bắt buộc
      `overBudgetNote` VÀ phải có `overhead.spend.over_budget`. Verify trên khoản `TCM26-12` (ngân
      sách 0đ, đã chi 12,7tr): gửi không lý do ⇒ chặn; có lý do ⇒ qua.
    - ⚠ **Ô "Nội dung chi" và "Giải trình vượt" phải là CONTROLLED.** React 19 `requestFormReset`
      chạy sau MỌI lần gọi action kể cả khi action TRẢ LỖI. Đã tái hiện: gõ xong nội dung, bị chặn vì
      thiếu giải trình, ô nội dung về `""`. Cùng bẫy đã vá ở KB-H2 mục (c). Ô tiền dùng `NumberField`
      chế độ điều khiển nên vốn an toàn — đó chính là lý do lỗi này khó thấy, chỉ ô CHỮ mới mất.
    - ⚠ **ĐỪNG gộp lỗi của nhiều `useActionState` bằng `??`.** Mỗi hook giữ lỗi riêng và không tự
      xoá cho nhau ⇒ lỗi CŨ của thao tác này che lỗi MỚI của thao tác kia. Đã tái hiện: double-click
      "Thanh toán" để lại "đã thanh toán rồi", sau đó bấm Đảo bỏ trống lý do vẫn hiện câu cũ. Nay mỗi
      thao tác chỉ hiện lỗi của chính nó (`modeErr` theo `mode` đang mở).
    - **Ba khoản lương `TCM26-20/21/22` đặt `actualSource="PAYROLL"`**: KHÔNG nhập tay được (lọc khỏi
      ô chọn + chặn ở server) vì số thật thuộc module ⑦. ⚠ Nhưng **bản import 2026 đã mang sẵn số chi
      lương của các tháng đã qua** — nên nhãn phân biệt hai ca: có số rồi thì ghi "nguồn Payroll",
      chưa có số mới ghi "chờ Payroll". Để nguyên chữ "chờ" cạnh con số 6,3 tỷ là nói dối người đọc.
      **Khi làm Payroll: số 2026 này là LỊCH SỬ, đừng cộng dồn lần nữa.**
    - **Quyền: 7 mã mới (117 → 124)**, cả 7 khai trong `MONEY_POLICY` — một nguồn sự thật cho
      `isRestricted` + `moneyCodesFor` + Vòng 4d (mục 10.16). Backfill 6 marker `20260802_overhead_*`
      (`spend.record` đi CHUNG marker với `view`). Đo được **giống hệt nhau** trên DB dựng-từ-đầu và
      trên bản mô phỏng production (gỡ marker + grant rồi seed lại): view 4 · budget.manage 2 ·
      approve_cfo 1 · approve_ceo 1 · spend.record 4 · spend.pay 3 · over_budget 2. `db:seed` lần hai
      no-op (1229 → 1229).
    - **Import file thật đã verify bằng SỐ, cả headless lẫn qua giao diện — khớp tuyệt đối:**
      50 khoản · 167 lần chi · ngân sách **16.248.791.769đ** · đã chi **8.666.620.418đ** · còn lại
      **7.582.171.351đ** · **3 khoản vượt**: `TCM26-12` −12.723.662 · `TCM26-13` −3.908.000 ·
      `TCM26-30` −22.917.862 (file gốc ghi −22.917.863, lệch **1 đồng** do làm tròn).
      Nhân bản 2027: **50/50 khoản khớp mốc T12**, 600 ô tháng, mã đổi 26→27.
    - **CHƯA LÀM (cố ý, muốn thêm phải hỏi chủ dự án):** đọc số thực chi từ Payroll (module ⑦ chưa
      có) · sửa/xoá từng lần chi đã tạo (chỉ có đảo + huỷ) · đính hoá đơn/chứng từ vào khoản chi ·
      biểu đồ theo tháng · nhắc hạn thanh toán qua notification · phân quyền theo NHÓM chi phí.

22. **MỘT NGUỒN CO → NHIỀU BẢN TRÌNH KHÁCH — LOF-V1 XONG 04/08/2026** (migration
    `20260806000000_lof_v1_leg_kind_project_group`). Bài toán thật: file A3 gửi khách
    (`LOF x TCM_Nghiem thu phase 1_Kun_5 tinh.xlsx`) khớp TỪNG ĐỒNG với CO/CE T013 trong app
    (HĐ 7.270.970.056 = rev1 · NT 7.557.818.278 = rev2 · chênh 286.848.222), nhưng A3 vẫn phải ghép
    tay **78 cột Excel** vì app thiếu 3 thứ: chiều TỈNH, vai trò của từng bản, và bản xuất nghiệm thu.
    - **KHÔNG làm CE theo dòng** (đã bác ở PLAN-HISTORY:2008 — mâu thuẫn make-up engine) và **KHÔNG
      nhân dòng vật lý theo tỉnh** (phá `stableKey` ⇒ mất dấu tạm ứng/thanh toán của 217 dòng T013).
      Ba thứ mới đều là NHÃN hoặc chỉ tác động lúc TRÌNH BÀY — bất biến "không tạo hệ tổng tiền song
      song" (mục 6) nguyên vẹn.
    - **`CostLine.legCode`** — nhãn CHẶNG (tỉnh/điểm/đợt), người dùng tự gõ, không có danh mục, trần
      40 ký tự. Mỗi dòng TỰ mang nhãn (không kế thừa lúc đọc) để chỉ có một nguồn sự thật.
    - **`CostSheetRevision.kind`** = `QUOTE|CONTRACT|ACCEPTANCE`, null = bản nội bộ (đa số). Trước đó
      vai trò chỉ nằm trong `note` tự do nên máy không biết "so cặp nào ra cột chênh lệch". Có đường
      gắn HỒI TỐ (`tagRevisionKind`) vì bản cũ không có nhãn — và **không tạo revision mới**: đây là
      siêu dữ liệu về bản chụp, không phải thay đổi số.
    - **`lib/costsheet-acceptance.ts`** (thuần) + route `/api/acceptance-export`: gom theo chặng, mỗi
      chặng một khối HĐ · NT · chênh lệch. Giá khách từng dòng suy ra bằng ĐÚNG chuỗi và ĐÚNG phép
      phân bổ của BM02 (`quotationChain` → trọng số → dư dồn dòng lớn nhất) ⇒ Σ dòng = serviceSubtotal
      TUYỆT ĐỐI. Nút hiện ở tab Nghiệm thu, chỉ khi đã đánh dấu ĐỦ CẢ HAI bản.
    - ⚠ **`pairSnapshotLines` ghép cặp HAI LƯỢT — đừng gộp lại thành một khoá.** Lượt 1 theo
      `stableKey` khi CẢ HAI bên có, lượt 2 theo (mã hạng mục ‖ tên). Khoá một lượt kiểu "stableKey
      nếu có, không thì tên" sinh ra `n:…` ở bản CŨ và `k:…` ở bản MỚI ⇒ **mọi dòng hiện thành "xoá
      hết + thêm lại"** dù không đổi một đồng. Đây đúng là ca dùng hằng ngày (hợp đồng ký từ lâu so
      với nghiệm thu vừa lưu). Đã tái hiện bằng số trên T002 trước khi sửa: 0 changed / 2 added /
      2 removed, chênh CO báo **−61.100.000 giả**. Sau khi vá: 2 changed / 0 / 0.
      ⚠ 3 snapshot của T013 (194/210/217 dòng) đều KHÔNG có `stableKey` — nhánh theo tên không phải
      phòng xa, nó là đường chạy thật của dữ liệu hiện có.
    - `lineEqual` nay so cả `legCode`: đổi nhãn không đổi đồng nào nhưng đổi cách bản xuất gom khối —
      báo "không đổi" là bịt đường phát hiện gán nhầm tỉnh.
    - **`ProjectGroup` + `Project.groupId`** — nhóm CHIẾN DỊCH, khuôn `ClientGroup` (mục 10.12): chỉ
      bật/tắt, KHÔNG có đường xoá; `code` KHÔNG vào mã sinh nào. Trang `/projects/groups` chỉ ĐỌC VÀ
      CỘNG, không lưu tổng nào. Gán bằng action HẸP `assignProjectGroup` ngay trên trang dự án —
      không đi qua form sửa dự án (bài học `assignClientGroup`: form đầy đủ chặn 64/68 khách).
      Seed one-shot gom **T013 + T025**; **T014 Go Kart CỐ Ý đứng riêng** (quyết định chủ dự án).
    - **Quyền: 0 mã mới.** Dùng lại `bidding.costsheet.edit` (gắn vai trò), `bidding.project.manage`
      (nhóm), `projects.view` (route xuất). Đo trên dev.db: grant **1245 → 1245**.
    - **Verify bằng số thật, đối chiếu file A3:** HĐ 7.270.970.056 · NT 7.557.818.278 · chênh tổng
      286.848.222 · **Σ chênh từng dòng 260.771.111** (= dòng "TỔNG CỘNG" của file gốc; 286.848.222 là
      dòng "TỔNG CHƯA VAT" — hai tầng đều khớp). Σ tiền khách mỗi bên = subtotal tuyệt đối. Đọc lại
      file Excel đã xuất: khớp trong sai số làm tròn <1đ (file gốc có phần thập phân).
    - **CHƯA LÀM (cố ý):** số nghiệm thu theo tỉnh làm SỐ CHÍNH THỨC trong DB (hoá đơn theo tỉnh) ·
      sổ phát sinh có lý do theo tỉnh (kiểu sheet ẩn `Update phat sinh Phu Tho`) · lọc dự án theo
      nhóm · nhóm lồng nhóm · mở `CostSheet.version="LIQUID"`.
    - ⚠ **CÒN TREO, cần quyết định với Hà (A3):** mã dự án lệch — A3 dùng **`T016LOF26A3`**, app dùng
      **`T013LO226A3`**; và khách LOF đang có **HAI bản ghi** (`LO2 · Malto - LOF` giữ 3 dự án KUN,
      `LOF · LOF Vietnam` giữ 1 dự án). Chưa xử lý gì trong đợt này.
    - **KUN 3 TỈNH MEKONG — ĐÃ ĐỌC, QUYẾT ĐỊNH KHÔNG NHẬP** (chủ dự án 04/08/2026: "cũ rồi").
      Chiến dịch RIÊNG và SỚM HƠN 10 tỉnh: Sóc Trăng · Vĩnh Long · Tiền Giang, T12/2025–T1/2026,
      đã quyết toán xong. HĐ 3.903.382.666 → NT 4.118.581.555 (chưa VAT, sau phí 10%: 4.293.720.933
      → 4.530.439.711). File `Source/KUN/(inter TCM)_CECO Liquid_KUN 3 TINH MEKONG.xlsx` **mã hoá
      AES** — mật khẩu nhận riêng, KHÔNG ghi vào repo.
      Đọc file này để KIỂM CHỨNG thiết kế LOF-V1, và nó khớp: cùng khung 4 luồng việc × N tỉnh, hai
      khối Hợp đồng/Nghiệm thu xếp dọc, phí agency 10% + VAT 8%, cột "Số tỉnh". Dòng **"Phát sinh
      theo từng tỉnh (−VAT)"** chính là cột chênh lệch theo chặng mà bản xuất nghiệm thu sinh ra.
    - **HAI THỨ FILE MEKONG CÓ MÀ APP CHƯA CÓ** (ghi lại để khỏi phải giải mã đọc lại):
      · **Margin theo TỪNG LUỒNG VIỆC** — file tính riêng cho mỗi hạng mục lớn (Địa điểm 40,3% ·
        Vận hành 41,6% · POSM 33,8% · Retouch 33,3%; nghiệm thu 39,4/45,9/44,4/33,3). App chỉ có
        MỘT margin ở cấp bảng. Đáng làm nếu BGĐ muốn soi luồng nào ăn mòn margin — đợt riêng.
      · **Sổ "CO phát sinh được duyệt (kèm HĐ)"** — mỗi dòng phát sinh có mã PID (`HA 2525-20`),
        phòng chịu (OPE/PCC/ACC), tỉnh, lý do, và phân loại **"Trả thay" vs "Phát sinh"**. Đây là
        lớp chi tiết DƯỚI cột chênh lệch; app hiện chỉ có ghi chú tự do trên revision.
    - ⚠ **CẦN XÁC NHẬN:** khối hợp đồng của file Mekong ghi **"Hợp đồng TCM – Prowtech"**, không phải
      TCM – LOF. Nếu Mekong ký qua Prowtech thì đó là cấu trúc thương mại KHÁC với 10 tỉnh (khách
      hàng là ai, hoá đơn xuất cho ai) — ảnh hưởng nếu sau này quyết định nhập vào app.

    **LOF-V1b — CE HỢP ĐỒNG KHUNG + NHẬP T025 (04/08/2026, migration
    `20260806010000_project_group_framework_ce`).** Đọc thêm 2 file: báo giá khách chốt 03-06Apr và
    CECO TRIỂN KHAI confirmed 15Apr — ráp được TOÀN BỘ chuỗi thương vụ KUN:
    R1 6 tỉnh 9.036.968.233 (margin 32,15%) → khách chốt 10 tỉnh **13.981.715.611** (CO 9.935.562.868,
    margin **28,94% — DƯỚI sàn 31%**, gồm Com 4-5% + dự phòng thuế) → HĐ phase 1 7.270.970.056 →
    NT phase 1 7.557.818.278 → **phase 2 còn lại = 6.710.745.555** (phép trừ khớp từng đồng).
    - **`ProjectGroup.frameworkCe`** — CE khung khách chốt cho CẢ chiến dịch, nhập tay, THUẦN THAM
      CHIẾU (tiền lệ `Project.budget`). Trang nhóm so với **Σ ceTotal** các phase (KHÔNG cộng Chi
      hộ — khung là CE hợp đồng, trộn Chi hộ là so hai đại lượng khác nhau) → hiện "khớp" hoặc
      "chênh ±X". Đã verify trên browser: KUN10T hiện đúng
      `CE khung 13.981.715.611 · Σ phase 14.268.563.833 — chênh +286.848.222` = đúng phát sinh
      nghiệm thu phase 1 được duyệt. Seed điền khung cho KUN10T CHỈ KHI đang trống.
    - **T025 ĐÃ CÓ CO/CE** (chỉ trên dev.db): 61 section · 156 dòng · rev1 kind=CONTRACT ·
      CE 6.710.745.555 · pseudo-CO 6.411.555.554 (margin giả 4,46% — dòng là GIÁ BÁN gross-up thuế,
      CÙNG quy ước T013 rev1 4,48%; CO thật vào ở bản sống khi triển khai, như T013 rev3).
      Nguồn: file 20Jul, **phase 2 từng dòng = tt(HĐ tổng 10 tỉnh) − tt(HĐ phase 1)** — hai khối
      nằm CÙNG DÒNG nên không phải khớp tên gì cả. Parser đối soát 4/4 sheet khớp tuyệt đối
      (MB 3.362.750.000/1.757.750.000 · VH 5.696.825.556/2.898.147.778 · PO 1.448.875.000/745.475.000
      · DT 2.202.200.000/1.208.600.000).
    - **Ba bẫy parser đã vấp và vá** (ghi lại vì deploy production PHẢI chạy lại import này):
      (a) **Ô THÀNH TIỀN là số chuẩn, KHÔNG phải SL×tỉnh×đơn giá** — có dòng tt=8M trong khi
          SL×dg=16M (cổng đường trượt tính nửa giá). Amount phải đọc từ tt.
      (b) Dòng có STT số + thành tiền nhưng KHÔNG có đơn giá vẫn là DÒNG LÁ (ca thật: "PIT/Thuế
          TNCN" r166 vận hành, 164,5tr) → FIXED. Thiếu quy tắc này là Σ lệch đúng 164.555.556.
      (c) **Key section phải theo SỐ ĐẾM, không theo chữ La Mã** — file lặp lại "I" ở nhiều khối,
          key trùng làm dòng nhân đôi (nổ unique stableKey + pseudo-CO thổi từ 6,4 lên 7,5 tỷ).
    - Dòng T025 CHƯA gắn legCode: file hợp đồng chỉ có "Số tỉnh ×N", chiều tỉnh chỉ xuất hiện ở
      giai đoạn nghiệm thu — A3 gắn nhãn dần khi triển khai, đúng thiết kế.
    - Phát hiện kèm: 2 file lệch nhau **1.000.000đ** ở POSM bản R1 (933.785.000 vs 932.785.000) —
      lỗi copy tay giữa các file Excel, đúng loại lỗi app xoá sổ.
    - ⚠ **DEPLOY LƯU Ý:** dữ liệu T025 + kind rev1/rev2 của T013 + nhóm KUN10T chỉ có trên dev.db.
      Production (từ 28/07 là nguồn sự thật, KHÔNG đè DB) khi deploy LOF-V1/V1b phải: seed tự tạo
      nhóm + điền khung; còn **gắn kind cho T013 (rev1=CONTRACT, rev2=ACCEPTANCE) làm qua UI tab
      So sánh**, và **import T025 chạy lại script** (dựng lại theo đúng 3 bẫy ở trên — nguồn là file
      20Jul còn nguyên trên OneDrive).

23. **BÀI ĐĂNG MKT — MKT-1 XONG 04/08/2026** (migration `20260807000000_mkt_posts`, 5 bảng MỚI
    `mkt_*`). Đưa cả vòng content lên 2 kênh vào app: Account nộp Ý CHÍNH + ảnh → AI DeepSeek viết
    bản RIÊNG từng kênh → HR sửa bản cuối, **copy đăng TAY**, đánh dấu đã đăng → hằng quý AI phân
    tích insights. Nav đặt giữa `/finance` và `/staff`.
    - ⚠ **App KHÔNG gọi API mạng xã hội — đăng tay là CHỦ ĐÍCH**, không phải nợ kỹ thuật. Đừng
      "hoàn thiện" bằng cách nối Meta/LinkedIn API mà chưa hỏi chủ dự án.
    - **`MktPost.keyPoints` là NGUỒN DỮ KIỆN DUY NHẤT của AI.** Cả 2 prompt đều cấm bịa số liệu/tên
      khách/kết quả ngoài ý chính — bài đăng là bộ mặt công ty trên kênh công khai, một con số bịa
      đi thẳng ra ngoài và không thu về được. Ý chính viết sơ sài thì bài AI rỗng theo, đó là đúng.
    - **Một bài → N `MktPostVariant`** (`@@unique([postId, channel])`), mỗi kênh vòng đời riêng
      `DRAFT → AI_DRAFTED → POSTED`. Giữ cả `aiDraft` (bản máy) lẫn `finalContent` (bản HR sửa) để
      đối chiếu HR đã sửa gì. Mọi lần đổi trạng thái đi qua `updateMany` có status trong `where` +
      kiểm `count === 0` (khuôn `moveBudget` của overhead) — chống double-click VÀ chống race với
      lượt gọi AI dài tới 75s.
    - ⚠ **Nhịp đăng tính bằng GIỜ ĐỊA PHƯƠNG** (`weekStartLocal` dùng `getDay/getDate`, TUYỆT ĐỐI
      không `getUTC*`) — đúng bug đã phải vá ở Kho v2 K4. Đã test bằng số: bài đăng **02:41 sáng thứ
      Hai rơi vào TUẦN MỚI**, không bị đẩy về tuần trước. 17/17 ca của `computeWeeklyCadence` +
      `buildQuarterStats` pass trước khi nối UI.
    - **Quyền: 5 mã mới (124 → 129)**. `mkt.view` ở base (20 vai, loại thủ kho + bảo vệ như
      `iso.view`); 4 mã còn lại trong `isRestricted` + cấp lại qua `extraByGroup`/`extraByRole` +
      5 backfill `20260804_mkt_*`. Đo được **GIỐNG HỆT NHAU** trên DB dựng-từ-đầu và DB đang chạy:
      view 20 · post.manage 4 (Account+BGĐ) · review 3 (HR_MANAGER+HR_STAFF+BGĐ) · frames.manage 3
      (Creative+BGĐ) · generate 3 = **+33 dòng** (1245 → 1278). `db:seed` lần hai no-op.
      ⚠ **HR đi theo MÃ ROLE, KHÔNG theo nhóm `HR`** — nhóm đó còn chứa `ADMIN_STAFF` (hành chính),
      cấp theo nhóm là lặp lại đúng bẫy SECURITY_GUARD-trong-nhóm-WAREHOUSE ở mục 10.15.
    - ⚠ **`mkt.generate` chỉ HR + BGĐ, CỐ Ý không cho Account** (quyết định chủ dự án 04/08/2026:
      AI tính tiền theo LƯỢT). Account chỉ nộp ý chính. Kiểm bằng `hasPermission` BÊN TRONG action
      đã có `requirePermission("mkt.view")` ở đầu — đặc quyền THÊM, mirror `clients.kb.generate`.
      Đã verify sống: đóng vai Account Staff, lấy `$ACTION_ID` của nút AI rồi POST thẳng ⇒ server
      trả `NO_GENERATE_PERM`, `aiDraftedAt` KHÔNG đổi (không có lượt gọi DeepSeek nào).
    - **`extract-text.ts` thêm 2 nhánh** (csv + xlsx qua `exceljs` vốn đã là dependency) — THUẦN
      THÊM, 3 nhánh cũ không đổi hành vi. Verify 4 ca: xlsx thật đọc 6000 ký tự + truncated · csv
      nguyên văn · **xlsx hỏng trả null không throw** · png vẫn null như cũ.
    - **Ảnh**: hằng MIME/size ở `lib/mkt.ts` (file THUẦN) chứ KHÔNG ở `mkt-storage.ts` — storage
      import `fs/promises`, kéo vào client component là build hỏng mà tsc/eslint không bắt được.
      Route `/api/mkt-image/[id]` mirror `/api/project-file/[id]` (**có** kiểm belongs-to), KHÔNG
      mirror `/api/client-kb/[id]`. Verify: chưa đăng nhập → **401**.
    - **Ô CHỮ đều CONTROLLED** (tiêu đề, ý chính, bản cuối, ghi chú, 2 link frame) — React 19 gọi
      `requestFormReset` sau MỌI lần chạy action kể cả khi TRẢ LỖI. Verify: gõ xong ý chính, bỏ tick
      cả 2 kênh, bị chặn ⇒ **157 ký tự ý chính còn nguyên**. Bản cuối đồng bộ lại khi AI vừa ghi
      bằng mẫu "điều chỉnh state lúc render", KHÔNG dùng `useEffect` (eslint chặn).
    - ⚠ **`export type { X }` trong file `"use server"` làm VỠ RUNTIME** (`ReferenceError: MktChannel
      is not defined`) — loader server-action của Next cố export nó như giá trị. `export type Foo =
      {...}` (khai báo) thì không sao. Đã vấp và gỡ; tsc/eslint đều KHÔNG bắt được, chỉ thấy khi mở
      trang.
    - **Verify AI bằng bài thật** (cùng một ý chính, 2 kênh): LinkedIn 899 ký tự giọng B2B, 5
      hashtag, 0 emoji · Fanpage 105 từ, 4 emoji, 6 hashtag, mời xem ảnh. **Không dòng nào chứa số
      liệu ngoài ý chính.** Phân tích quý: AI **tự phát hiện file CSV mâu thuẫn với số CRM và từ
      chối dùng**, đồng thời nhận ra file xlsx là báo cáo tài chính chứ không phải LinkedIn
      Analytics → ghi "chưa có số liệu" thay vì bịa.
    - **CHƯA LÀM (cố ý, muốn thêm phải hỏi chủ dự án):** gọi API đăng bài tự động · nhắc nhịp qua
      notification (chỉ có banner trên trang — quyết định chủ dự án) · backdate `postedAt` · route
      tải file insights về (chỉ AI đọc) · lịch sử phiên bản bản cuối · 2 người cùng sửa bản cuối thì
      người lưu sau thắng, im lặng · sửa/xoá từng ảnh sau khi đã đăng vẫn cho phép (ảnh là đính kèm,
      không phải nội dung audit).

24. **DASHBOARD — DASH-1 XONG 04/08/2026** (KHÔNG migration, KHÔNG mã quyền mới). Thiết kế lại
    trang `/` cho chuyên nghiệp hơn: dải hero mang màu thương hiệu · dải "Cần chú ý" · 2 biểu đồ.
    Số liệu và phân quyền KHÔNG đổi — 18/18 mốc số đo lại khớp bản trước khi sửa.
    - **Bộ thành phần của Dashboard nằm ở `components/ui/stat-ratio.tsx`** (chỉ `app/(app)/page.tsx`
      dùng) + `components/ui/dashboard-charts.tsx`. Cả hai là **server component**: lớp hover làm
      bằng CSS `group-hover`, không gửi thêm byte JS nào.
    - ⚠ **CẤM đặt `transition-colors` lên phần tử có nền lấy từ biến đổi theo theme**
      (`bg-surface`, `bg-brand-50`…). Nền sẽ KẸT ở màu của lần vẽ đầu tiên và không đổi khi bấm
      sáng/tối — đã tái hiện: bản dev kẹt màu sáng ở cả hai theme, bản build kẹt màu tối ở cả hai,
      trong khi mọi thẻ không có transition đổi đúng. Đã quét cả app: 18 file dùng
      `transition-colors` nhưng KHÔNG file nào đặt cạnh nền theo biến theme, nên chỗ khác không dính.
    - ⚠ **Chỉ 3 token brand ĐỔI GIÁ TRỊ ở dark mode: `brand-50`, `brand-100`, `brand-950`.**
      `brand-600`/`brand-700` giữ nguyên màu sáng trên nền tối ⇒ **chữ số tô bằng chúng chỉ đạt ~2,7**.
      Vì vậy chữ số lớn luôn `text-foreground`; màu thương hiệu chỉ nằm ở nền tint, thanh tỷ lệ và
      viền — ba chỗ không mang chữ.
    - ⚠ **Dải hero dừng ở `brand-700`, KHÔNG chạy tới `brand-500`**: chữ trắng 72% trên brand-500 đo
      được 2,61 và trên brand-600 là 3,37 (dưới AA 4,5); trên brand-700 thì 100%/90%/72% lần lượt
      đạt 7,24 / 6,19 / 4,54. Hoạ tiết vạch chéo 45° lấy từ nét cắt của logo — không phải hoa văn tuỳ ý.
    - **Bộ màu biểu đồ `--chart-1/2/3` (globals.css) ĐÃ QUA BỘ KIỂM MÙ MÀU** — PASS cả 5 phép ở
      nền sáng lẫn tối, ΔE thấp nhất 29,8. ⚠ Đổi màu thì **phải chạy lại bộ kiểm**. Hai điều đã đo
      và phải giữ: (a) **KHÔNG dùng cặp xanh lá/đỏ cho hai chuỗi trong cùng biểu đồ** — đo ΔE 5,0
      dưới mắt deutan, gần như dính làm một; (b) **KHÔNG mượn `--success/--warning/--danger`** tô
      series — màu trạng thái phải để dành cho trạng thái.
    - ⚠ **`getProjectStageMix` lọc CẢ BA chặng theo cùng `fiscalYear`** nên ba số cộng lại đúng bằng
      tổng dự án của năm, và chặng `EXECUTION` bằng ĐÚNG `runningProjectsYtd` của card phía trên.
      Bản phác thảo ban đầu định ghép 19 dự án bidding (KHÔNG lọc năm) với 6 dự án thực thi (CÓ lọc
      năm) vào một vòng tròn — hai mẫu số khác nhau, cộng lại thành một "tổng" vô nghĩa. Chặng đầu
      suy bằng PHÉP TRỪ, không liệt kê mã, để admin thêm trạng thái mới thì tổng không lệch âm thầm.
    - **`getCashflowTrend` dùng đúng 3 nguồn và đúng chặn `lt: now` của `getCashflowMtd`** ⇒ cột cuối
      biểu đồ bằng đúng card "Đã thu / Đã chi (tháng này)". ⚠ Là dữ liệu dòng tiền → chỉ nạp khi
      `scope.canSeeCashflow`, nằm trong cùng khối được gác.
    - **Dùng thanh chồng ngang, KHÔNG donut** (so góc kém chính xác hơn so chiều dài). Nhãn chỉ đặt
      vào TRONG mảnh khi mảnh ≥14% bề ngang; màu chữ trong mảnh chọn theo độ sáng của NỀN MẢNH —
      trắng trên #0068e6 (5,09) và #7c3aed (5,70), nhưng phải đổi sang mực đậm trên cam #ea580c
      (trắng chỉ 3,56 · mực đậm 5,40).
    - ⚠ **Lưới bộ phận KHÔNG dùng mẹo "gap-px trên nền bg-border" để vẽ đường kẻ** — mẹo đó chỉ đẹp
      khi số ô chia hết cho số cột, mà nhân viên Account chỉ thấy ĐÚNG 1 ô ⇒ lộ 3/4 chiều ngang là
      mảng xám đặc. Mỗi dòng là một thẻ độc lập.
    - **Đo tương phản 166 phần tử mỗi theme:** nền sáng **166/166 đạt AA**; nền tối còn 12 chỗ chữ
      đỏ ở **3,64** — đó là token `--danger` CÓ SẴN của app (dùng hàng trăm nơi), **cố ý không sửa
      token toàn cục trong một việc thiết kế Dashboard**. Bù lại mức nghiêm trọng không bao giờ chỉ
      dựa vào màu: luôn có **số + % + chiều dài thanh** đi kèm.
    - **Đã gỡ khối "Lộ trình module"** (nội dung mô tả các module là "đang xây" trong khi đã xong) +
      2 key i18n đi kèm. Sửa lại `subtitle` cho đúng thực tế.
    - ⚠ **Biểu đồ xu hướng hiện gần như TRỐNG và đó không phải lỗi:** dev.db lẫn production mới có
      **1 ClientPayment + 1 Advance**, tức 1/6 tháng có phát sinh. Biểu đồ hiện câu "Mới n/6 tháng có
      phát sinh" thay vì vẽ hình rỗng; sẽ tự dày lên khi kế toán ghi nhận thu/chi đều.
    - **CHƯA LÀM (cố ý):** không thêm chỉ tiêu tiền mới nào (đã cân nhắc dòng "chênh lệch dự kiến
      cuối tháng" rồi bỏ — dễ bị đọc nhầm thành số dư tiền mặt thật) · không đổi token màu toàn app ·
      chưa có bảng dữ liệu thay thế cho biểu đồ (table view).

25. **TRƯỞNG TEAM + PLANNING THEO TEAM + MƯỢN NGƯỜI — PLN-1 XONG 05/08/2026** (2 migration
    `20260808000000_team_lead` + `20260808010000_planning_loan_request`). Bối cảnh: Planning giải thể
    (mục 10.18) và chưa tuyển được người, nên việc Planning trở thành việc NỘI BỘ mỗi team Account.
    - **`Team.leadStaffId` = Trưởng team** (FK optional → Staff). Đã gán theo quyết định chủ dự án:
      A1 = HỒ HỒNG PHƯỚC, A3 = TRẦN THU HÀ (email `ttha@` — KHÔNG phải `tthha@`, đã vấp một lần).
      Sửa ở `/settings/teams`. Seed gán một lần có marker, không đè chỉnh tay.
    - **Order Planning gửi về TRƯỞNG TEAM của team dự án** (không phải mọi người có cờ
      `isPlanningStaff`): trưởng team nhận thông báo rồi TỰ GÁN người trong team. Nguồn "ai làm được
      Planning" 3 tầng trong `lib/planning.ts` — cờ `isPlanningStaff` → thành viên team → trưởng team.
    - **Ô "Giao cho" ĐÓNG lại chỉ còn người TRONG team dự án** (đảo quyết định cũ ở mục 10.18 — thời
      đó chưa có trưởng team nên phải mở). Muốn dùng người team khác phải đi luồng MƯỢN.
    - **Luồng mượn người team khác** — bảng `PlanningLoanRequest`: trưởng team A xin mượn → trưởng
      team B duyệt VÀ CHỌN ĐÍCH DANH người cho mượn → người đó vào được ô "Giao cho" của dự án đó
      (phạm vi theo DỰ ÁN, không phải mượn vĩnh viễn). Từ chối phải có lý do.
    - ⚠ **Loại trừ NGƯỜI GỬI khỏi danh sách nhận thông báo phải kiểm rỗng**: trưởng team tự gửi order
      cho chính team mình thì người nhận = chính mình − chính mình = RỖNG → từng tạo notification
      không có ai nhận. Đã vá: rỗng thì vẫn báo cho người gửi.
    - Không mã quyền mới; đã deploy (xem §11, commit `c41cc6c`).

26. **CO/CE v3 — CE-1 XONG 05/08/2026: nền số liệu + trần chi VAT** (migration VIẾT TAY
    `20260809000000_coce_v3_ce1` — bẫy RedefineTables lần 4, `migrate diff` đòi DROP TABLE
    `finance_cost_line`). Đợt 1/4 của kế hoạch CO/CE v3 (CE theo dòng, thuế theo dòng, phí theo mục,
    vòng review khách — toàn bộ quyết định đã chốt nằm ở plan `playful-hatching-lampson.md` và mockup
    `coce-v2-mockup.html`). **CE-1 THUẦN NỀN — chưa có UI nào đổi**; builder mới là CE-2.
    - **Schema (10 cột mới, đều nullable/additive):** `CostLine` + `ceQuantity`/`ceUnitPrice` (CE theo
      dòng), `ceGroupKey`/`ceName` (GỘP N dòng CO → 1 dòng CE khách nhìn — mirror tiền lệ cặp kho K3;
      leader mang ceName/ceQ/ceP), `vatPct` (8|10, CHỈ dòng VAT; null = chưa chọn — Q4);
      `CostSheetSection.clientFeePct` (phí QL BÁO KHÁCH theo mục L1 — ⚠ ĐỪNG NHẦM `CostSheet.mgmtFeePct`
      là phí NỘI BỘ cộng vào CO); `CostSheetRevision.origin`/`importFileKey` (CE-4);
      `Client.quoteTemplateCode` (CE-3); `FinanceCostLine.payCap` (backfill = netAmount, 377 dòng).
    - **Hai phát hiện làm đợt này gọn** (đọc trước khi sửa engine): (a) cột "Total CO" của thiết kế
      ≡ `CostLine.amount` sẵn có — `TAX_GROSSUP {VAT:1, TNCN:1/0.9, TNDN:1/0.8}` ở `bidding.ts` trùng
      từng đồng spec, KHÔNG đổi công thức nào, `coTotal` giữ nguyên ngữ nghĩa; (b) trần chi hiện hành
      đã là `netAmount` → chỉ dòng VAT trần NỞ thêm (không có khoản chi cũ nào hồi tố thành vượt trần).
    - **Trần chi NCC nay đọc từ `payCap`**: `payCapFor(line)` = VAT có `vatPct` → `net×(1+pct/100)`,
      còn lại = net. `syncFinanceCostLines` ghi; **cả 7 điểm tiêu thụ** (2 cửa kiểm trong transaction ở
      `finance/actions.ts`, hiển thị `/finance`, `/finance/vendor-payments`, `operations/actions.ts`,
      `lineDisbursement`/`projectDisbursement` ở `lib/finance.ts`) đổi ĐỒNG LOẠT — UI không bao giờ
      lệch với server. Đã verify chức năng: set vatPct=10 dòng 6.400.000 → payCap 7.040.000, gỡ → về net.
    - **Engine thuần mới ở `lib/bidding.ts`** (30/30 test số): `payCapFor` · `taxDisplayAmount` ·
      `ceRowsOf` (gộp theo `ceGroupKey`, dòng đầu làm leader) · `sheetHasLineCe` (nhận diện chế độ:
      mọi dòng ngoài Chi hộ có `ceUnitPrice` — KHÔNG có cột cờ) · `computeCeAggregates` (ceService,
      phí theo mục kế thừa gốc, cePreVat, `ceTotalDerived = round(cePreVat×(1+vatPct/100))` — GIỮ
      ngữ nghĩa ceTotal cũ, `marginPctNew` theo Q1: (CE dv + phí − coTotal)/(CE dv + phí), trước VAT)
      · `sectionNumber` (I/II → 1/2 → 1.1 → a/b/c).
    - **`saveCostSheet`**: sheet chế độ mới thì server TỰ suy `ceTotal` (bỏ qua input) + margin Q1;
      sheet cũ giữ nguyên đường cũ 100%. Snapshot revision mở rộng (line +5 trường, section
      +clientFeePct, totals +{ceService, feeTotal, cePreVat} khi chế độ mới). Validator chặn:
      vatPct chỉ trên dòng VAT và chỉ 8|10 · nhóm `ceGroupKey` nằm TRỌN trong một mục · dòng kho K3
      cấm ceGroupKey · clientFeePct chỉ mục gốc không Chi hộ.
    - **Quyền: 2 mã mới (129 → 131)** — `bidding.costsheet.view_cost` (thấy Total CO + margin + CE:
      ACCOUNT + kế toán + CFO + BGĐ = 6 vai) và `bidding.costsheet.view_paycap` (thấy trần chi NCC:
      thêm PUR/OPE/PRO = 12 vai). Là mã GATE CỘT kiểm lúc RENDER (số bị gate không vào HTML — bài học
      KB-H2), KHÔNG có `requirePermission` riêng — đã ghi chú thẳng trong catalog. Backfill 2 marker
      `20260805_coce_view_*`, roleFilter theo MÃ ROLE. Đo: DB dựng-từ-đầu và dev.db khớp nhau tuyệt
      đối ở cả 2 mã (6/12 vai, cùng danh sách); chênh tổng 16 dòng giữa hai bản là chênh CŨ đã giải
      thích ở mục 10.15, không phải do đợt này. `db:seed` lần 2 no-op (1296 → 1296).
    - **Verify:** coTotal cả 5 bảng (T002/T005/T006/T013/T025) không đổi MỘT ĐỒNG sau migration + seed
      · payCap = netAmount trên toàn bộ 377 dòng (trần PIT/CIT giữ nguyên) · tsc/eslint/i18n 0-0/build
      sạch · `/finance` hiển thị trần không đổi trên browser.
    - **CE-2 ĐÃ XONG** — xem ngay dưới đây. **CE-3/4 CHƯA LÀM** (xuất template A4 ngang + multi-sheet
      + stableKey ẩn · import file khách + diff màu) — kế hoạch chi tiết trong plan file.

27. **CO/CE v3 — CE-2 XONG 05/08/2026: builder MỘT MÀN HÌNH** (KHÔNG migration, KHÔNG mã quyền mới).
    Viết lại phần TRÌNH BÀY của `cost-sheet-builder.tsx` theo đúng mockup v4 đã chốt; GIỮ NGUYÊN state
    phẳng + payload `sectionsJson` + đường lưu `saveCostSheet`.
    - **Lưới**: STT phân cấp (`sectionNumber`: I/II → 1/2 → 1.1 → a/b) · freeze 2 cột đầu + 2 hàng
      header · màu theo tầng · khối CE | CO | Total CO | Trần chi NCC | Margin · dải KPI realtime
      sticky · thanh cuộn ngang NỔI đồng bộ 2 chiều · bộ chọn "xem đến cấp 1 / 1–2 / 1–3 / tất cả".
    - **HAI CHẾ ĐỘ trên cùng component**, nhận diện bằng `sheetHasLineCe` (dữ liệu, không cột cờ).
      Bảng cũ giữ nguyên hành vi (ô ceTotal nhập tay + make-up cũ); bảng mới thì ceTotal chỉ ĐỌC vì
      server tự suy. Banner "Chuyển sang CE theo dòng" là TỰ NGUYỆN (Q2).
    - ⚠ **Convert dùng ĐÚNG phép phân bổ BM02** (factor + residual dồn hàng lớn nhất): Σ CE dòng =
      serviceSubtotal TUYỆT ĐỐI — verify T005/T006/T013 (T013: 6.870.743.889). Nhưng **tổng cuối lệch
      ≤ số mục gốc**: phí quản lý chế độ mới làm tròn THEO TỪNG MỤC, BM02 làm tròn một lần cho cả
      bảng (T006 và T013 lệch đúng 1đ). Banner nói thẳng điều này — đừng "sửa" bằng cách ép ceTotal
      bằng số cũ, sẽ đẻ ra hệ tổng song song.
    - **Gộp N dòng CO → 1 hàng CE**: tick chọn nhiều dòng CÙNG mục → `ceGroupKey`; dòng đầu làm đại
      diện mang ceName/ceQ/ceP, các dòng con thụt vào dưới. CE hàng gộp mặc định = Σ CE các dòng đang
      gộp nên tổng KHÔNG đổi ngay lúc gộp. ⚠ **Cặp kho K3 TỰ GỘP theo `stockResvLineId`** mà không
      cần ceGroupKey (validator cấm đặt khoá lên dòng kho) — bất biến "khách chỉ thấy MỘT dòng" giữ
      nguyên ở chế độ mới.
    - ⚠ **BUG ĐÃ VÁ, ĐỌC TRƯỚC KHI SỬA HÀM setLines**: bản đầu dùng cờ `first` đặt NGOÀI updater để
      chọn dòng đại diện. React StrictMode gọi updater HAI LẦN ở dev ⇒ lượt hai coi mọi dòng là thành
      viên và **cả nhóm MẤT giá CE**, tổng báo khách tụt đúng phần của nhóm, im lặng. Bắt được lúc
      verify browser (tổng tụt 19.237.033 trên T006). Nay chốt dòng đại diện + giá CE TRƯỚC updater —
      đúng tiền lệ đã ghi ở `addLine`. **Mọi updater trong builder phải THUẦN.**
    - **Xoá dòng đại diện → bầu dòng kế tiếp** (`ceGroupHeirIndex`, hàm thuần ở `lib/bidding.ts`, có
      test): không có bước này thì nhóm còn lại mất trắng giá CE và bảng rơi khỏi chế độ mới trong
      im lặng.
    - **Phí quản lý báo khách theo mục L1**: panel 10% / 5% / nhập tay, một mục một mức (mục đã chọn
      mức khác thì khoá), cảnh báo ĐÍCH DANH mục còn thiếu; dòng phí + TỔNG trước VAT + VAT + SỐ TIỀN
      THANH TOÁN nằm CUỐI LƯỚI đúng vị trí quen trong file Excel.
    - **Thuế đổi từng dòng bất kỳ lúc nào** (VAT 8/10 · TNCN · TNDN · Khác): rời VAT thì xoá `vatPct`,
      rời OTHER thì xoá `customTaxAmount` (client dọn, server dọn lại). Dòng kho ép `vatPct=null` trong
      stock guard của `saveCostSheet`.
    - ⚠ **GATE CỘT QUYẾT ĐỊNH TẠI SERVER, KHÔNG phải ở JSX**: thiếu `view_cost` thì trang KHÔNG select
      `ceQuantity`/`ceUnitPrice`/`ceTotal` vào payload và builder thành CHỈ ĐỌC (`canEdit = view_cost &&
      costsheet.edit`). Cho lưu bằng payload đã bị tước là ghi đè CE thành rỗng — mất số của Account.
    - ⚠ **LỖ HỔNG ĐÃ VÁ, DỄ TÁI DIỄN**: khối "So sánh phiên bản" (`RevisionCompare`) truyền NGUYÊN
      `snapshotJson` xuống client — trong đó có `totals` (coTotal/ceTotal/ceService/phí) và giá TỪNG
      DÒNG. Giấu số ở lưới mà để khối này không gác là mọi thứ lộ nguyên trong HTML thô. Nay gác bằng
      `view_cost`. Ba ô tiền ở khối mobile của `/bidding/[id]` cũng vậy. **Thêm bất kỳ khối nào mang
      snapshot hay tổng tiền thì phải gác cùng mã quyền.**
    - **Verify trên T006 + T002 thật, đối chiếu bằng số:** convert → Σ CE 332.511.182 (khớp BM02) ·
      phí 33.251.119 · trước VAT 365.762.301 · coTotal 246.310.558 và Chi hộ 188.173.000 KHÔNG đổi ·
      gộp 3 dòng → hàng gộp 19.237.033, tổng giữ nguyên, margin nhóm 25,9% · **LƯU THẬT**: DB ra
      ceTotal 365.762.301 (server tự suy), coTotal không lệch một đồng, rev 2, 32/34 dòng dịch vụ có
      CE (2 dòng còn lại là thành viên nhóm), 6 dòng Chi hộ không CE, 4 mục có `clientFeePct`,
      snapshot có đủ `ceService/feeTotal/cePreVat` · **trần chi chạy suốt end-to-end**: đặt VAT 8%
      trên T002 → lưu → `/finance` hiện 6.912.000 thay cho 6.400.000 · **act-as OPE**: HTML thô không
      còn CE/Total CO/margin/snapshot, vẫn thấy trần chi 7.425.000, không có nút Lưu.
    - **CHƯA LÀM (cố ý, đúng phạm vi CE-2):** kéo-thả sắp xếp dòng · sửa tên mục Chi hộ · nút "xem
      với vai" (mockup có, bản thật CỐ Ý bỏ — cột thấy được gắn chặt theo quyền của chính user).

28. **CO/CE v3 — CE-3 XONG 05/08/2026: xuất báo giá theo mẫu, A4 ngang, nhiều sheet, cột khoá ẩn**
    (KHÔNG migration — cột `Client.quoteTemplateCode` đã có từ CE-1; KHÔNG mã quyền mới).
    - **`lib/quote-templates.ts` — danh mục mẫu Ở CODE** (khuôn `iso-catalog.ts`): `BM02` (mặc định,
      8 cột, có khối ISO + điều khoản + chữ ký) và `COMPACT` (bỏ Mô tả + Ghi chú, không điều khoản).
      Mỗi mã ứng với một cách trình bày CÓ THẬT trong bộ xuất — thêm dòng vào DB sẽ đẻ ra mẫu không
      ai render được. Gán mẫu cho khách bằng action HẸP `setClientQuoteTemplate` ngay trên trang chi
      tiết khách (tiền lệ `assignClientGroup` — form sửa khách bắt hồ sơ đầy đủ mà 64/68 khách đang
      thiếu). Route xuất nhận `?template=` để xem thử mà không đụng hồ sơ khách.
    - ⚠ **NHÁNH KÉP trong `buildQuotationModel`**: sheet chế độ CE THEO DÒNG thì dòng khách lấy
      THẲNG từ dòng (`ceRowsOf`, đã gộp), **KHÔNG suy ngược từ ceTotal rồi phân bổ**; footer dựng từ
      chính các dòng (Σ CE → các dòng phí TÁCH THEO MỨC % → trước VAT → VAT → tổng). Sheet cũ giữ
      nguyên 100% chuỗi BM02 + phân bổ. Bất biến **Σ dòng in = dòng footer đầu** verify cho CẢ HAI
      nhánh: T006 332.511.182 · T013 6.870.743.889.
    - **Bản khách nay in A4 NGANG, fit bề ngang** (quyết định 05/08 — trước là A4 dọc, bảng CE nhiều
      cột bị bóp chữ). Áp cho MỌI sheet của file và cho cả trang in (`@page size: A4 landscape`).
    - **Bố cục `?layout=multi`**: sheet đầu TỔNG HỢP (mỗi mục L1 một dòng rồi tới chuỗi phí/VAT/tổng)
      + mỗi mục L1 một sheet. `l1Blocks` dựng trong CÙNG lượt `walk` với `rows` nên hai bố cục không
      thể lệch số. ⚠ Tên sheet cắt 31 ký tự + thay `: \ / ? * [ ]` và khử trùng — Excel ném lỗi ghi
      file nếu tên dài/có ký tự cấm.
    - **Cột ẩn `__key`** (hằng `STABLE_KEY_HEADER`) ở cuối MỌI sheet bản khách, mang `stableKey` của
      dòng (hàng gộp mang khoá dòng ĐẠI DIỆN) — đường quay về của CE-4 khi khách trả file. Verify
      đọc ngược: T006 38 khoá · T013 217 khoá, khớp model kể cả khối Chi hộ.
    - ⚠ **Route xuất CHẶN 409 khi bảng chế độ CE còn mục L1 chưa áp phí quản lý**, kể tên đích danh:
      thiếu phí thì bản gửi khách THIẾU đúng phần phí của mục đó mà không ai thấy. Bản NỘI BỘ vẫn
      xuất được (không có phí báo khách). Verify sống: bỏ phí mục I của T006 → `/quotation?mode=client`
      trả 409 "Chưa áp phí quản lý cho: I. PLAN / KẾ HOẠCH (FOC)", `mode=internal` vẫn 200.
    - ⚠ **Hai công thức Excel "cộng 2 dòng trên" chỉ đúng cho chuỗi BM02 CŨ (5 dòng cố định)** — chế
      độ CE có số dòng phí thay đổi theo số mức %, nên ở nhánh mới chỉ dòng Σ ĐẦU dùng công thức,
      còn lại ghi giá trị. Đừng "thống nhất" hai nhánh bằng cách áp lại công thức theo chỉ số.
    - **Verify (34/34 test đọc-ngược-file + browser thật):** 4 đường xuất đều 200 · A4 ngang +
      fitToWidth trên MỌI sheet của cả 2 bố cục · Σ dòng mỗi sheet mục = subtotal mục đó (T013: 5
      mục, từ 340.038.230 tới 2.566.069.966) · sheet TỔNG HỢP Σ = Σ subtotal · COMPACT bỏ đúng 2 cột
      · gán mẫu cho khách rồi xuất KHÔNG truyền `?template=` ra file **trùng byte tuyệt đối** bản
      COMPACT (152.526 vs BM02 154.916) → route đọc đúng mẫu của khách · audit log ghi cũ→mới.
    - **CHƯA LÀM (cố ý):** mẫu riêng theo từng khách (AEON…) — chỗ cắm đã có, thêm khi khách yêu cầu
      thật · chọn bố cục/mẫu ngay trên hộp thoại xuất (hiện là 2 link + `?template=`) · xuất PDF từ
      server (vẫn dùng trang in + Ctrl-P).

29. **CO/CE v3 — CE-4 XONG 05/08/2026: đọc file khách trả về + đối chiếu từng dòng.**
    (KHÔNG migration — `origin`/`importFileKey` đã có từ CE-1; KHÔNG mã quyền mới — dùng
    `bidding.costsheet.edit`.) *(CE-4 khép lại kế hoạch v3 ban đầu; **CE-5 làm thêm sau đó** theo
    yêu cầu vòng đời version của chủ dự án — xem mục 10.30.)*
    - ⚠ **IMPORT KHÔNG BAO GIỜ GHI VÀO BẢNG CO/CE.** Action chỉ kiểm đọc được, lưu file GỐC vào
      storage rồi trả khoá; trang dùng khoá đó đọc lại và ĐỐI CHIẾU. Muốn thành số thật thì Account
      sửa trên builder rồi bấm Lưu như mọi lần — đi qua đủ margin gate, validator, revision. Tự ghi
      là bỏ qua toàn bộ chốt chặn đó cho một file người ngoài công ty gửi vào.
    - **Khớp HAI LƯỢT** (`matchImportedLines`), đúng tinh thần `pairSnapshotLines`: cột ẩn `__key`
      trước, phần còn lại theo TÊN. Khách xoá cột ẩn thì cả file rơi về lượt 2 và dòng bị đổi tên rơi
      vào panel "không khớp" — **KHÔNG đoán bừa**.
    - ⚠ **Dòng khối CHI HỘ phải được BỎ QUA** (tham số `ignore`): chúng có trong file khách nhưng nằm
      ngoài phạm vi mặc cả CE. Không bỏ qua thì mỗi lần import có 6 dòng nhiễu ở panel rà, người dùng
      quen tay bỏ qua cả panel rồi bỏ sót dòng lạ THẬT.
    - ⚠ **BUG ĐÃ VÁ — ô STT phải là SỐ THẬT, đừng dùng bộ parse tiền**: bộ parse bóc mọi ký tự không
      phải chữ số nên nhãn footer "PHÍ QUẢN LÝ DỰ ÁN (10%)" ra 10, "Thuế GTGT (0%)" ra 0 ⇒ dòng phí,
      dòng VAT và cả câu điều khoản bị đọc thành HẠNG MỤC. Tái hiện được: bản một sheet đọc ra 42
      dòng thay vì 32. Nay có `sttNumber` riêng, chỉ nhận số thật hoặc chuỗi toàn chữ số.
    - **Khách ĐỔI TÊN mà không đổi tiền vẫn được báo** (direction `same`): đó là yêu cầu đổi cách gọi
      hạng mục trên báo giá; im lặng thì Account gửi lại bản dùng tên cũ và khách tưởng bị phớt lờ.
    - **Sheet TỔNG HỢP bị bỏ qua khi đọc** — ở đó mỗi dòng là MỘT MỤC, gộp vào sẽ đếm tiền hai lần.
    - `loadCurrentCeRows`/`matchSavedImport` nằm ở `lib/costsheet-import-server.ts` chứ KHÔNG ở file
      `"use server"`: mọi export của file action là endpoint gọi được từ client và phải serialize
      được, mà hai hàm này trả `Set`.
    - **Verify 16/16 test vòng tròn + chạy thật qua giao diện.** Vòng tròn: xuất → đóng vai khách sửa
      (giảm tiền, tăng tiền, đổi tên, xoá 1 dòng, thêm 1 dòng) → đọc lại → khớp. Trên browser với
      file thật: **2 dòng khách sửa số** (19.237.033 → 11.542.220 và 3.239.921 → 5.239.921, tô đúng
      cam/xanh) · **1 dòng khách xoá** (Gift exchange table — 3.374.918, gạch đỏ) · **0 dòng không
      khớp** vì dòng đổi tên được khoá ẩn cứu. Import lại file CHƯA SỬA → 0/0/0. Bố cục nhiều sheet
      cho kết quả y hệt bố cục một sheet.
    - **CHƯA LÀM (cố ý):** tự áp thay đổi vào builder bằng một nút (Account tự sửa theo bảng đối
      chiếu — an toàn hơn, và chỉ có vài dòng mỗi vòng) · đọc file .xls cũ hoặc CSV · gắn
      `origin="IMPORT"` tự động khi lưu (hàm `tagRevisionAsImport` đã có, chưa nối nút).

30. **CO/CE — CE-5 XONG 06/08/2026: VÒNG ĐỜI VERSION** (migration VIẾT TAY
    `20260810000000_coce_v3_ce5` — bẫy RedefineTables lần 5; KHÔNG mã quyền mới, dùng
    `bidding.costsheet.edit`). Nghiệp vụ thật: thương lượng thầu 5–7 vòng, ký xong còn 2–3 vòng nữa,
    mỗi vòng phải xem được "đổi gì so với bản trước", chốt 1 bản cho HỢP ĐỒNG và 1 bản cho NGHIỆM
    THU, rồi so hai bản đó để làm phụ lục/thanh lý. Bốn phần:
    - **(a) Diff nay THẤY CE.** Trước CE-5 `costsheet-diff.ts` chỉ so `amount` (CO) nên bảng ở chế độ
      CE theo dòng đổi giá bán bao nhiêu cũng báo **0 dòng thay đổi**. Tái hiện bằng số trước khi
      sửa: một vòng khách cắt −2.112.279 hiện ra "0 changed". Nay `SnapshotLine` mang thêm
      `ceQuantity/ceUnitPrice/ceGroupKey/ceName/vatPct/taxType/customTaxAmount/ceDropped`,
      `lineEqual` so cả 8 trường, `LineDiff` có `ceDelta` + `direction`.
      ⚠ **`direction` lấy `ceDelta` LÀM CHUẨN, chỉ rơi về `amountDelta` khi CE không đổi** — dòng
      khách ép giảm giá bán mà CO giữ nguyên phải hiện màu "giảm", không phải "không đổi".
    - **(b) Import sinh thẳng version mới.** Account bấm import → **xem bảng đối chiếu TRƯỚC** → bấm
      "Áp vào version mới" thì mới ghi (quyết định chủ dự án — không tự động, để còn nhìn trước khi
      chốt). `applyImportToNewVersion` dựng payload từ DB rồi gọi **chính `saveCostSheet`**, KHÔNG
      viết đường ghi thứ hai: giữ nguyên margin gate, validator, revision, `stableKey`. Revision sinh
      ra gắn `origin="IMPORT"` + ghi chú `Phản hồi khách cho v{N}`.
      ⚠ Chặn `LEGACY_MODE` (bảng chưa ở chế độ CE theo dòng) và `NO_CHANGE` (file không khác gì) —
      không có hai cửa đó thì mỗi lần bấm nhầm đẻ một version rỗng.
      **Margin dưới sàn 31% VẪN sinh version, chờ duyệt** (quyết định chủ dự án): vòng thương lượng
      chính là lúc margin tụt, chặn ở đây là chặn đúng việc Account đang làm.
    - **(c) Dòng khách yêu cầu BỎ — cột mới `CostLine.ceDropped`.** Khách xoá dòng thì **không xoá
      dữ liệu**: dòng gạch ngang, CE = 0, **CO vẫn tính** (chi phí nội bộ vẫn có thật), có nút
      "Khôi phục" để Account thương lượng lại. Dòng khách THÊM vào thì nhập với CO = 0 và tô **xanh
      dương** (khác hẳn xanh lá của dòng tăng tiền) kèm cảnh báo *"có dòng có giá trị ở CE nhưng = 0
      ở CO"* — Account phải bổ sung CO hoặc xác nhận cố ý.
      ⚠ **BUG ĐÃ VÁ, ĐỌC TRƯỚC KHI SỬA BUILDER**: `ceInput()` quên truyền `ceDropped` xuống hàm tính
      nên **màn hình cộng cả dòng đã bỏ** trong khi server thì không — lệch đúng một dòng
      (326.816.369 trên màn hình vs **323.441.451** ở server, chênh 3.374.918). Loại lỗi này im lặng
      tuyệt đối: cả hai số đều "hợp lý", chỉ lộ khi đối chiếu DB sau khi lưu. **Mọi trường mới của
      dòng phải được truyền vào CẢ hàm tính của builder LẪN payload lưu.**
    - **(d) Chốt bản + so bản.** Mỗi dòng version có nút **"so với bản trước"** (trừ v1) nhảy thẳng
      xuống khối so sánh. `tagRevisionKind` nay ép **MỘT bản mỗi loại** trong transaction (gắn
      CONTRACT cho bản mới thì tự gỡ nhãn khỏi bản cũ) — hai bản cùng nhãn thì câu hỏi "hợp đồng
      chốt số nào" không có đáp án. ⚠ **Gắn nhãn KHÔNG khoá bản** (quyết định chủ dự án): sau khi ký
      vẫn còn 2–3 vòng sửa. `sendCostSheetToLiquidation` nay tìm bản **`kind="ACCEPTANCE"`** thay vì
      bản mới nhất, và **không làm gì nếu chưa ai gắn nhãn** — lấy bản mới nhất là gửi nghiệm thu một
      bản nháp mà không ai biết.
    - **Verify bằng số trên T006 thật:** import phản hồi khách → v3 tự sinh, `origin=IMPORT`, ghi chú
      "Phản hồi khách cho v2" · **coTotal 246.310.558 KHÔNG đổi qua cả v1/v2/v3** · ceTotal
      365.762.301 → 355.785.597, chênh **−9.976.704** = −7.694.813 (khách cắt) + 2.000.000 (khách
      thêm) − 3.374.918 (khách bỏ) − 906.973 (phí quản lý giảm theo) · khối so sánh hiện Δ CO 0 ·
      Δ CE −9.976.704 · 4 dòng đổi có CE trước/sau · dòng bị bỏ gạch ngang mà vẫn giữ 3.374.918 để
      khôi phục · bấm "Khôi phục" tổng về 326.816.369. 8/8 test diff, tsc/eslint/build/i18n sạch.
    - **CHƯA LÀM (cố ý):** khoá cứng bản đã gắn nhãn · lịch sử ai gắn/gỡ nhãn (chỉ có AuditLog chung)
      · so BA bản trở lên cùng lúc · xuất bảng so sánh ra Excel (hiện chỉ xem trên màn hình).

31. **TUYỂN DỤNG — TD-1 XONG 06/08/2026** (migration `20260811000000_recruit_td1`, 5 bảng MỚI
    `job_position` / `jd_template` / `candidate` / `interview` / `interview_score`). Sub-module của
    Nhân sự, thêm tab ngang thứ tư ở `/staff`.
    - **Vòng đời:** HR mở vị trí + JD ở `/settings/recruit` → nhận CV gắn vào vị trí → bấm **AI đọc
      CV** điền sẵn hồ sơ → HR kiểm rồi Lưu → hẹn phỏng vấn 3 vòng, mỗi vòng gửi YÊU CẦU cho người
      phỏng vấn tự xác nhận → chấm điểm theo tiêu chí → chốt **Thành công / Từ chối** → hồ sơ bị từ
      chối vào **Kho hồ sơ**, tìm lại theo phòng ban / vị trí.
    - ⚠ **KHÔNG nối API Google Calendar** (quyết định chủ dự án 06/08/2026). Thay bằng nút tải file
      lịch `.ics` (`lib/ics.ts` thuần + route `/api/interview-ics/[id]`) — mở ra là Google Calendar
      / Outlook / lịch điện thoại tự hỏi "thêm vào lịch?". Nối API đòi tài khoản Google Cloud, duyệt
      ứng dụng và mỗi nhân sự cấp quyền một lần; token hết hạn là lịch hỏng âm thầm.
      ⚠ **Đường GỬI THƯ MỜI HỌP chưa làm được vì máy chủ mail công ty CHƯA khai báo** — toàn bộ
      `SMTP_*` trên production đang trống (đó cũng là lý do "Quên mật khẩu" chưa gửi được thư). Khai
      báo xong thì chỉ cần đính chuỗi `buildIcs()` vào email, KHÔNG phải viết lại gì.
    - ⚠ **JD dùng danh mục RIÊNG (`JobPosition`), CỐ Ý không đụng `Staff.title`.** Nợ "chuyển title
      thành option_set" ở mục 10.5 đụng lương theo vị trí / KPI / Creative cost — ngoài phạm vi
      tuyển dụng. Vị trí neo vào org chart qua phòng ban + team + người quản lý trực tiếp.
      Vị trí chỉ **đóng/tạm dừng**, KHÔNG có đường xoá (mirror ClientGroup, mục 10.12): xoá vị trí
      đang có ứng viên là mất dấu cả kho hồ sơ. Mẫu JD điền xong là **dữ liệu rời** — sửa mẫu về sau
      không đổi JD của vị trí đã tạo (JD đã đăng tuyển không được đổi sau lưng người đang ứng tuyển).
    - ⚠ **LƯƠNG MONG MUỐN có HAI TẦNG quyền, gate ở TẦNG TRUY VẤN.** Mã `recruit.salary.view` (HR +
      BGĐ) **hoặc** là **trưởng bộ phận / người quản lý trực tiếp của CHÍNH vị trí đó** — hai vai sau
      kiểm THEO BẢN GHI (`canSeeExpectedSalary`), vì ma trận quyền phẳng toàn cục không diễn đạt
      được "trưởng phòng của phòng đang tuyển". Trang **không select cột `expectedSalary`** khi
      không đủ điều kiện; `saveCandidate` cũng **bỏ qua trường này** nếu người lưu không được xem —
      thiếu phép kiểm đó thì người không thấy ô lương vẫn ghi đè nó thành rỗng chỉ bằng cách bấm Lưu.
      Đã verify: đóng vai Field Supervisor → HTML thô **không có ô lương và không có con số nào**.
    - ⚠ **Người phỏng vấn KHÔNG cần mã quyền nào.** Họ mở được hồ sơ + CV của đúng lượt gắn tên mình
      bằng phép kiểm theo bản ghi (`gateCandidate`). Vì vậy `/api/recruit-cv/[id]` **kiểm belongs-to
      ngay từ đầu** (mirror `/api/project-file/[id]`, KHÔNG mirror `/api/client-kb/[id]` — mục 10.13).
      Trang `/staff/recruit/interviews` cố ý mở cho mọi người đã đăng nhập, phạm vi do CÂU TRUY VẤN
      quyết định chứ không phải mã quyền. Đã verify: người không liên quan → CV **403**, hồ sơ →
      `/no-access`, `/staff/recruit` → đá sang "Lịch phỏng vấn của tôi" (KHÔNG phải `/no-access` —
      tránh đúng vòng lặp 307 ở mục 10.1).
    - **Tiêu chí chấm điểm là danh mục MỀM** — OptionSet `recruit_criteria`, 6 mục mặc định do trợ
      lý đề xuất và chủ dự án duyệt (chuyên môn · xử lý tình huống · giao tiếp · thái độ & gắn bó ·
      **chịu áp lực/hiện trường** (đặc thù nghề event) · văn hoá & đội nhóm), chấm 1–5 + ghi chú
      từng mục, cuối phiếu có đề xuất Đạt / Cân nhắc / Không đạt + điểm mạnh + điểm cần lưu ý.
      ⚠ `InterviewScore.criterionCode` lưu **CHUỖI**, không phải khoá ngoại: tắt tiêu chí về sau thì
      phiếu cũ vẫn đọc được (cùng nguyên tắc "tắt, không xoá" của câu hỏi KB-H3).
    - **Quyền: 7 mã mới (131 → 138)**, nguồn sự thật là `RECRUIT_POLICY` trong seed, nuôi cả ba
      đường `isRestricted` + `recruitCodesFor` + 3 backfill `20260806_recruit_*` (khuôn `MONEY_POLICY`,
      mục 10.16). ⚠ **CẢ 7 mã đều `isRestricted`**, khác `iso.view`/`mkt.view` cố ý để ở base — hồ sơ
      ứng viên là dữ liệu cá nhân của người NGOÀI công ty. ⚠ Lọc theo **MÃ ROLE**, không theo nhóm
      `HR` (nhóm đó còn có `ADMIN_STAFF` hành chính — đúng bẫy SECURITY_GUARD ở mục 10.15).
      Đo được **GIỐNG HỆT NHAU** trên DB dựng-từ-đầu và dev.db: view 3 · manage 2 · jd.manage 2 ·
      ai_parse 2 · salary.view 3 · interview.manage 2 · decide 2 = **+16 dòng**. `db:seed` lần hai
      no-op (1312 → 1312).
    - ⚠ **`recruit.ai_parse` tách riêng vì AI tính tiền theo LƯỢT** — kiểm bằng `hasPermission` BÊN
      TRONG action đã có `requirePermission("recruit.manage")` ở đầu (mirror `mkt.generate`).
    - ⚠ **AI CHỈ TRẢ VỀ CHO FORM, KHÔNG ghi thẳng vào hồ sơ** (đúng yêu cầu "fill vào thông tin căn
      bản → cho lưu"): HR nhìn rồi mới Lưu, và bấm lại nút không đè mất phần HR đã sửa tay. Chỉ
      `aiParsedAt` được ghi. Mọi output AI qua **Zod** (`aiChatJson` chỉ ép kiểu — mục 10.14): ngày
      sinh sai khuôn → null thay vì đoán, lương ngoài dải [1tr, 1 tỷ] → bỏ.
    - ⚠ **`DateField` giữ giá trị trong state NỘI BỘ, không nhận giá trị qua prop** — muốn AI điền
      được ngày sinh phải ép dựng lại bằng `key` (đúng mẫu đã vá ở trình soạn bài KB-H3, mục 10.14a).
      Chỉ bump key khi AI đọc ĐƯỢC ngày sinh; AI trả null thì giữ nguyên thứ HR đã gõ.
    - ⚠ **BUG ĐÃ VÁ:** bản đầu điều hướng sau khi tải CV bằng `router.push()` **trong lúc render** →
      React báo "Cannot update a component while rendering a different component". Nay `uploadCandidate`
      gọi `redirect()` ở SERVER. Điều hướng không bao giờ được làm trong thân render.
    - ⚠ **Giờ phỏng vấn nhận NGÀY và GIỜ TÁCH RIÊNG**, cố ý không dùng ô `datetime-local`: ô native
      hiển thị theo locale hệ điều hành và Chromium bỏ qua `lang` → máy tiếng Anh-Mỹ hiện mm/dd/yyyy
      (đúng lỗi đã vá ở `operations-grid.tsx`, mục 10.19). Mốc hẹn là THỜI ĐIỂM THẬT nên dựng bằng
      giờ ĐỊA PHƯƠNG, KHÔNG theo quy ước UTC-midnight — server bắt buộc `TZ=Asia/Ho_Chi_Minh`.
      Verify: hẹn 09:00 ngày 12/08 → DB `2026-08-12T02:00:00Z`, file .ics `DTSTART:20260812T020000Z`.
    - **Verify end-to-end trên browser bằng CV thật** (act-as 3 vai khác nhau): AI đọc CV **5/5
      trường khớp** (họ tên · ngày sinh 1997-03-14 · điện thoại · email · lương "18.000.000
      VND/tháng" → 18000000) · ngày sinh lưu đúng UTC-midnight, lương lưu BigInt · thông báo gửi
      người phỏng vấn **không rò điện thoại/email/lương** · chấm 6 tiêu chí 24/30 → trung bình hiện
      **4,0** khớp `averageScore` · file .ics tải được, `Content-Type: text/calendar`, địa điểm thoát
      dấu phẩy đúng chuẩn · từ chối thiếu lý do bị **server** chặn (đã gỡ `required` phía trình duyệt
      để thử thẳng server) · hồ sơ bị từ chối rời danh sách đang chạy, vào Kho hồ sơ, lọc theo phòng
      ban khác thì không hiện · **bẫy React 19 đã né**: action trả lỗi mà ô điện thoại, ô tóm tắt và
      ngày sinh đều còn nguyên. 28/28 test thuần (ics + phép tính) pass.
    - ⚠ **Dữ liệu gửi ra DeepSeek:** nội dung CV đi NGUYÊN VĂN (≤24.000 ký tự) — đây là dữ liệu cá
      nhân của người NGOÀI công ty. Hộp xác nhận trước nút AI nói rõ điều đó, cùng chuẩn đã áp cho
      kho kiến thức khách hàng.
    - **CHƯA LÀM (cố ý, muốn thêm phải hỏi chủ dự án):** gửi thư mời họp qua email (chờ khai báo
      SMTP) · nối Google Calendar API · cổng ứng tuyển cho ứng viên tự nộp · gửi thư báo kết quả cho
      ứng viên · nhập tay tiêu chí khác nhau theo từng VÒNG (hiện dùng chung một bộ) · tìm kiếm
      toàn văn trong kho hồ sơ (mới lọc theo phòng ban/vị trí/trạng thái) · đọc CV là ảnh scan (OCR)
      · gắn ứng viên đã nhận sang hồ sơ nhân sự · nhắc lịch phỏng vấn qua notification trước giờ hẹn.

32. **CREATIVE — CR-1 + CR-1b XONG 06–07/08/2026: 3 team nhỏ + điều phối việc, flow v2**
    (1 migration VIẾT TAY `20260812000000_creative_squads`; **KHÔNG mã quyền mới**).
    **ĐÃ DEPLOY 07/08/2026** — production chạy `c2deb47`, xem §11.

    Cơ cấu chốt với chủ dự án: phòng Creative chia **3 team nhỏ** — `CREATIVE` (idea & chiến lược) ·
    `GRAPHIC_2D` (Key Visual, master KV) · `MULTIMEDIA` (3D/Animation/AI, kiêm nhiệm).

    - ⚠ **BỐN CHỖ HỤT ĐÃ ĐO ĐƯỢC TRƯỚC KHI SỬA** (đo trên dev.db): **0/5 task có deadline** · không có
      khái niệm team nhỏ · không có màn "việc của tôi" · 42 dòng lương theo vị trí đều là số mẫu
      20.000.000. CR-1 xử lý ba cái đầu; phần chi phí CỐ Ý để nguyên (xem "chưa làm" cuối mục).
    - ⚠ **GỐC RỄ của "0 task có deadline": `spawnTasksForCreativeOrder` KHÔNG chép
      `order.desiredTimeline` xuống task.** Cột hạn bỏ trống ⇒ bộ nhắc quá hạn ở `reminders.ts` (đã
      viết xong từ lâu, bắn theo `deadline`) **không bao giờ chạy** — code chết. Nay spawn chép hạn
      từ Order. Verify: gửi Order hạn 20/08 → cả 3 task sinh ra đều có hạn 20/08.
    - **Bước ĐIỀU PHỐI mới, đứng TRƯỚC "giao người"**: CD chọn team nhỏ + **deadline BẮT BUỘC** →
      trưởng team nhận thông báo → trưởng team giao người trong team. ⚠ **KHÔNG thêm status mới**:
      "đã về team" là THUỘC TÍNH (`CreativeTask.squadId`), không phải giai đoạn — thêm `ROUTED` phải
      sửa ≥6 chỗ và vỡ ngay khi CD giao thẳng nhảy cóc. Board tách nhóm UNASSIGNED thành 2 nhóm con
      bằng dữ liệu (`squadId` null hay không).
    - **Nhãn checklist Order → team**, hằng `SQUAD_CODE_BY_ORDER_LABEL` ở `lib/creative.ts`:
      KEY_VISUAL/DESIGN_2D → GRAPHIC_2D · DESIGN_3D/SET_DESIGN/VIDEO → MULTIMEDIA · **OTHER và dòng
      từ Master Timeline KHÔNG map** (CD tự quyết). Đây chỉ là GỢI Ý — CD điều phối lại được.
      ⚠ Danh sách nhãn còn sống ở `bidding/order-panel.tsx` + `order-actions.ts`; CR-1 KHÔNG đụng 2
      file đó, thêm nhãn mới ở đó mà quên map ở đây thì task chỉ không được gợi ý team (vô hại).
    - ⚠ **Trưởng team giao việc bằng phép kiểm THEO BẢN GHI, KHÔNG có mã quyền riêng**
      (`squad.leadStaffId === meId`) — đừng đi tìm `requirePermission` tương ứng. Vá luôn **3 lỗ cũ**
      của `assignCreativeTask`: (a) assignee phải là Staff **đang hoạt động thuộc phòng CREATIVE**
      (trước đây server nhận MỌI staffId); (b) trưởng team chỉ giao được người **trong team mình**
      cho task **của team mình**; (c) form bỏ trống deadline thì **GIỮ hạn cũ**, trước đây ghi đè
      thành null — tức thao tác giao việc tự xoá mất hạn vừa điều phối.
    - ⚠ **A7 — DUYỆT NHIỀU BÊN: ĐÃ GỠ ở CR-1b (07/08/2026), ĐỪNG BUILD LẠI.** CR-1 từng có bảng
      `CreativeTaskApprover` cho Master KV 3 chữ ký (Creative + Art + Account). Chủ dự án chỉnh
      lại flow (xem "Flow v2" ngay dưới): job TCM thiên về THỰC THI, vai CD giảm, và làm việc với
      khách là phần của Account — kéo thêm chữ ký trong nội bộ Creative là sai vai. Nay **MỘT người
      có `creative.task.approve` duyệt là xong**, rồi trả thẳng cho Account đặt việc.
      Gỡ sạch: model + migration `20260812010000_creative_task_approvers` (xoá HẲN — chưa từng lên
      production, production khi đó ở `35314b1`) + code trong `creative/actions.ts` + giao diện
      trong `task-board.tsx` + 6 key i18n. ⚠ **Bản `creative-mini` VẪN GIỮ duyệt nhiều bên** —
      sản phẩm riêng, quyết định riêng; đừng "đồng bộ" hai bên.
    - ⚠ **Bộ nhắc quá hạn PHẢI có trưởng team trong danh sách nhận** (`reminders.ts`): task đã điều
      phối + có hạn nhưng CHƯA giao người thì `assigneeId`/`assignedById` đều null → bản cũ **không
      gửi cho ai VÀ không set cờ**, nên vòng quét 5 phút lôi lại task đó vĩnh viễn. Đã tái hiện đúng
      ca này rồi vá.
    - **`/creative/my` — "Việc của tôi"** (tab thứ hai): gác `creative.task.submit`; phạm vi do CÂU
      TRUY VẤN quyết định (`assigneeId = me`), không phải mã quyền. Dùng lại `TaskBoard` với 2 prop
      `hideCreate`/`hideFilters`. Task trễ hạn nổi lên đầu (`sortByUrgency`, hàm thuần).
    - **`/settings/creative-squads`**: sửa tên team, trưởng team, bật/tắt + bảng phân người. Gác
      `settings.creative.manage`. **KHÔNG có đường tạo/xoá team** — 3 team seed sẵn, `isActive` là đủ
      (xoá team đang có người/task trỏ vào là mất dấu điều phối, mirror ClientGroup mục 10.12).
    - **Phần B — khớp luồng pitching:**
      · **B1** Brainstorm **tick sẵn lead 3 team nhỏ** trong ô mời (gợi ý, Account bỏ tick được).
      · ⚠ **B2 Giải trình khi THUA THẦU nay BẮT BUỘC với MỌI lý do**, không chỉ "Khác"
        (`markFailed`, bỏ điều kiện `code === "OTHER"`). Thống kê tỷ lệ fail chỉ dùng được khi biết
        lý do THỰC — chọn một mục rồi bỏ trống giải trình thì một năm sau không ai nhớ vì sao thua.
      · **B3** Khối **"Thống kê pitching"** trên `/bidding`: đã có kết quả / thắng / thua / tỷ lệ
        thua + phân bố lý do. Hàm thuần `computeBiddingFunnel` ở `lib/bidding.ts`.
        ⚠ Đọc dữ liệu RIÊNG, **chỉ lọc theo TEAM đang xem** — cố ý không dùng lại mảng `projects` của
        trang vì mảng đó còn bị lọc theo trạng thái + ô tìm kiếm, tỷ lệ sẽ nhảy khi người dùng gõ tìm
        kiếm. ⚠ `CANCELED` (khách huỷ) **KHÔNG tính là thua thầu** — gộp vào là thổi tỷ lệ thua lên.
    - **Verify (26/26 test thuần + browser thật, act-as 4 vai):** Order hạn 20/08 → 3 task đều có
      hạn, KV→Graphic 2D, 3D→Multimedia, OTHER không team, đúng 2 trưởng team nhận thông báo ·
      điều phối **thiếu hạn bị server chặn** (đã gỡ `required` phía trình duyệt để thử thẳng server),
      có hạn thì qua · **tạm gỡ `creative.task.assign` khỏi CREATIVE_STAFF** rồi đóng vai trưởng
      Graphic 2D: **giao được** task team mình, bị chặn khi giao task của Multimedia và khi nhét tay
      id người ngoài phòng Creative · duyệt 3 bên: ký 1 người task VẪN đứng SUBMITTED, người ngoài
      danh sách bấm ký bị chặn dù có mã quyền, trả lại → REVISION + xoá sạch 3 chữ ký · nhắc quá hạn
      gửi đúng trưởng team, đặt cờ, chạy lần 2 no-op · brainstorm tick đúng 3/36 người · thống kê
      6 đã có kết quả / 6 thắng / 0 thua khớp đếm tay trong DB. tsc/eslint/i18n 0-0/build sạch.
    - **FLOW v2 — chốt với chủ dự án 07/08/2026 (đã vẽ lại sơ đồ và duyệt).** Job của TCM thuần
      activation/event, THỰC THI nhiều hơn sáng tạo, nên vai Creative Director giảm so với mô tả
      hồi CR-1. Tám điểm, phần lớn là QUY TRÌNH ngoài app — ghi ở đây để người sau không build
      nhầm tính năng:
      · **Account cầm trịch mọi khâu đối ngoại.** Account present cho khách; CD chỉ tham dự khi
        được yêu cầu hỗ trợ trình bày. Chốt idea/concept/proposal/báo giá trước khi gửi khách là
        việc của Account — KHÔNG kéo CD vào khâu này.
      · **Account là người raise buổi brainstorm** khi có brief. Nhân sự planning nay nằm TRONG
        từng team Account (xem mục 10.18), không còn là phòng riêng.
      · **Creative vẫn là bộ phận ĐỘC LẬP, nhận Order từ Account** — đầu flow nhận việc từ Account,
        cuối flow trả thành phẩm về Account, nhiều vòng lặp theo ý khách. App đã đúng như vậy.
      · **Thực thi:** thiết kế KV → adapt KV đã duyệt xuống toàn bộ hạng mục → **xuất file sản
        xuất cho nhà cung cấp**, phối hợp với OPE và PRO. Phần xuất file/phối hợp làm NGOÀI app.
      · ⚠ **Team nhỏ thứ ba giữ tên "3D"**, chuyển dần sang "Multimedia" (3D/Animation/AI) sau khi
        mọi người quen. CỐ Ý không sửa code/seed: mã trong code vẫn là `MULTIMEDIA` (bản đồ nhãn
        `SQUAD_CODE_BY_ORDER_LABEL` khoá theo mã), chủ dự án tự đổi TÊN HIỂN THỊ ở
        `/settings/creative-squads`. Đổi tên hiển thị không đụng một dòng code nào.
      · **Brainstorm vẫn tick sẵn lead 3 team nhỏ** (B1) — đúng ý "Account raise cho các team liên
        quan"; chỉ là gợi ý, Account bỏ tick được.
    - ⚠ **HẠN CHẾ PHẢI NÓI RÕ: `creative.task.assign` vẫn đang cấp RỘNG** (nằm trong grant mặc định,
      ~20 vai có). Đường "trưởng team" của CR-1 là **MỞ THÊM một lối**, chưa phải siết lại — hôm nay
      gần như ai cũng giao việc Creative được. Muốn đúng tinh thần "CD điều phối, trưởng team giao
      người" thì phải gỡ mã đó khỏi các vai không liên quan; đó là quyết định chính sách của BGĐ,
      cố ý không tự làm trong đợt này.
    - ⚠ **TRƯỞNG TEAM ĐÃ NGHỈ — vá 07/08/2026 (CR-1c).** `CreativeSquad.leadStaffId` là CON TRỎ,
      KHÔNG tự rỗng khi người đó nghỉ (nghỉ chỉ set `isActive = false`). Trước bản vá, cả **ba** chỗ
      gửi thông báo cho trưởng team đều chỉ kiểm `leadStaffId != null` ⇒ tin bay vào tài khoản đã
      nghỉ, **im lặng**, tới lúc có người thắc mắc "sao mãi không ai nhận việc" mới lộ. Cùng loại
      lỗi con-trỏ-mồ-côi đã trả giá khi giải thể team A2 (mục 10.18).
      · Nay ba chỗ (spawn từ Order · `routeCreativeTask` · nhắc quá hạn) dùng chung hằng
        **`ACTIVE_SQUAD_LEAD`** ở `lib/creative.ts` = còn hoạt động **VÀ** thuộc phòng CREATIVE —
        khớp đúng phép kiểm lúc GÁN trong `settings/creative-squads/actions.ts`. ⚠ Sửa một bên thì
        phải sửa bên kia, hai đường phải cùng luật.
      · ⚠ **Ca task chưa giao người + trưởng team đã nghỉ ⇒ KHÔNG còn ai để gửi, và CỐ Ý không set
        cờ `deadlineReminderSentAt`.** Task nằm chờ tới khi admin gán trưởng team mới. Đánh dấu "đã
        nhắc" trong khi chẳng ai nhận được gì mới là thứ nguy hiểm. Đổi lại: vòng quét 5 phút vẫn
        lôi task đó lên mỗi lượt — chấp nhận, vì cảnh báo đỏ ở Settings là đường sửa.
      · **Màn Settings hiện cảnh báo đỏ đích danh** (`settings.creativeSquads.staleLead`). Cần thiết
        vì ô thả xuống chỉ liệt kê người ĐANG làm việc: trưởng team đã nghỉ thì ô hiện "— Chưa gán —"
        trong khi DB vẫn trỏ vào họ — nhìn tưởng chưa gán, thực ra đang gán vào người không còn ở đó.
      · Verify bằng số: trưởng team còn làm việc ⇒ nhắc quá hạn 0 → 1; đánh dấu nghỉ rồi chạy lại ⇒
        1 → 1 (không gửi thêm) và cờ KHÔNG được set. Trên browser: hàng Graphic 2D hiện đúng dòng đỏ
        nêu tên người đã nghỉ; chọn người khác rồi Lưu thì cảnh báo tắt.
    - ⚠ **3 team nhỏ seed ra RỖNG — không tự gán ai.** Chưa gán trưởng team thì luồng điều-phối-rồi-
      giao chưa chạy, nhưng CD vẫn giao thẳng như cũ nên không có gì hỏng. Gán ở
      `/settings/creative-squads`.
    - **CHƯA LÀM (cố ý, muốn thêm phải hỏi chủ dự án):** lịch sử phiên bản sản phẩm (mỗi lần nộp một
      dòng thay vì ghi đè `deliverableLinkUrl`) · báo cáo tải theo tuần & thời gian chờ từng khâu ·
      ước lượng khối lượng + độ ưu tiên · sửa phần chi phí (vẫn chạy trên lương mẫu 20tr — **đừng
      đọc bảng đó để ra quyết định**) · siết grant `creative.task.*` · nối task theo thứ tự trước-sau.

33. **TẠM ỨNG — VÁ TRẦN payCap + TRANG "TẠM ỨNG CỦA TÔI" (FIN-A) — 14/08/2026** (KHÔNG migration,
    KHÔNG mã quyền mới). Kết quả rà soát flow tạm ứng/thanh toán NCC theo yêu cầu chủ dự án.
    - **Lõi chống-chi-vượt theo dòng CO xác nhận ĐÃ KÍN**: trần dòng = `payCap`, tử số đếm cả tạm
      ứng LẪN phiếu chi, check quyết định trong transaction, vượt trần cấp dự án đòi
      `finance.vendor_payment.over_cap` + lý do + audit. ⚠ **Trần đi theo bản CO SỐNG mới nhất đã
      LƯU, không phải bản đã qua nút duyệt** — muốn "chỉ nở trần khi được duyệt" là thay đổi chính
      sách, chưa làm.
    - ⚠ **Đã vá điểm sót CE-1**: check trong transaction của phiếu chi CẤP DỰ ÁN
      (`createVendorPayment` nhánh không gắn dòng) còn cộng `netAmount` trong khi pre-check đã theo
      `payCap` ⇒ dự án có dòng VAT chọn % bị chặn CHẶT HƠN pre-check (đo trên T002: lệch 512.000đ —
      phiếu trong dải đó qua pre-check rồi bị chặn oan trong transaction). Chiều lệch an toàn (chặt
      chứ không hở) nhưng hai cửa nói hai luật. Nay cả hai cùng đọc `payCap`.
    - **Trang mới `/advances` "Tạm ứng của tôi"** — vá lỗ tiếp cận: form đề nghị tạm ứng trước đây
      CHỈ nằm ở `/finance` (gác `finance.view`, 5 vai) trong khi `finance.advance.request` cấp cho
      20 nhóm ⇒ phần lớn người có quyền đề nghị không mở được trang để đề nghị. Trang mới gác đúng
      `finance.advance.request`; nav "Tạm ứng" hiện theo mã đó.
      · Hiện: hạn mức của TÔI (realtime, cùng nguồn số với chốt chặn) · lịch sử tạm ứng CỦA TÔI
        (lọc ở CÂU TRUY VẤN: requestedById HOẶC recipientStaffId = mình) · bảng dòng chi phí RÚT
        GỌN chỉ có "còn được ứng" + form.
      · ⚠ **CỐ Ý không dùng lại AdvanceBoard của /finance**: bảng đó mang nút kế toán và tạm ứng
        của NGƯỜI KHÁC kèm số tài khoản ngân hàng của họ. Form thì DÙNG CHUNG (`NewAdvanceForm`
        export từ advance-board.tsx, prop kiểu Pick) — một form, một hành vi, đường ghi vẫn là
        `requestAdvance` với đủ trần + hạn mức. Đã soi HTML thô ở vai Field Supervisor: không có
        số tài khoản người khác / CO tổng / tạm ứng người khác (chuỗi nhãn kế toán trong HTML là
        bundle i18n dùng chung toàn app, không phải dữ liệu).
    - **Verify trên browser (act-as CAO NHẬT PHONG — OPERATIONS_STAFF, có request KHÔNG có view):**
      nav có "Tạm ứng" không có "Chi phí & Công nợ" · GEN-001 hiện trần 6.912.000 (payCap gồm VAT
      8%, không phải net 6.400.000) · đề nghị 1tr ⇒ quota 0→1 lần, dòng 12,5tr→11,5tr, lịch sử hiện
      "Chờ Kế toán chi", 3 người phòng kế toán nhận notification · đề nghị 12tr > 11,5tr ⇒ server
      chặn kèm đúng số còn lại, không sinh bản ghi · bảng `/finance` phía kế toán khớp từng số.
      Khoản test đã xoá sạch (advance + notification + audit), dev.db về nguyên trạng.
    - **CHƯA LÀM (ghi nhận từ đợt rà soát, chờ Cashflow v2):** bảng toàn danh mục "cash out từng
      dự án + % trên CO" · sổ phát sinh CO có mã/lý do · dự kiến chi từ phần CO chưa thành phiếu ·
      thu dự kiến từ CollectionMilestone CHƯA xuất hóa đơn (hiện forecast chỉ đọc hóa đơn đã phát
      hành) · overhead + lương vào cashflow (`OverheadSpend` chưa có cột dueDate) · khung thời gian
      tự chọn tháng/quý/năm. *(Toàn bộ danh sách này — trừ sổ phát sinh CO — đã làm ở 10.34.)*

34. **CASHFLOW v2 — XONG 15/08/2026** (KHÔNG migration — `OverheadSpend.expectedDate` hoá ra đã có
    sẵn từ OVH-1; KHÔNG mã quyền mới). Viết lại `/finance/cashflow` thành báo cáo dòng tiền dự kiến
    toàn danh mục, khung thời gian tự chọn.
    - ⚠ **Gác `dashboard.cashflow` (BGĐ + CFO; ADMIN sàn cứng), KHÔNG còn là `finance.view`** —
      quyết định chủ dự án 14/08/2026: báo cáo cashflow chỉ CFO/CEO/Admin. Tab "Dòng tiền" trên
      thanh Finance ẨN theo đúng mã đó (truyền `showCashflow` từ layout — chỉ TRANG TRÍ, hàng rào
      thật là `requirePermission` ở đầu cả trang chính LẪN trang in). Đã verify act-as Kế toán:
      không tab, gõ thẳng URL cả 2 route bị đá về SAFE_LANDING, HTML không mang số nào.
    - **Nguồn số (7 nguồn, `lib/cashflow.ts` — realtime, không cache):** THU = hóa đơn còn phải thu
      (hạn + đệm 14 ngày) + **đợt thu C5 chưa xuất hóa đơn** (% động trên billable CO/CE sống, cùng
      công thức trang Nghiệm thu; trừ phần đã xuất để không đếm trùng nhánh hóa đơn). CHI = phiếu
      chi SCHEDULED + tạm ứng REQUESTED + khoản chi văn phòng đã lên phiếu (theo `expectedDate`,
      thiếu thì cuối tháng ghi nhận) + **phần ngân sách LOCKED của tháng chưa thành phiếu** — tách
      2 dòng LƯƠNG (item `actualSource=PAYROLL`) và CHI VĂN PHÒNG, cùng cơ sở `amountTotal` với màn
      Overhead, tháng đã qua không dựng. ⚠ Khi làm module ⑦ Lương: thay NGUỒN của dòng
      `PAYROLL_PLAN`, đừng cộng thêm — cộng là đếm lương hai lần.
    - ⚠ **"Chưa lên lịch" là khối RIÊNG, cố ý KHÔNG bịa ngày** (quyết định chủ dự án): đợt thu
      chưa có hạn + phần CO còn lại chưa thành phiếu của dự án ĐANG CHẠY (Finished thì phần chưa
      chi là tiết kiệm được, không phải khoản sắp chi). Gán ngày ước cho chúng là báo cáo nói dối.
    - **Khung thời gian:** tháng này / quý này / đến hết năm / tùy chọn từ–đến, chia bucket theo
      tuần hoặc THÁNG DƯƠNG LỊCH; luôn bắt đầu từ HÔM NAY (phần đã xảy ra nằm ở Dashboard MTD —
      trộn số thực vào số dự báo là hai bản chất trong một bảng). Quá hạn dồn vào cột đầu; khoản
      SAU khung đếm riêng thành dòng "còn N khoản ngoài khung" — không có nó thì khung hẹp đọc
      thành "hết nghĩa vụ". Bảng "Cash out theo dự án": trần chi (Σ payCap ngoài Chi hộ) · đã chi
      (tạm ứng đã chi + phiếu PAID) · % · cam kết (chờ chi + SCHEDULED) · còn lại.
    - **Xuất PDF = trang in `/finance/cashflow/print`** (vùng `#cashflow-print-area` thêm vào
      globals.css, nút gọi hộp thoại in → Save as PDF — đúng tiền lệ BM02, không thư viện PDF).
      Nền trắng chữ đen CỐ ĐỊNH để PDF không phụ thuộc theme đang bật.
    - **Đã GỠ theo cùng đợt:** `getCashflowForecast`/`getCashflowBucketConfig` cũ + 2 setting
      `cashflow_weekly_buckets`/`cashflow_monthly_buckets` + khối cấu hình bucket ở
      `/settings/finance` (khung giờ chọn ngay trên trang báo cáo, để knob chết là UI nói dối).
      Hai dòng setting cũ còn trong DB, không ai đọc.
    - **Verify bằng số (headless gọi thẳng `getCashflowOutlook` + browser admin + act-as):** hóa
      đơn T002 quá hạn 80tr dồn cột đầu · milestone test 10%×120tr hạn 25/08 ra ĐÚNG 12tr ở bucket
      T9 (25/08+14=08/09), 5% không hạn ra đúng 6tr ở "Chưa lên lịch" · T002 remaining **−2.954.666
      trùng khớp tuyệt đối** số đo lúc vá payCap (10.33) · lương ngân sách 1.069.818.503đ/tháng
      T8–T11, T12 1.706.909.604đ (tháng thưởng) · khối "sau khung" 23,5 tỷ = đúng ngân sách 2027
      nhân bản T12×12 · khung tùy chọn 01–30/09 chỉ ra khoản T9 · from/to hỏng rơi về tháng, không
      ném lỗi · chưa đăng nhập 307 cả 2 route. Milestone test đã xoá, dev.db nguyên trạng.
    - **CHƯA LÀM (cố ý):** sổ phát sinh CO có mã/lý do theo tỉnh (đã ghi ở 10.22) · biểu đồ (bảng
      số trước, hình sau khi có dữ liệu thật dày) · số dư tiền mặt đầu kỳ (app không giữ số dư
      ngân hàng — lũy kế là DÒNG CHẢY, không phải SỐ DƯ, đọc nhầm là tưởng sắp hết tiền).

35. **FIN-B — TRẦN CHI ĐI THEO BẢN CO ĐÃ DUYỆT — XONG 15/08/2026** (migration VIẾT TAY
    `20260815000000_fin_b_co_approval` — bẫy RedefineTables lần 8, một cột `cost_sheet.approvedRevNo`;
    KHÔNG mã quyền mới — dùng lại `bidding.costsheet.approve`, 2 vai BGĐ + CFO). Quyết định chủ dự
    án 15/08/2026: *CO duyệt lần đầu, phát sinh duyệt bổ sung, trần chi theo dòng đổi theo TỪNG LẦN
    DUYỆT* — **thay bất biến cũ "trần đi theo bản CO sống mới nhất đã LƯU"** (10.33 ghi nhận).
    - **Con trỏ theo `revNo`, không phải FK** (khuôn `FinanceCostLine.sourceRevNo`): revision bất
      biến và `@@unique([costSheetId, revNo])` nên revNo là đủ; so sánh duyệt/sống/đã-sync đều là
      phép so số nguyên.
    - ⚠ **`syncIfApproved` là CỔNG DUY NHẤT cho mọi đường sync ngoài duyệt** (`lib/finance.ts`):
      chỉ sync khi `approvedRevNo == revNo mới nhất` (mỗi lần lưu đều sinh revision nên "bản sống
      == bản duyệt" ⇔ đẳng thức đó). Ba đường cũ đã đổi: `saveCostSheet` **KHÔNG còn sync** (lưu
      chỉ sinh revision, trần đứng yên) · `moveToProcessing` và nút "Làm mới" ở /finance đi qua
      `syncIfApproved`. **Gọi thẳng `syncFinanceCostLines` từ chỗ mới nào khác là mở cửa sau kéo
      số CHƯA DUYỆT vào trần chi** — người gọi hợp lệ chỉ có `approveCostSheet` (vừa set con trỏ,
      bản sống = bản duyệt) và `syncIfApproved`.
    - **`approveCostSheet` mở rộng, không đẻ action mới**: form mang `revNo` bản người duyệt ĐANG
      NHÌN → server đối chiếu bản mới nhất, lệch là từ chối (`approveStaleRev`) — Account lưu thêm
      bản trong lúc người duyệt đang đọc thì không duyệt nhầm bản chưa xem. Duyệt xong: set
      `approvedRevNo` → sync trần (nuốt lỗi như tiền lệ, có nút Làm mới chữa) → audit ghi `v{N}`.
      Margin gate + override giữ nguyên. Duyệt lại sau phát sinh dùng đúng nút này ("Duyệt bản vN");
      `rejectedAt` đã được saveCostSheet xoá khi lưu bản mới (hành vi có sẵn) nên vòng từ chối →
      sửa → trình lại tự chạy.
    - **"Chờ duyệt" đổi nghĩa ở CẢ HAI trang** (bidding/[id] + projects/[id]/co-ce): = bản SỐNG
      chưa duyệt — gồm chưa-duyệt-lần-nào LẪN đã-lưu-phát-sinh (`approvedRevNo < latest`). Badge 3
      trạng thái: "Đã duyệt (vN)" · "vM chờ duyệt — trần theo vN" · "Chờ duyệt".
    - **/finance nói rõ hai ca KHÁC NHAU, đừng gộp**: (a) bản sống vượt bản duyệt → banner VÀNG
      "trần giữ theo bản đã duyệt, chờ duyệt" — trần đứng yên là ĐÚNG, không có nút gì; (b)
      `sourceRevNo < approvedRevNo` (sync bản duyệt bị trượt) → banner ĐỎ + nút Làm mới — trần
      đang SAI. Bảng có CO nhưng chưa duyệt lần nào → thông điệp "trần mở khi BGĐ/CFO duyệt" và
      GIẤU nút Làm mới (bấm mà syncIfApproved từ chối thì nút thành nói dối).
    - **Baseline một lần trong seed** (marker `20260815_fin_b_baseline`): bảng CTRACT đã có dòng
      trần chi ở module ④ → coi bản MỚI NHẤT là đã duyệt (BGĐ đã ngầm chấp nhận trần đang chạy;
      thiếu bước này thì ngày deploy mọi dự án MẤT trần chi). CỐ Ý không đặt `approvedById/At` —
      ghi tên người vào lần duyệt không tồn tại là bịa lịch sử. Bảng CHƯA có trần chi giữ null →
      cổng gác từ đầu. Đo trên dev.db: 4 bảng baseline (T002/T006/T013/T025), T005 giữ null.
    - **Verify end-to-end bằng số trên browser (T002):** đổi VAT dòng GEN-001 8%→10% → lưu ⇒ bản
      sống v5, trần VẪN 6.912.000 theo v4, /finance hiện đúng "v4 → v5", nút hiện "Duyệt bản v5"
      (hidden revNo=5) → duyệt ⇒ `approvedRevNo=5`, trần nhảy **7.040.000**, audit `v5` kèm tên
      người duyệt → đổi về 8% + lưu + duyệt v6 ⇒ trần về **6.912.000**, coTotal/ceTotal không đổi
      một đồng. Headless: 4 trạng thái `syncIfApproved` (SYNCED / PENDING_APPROVAL — số dòng trần
      đứng yên / NEVER_APPROVED / NO_SHEET) đều đúng. tsc/eslint/build/i18n 0-0 sạch.
    - **Hệ quả vận hành phải biết:** (a) dự án MỚI dựng CO xong **chưa tạm ứng/chi được** cho tới
      lần duyệt đầu — cổng mở két chính là nút duyệt; (b) ⚠ `bidding.costsheet.approve` trên
      production đang đúng 2 vai BGĐ + CFO — **từ nay mỗi phát sinh CO đều chờ 1 trong 2 vai đó
      duyệt thì hiện trường mới ứng/chi phần chênh**, BGĐ cần biết mình là nút cổ chai mới; (c)
      CE-5 import-sinh-version và mọi đường qua saveCostSheet tự thừa hưởng (không sync khi lưu).
    - **CHƯA LÀM (cố ý):** notification cho người có quyền duyệt khi có bản chờ ("bấm vào là thấy"
      — badge đã hiện ở hai trang; thêm notification thì hỏi chủ dự án) · khoá sửa CO sau khi duyệt
      (Account vẫn sửa tự do, chỉ trần bị giữ — đúng flow thương lượng nhiều vòng của CE-5) · duyệt
      một bản CŨ hơn bản sống (chỉ duyệt được bản mới nhất — muốn "quay về v cũ" thì sửa CO về nội
      dung đó rồi lưu + duyệt, giữ một đường ghi duy nhất).

36. **THU MUA — PUR-1a + PUR-1b XONG 16/08/2026: sub-module Thu mua = hồ sơ NCC theo nhóm + RFQ theo mẫu +
    cổng NCC + AI bóc file + so sánh → trình → Account chốt vào CO** (migration `20260816000000_pur_rfq` — Prisma sinh đúng ALTER TABLE cho 6 cột
    Vendor + 6 CREATE TABLE, đã kiểm không DROP; **4 mã quyền mới, 138 → 142**). Kết quả rà soát
    Purchasing theo yêu cầu chủ dự án 15/08/2026 (đọc 12/13 file báo giá NCC thật ở
    `D:\TCM\PUR\ANH HOÀNG BÁO GIÁ`): app đã có Order→`DepartmentTask` PCC và PO neo dòng CO, nhưng
    toàn bộ khoảng giữa (tìm NCC → xin báo giá → so → chốt với Account → đưa vào CO) làm ngoài app —
    bằng chứng là file `2- BG TỔNG HỢP` PUR ghép tay ~14 NCC + báo giá vòng 2. PUR-1b (cùng ngày)
    khép vòng: so sánh → PUR trình → Account chốt → ghi vào CO — xem các gạch đầu dòng **[1b]** dưới.
    - **6 mẫu form = 6 nhóm hàng, danh mục Ở CODE** (`lib/rfq-templates.ts`, khuôn `quote-templates.ts`):
      EVENT_EQUIPMENT · AV_LED · POSM_RENTAL · PRODUCTION_PRINT · OUTSOURCED_STAFF · SPECIAL_STRUCTURE.
      Mỗi mẫu có cột dòng mở rộng, điều khoản chung, và **CÔNG THỨC THÀNH TIỀN RIÊNG**
      (`computeQuoteLineAmount` — MỘT nguồn sự thật cho cổng NCC, form nhập hộ, AI, server): mặc định
      SL × Π(hệ số) × đơn giá; nhân sự thuê ngoài = ngày × người × giờ × đơn giá/GIỜ + cơm × người × ngày;
      mô hình đặc biệt = Σ 4 khối. **25/25 test số khớp file thật** (bảo vệ Hoàng Anh Đạt 12.900.000 ·
      BV Miền Bắc 6.300.000 gồm cơm · Thiện Sự Kiện 6.750.000 · Anh Vũ 180.000.000 · mascot 190tr).
      `suggestRfqTemplate` gợi ý mẫu từ tên dòng CO theo **RANH GIỚI TỪ** — bản đầu so chuỗi con,
      khoá "ao" (áo) trúng "b**ao** ve" nên bảo vệ bị gợi ý thành in ấn; đã vá + test.
      ⚠ `VendorGroup.groupCode` và `Rfq.groupCode` CÙNG danh mục này — "mỗi nhóm kèm form của nhóm".
    - **Schema:** `Vendor` +6 cột hồ sơ (địa chỉ, ngân hàng ×3, điều khoản TT, ghi chú) · `vendor_group`
      (NCC nhiều nhóm — Sông Lam vừa thiết bị vừa POSM) · `vendor_document` (kho báo giá/PO/HĐ theo
      NCC, "chốt order/ký HĐ thì PUR lưu để tham chiếu giá") · `rfq` · `rfq_line` · `rfq_vendor` ·
      `rfq_quote_line`. ⚠ **`RfqLine.costLineStableKey` là CHUỖI, KHÔNG FK CostLine.id** — dòng CO bị
      tạo lại mỗi lần lưu, chỉ stableKey bền (tiền lệ `FinanceCostLine.lineKey`); PUR-1b ghi ngược
      giá chốt vào CO theo khoá này. `RfqLine` là ẢNH CHỤP (tên/mô tả/ĐVT/SL/`refUnitPrice` = đơn giá
      CO TRƯỚC THUẾ) để NCC thấy đúng thứ được hỏi kể cả khi CO đổi.
    - **Quyền (`PUR_POLICY` trong seed — nguồn sự thật cho `isRestricted` + `purCodesFor` + 2 backfill
      `20260816_pur_*`, khuôn RECRUIT_POLICY, lọc theo MÃ ROLE):** `purchasing.view` (PUR + BGĐ + 3 vai
      ACCOUNT + CFO + kế toán = 8 vai — Account xem RFQ để cùng chốt) · `purchasing.rfq.manage` ·
      `purchasing.rfq.ai` (đặc quyền AI, kiểm `hasPermission` BÊN TRONG action) · `purchasing.vendor.manage`
      (3 mã sau: PUR + BGĐ = 3 vai). Đo trên dev.db 8/3/3/3, grant 1312 → 1329, seed lần 2 no-op.
      **"Chốt & đưa vào CO" (1b) KHÔNG cần mã mới** — sẽ đi qua `saveCostSheet` nên tự đòi
      `bidding.costsheet.edit` (Account): PUR trình, Account chốt.
    - **Quản lý NCC chuyển nhà**: `/settings/vendors` nay CHỈ redirect sang `/purchasing/vendors`
      (một UI NCC duy nhất; gác OR `purchasing.vendor.manage` ‖ `settings.vendors.manage` để ai từng
      có quyền cũ không mất). Trang mới: lọc theo nhóm, hồ sơ đủ trường (ô CHỮ controlled — bẫy
      requestFormReset), gán 6 nhóm, kho tài liệu (route `/api/vendor-doc/[id]` KIỂM belongs-to, mirror
      `/api/project-file`), RFQ đã tham gia. Seed one-shot `20260816_pur_vendors`: **17 NCC thật** từ 2
      bảng tổng hợp (chỉ tên + nhóm, code tự sinh; chỉ tạo khi chưa trùng tên/mã).
    - **RFQ:** `/purchasing` = khối "Order PCC đang chờ" trên MỌI dự án (lối vào tổng — trước chỉ xem
      trong từng dự án) + danh sách RFQ · `/purchasing/rfq/new` tick dòng CO (chỉ QTY_PRICE/FIXED, không
      dòng %, không dòng kho K3; server đọc lại theo stableKey — không tin payload) → mẫu (gợi ý) → NCC
      lọc theo nhóm (+ "hiện mọi NCC") · `/purchasing/rfq/[id]`: phát hành (DRAFT→SENT), từng NCC có
      **tạo link cổng** (token 32 byte base64url, DB lưu **sha256** khuôn GuestInvite, hết hạn = hạn báo
      giá + 7 ngày hoặc 30 ngày, phát lại = thu hồi cũ), **xuất Excel mẫu** (`/api/rfq/[id]/template.xlsx`
      — khung y file RFQ TCM đang gửi, công thức thành tiền Excel, cột ẩn `__line` mang id dòng; **CỐ Ý
      KHÔNG in giá CO** vì file đi ra ngoài), **nhập hộ**, **upload file + AI bóc**, NCC từ chối.
      ⚠ Bug đã vá lúc verify: checkbox "tick cả hạng mục" gọi `toggle` từng dòng trong vòng lặp → mỗi
      lượt so với snapshot cũ, sai với >1 dòng; nay `setMany` một lần setState.
    - ⚠ **Đường ghi báo giá DUY NHẤT `writeVendorQuote` ở `lib/rfq-server.ts` (server-only), dùng chung
      cho 3 lối vào** (PUR nhập hộ · PUR lưu sau AI · cổng NCC). CỐ Ý không đặt ở file `"use server"`:
      mọi export của file action là endpoint gọi được từ client, mà hàm này KHÔNG tự gác quyền (mỗi lối
      gác kiểu riêng — quyền PUR hoặc token NCC). Cùng lý do `loadRfqByToken` cũng ở lib. Server LUÔN
      tính lại `amount` bằng `computeQuoteLineAmount`; dòng không có đơn giá = NCC không báo → không lưu.
      Có báo giá đầu tiên → RFQ SENT→COMPARING (vẫn nhận thêm; NCC gửi lại = ghi đè, có audit).
      Đã gỡ một `export type { RfqStatus }` khỏi file "use server" trước khi vấp (bẫy 10.23).
    - **Cổng NCC `(guest)/rfq/[token]`** — không đăng nhập, gác HOÀN TOÀN bằng token; hết hạn/thu hồi/RFQ
      đóng → thông báo, không form. Chỉ hiện tên NCC được mời + dòng hỏi giá + form mẫu + báo giá của
      CHÍNH họ; **KHÔNG hiện giá CO, KHÔNG hiện NCC khác** (đã curl không cookie: có "Kính gửi Hoàng Anh
      Đạt", không có 800.000/2.500.000, không có tên NCC kia). Form dùng chung `components/rfq/quote-form.tsx`
      với PUR (thành tiền realtime bằng đúng hàm server). Gửi xong → notification cho người tạo RFQ.
    - **AI bóc file (`lib/ai/rfq-prompts.ts`, Zod `rfqParseSchema`):** LƯU FILE TRƯỚC (hồ sơ phải giữ được
      kể cả AI không đọc nổi) → `extractTextFromFile` → DeepSeek → Zod → **TRẢ VỀ FORM cho PUR sửa rồi
      Lưu**, KHÔNG ghi thẳng (mirror `parseCvWithAi`); id dòng lạ bị loại; dòng file không khớp dòng RFQ
      vào panel "không khớp", KHÔNG tự thêm. Verify bằng **file BV Miền Bắc thật**: 4,5s, confidence 0,8,
      khớp ca đầu → đơn giá **50.000/giờ**, 2 người, 10 giờ, ca 22:00–08:00, cơm 30.000 (đúng dòng 8 file),
      5 ca còn lại vào "không khớp" (không bịa), terms trích đúng VAT 8% + ghi chú nguyên văn; PUR sửa
      "SL báo" về 1 thì thành tiền = **1.060.000** = cột Tổng cộng dòng 8 file thật.
      ⚠ **`extractTextFromFile` cắt 6.000 ký tự/file** (trần của helper dùng chung KB/CV/MKT) — báo giá
      Excel dài nhiều sheet (Sông Lam 900 dòng, Nam Thái Dương 3 tỉnh) AI chỉ thấy phần đầu. Nâng trần là
      sửa helper dùng chung — chưa làm, ghi nhận. `.xls` cũ (BEDU/Trần Gia) và ảnh scan: cho tải lên
      lưu hồ sơ nhưng AI báo "không đọc được" — đúng thiết kế, PUR nhập tay.
    - **Verify (browser T002, act-as 3 vai):** tạo RFQ 2 dòng/2 NCC bảo vệ (mẫu gợi ý đúng từ "Đội
      PG/PB") · phát hành · link token → tab riêng không cookie mở được, NCC điền 5n×2ng×12h×75k, SL báo 1
      → **9.000.000** đúng file Hoàng Anh Đạt, gửi → DB `amount` server tính lại khớp, terms lưu, RFQ →
      COMPARING, notification tới người tạo · upload file thật + AI → form điền sẵn → Lưu `via=FILE` ·
      thu hồi link → cổng từ chối · Excel mẫu 200 đúng MIME, tên file UTF-8 chuẩn · act-as PUR Manager:
      thấy nav + giá CO tham chiếu (được phép — view_paycap) + nút quản lý, HTML không CE/margin ·
      act-as Account Staff: mở được RFQ, thấy báo giá, **không** nút nhập hộ/tạo link/huỷ · chưa đăng
      nhập: 3 trang 307, 3 API 401. Audit chuỗi `CREATE→ISSUE→TOKEN_ISSUE→QUOTE_SAVE→AI_PARSE→QUOTE_SAVE`.
      RFQ test + file đã xoá, dev.db nguyên trạng. tsc/eslint/build/i18n 0-0 sạch, migrate diff rỗng.
    - **[1b] SO SÁNH — SỐ TÍNH BẰNG CODE, AI CHỈ VIẾT CHỮ.** `lib/rfq-compare.ts` (thuần, 17/17 test):
      `buildCompareMatrix` ra rẻ nhất/chênh %/thiếu NCC/vượt CO từng dòng + tổng theo NCC (coverage,
      CO tham chiếu CÙNG DÒNG để so cùng mẫu số, số dòng rẻ nhất) + `bestMixTotal`. `rfqCompareMessages`
      nhận ma trận ĐÃ TÍNH dạng text; Zod `rfqCompareSchema` chỉ có câu chữ (summary/lineSuggestions/
      termsNotes/risks) — **số AI trả về không bao giờ dùng làm số so sánh**; gợi ý trỏ id lạ bị loại.
      Verify thật: AI nhận ra Tất Thành rẻ hơn nhưng "chưa gồm xăng" + coverage 50%, Sông Lam cọc 50% +
      VAT 8% — đúng thứ PUR cần, không bịa số.
    - **[1b] PUR chọn + lý do → Trình:** `finalJson` = `{picks: {lineId → {rfqVendorId, reason}}, note}`;
      chỉ nhận NCC ĐÃ BÁO dòng đó; **mỗi dòng đã chọn phải có lý do** mới trình được (thống kê "vì sao
      chọn" chỉ dùng được khi lý do có thật — cùng nguyên tắc giải trình thua thầu B2). Trình → SUBMITTED
      + notify PIC + Leader dự án. Account trả lại (bắt buộc lý do) hoặc PUR tự rút về → COMPARING.
    - ⚠ **[1b] AI ĐƯỢC CHỐT — kiểm THEO BẢN GHI (`canConfirmRfq`), KHÔNG chỉ mã quyền.** Phát hiện lúc
      verify: `bidding.costsheet.edit` đang cấp cho **20 vai kể cả PUR** (grant mặc định rộng, chưa từng
      siết ở 10.16), nên gác bằng mã đó thì PUR tự chốt được — sai câu chốt "PUR trình, Account chốt".
      Nay: (PIC hoặc Leader của dự án + `costsheet.edit`) HOẶC `bidding.costsheet.approve` (BGĐ/CFO).
      Đã verify: act-as PUR Manager → không nút chốt, chỉ rút về; act-as HỒ HỒNG PHƯỚC (PIC T002) → chốt
      được. **Ghi nhận cho BGĐ:** `costsheet.edit` 20 vai là chính sách nên xem lại riêng.
    - ⚠ **[1b] "CHỐT & ĐƯA VÀO CO" = MỘT đường ghi:** `buildSheetPayloadFromDb` (đúng hàm CE-5) → sửa
      `vendorId` + `unitPrice` (hoặc chuyển `FIXED`/`fixedAmount` khi NCC báo theo KHỐI hoặc SL khác SL
      hỏi) của các dòng đã chọn theo **stableKey** → gọi CHÍNH `saveCostSheet` → revision `origin="RFQ"`,
      note "Chốt NCC theo {mã}"; `Rfq.status=CONFIRMED`, `appliedRevNo`. Dòng CO đã biến mất khỏi bảng
      sống → bỏ qua + báo số dòng. ⚠ **Bảng chế độ CŨ phải truyền `ceTotal` HIỆN HÀNH** vào form —
      CE-5 truyền "0" được vì bảng đó ở chế độ CE theo dòng (server tự suy); áp "0" cho bảng cũ là ghi
      CE về 0, margin âm. **Vì FIN-B, bản mới CHỜ BGĐ/CFO duyệt** trần chi mới nở — action cố ý không
      sync. Chuỗi đầy đủ: PUR trình → Account chốt → BGĐ duyệt → két mở.
    - **[1b] Lịch sử giá theo NCC** (`loadVendorPriceHistory`, tính LÚC ĐỌC từ 3 sổ, không bảng riêng):
      báo giá RFQ đã CHỐT (chỉ dòng Account CHỌN NCC đó — dòng thua không phải "giá đã chốt") · dòng CO
      sống trỏ vendorId · dòng PO. Cố ý KHÔNG gộp giữa 3 sổ: cùng hạng mục hiện ở cả 3 là thông tin
      (giá báo → giá vào CO → giá đặt). Tab ở `/purchasing/vendors/[id]`.
    - **[1b] Vá FIN-B nhánh AUTO-DUYỆT theo ngưỡng** (FR-12: margin đạt + dưới `auto_approve_threshold`
      100tr, hoặc override có lý do): `saveCostSheet` vốn đặt `approvedById` nhưng FIN-B (10.35) sót
      `approvedRevNo` → bảng nhỏ "duyệt trên giấy" mà trần chi không mở, badge lại báo "chờ duyệt".
      Nay nhánh này set `approvedRevNo` + sync trần như `approveCostSheet`. Đây là ngoại lệ nhất quán,
      không phải cửa sau: hệ thống đã coi là duyệt thì con trỏ phải theo.
    - **[1b] Verify end-to-end trên T002 (browser + DB, act-as 3 vai):** RFQ mẫu POSM 2 dòng, Sông Lam
      báo 720k/2.600k, Tất Thành chỉ báo Xe 2.300k → ma trận "CO 18.900.000 · rẻ nhất từng dòng
      **17.260.000**" (khớp tính tay) → AI nhận xét (4–5s) → chọn Sông Lam cho PG + Tất Thành cho Xe,
      lý do từng dòng, tổng **17.260.000 (−1.640.000 so CO)** → Trình (notify PIC Phước + Leader Yến) →
      act-as PUR Manager: KHÔNG nút chốt → act-as PIC Phước: chốt ⇒ **CO v7 origin=RFQ, coTotal
      17.260.000, CE giữ 120tr, 2 dòng đúng NCC + đơn giá, trần chi VẪN theo v6** → BGĐ duyệt v7 ⇒ trần
      **6.220.800** (5.760.000×1,08) và **11.500.000**, dòng trần mang đúng NCC · lịch sử giá Sông Lam
      chỉ nhận dòng thắng · audit `AI_COMPARE→SELECTION_SAVE→SUBMIT_TO_ACCOUNT→CONFIRM_INTO_CO`. Dữ
      liệu test đã dọn, T002 trả về đúng v6 / 18.900.000 / trần 6.912.000–12.500.000.
    - **CHƯA LÀM (cắt cố ý — muốn thêm hỏi chủ dự án):** gửi email tự động cho NCC (SMTP trống) · đàm
      phán vòng 2 có lịch sử (v1: NCC gửi lại = ghi đè) · đọc `.xls` cũ (cần lib `xlsx`) · xếp hạng NCC ·
      tạo PO một nút từ RFQ · nhắc hạn RFQ qua notification · nâng trần 6.000 ký tự của
      `extractTextFromFile` (helper dùng chung).

37. **THU MUA — PUR-2 XONG 16/08/2026: hồ sơ NCC mở rộng + trường tuỳ chỉnh ở Settings** (migration
    `20260816010000_pur2_vendor_profile` — Prisma sinh đúng ALTER TABLE 2 cột + 2 CREATE TABLE, đã kiểm không
    DROP; **KHÔNG mã quyền mới**). Yêu cầu chủ dự án 16/08/2026: PUR nhập được mã 3 ký tự · tên pháp nhân ·
    địa chỉ · MST · người liên hệ (tên/ĐT/email, thêm người thứ 2, thứ 3…) · điều khoản thanh toán · ghi chú;
    **Settings cho phép khai thêm trường mới** để quản lý NCC.
    - **Schema:** `Vendor` +`legalName` (tên pháp nhân — `name` giữ vai TÊN GỌI NGẮN hiện ở mọi ô chọn/RFQ) +
      `customJson` (giá trị trường tuỳ chỉnh, khoá = `VendorFieldDef.key`) · bảng MỚI `vendor_contact`
      (name/title/phone/email/isPrimary/sort, tối đa `MAX_VENDOR_CONTACTS` = 5, cascade theo NCC) · bảng MỚI
      `vendor_field_def` (key @unique, labelVi/En, type TEXT|TEXTAREA|NUMBER|DATE|SELECT|BOOL, optionsJson,
      hint, required, sort, isActive).
    - ⚠ **3 cột liên hệ CŨ (`Vendor.contact/phone/email`) = người liên hệ CHÍNH, đồng bộ mỗi lần lưu**
      (`writeContacts` xoá-tạo lại bảng con rồi ghi người ★ lên 3 cột cũ). Chỗ đọc cũ không phải đổi; NCC tạo
      trước PUR-2 mở form sửa vẫn thấy liên hệ cũ ở dòng đầu (trang chi tiết suy từ 3 cột khi bảng con rỗng).
      Không đặt cột mới thay 3 cột cũ là cố ý — một nguồn ghi (`writeContacts`), hai nơi đọc.
    - ⚠ **MÃ NCC: đúng 3 ký tự A-Z0-9 khi TẠO hoặc khi ĐỔI (`VENDOR_CODE_RE`, khuôn `Client.code`); mã cũ dài
      hơn (V-PCC-01, 17 NCC seed…) vẫn hợp lệ khi KHÔNG đổi (`VENDOR_CODE_LEGACY_RE`).** Không ép đổi hàng
      loạt: mã NCC hiện chỉ HIỂN THỊ (RFQ detail), không vào mã sinh nào — đã grep. Form tạo tự GỢI Ý mã 3 ký tự
      từ tên (`suggestVendorCode`, chữ đầu ≤3 từ chính) cho tới khi PUR tự gõ vào ô mã; server vẫn kiểm chuẩn +
      trùng. **17 NCC seed đổi sang mã 3 ký tự** (SLM · FSS · TDA · TTH · PLM · NPH · VPR · DHG · MHG · SGC ·
      NTD · TSK · AVU · TNG · VAR · HAD · BMB) — trên dev.db đổi bằng script; production CHƯA chạy seed PUR
      (chưa deploy) nên sẽ tạo thẳng mã mới.
    - **Trường tuỳ chỉnh — `/settings/vendor-fields`** (gác `settings.vendors.manage` = BGĐ + PUR Manager; card
      mới ở trang Thiết lập): tạo/sửa nhãn vi-en, kiểu, danh sách lựa chọn (mỗi dòng một), gợi ý, bắt buộc, thứ
      tự, bật/tắt. ⚠ **`key` sinh MỘT LẦN từ nhãn Việt (`fieldKeyFromLabel`, trùng thì `_2`, `_3`) và KHÔNG
      đổi được** — đó là khoá JSON của mọi NCC đã nhập. **KHÔNG có đường xoá** — tắt là ẩn khỏi form, giá trị
      cũ vẫn nằm trong `customJson` (mirror ClientGroup / JobPosition).
    - ⚠ **`collectCustomValues` (lib thuần `vendor-fields.ts`) là MỘT nguồn sự thật cho đường ghi**: đọc
      `cf_<key>` theo danh sách trường ĐANG BẬT đọc lại ở server (không tin client), ép kiểu, **GIỮ NGUYÊN giá
      trị của trường đã tắt** (tắt trường ≠ xoá dữ liệu), trả `missing` cho trường bắt buộc bỏ trống → action
      chặn `CUSTOM_REQUIRED` kèm tên trường đích danh. Ô số là `NumberField` nên input ẩn gửi số CHUẨN — parser
      `Number(s)`, đừng bóc dấu chấm/phẩy ở đây (bóc là hỏng số thập phân).
    - ⚠ **BẪY MỚI TÌM RA — `requestFormReset` của React 19 KHÔNG chỉ xoá ô chữ, mà còn RESET `<select>`,
      checkbox, radio, KỂ CẢ KHI CHÚNG LÀ CONTROLLED.** Chuẩn cũ "ô CHỮ phải controlled" (OVH/MKT/KB) chỉ cứu
      được input/textarea vì React đồng bộ `defaultValue` cho chúng; với select/checkbox/radio React KHÔNG khôi
      phục sau `form.reset()`. Đã tái hiện trên form tạo NCC: action báo lỗi mã ⇒ nhóm hàng BỎ TICK, người
      liên hệ ★ nhảy về người đầu, ô "Xếp hạng" về rỗng — IM LẶNG; sửa mã rồi Lưu là ghi sai (React state vẫn
      đúng, nhưng FormData đọc từ DOM). Cách vá ở PUR-2: `<form onReset={(e) => e.preventDefault()}>` — sự
      kiện `reset` do `form.reset()` bắn ra là CANCELABLE, chặn nó là mọi ô (kể cả uncontrolled) giữ nguyên
      sau action lỗi; áp cho 4 form (tạo/sửa NCC, tạo/sửa trường). Form không cần reset thật: tạo NCC xong thì
      `redirect`, tạo trường xong thì remount khối nhập theo `key` (mẫu "điều chỉnh state lúc render"), sửa
      thì giá trị trên form = giá trị đã lưu. Verify sau vá: submit lỗi 2 lần liên tiếp, nhóm/★/xếp hạng/năng
      lực/liên hệ 3 đều còn nguyên. **Mọi form `useActionState` có select/checkbox/radio trong app đều mang
      bẫy này** (vd `category` NCC, `leadStaffId` team…) — hiện chỉ mất lựa chọn CHƯA LƯU sau một lần lỗi, chưa
      vá đại trà (không thuộc phạm vi PUR-2), nhưng thêm form mới thì dùng `onReset` này.
    - Ô số tuỳ chỉnh là `NumberField` **KHÔNG điều khiển** (`defaultValue`): `onChange` của NumberField chỉ trả
      số nên bản controlled biến "xoá trắng" thành **0** (đã tái hiện: xoá ô rồi lưu ⇒ `nang_luc… = 0`);
      uncontrolled thì ô trống gửi `""` ⇒ server xoá khoá. An toàn vì form đã chặn reset. Verify: nhập 250 →
      lưu → 250; xoá trắng → lưu → khoá biến mất khỏi `customJson`.
    - ⚠ **Trường "bắt buộc" áp cho MỌI NCC khi LƯU, kể cả NCC cũ**: đánh dấu bắt buộc một trường mới thì lần
      sửa kế tiếp của NCC cũ bị chặn cho tới khi điền (đã thấy trên V-OPE-01: "Thiếu thông tin bắt buộc: Xếp
      hạng NCC"). Loud, không silent — cố ý giữ; muốn "bắt buộc chỉ với NCC mới" thì phải hỏi chủ dự án.
    - **Đã dọn:** namespace i18n `settings.vendors` (24 key × 2) mồ côi từ PUR-1a (form cũ đã gỡ, trang chỉ
      redirect) — xoá theo quy tắc "dọn rác do chính mình tạo".
    - **Verify:** tsc · eslint · i18n **0/0 (4072 key)** · `next build` sạch, có route `/settings/vendor-fields` ·
      `migrate diff` rỗng · test thuần: `suggestVendorCode` luôn ra 3 ký tự hoặc rỗng (Sông Lam → SLA, Vietpro
      → VIE, Thiện Sự Kiện → TSK, "A" → "") · `fieldKeyFromLabel` ("Năng lực tối đa (người)" →
      `nang_luc_toi_da_nguoi`) · `collectCustomValues` giữ khoá cũ, ép SELECT/NUMBER/DATE/BOOL, báo đúng 2
      trường bắt buộc thiếu · chưa đăng nhập: 2 route mới 307 về login.
      **Browser (dev.db, act-as 2 vai):** Settings tạo trường SELECT "Xếp hạng NCC" (A/B/C, bắt buộc, gợi ý) →
      key `xep_hang_ncc`, form tạo tự trắng; tạo trường NUMBER "Năng lực tối đa (người)" → key
      `nang_luc_toi_da_nguoi`, sort 2 · form NCC: gõ tên "Công ty TNHH Sự kiện Ánh Dương" ⇒ ô mã tự gợi ý
      **SKA** (bỏ CONG/TY/TNHH); mã "AD" ⇒ server chặn "phải đúng 3 ký tự"; bỏ trống Xếp hạng ⇒ "Thiếu thông
      tin bắt buộc: Xếp hạng NCC" (đích danh); mã "SLM" khi sửa ⇒ "Mã NCC đã tồn tại"; lưu hợp lệ ⇒ DB đúng
      từng cột: 3 `vendor_contact` (★ = người thứ 2, đồng bộ xuống `contact/phone/email`), nhóm
      OUTSOURCED_STAFF, `customJson {"xep_hang_ncc":"B","nang_luc_toi_da_nguoi":150}` (số thật, không chuỗi),
      audit CREATE/UPDATE ghi `ADG→ADX` · sửa: bỏ liên hệ 3 + đổi ★ ⇒ 2 dòng, ★ đúng, h1 đổi mã · tắt trường
      "Năng lực" ở Settings rồi lưu lại NCC (trường không còn trên form) ⇒ giá trị 120 VẪN trong `customJson` ·
      NCC cũ V-OPE-01: form sửa hiện liên hệ cũ ở dòng đầu, lưu với mã dài "V-OPE-01" vẫn qua, liên hệ chuyển
      sang bảng con · danh sách hiện tên pháp nhân + liên hệ ★ · act-as Account Manager (chỉ `purchasing.view`):
      trang NCC chỉ-đọc liệt kê pháp nhân/MST/địa chỉ/điều khoản/2 liên hệ/Xếp hạng, HTML không có số tài khoản,
      không form; `/settings/vendor-fields` bị đá về Dashboard · Settings: đổi sang SELECT không lựa chọn ⇒ lỗi
      và kiểu trên form VẪN là SELECT (không nhảy về TEXT). Dữ liệu test đã dọn (NCC ADX + 2 trường + audit),
      V-OPE-01 trả về nguyên trạng, dev.db 20 NCC / 0 contact / 0 def.
    - **CHƯA LÀM (cố ý):** import NCC từ Excel · lịch sử thay đổi hồ sơ NCC (chỉ AuditLog chung) · trường tuỳ
      chỉnh xuất hiện trong so sánh RFQ / lọc danh sách · gộp hai NCC trùng.

---

## 11. Trạng thái ngay tại thời điểm bàn giao

⚠ **CHỜ DEPLOY — `e6c2e18` (16/08/2026, đã push `origin/master`) CHƯA lên production.** Gói FIN-A + Cashflow v2
+ FIN-B + PUR-1a/1b + PUR-2 (mục 10.33–10.37): **3 migration mới** (`fin_b_co_approval`, `pur_rfq`,
`pur2_vendor_profile`, đều additive), **4 mã quyền mới** (138 → 142, backfill PUR_POLICY), seed one-shot 17 NCC +
baseline FIN-B. Tối 16/08 `deploy.sh --check` dừng ở B1: máy dev đứng ở mạng `192.168.0.x` (không phải LAN
công ty) và NAT cổng 2222 timeout suốt 45 phút dù `app.tcmbtl.com` vẫn 200 — đúng ca đã ghi ở §8.1. Kế hoạch
chủ dự án: **sáng 17/08 nối Wi-Fi công ty rồi chạy `bash scripts/deploy.sh`** (đường LAN). Sau deploy đối
chiếu như mọi lần: nhân sự/khách/dự án 36/68/25 · coTotal+ceTotal 5 bảng không đổi · grant 1312 → **1329**
(+17 = 4 mã PUR) · `cost_sheet.approvedRevNo` khác null đúng ở các bảng đã có trần chi · bảng `rfq*`,
`vendor_contact`, `vendor_field_def` trống · 17 NCC seed mã 3 ký tự · `[jobs] scheduler bật`. Nhắc BGĐ hai
điểm vận hành của FIN-B (mục 10.35): trần chi chỉ nở khi BGĐ/CFO duyệt bản CO; cashflow chỉ BGĐ/CFO/Admin.

**Production đang chạy `f04b39a`** (07/08/2026 15:49) — **CR-1c**: trưởng team đã nghỉ không còn
nhận thông báo vào khoảng không (mục 10.32). Chạy `bash scripts/deploy.sh` **đường LAN**, fingerprint
khớp. **KHÔNG migration mới** (67 migration, "No pending migrations"), **không mã quyền mới**. Backup
TRƯỚC deploy: `~/backup/*-20260807-154919*` trên server + `D:/TCM/backup-prod-20260807-154919/` máy dev.

Đối chiếu production sau deploy — **không đổi một dòng dữ liệu nào**: nhân sự/khách/dự án **36/68/25**
· dòng CO/CE **483** · grant **1312** · coTotal+ceTotal 5 bảng **không lệch một đồng** ·
`integrity_check` **ok** / `foreign_key_check` **0 dòng**. Ba team nhỏ vẫn để trống trưởng team đúng
ý chủ dự án; team thứ ba đã mang tên **"3D — Animation/AI"**. Health check: `/login` 200 ·
`/creative`, `/settings/creative-squads` 307 về login · pm2 online, **restart 0** · `[jobs] scheduler bật`.

---

### Deploy trước đó — 07/08/2026 lúc 09:44

**Production khi đó chạy `c2deb47`** — **CR-1 + CR-1b Creative**: 3 team nhỏ,
điều phối việc có hạn, flow v2 (mục 10.32). Chạy `bash scripts/deploy.sh` **đường LAN
192.168.1.111:22**, fingerprint khớp. **1 migration mới** áp sạch (`creative_squads` — bảng
`creative_squad` MỚI + 2 cột nullable thêm bằng ALTER TABLE), **không mã quyền mới**. Backup TRƯỚC
deploy ở hai nơi: `~/backup/*-20260807-094456*` trên server + `D:/TCM/backup-prod-20260807-094456/`
máy dev.

Đối chiếu production SAU deploy với backup TRƯỚC deploy — **khớp từng số, không đổi một dòng nào**:

| | backup trước | production sau |
|---|---|---|
| nhân sự / khách / dự án | 36 / 68 / 25 | **36 / 68 / 25** |
| coTotal + ceTotal 5 bảng CO/CE | (10 số) | **không đổi MỘT ĐỒNG** |
| dòng CO/CE / dòng grant quyền | 483 / 1312 | **483 / 1312** |
| 3 team nhỏ Creative | — | **CREATIVE · GRAPHIC_2D · MULTIMEDIA**, lead trống, 0 người |
| bảng `creative_task_approver` | — | **KHÔNG CÓ** (đúng — CR-1b đã gỡ trước khi deploy) |
| `integrity_check` / `foreign_key_check` | — | **ok** / 0 dòng |

Marker seed `20260806_creative_squads` có đủ. Health check: `/login` 200 · `/creative`,
`/creative/my`, `/settings/creative-squads`, `/bidding` đều 307 về login · pm2 `online`,
**restart 0** · `[jobs] scheduler bật`.

⚠ **VIỆC PHẢI LÀM TRƯỚC KHI TEAM DÙNG THẬT — 3 team nhỏ đang RỖNG.** Seed chỉ dựng 3 team, CỐ Ý
không tự gán ai. Vào `/settings/creative-squads` để (a) gán **trưởng team** cho từng team, (b) phân
6 nhân sự Creative vào team, (c) đổi tên hiển thị team thứ ba từ "Multimedia — 3D/Animation/AI"
thành **"3D"** theo quyết định flow v2. Chưa gán thì luồng điều-phối-rồi-giao chưa chạy, nhưng CD
vẫn giao thẳng như cũ nên KHÔNG có gì hỏng.

⚠ **7 task Creative cũ trên production đều CHƯA có team** (`squadId` null) — đúng thiết kế, chúng
sinh ra trước CR-1. Chúng nằm ở nhóm "Chờ điều phối về team" trên bảng; CD điều phối dần, hoặc cứ
giao thẳng như trước.

---

### Deploy trước đó — 06/08/2026 lúc 14:27

**Production khi đó chạy `35314b1`** — **TD-1 Tuyển dụng** (mục 10.31). Chạy
`bash scripts/deploy.sh` **đường LAN 192.168.1.111:22**, fingerprint khớp. **1 migration mới** áp
sạch (`recruit_td1` — 5 bảng MỚI, không đụng cột nào của bảng cũ), **7 mã quyền mới**. Backup TRƯỚC
deploy ở hai nơi: `~/backup/*-20260806-142708*` trên server + `D:/TCM/backup-prod-20260806-142708/`
máy dev.

Đối chiếu production SAU deploy — **dữ liệu cũ không đổi một dòng nào**:

| | trước | production sau |
|---|---|---|
| nhân sự / khách / dự án | 36 / 68 / 25 | **36 / 68 / 25** |
| coTotal + ceTotal 5 bảng CO/CE | (10 số) | **không đổi MỘT ĐỒNG** |
| dòng CO/CE | 483 | **483** |
| dòng grant quyền | 1296 | **1312** (+16 = đúng 7 mã tuyển dụng) |
| 5 bảng tuyển dụng mới | — | **0 / 0 / 0 / 0 / 0** (chưa ai nhập, đúng như mong đợi) |
| `integrity_check` / `foreign_key_check` | — | **ok** / 0 dòng |

7 mã quyền đo trên production **giống hệt** bản dựng-từ-đầu và dev.db: view 3 · manage 2 ·
jd.manage 2 · ai_parse 2 · salary.view 3 · interview.manage 2 · decide 2. Đủ 3 marker
`20260806_recruit_*`, OptionSet `recruit_criteria` 6 mục.

Health check: `/login` 200 · `/staff/recruit`, `/staff/recruit/interviews`, `/staff/recruit/archive`,
`/settings/recruit` đều 307 về login · hai route API (`/api/recruit-cv/x`, `/api/interview-ics/x`)
trả **401** khi chưa đăng nhập · `[jobs] scheduler bật`.

⚠ **Việc cần làm trước khi HR dùng thật:** mở `/settings/recruit` tạo vị trí đang tuyển đầu tiên
(gắn phòng ban + người quản lý trực tiếp — chính người đó và trưởng bộ phận sẽ thấy lương mong
muốn của ứng viên). Chưa có vị trí nào thì ô "Nhận CV mới" báo rõ và không cho tải CV lên.

⚠ **Đường gửi thư mời họp vẫn CHƯA có** vì `SMTP_*` trên production đang trống — người phỏng vấn
nhận thông báo TRONG APP và tự bấm "Thêm vào lịch" để tải file .ics. Khai báo máy chủ mail xong
thì nâng lên gửi thư mời rất nhẹ (xem mục 10.31).

---

### Deploy trước đó — 06/08/2026 lúc 10:20

**Production khi đó chạy `28b16dc`** — **CE-5 vòng đời version** (mục 10.30). Chạy
`bash scripts/deploy.sh` **đường LAN 192.168.1.111:22**, fingerprint khớp. **1 migration mới** áp
sạch (`coce_v3_ce5` — thêm cột `cost_line.ceDropped`), **không mã quyền mới**. Backup TRƯỚC deploy ở
hai nơi: `~/backup/*-20260806-101954*` trên server + `D:/TCM/backup-prod-20260806-101954/` máy dev.

Đối chiếu production SAU deploy với backup TRƯỚC deploy — **khớp từng số, không đổi một dòng nào**:

| | backup trước | production sau |
|---|---|---|
| nhân sự / khách / dự án | 36 / 68 / 25 | **36 / 68 / 25** |
| coTotal + ceTotal 5 bảng CO/CE | (10 số) | **không đổi MỘT ĐỒNG** |
| dòng grant quyền / dòng CO/CE | 1296 / 483 | **1296 / 483** |
| cột mới `ceDropped` | — | **0 true / 483 false** (đúng: mặc định trên toàn bộ dòng cũ) |
| `integrity_check` / `foreign_key_check` | — | **ok** / 0 dòng |

Health check: `/login` 200 · `/bidding` và `/projects/groups` 307 về login · `[jobs] scheduler bật`.

⚠ **Vẫn giữ nguyên ghi chú của ba lần deploy trước: production chưa có bảng nào ở chế độ CE theo
dòng** (`ceUnitPrice` 0 dòng · `clientFeePct` 0 mục · `quoteTemplateCode` 0 khách · revision
`origin="IMPORT"` 0). Chuyển đổi là TỰ NGUYỆN — Account bấm nút trên từng bảng khi muốn. **Toàn bộ
CE-5 (diff thấy CE, import sinh version, dòng khách bỏ, chốt 2 mốc) chỉ chạy trên bảng đã chuyển
chế độ**, nên tới khi Account chuyển bảng đầu tiên thì production nhìn y hệt hôm qua.

**BẢN VÁ NGINX ĐÃ CHẠY XONG 06/08/2026 lúc 11:58** (`~/nginx-fix/apply.sh`, chủ dự án chạy bằng
sudo) — kết thúc sự cố 429/502 mở từ 05/08. Hai thay đổi: khối chuyển hướng IP → tên miền (thay
`tcm-crm-test-ip` cũ trỏ cổng 3100 đã chết), và map miễn giới hạn tốc độ cho **GET có `_rsc`**
(Next.js tự tải trước link "Quên mật khẩu?" khi mở trang login, ngưỡng cũ 5r/m làm app tự chặn
chính mình).

Đo sau khi vá: IP nội bộ **và** IP public đều **301** về `app.tcmbtl.com` · tải trước 60/60 login +
40/40 forgot-password **không lần nào bị chặn** · **POST kèm `?_rsc=` VẪN bị chặn** (35/60 ở login,
23/40 ở forgot-password) — tức mẹo thêm `_rsc` không né được giới hạn, đúng như thiết kế.

⚠ **BẪY NGINX ĐÃ CẮN MỘT LẦN — ĐỌC TRƯỚC KHI SỬA `limit_req` LẦN SAU.** nginx **không cho đổi KHOÁ
TÍNH của một vùng `limit_req_zone` đã tồn tại bằng lệnh nạp lại nóng**: nó ghi `[emerg] limit_req
"tcm_login" uses the "$tcm_rl_key" key while previously it used the "$binary_remote_addr" key` rồi
**giữ nguyên cấu hình cũ**. Nguy ở chỗ mọi tín hiệu bên ngoài đều báo THÀNH CÔNG — `nginx -t` ok
(kiểm FILE, không kiểm vùng nhớ tiến trình đang chạy) và systemd ghi "Reloaded" (lệnh gửi tín hiệu
thoát 0). Lần chạy 09:51 vì vậy **im lặng không có tác dụng gì suốt hơn 2 tiếng**, chỉ lộ ra khi thử
bằng request thật. Khởi động lại HẲN thì vùng nhớ dựng mới nên hết xung đột. `apply.sh` nay tự phát
hiện và chuyển sang restart, rồi **tự gõ một request thật để chứng minh cấu hình mới đã sống** thay
vì tin systemctl. **Đừng bao giờ kết luận "nginx đã nạp cấu hình mới" từ `nginx -t` + `systemctl`.**
(Các lần nạp lại nóng SAU này không còn vướng, vì cấu hình đang chạy đã dùng khoá mới.)

Ghi chú: `ps` trên server còn một tiến trình `nginx` khác — đó là nginx **bên trong container Docker
`mikopbx`** (tổng đài), không gian mạng riêng, không liên quan web server. Đừng "dọn".

---

### Deploy trước đó — 05/08/2026 lúc 18:41

**Production khi đó chạy `6eff5b3`** — CE-4 đọc file khách trả về; kế hoạch CO/CE v3 ban đầu hoàn
tất cả 4 đợt, xem mục 10.26 → 10.29. Chạy `bash scripts/deploy.sh` **đường LAN 192.168.1.111:22**,
fingerprint khớp. **Không migration mới, không mã quyền mới.** Backup TRƯỚC deploy:
`~/backup/*-20260805-184114*` trên server + `D:/TCM/backup-prod-20260805-184114/` máy dev.

Đối chiếu production sau deploy — **không đổi một dòng dữ liệu nào**:

| | production sau |
|---|---|
| nhân sự / khách / dự án | **36 / 68 / 25** |
| coTotal + ceTotal 5 bảng CO/CE | **không đổi một đồng** |
| dòng grant quyền / dòng CO/CE | **1296 / 483** |
| revision `origin="IMPORT"` | **0** — chưa ai import, đúng như mong đợi |
| `integrity_check` / `foreign_key_check` | **ok** / 0 dòng |

Health check: `/login` 200 · `/projects/*/co-ce` 307 về login · `[jobs] scheduler bật`.

---

### Deploy trước đó — 05/08/2026 lúc 18:22

**Production khi đó chạy `6f4c1aa`** — CE-2 builder một màn hình + CE-3 bộ xuất
báo giá, xem mục 10.27 và 10.28. Chạy `bash scripts/deploy.sh` **đường LAN 192.168.1.111:22**,
fingerprint khớp. **Không có migration mới** (64 migration, "No pending migrations to apply") và
**không có mã quyền mới**. Backup TRƯỚC deploy ở hai nơi: `~/backup/*-20260805-182206*` trên server
và `D:/TCM/backup-prod-20260805-182206/` trên máy dev.

Đối chiếu production SAU deploy — **không đổi một dòng dữ liệu nào**, đúng như mong đợi với một
đợt thuần giao diện + bộ xuất:

| | trước | production sau |
|---|---|---|
| nhân sự / khách / dự án | 36 / 68 / 25 | **36 / 68 / 25** |
| coTotal + ceTotal 5 bảng CO/CE | (10 số) | **không đổi MỘT ĐỒNG** |
| dòng grant quyền | 1296 | **1296 — không đổi** |
| dòng CO/CE | 483 | **483** |
| payCap vs netAmount | 375/375 bằng nhau | **375/375** |
| `integrity_check` / `foreign_key_check` | — | **ok** / 0 dòng |

⚠ **Production chưa có bảng nào ở chế độ CE THEO DÒNG** (`ceUnitPrice` 0 dòng · `clientFeePct` 0
mục · `quoteTemplateCode` 0 khách) — ĐÚNG THIẾT KẾ: chuyển đổi là TỰ NGUYỆN (Q2), Account bấm nút
"Chuyển sang CE theo dòng" trên từng bảng khi muốn. Mọi bảng hiện hành vẫn chạy đường BM02 cũ y
nguyên. Các số CE ở mục 10.27/10.28 đo trên dev.db sandbox.

Health check: `/login` 200 · `/clients` và `/projects/*/co-ce` 307 về login · hai route xuất
(`?mode=client` và `&layout=multi`) trả **401** khi chưa đăng nhập · `[jobs] scheduler bật`.

---

### Deploy trước đó — 05/08/2026 lúc 16:36

**Production khi đó chạy `0121032`** — CE-1 nền số liệu CO/CE v3, xem mục 10.26.
Chạy `bash scripts/deploy.sh` **đường LAN 192.168.1.111:22**, fingerprint khớp. 1 migration mới áp
sạch (`coce_v3_ce1`, 10 cột + backfill payCap). Backup TRƯỚC deploy ở hai nơi: `~/backup/*-20260805-163318*`
trên server và `D:/TCM/backup-prod-20260805-163318/` trên máy dev.

Đối chiếu production SAU deploy với backup TRƯỚC deploy — khớp tuyệt đối:

| | trước | production sau |
|---|---|---|
| nhân sự / khách / dự án | 36 / 68 / 25 | **36 / 68 / 25** |
| coTotal 5 bảng CO/CE | (5 số) | **không đổi MỘT ĐỒNG** |
| dòng grant quyền | 1278 | **1296** (+18 = 2 mã CE-1: view_cost 6 vai · view_paycap 12 vai) |
| payCap vs netAmount | — | **375/375 dòng bằng nhau** (chưa dòng nào chọn % VAT — đúng Q4) |
| `integrity_check` / `foreign_key_check` | — | **ok** / 0 dòng |

Đủ 2 marker `20260805_coce_view_*`. Health check: `/login` 200 · `[jobs] scheduler bật`.
(Ghi chú: dev.db sandbox có T002 coTotal 18,9tr khác production 80tr — dữ liệu mẫu hai bên đã lệch
từ 28/07, không phải do deploy.)

---

### Deploy trước đó — 05/08/2026 lúc 11:19

**Production khi đó chạy `c41cc6c`** — PLN-1 Trưởng team + Planning theo team +
luồng mượn người, xem mục 10.25. Chạy `bash scripts/deploy.sh` **đường LAN 192.168.1.111:22**,
fingerprint khớp. 2 migration mới áp sạch (`team_lead`, `planning_loan_request`), không mã quyền mới
(grant giữ 1278). Backup TRƯỚC deploy ở hai nơi: `~/backup/` trên server và
`D:/TCM/backup-prod-20260805-111951/` trên máy dev. Health check: `/login` 200 · `[jobs] scheduler
bật` · không file mồ côi.

⚠ **Nginx production có 2 lỗi cấu hình đã chẩn đoán sáng 05/08 (nguyên nhân app "không mở được")**,
bản vá đã đặt sẵn ở `~/nginx-fix/` trên server (map miễn rate-limit cho GET prefetch `?_rsc=` — POST
vẫn bị giới hạn; gỡ proxy mồ côi trỏ cổng 3100 của `tcm-crm-test` cũ; redirect IP → domain). **Chủ dự
án phải tự chạy** (cần sudo): `ssh -i ~/.ssh/tcm_deploy tcm@192.168.1.111 -t 'sudo bash ~/nginx-fix/apply.sh'`
— script tự kiểm `nginx -t` và tự khôi phục nếu hỏng. Chưa chạy thì thi thoảng vẫn tái diễn 429/timeout.

---

### Deploy trước đó — 04/08/2026 lúc 18:32

**Production khi đó chạy `b276b4e`** — DASH-1 thiết kế lại Dashboard, xem mục 10.24.
Chạy `bash scripts/deploy.sh` **đường LAN 192.168.1.111:22**, fingerprint khớp. **Không có migration
mới** (61 migration, "No pending migrations to apply") và **không có mã quyền mới**. Backup TRƯỚC
deploy ở hai nơi: `~/backup/*-20260804-183222*` trên server và `D:/TCM/backup-prod-20260804-183222/`
trên máy dev.

Đối chiếu production SAU deploy — **không đổi một dòng nào**, đúng như mong đợi với một thay đổi
thuần giao diện:

| | trước | production sau |
|---|---|---|
| nhân sự / khách / dự án | 36 / 68 / 25 | **36 / 68 / 25** |
| CO/CE sheet / dòng | 5 / 483 | **5 / 483** |
| overhead khoản / lần chi | 50 / 167 | **50 / 167** |
| dòng grant quyền | 1278 | **1278 — không đổi** |
| `integrity_check` | — | **ok**, `foreign_key_check` 0 dòng |

Health check: `/login` 200 · `/`, `/finance/debt`, `/reminders`, `/bidding` đều 307 về login khi chưa
đăng nhập · pm2 `online`, **restart 0**, `[jobs] scheduler bật`. ⚠ **Error log KHÔNG thêm dòng nào** —
lần ghi cuối là `2026-08-01 20:24`, tức 3 ngày TRƯỚC lần deploy này; mấy dòng
`Failed to find Server Action` trong đó là rác cũ, không phải do bản này.

---

### Deploy trước đó — 04/08/2026 lúc 15:57

**Production khi đó chạy `08247f9`** — MKT-1, xem mục 10.23. Chạy
`bash scripts/deploy.sh` **đường LAN 192.168.1.111:22**, fingerprint khớp. 1 migration mới áp sạch
(`mkt_posts`, 5 bảng). Backup TRƯỚC deploy ở hai nơi: `~/backup/*-20260804-155711*` trên server và
`D:/TCM/backup-prod-20260804-155711/` trên máy dev.

⚠ **Sáng 04/08 đường ngoài cổng 2222 TIMEOUT hai lần** (app vẫn chạy bình thường qua nginx, chỉ SSH
không vào được); chiều cùng ngày đường LAN vào tốt và `deploy.sh` tự chọn đúng. Nếu lần sau cả hai
đường đều tắc thì nhờ IT kiểm NAT cổng 2222 trên router — không phải lỗi server.

| | trước | production sau |
|---|---|---|
| nhân sự / khách / dự án | 36 / 68 / 25 | **36 / 68 / 25** |
| CO/CE sheet / dòng | 5 / 483 | **5 / 483** |
| overhead khoản / lần chi | 50 / 167 | **50 / 167** |
| dòng grant quyền | 1245 | **1278** (+33 = 5 mã MKT) |
| `integrity_check` | — | **ok**, `foreign_key_check` 0 dòng |

Quyền MKT đo trên production **giống hệt** bản dựng-từ-đầu: view 20 · post.manage 4 · review 3 ·
frames.manage 3 · generate 3. Đủ 5 marker `20260804_mkt_*`, OptionSet `mkt_content_type` 6 item.
Health check: `/login` 200 · `/mkt`, `/mkt/new`, `/mkt/insights` đều 307 về login · `/api/mkt-image/x`
**401**. Bảng MKT trống (0 bài, 0 báo cáo) — đúng, chưa ai nhập.

⚠ **Việc cần làm trước khi dùng thật:** Creative dựng ~5 frame/kênh, để lên Drive rồi dán 2 link vào
card "Thư mục frame ảnh" trên `/mkt` (đang trống). Danh mục loại nội dung sửa ở
`/settings/options/mkt_content_type`.

---

### Deploy trước đó — 04/08/2026 lúc 09:18

**Production khi đó chạy `205f740`** — LOF-V1 + V1b, xem mục 10.22. Chạy
`bash scripts/deploy.sh` đường ngoài cổng 2222, fingerprint khớp. 2 migration mới áp sạch
(`lof_v1_leg_kind_project_group`, `project_group_framework_ce`). Backup TRƯỚC deploy:
`backup-prod-20260804-091825`; backup TRƯỚC khi ghi dữ liệu: `dev.db.bak-20260804-092118` —
cả hai đều ở hai nơi (server `~/backup/` + máy dev `D:/TCM/`).

**Dữ liệu LOF đã replay lên production đúng kế hoạch ở mục 10.22** (seed tự tạo nhóm; hai việc còn
lại chạy script trên server mirror đúng action của app — `tagRevisionKind` và đường ghi
`saveCostSheet`, script ghi có CHỐT CHẶN tự hủy nếu coTotal lệch bản đã verify trên dev):

| | production sau replay |
|---|---|
| nhân sự / khách / dự án / grant | **36 / 68 / 25 / 1245 — không đổi** |
| CO/CE sheet / dòng | 4 / 327 → **5 / 483** (+T025: 61 section · 156 dòng) |
| T013 | rev1=**CONTRACT** 7.270.970.056 · rev2=**ACCEPTANCE** 7.557.818.278 · rev3 bản sống |
| T025 | rev1=**CONTRACT** · CE **6.710.745.555** · pseudo-CO 6.411.555.554 (khớp hệt dev) |
| nhóm KUN10T | CE khung 13.981.715.611 · Σ phase 14.268.563.833 · **chênh +286.848.222** ✓ |
| `integrity_check` / `foreign_key_check` | **ok** / 0 dòng |

Health check: `/login` 200 · `/projects/groups` 307 về login · `[jobs] scheduler bật`. Không còn
file tạm nào trên server.

---

### Deploy trước đó — 02/08/2026 lúc 13:42

**Production khi đó chạy `a158fa6`** — ISO-1 + OVH-1, xem mục 10.20 và 10.21. Chạy
`bash scripts/deploy.sh` **đường ngoài cổng 2222**, fingerprint khớp. 3 migration mới áp sạch
(`project_iso_docs`, `overhead_costs`, `overhead_spend_note`). Backup TRƯỚC deploy ở HAI nơi:
`~/backup/*-20260802-134201*` trên server và `D:/TCM/backup-prod-20260802-134201/` trên máy dev.

Đối chiếu production SAU deploy — **không mất dòng nào**, và grant khớp tuyệt đối với bản diễn tập
(mô phỏng bằng cách gỡ marker + grant trên bản sao rồi seed lại, đo trước là 1245):

| | trước | production sau |
|---|---|---|
| nhân sự / khách / dự án | 36 / 68 / 25 | **36 / 68 / 25** |
| CO/CE sheet / dòng | 4 / 327 | **4 / 327** |
| dòng grant quyền | 1198 | **1245** (+47 = 10 mã mới của ISO + Overhead) |
| `PRAGMA integrity_check` | — | **ok**, `foreign_key_check` 0 dòng |

7 mã overhead đo được đúng chính sách: view 4 · budget.manage 2 · approve_cfo 1 · approve_ceo 1 ·
spend.record 4 · spend.pay 3 · over_budget 2. Ba mã ISO: view 20 · manage 5 · export 5. Đủ 8 marker
`20260802_iso_*` + `20260802_overhead_*`. Health check: `/login` 200 · `/overhead`, `/overhead/budget`,
`/overhead/spends`, `/iso` đều 307 về login khi chưa đăng nhập · `/api/overhead/export` **401**.

**Ngân sách chi phí văn phòng 2026 ĐÃ NHẬP vào production** (02/08/2026 13:52, theo yêu cầu chủ dự
án). Vì không đăng nhập hộ được nên chạy bằng script trên server gọi **đúng đường code của app**
(`parseOverheadExcel` → `saveAiFile` → `importBudget`) rồi ghi `AuditLog` như `confirmBudgetImport` —
KHÔNG viết lại logic, vì script viết lại chỉ chứng minh script đúng. Checksum file trên server khớp
md5 bản gốc trước khi chạy. Backup ngay trước khi ghi: `~/backup/dev.db.bak-20260802-135050` +
`D:/TCM/backup-prod-20260802-135050/`.

Đọc lại bằng chính `loadOverheadReport` của app trên production — **khớp tuyệt đối bản đo trên máy dev**:

| | production |
|---|---|
| bản ngân sách | 1 · trạng thái **LOCKED** · người đứng tên NGUYỄN VĂN HOÀNG |
| khoản / lần chi / ô tháng | **50 · 167 · 600** |
| ngân sách năm | **16.248.791.769đ** |
| đã chi (PAID) / còn lại | **8.666.620.418đ** / **7.582.171.351đ** |
| khoản vượt | **3** — TCM26-12 −12.723.662 · TCM26-13 −3.908.000 · TCM26-30 −22.917.862 |
| khoản nguồn PAYROLL | TCM26-20 / 21 / 22 |

`integrity_check` ok · `foreign_key_check` 0 dòng · 36 nhân sự / 68 khách / 25 dự án / 4 CO-CE
không đổi. File Excel gốc lưu ở `storage` (`sourceFileKey`) để về sau còn đối chiếu.

⚠ **`ProjectIsoDoc` vẫn 0 dòng** — đúng thiết kế: sổ ISO chỉ điền dần theo dự án MỚI, không backfill
63 dự án cũ (mục 10.20).

⚠ **Script chạy tay trên server phải là `.mts`, không phải `.ts`.** Repo không khai `type: module`
nên tsx dịch `.ts` sang CJS và `await` ở cấp cao nhất là lỗi biên dịch — mà bản vá `server-only`
buộc phải dùng dynamic import (import tĩnh bị nâng lên chạy trước bản vá). Kèm theo: shell không
đăng nhập KHÔNG có `node` trong PATH, phải
`export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`; server cũng **không có `sqlite3` lẫn
`curl`** — kiểm DB bằng `PRAGMA` qua Prisma, kiểm HTTP bằng `curl` từ máy dev.

---

### Deploy trước đó — 01/08/2026 lúc 22:28

**Production khi đó chạy `ee37e20`.** Ba lần deploy trong ngày: `8536dd8` (Planning
giải thể + xoá team A2, mục 10.18/10.19) → `29e979a` (chốt cứng dd/mm/yyyy) → `ee37e20` (chuẩn bị bật
Cloudflare Tunnel). Cả ba chạy `bash scripts/deploy.sh` **đường ngoài cổng 2222**, fingerprint khớp.
1 migration mới trong ngày (`20260803000000_staff_is_planning_staff`).

⚠ **Từ 22:31 ngày 01/08, app KHÔNG còn lắng nghe trên LAN.** Đã đổi sang `npm run start:server`
(bind `127.0.0.1:3000`) + thêm `AUTH_COOKIE_SECURE="true"` vào `.env` — chi tiết và lý do ở mục 8.2.
Đo sau khi đổi: `https://app.tcmbtl.com/login` → 200 · `http://127.0.0.1:3000` → 200 (nginx dùng) ·
`http://192.168.1.111:3000` → **ECONNREFUSED** (đúng như mong đợi). Backup `.env` và `start-tcm.sh`
trước khi sửa nằm ở `~/backup/*.bak-20260801-2231*`.
**CHƯA KIỂM ĐƯỢC:** máy trong LAN công ty có mở được `https://app.tcmbtl.com` không — tên miền phân
giải ra IP PUBLIC `115.79.195.150`, nên cần router hỗ trợ NAT hairpin, hoặc phải thêm bản ghi DNS nội
bộ trỏ `app.tcmbtl.com` → `192.168.1.111`. Máy dev không nằm trong LAN đó nên không thử hộ được.

**Số đo sau deploy `8536dd8`:**

Đối chiếu production SAU deploy — khớp tuyệt đối với bản diễn tập trên bản sao trước đó:

| | trước | production sau |
|---|---|---|
| nhân sự | 42 | **36** (xoá 5 team A2 + 1 Planning) |
| khách / dự án | 68 / 25 | **68 / 25 — không mất dòng nào** |
| A1 | tắt, 0 người | **bật, 2 người · 48 khách · 17 dự án** |
| A2 | 7 người · 48 khách · 17 dự án | **0 / 0 / 0** |
| A3 | 6 người · 17 khách · 7 dự án | không đổi |
| phòng Planning | 1 người, có lead | **0 người, lead trống, VẪN active, costPrefix PLA còn nguyên** |
| dự án mất PIC | 21 | **21 — không tăng** |
| dòng grant quyền | 1198 | **1198 — không đổi** |

Hai marker ghi đúng số: `20260801_a2_offboard` = `{deleted:5, snapshots:5, movedClients:48,
movedProjects:17}` · `20260801_planning_dissolved` = `{removed:1}`. Đủ **6 ảnh chụp offboard** trong
`AuditLog`; cả 6 người đo được **0 ca làm, 0 điểm KPI** nên không mất gì ngoài phần đã lường trước
(riêng Trâm Anh có 2 tạm ứng đã chụp lại). `PRAGMA integrity_check` = `ok`, `foreign_key_check` 0
dòng. Health check `/login` 200, `[jobs] scheduler bật` xuất hiện sau restart.

Backup TRƯỚC deploy giữ ở HAI nơi: `~/backup/` trên server và
`D:/TCM/backup-prod-20260801-124359/` trên máy dev (`dev.db` 2,36MB + `app.tar.gz`).

⚠ **Script `deploy.sh` LỌC BỚT output của `db:seed`** — chỉ in dòng "✅ Seed hoàn tất", nuốt mất các
dòng log của từng vòng one-shot. Đừng đọc log deploy để kết luận vòng nào đã chạy; kiểm thẳng bảng
`setting` module `seed` trên production (cách làm ở mục 10.17).

⚠ **`ssh` tay phải chỉ rõ key**: `ssh -p 2222 -i ~/.ssh/tcm_deploy tcm@115.79.195.150`. Không có
`-i` là rơi vào hỏi mật khẩu. Và script node chạy trên server **phải nằm trong `~/tcm-crm`** mới
resolve được `@prisma/client`; để ở `/tmp` là `MODULE_NOT_FOUND`.

---

### Deploy trước đó — 30/07/2026 lúc 11:15

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
