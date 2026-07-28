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
| ① | Khách hàng | `/clients` | Xong (có import Excel thật + báo cáo chăm sóc) |
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

**Quy mô:** 80 model Prisma · 33 migration · 47 file `src/lib` · 2253 key i18n × 2 ngôn ngữ · ~85 route.

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

Quy trình đã dùng: **backup DB production → đồng bộ code (tar over ssh) → `prisma migrate deploy` → `npm run build` → `pm2 restart`**.

- **Bộ hẹn giờ nhắc việc chạy TRONG tiến trình Next** (`src/instrumentation.ts`, chu kỳ 5 phút) — `pm2 restart` là đủ, KHÔNG cần cron của OS. Sau khi restart, kiểm `pm2 logs` phải thấy dòng `[jobs] scheduler bật`.
- ⚠ **Server phải đặt `TZ=Asia/Ho_Chi_Minh`** (hoặc set trong env của pm2): mốc giờ 8/9/10h của `src/lib/occasions.ts` đọc bằng `now.getHours()` = giờ local của tiến trình, sai TZ là lệch 7 tiếng.

⚠️ **Chỉ deploy khi ở trong mạng LAN công ty.** Cổng 22 ở IP public (115.79.195.150) trả về host key **khác** với server đã biết → không phải máy chủ CRM, không được đẩy dữ liệu vào đó.

- Fingerprint server thật (192.168.1.111, ED25519): `SHA256:EWU4YXJM5NoE01QTVwLnXV2ao1Q1TG7fwvabxf39CfU`
- Luôn **backup DB production trước** mọi thao tác ghi đè.

---

## 9. Lịch sử thiết kế — đọc khi cần hiểu "vì sao lại làm thế này"

`docs/PLAN-HISTORY.md` (~300KB) chứa toàn bộ blueprint + kế hoạch từng batch, kèm **lý do** của mỗi quyết định kiến trúc, các phương án đã cân nhắc và bị loại, ràng buộc nghiệp vụ đã chốt với BoD.

Trước khi sửa một module lạ, tìm phần tương ứng trong file này — phần lớn câu hỏi "tại sao không làm cách đơn giản hơn?" đã có câu trả lời sẵn.

---

## 10. Hạn chế đã biết / nợ kỹ thuật (cố ý, không phải bug)

1. **RBAC đã chặn thật toàn app bằng ma trận quyền.** Không còn là "nominal".
   - **danh mục 109 quyền nằm ở CODE** (`src/lib/permission-catalog.ts`), **grant nằm ở DB** (bảng `role_permission`), sửa ở `/settings/roles` tab **"Ma trận quyền"**. Danh mục để ở code vì mỗi mã phải có một chỗ `requirePermission()` tương ứng — thêm dòng vào DB sẽ tạo quyền không ai kiểm.
     Ngoại lệ (kiểm bằng `hasPermission()` **bên trong** action đã có `requirePermission` khác ở đầu — đừng đi tìm `requirePermission` tương ứng): `finance.vendor_payment.over_cap` trong `createVendorPayment` VÀ trong `createCtvBatchPayments` (đề xuất thanh toán đợt CTV, operations/actions.ts); `finance.invoice.over_cap` trong `createClientInvoice` (trần mềm theo CO/CE sống — cửa Nghiệm thu vẫn trần cứng).
   - **~290 điểm chặn**: ~206 server action + 72 page + 8 route API (27/07 đợt 3+4: PO 4 action + kế hoạch thu 2 + NCC 2 + trang P&L/Vendors; 27–28/07 Kho v2: 2 action + 1 trang danh mục cây, rồi 7 action đề xuất + 3 trang `/inventory/requests`). Biên bản nghiệm thu làm NGOÀI hệ thống bằng Word (quyết định chủ dự án 27/07) — flow trong app dừng ở "Chuyển sang Nghiệm thu" (Account) → kế toán xuất hóa đơn; bản in-app cũ nằm ở commit eb76699 nếu cần khôi phục. Guard là `requirePermission("<mã>")` ở **câu lệnh đầu tiên** của mỗi page/action; route API dùng `hasPermission()` rồi trả 403.
   - **Role `ADMIN` là sàn cứng trong code** — luôn đủ 109 quyền, không có dòng grant nào trong DB. Cố ý, để không ai tự khoá mình ra khỏi chính trang sửa ma trận.
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

---

## 11. Trạng thái ngay tại thời điểm bàn giao

**Vừa xong (đã verify sạch, chưa deploy):**
- CO/CE hỗ trợ dòng âm tiền + thuế "Khác (nhập tay)" — migration `20260725010528_costline_custom_tax_amount`.

**Dữ liệu thật đã nhập trong `prisma/dev.db` (chỉ có ở local, chưa lên production):**
- CO/CE báo giá AMHL: T005 (Christmas Decor), T006 (Black Friday, có khối Chi hộ quà tặng)
- CO/CE nghiệm thu KUN: T013 "Phase 1: 5 tỉnh" — 3 revision (HĐ → Nghiệm thu → CO thật), CO 5,39 tỷ
- Master Timeline: T013 (5 tỉnh đầu, 64 dòng) và T025 "Phase 2: 5 tỉnh tiếp theo" (5 tỉnh cuối, 65 dòng)

**Đang chờ:** deploy lên server (chờ vào văn phòng dùng LAN). Chủ dự án đã chọn phương án **đè `dev.db` lên production** — nhớ backup DB production trước và báo lại số bản ghi chênh lệch trước khi ghi đè.

**Việc lớn còn lại theo thứ tự ưu tiên gợi ý:** RBAC thật → module ⑦ Lương → CO/CE Phase 2 (CE theo dòng).
