# BÀN GIAO — TCM CREATIVE (bản mini)

> Cập nhật: 07/08/2026. Nhánh `creative-mini`. Dành cho người tiếp nhận code + trợ lý AI làm tiếp.
> **Đọc hết mục 1 trước khi gõ bất cứ lệnh nào.**
>
> Tài liệu của bản TCM ĐẦY ĐỦ nằm ở `docs/HANDOVER-TCM-FULL.md` (giữ nguyên để tra cứu, **không
> mô tả codebase này**). Phần lớn nội dung trong đó nói về module đã bị cắt khỏi bản mini — đọc
> nhầm sẽ đi tìm file không tồn tại.

---

## 1. ⚠ BA CÁI BẪY PHẢI BIẾT TRƯỚC

### 1.1 TUYỆT ĐỐI KHÔNG chạy `scripts/deploy.sh` từ nhánh này

Script đó kế thừa nguyên xi từ bản TCM đầy đủ và **không hề biết mình đang ở bản mini**. Nó ssh vào
**server công ty thật** (`192.168.1.111`, hoặc `115.79.195.150:2222`), đồng bộ code vào `~/tcm-crm`,
build, rồi `pm2 restart tcm-crm` — tức **đè bản mini lên CRM production đang phục vụ 36 người**.
Script có chừa `dev.db` / `.env` / `storage`, nhưng code và migration là của bản mini (2 migration,
19 model, 17 mã quyền) trong khi production đang chạy 68 migration / 113 model / 138 mã quyền — kết
quả là app production hỏng, không phải "mất dữ liệu" mà là **không còn ứng dụng để mở dữ liệu ra**.

**Bản mini CHƯA CÓ đích deploy nào. Chỉ chạy local.**

Cùng loại rác kế thừa, cũng đừng dùng: `scripts/1-CAP-NHAT-CRM.bat`, `scripts/2-CHAY-CRM.bat` (gọi
`npm run start:lan` → mở cổng 3000 ra toàn LAN, in ra chữ "TCM CRM" nhưng phục vụ bản mini),
`scripts/3-SAO-LUU-DU-LIEU.bat`, `scripts/build-ctv-template.js`, `templates/`.

### 1.2 Đây là git WORKTREE, không phải bản clone riêng

`.git` ở đây là một FILE trỏ về `D:/TCM/TCM_AI_CRM/TCM_CRM/.git/worktrees/TCM_CRM_creative`. Hệ quả:

- Commit ở đây hiện luôn trong repo chính — **cùng một kho, hai thư mục làm việc**.
- Không checkout được `creative-mini` ở cây `TCM_CRM` (git chặn: một nhánh chỉ được một worktree).
- Xoá thư mục này bằng tay là để lại worktree mồ côi; muốn bỏ thì `git worktree remove`.

### 1.3 DB riêng — `prisma/creative.db`, đừng trỏ chéo

`DATABASE_URL` trong `.env` phải trỏ `file:./creative.db`. **Đừng trỏ sang `dev.db` của bản đầy đủ**
(và ngược lại): hai bên có bảng `_prisma_migrations` khác hẳn nhau, `migrate deploy` sẽ báo drift và
mọi thao tác sửa schema sau đó đều là mò trên dữ liệu thật.

`.gitignore` loại `/prisma/*.db` theo MẪU chứ không liệt kê từng tên — đặt tên CSDL mới cũng tự
được loại. (Dòng cũ chỉ loại đúng `dev.db` và `creative.db` suýt bị commit.)

---

## 2. Bản mini này là gì

Cắt bản TCM đầy đủ (nền tảng vận hành nội bộ cho agency event & activation) xuống còn **KHUNG NỀN
TẢNG + MODULE CREATIVE**, chạy độc lập được, không phụ thuộc module nào đã cắt.

**Giữ lại:** đăng nhập & đổi mật khẩu · phân quyền theo ma trận · nhân sự & phòng ban · danh mục
dùng chung (OptionSet) · thông báo · nhắc việc · act-as · i18n vi/en · hồ sơ cá nhân · toàn bộ
module Creative (nhận việc → điều phối → giao người → nộp → duyệt → chi phí theo giờ).

**Đã cắt:** khách hàng, bidding & CO/CE, quản lý dự án, tài chính & công nợ, kho, chấm công, KPI,
lương, chat, trợ lý AI, ISO, chi phí văn phòng, MKT, tuyển dụng, org chart, KB.

| | bản TCM đầy đủ | bản mini |
|---|---|---|
| model Prisma | 113 | **19** |
| migration | 68 | **2** |
| mã quyền | 138 | **17** |
| nhóm quyền (role) | 21 | **4** |
| mục nav | 17 | **1** (Creative) + Cài đặt |
| file `src/lib` | 90 | **17** |
| file trong `src` | 458 | **101** |
| trang (`page.tsx`) | 113 | **20** (→ 24 route sau build) |
| CSDL | `prisma/dev.db` | `prisma/creative.db` |
| cổng dev | 3000 | **3100** |

*(Cột "bản đầy đủ" đo thẳng trên nhánh `master` ngày 07/08/2026, không chép lại từ tài liệu cũ —
`docs/HANDOVER-TCM-FULL.md` ghi 76 file `src/lib` là con số đã lỗi thời.)*

---

## 3. Chạy trong 5 phút

```bash
npm install
# .env đã có sẵn trong thư mục làm việc này; nếu dựng máy mới thì xin riêng (không commit)
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run dev            # http://localhost:3100
```

Seed **idempotent** — chạy lại không nhân bản dữ liệu, và **không đè** ma trận quyền đã chỉnh tay
(chỉ cấp cho role chưa có dòng grant nào). Muốn làm lại sạch: `npx prisma migrate reset --force`
rồi `npm run db:seed`.

**Sáu tài khoản mẫu** (mật khẩu chung ở `prisma/seed.ts`, hằng `DEFAULT_PASSWORD`; cả sáu đều
`mustChangePassword: true` nên bị bắt đổi ngay lần đầu):

| Đăng nhập | Người | Nhóm quyền | Dùng để thử |
|---|---|---|---|
| `admin` | QUẢN TRỊ HỆ THỐNG | ADMIN | mọi thứ, kể cả act-as |
| `cd` | NGUYỄN MINH KHANG | CREATIVE_DIRECTOR | điều phối, giao việc, duyệt, chi phí |
| `art` | TRẦN THU HÀ | CREATIVE_STAFF | trưởng team Graphic 2D — giao người trong team |
| `3d` | LÊ QUỐC BẢO | CREATIVE_STAFF | trưởng team Multimedia |
| `2d` | PHẠM NGỌC LAN | CREATIVE_STAFF | designer thuần — chỉ làm và nộp bài |
| `account` | VŨ ĐÌNH NAM | REQUESTER | người đặt việc — gửi yêu cầu, nhận thành phẩm |

Gõ tên ngắn là đủ: `normalizeLoginId()` tự ghép thành `<tên>@tcm.local`. Ô đăng nhập là
`type="text"` (để `type="email"` thì trình duyệt chặn tên không có `@`).

⚠ **"Quên mật khẩu" KHÔNG dùng được với các tài khoản mẫu** — `isMailableDomain()` chỉ chấp nhận
`@tcmbtl.com`, mà tài khoản mini đều là `@tcm.local` (không có hộp thư thật). Và `.env` cũng chưa
khai `SMTP_*` nên không gửi được thư. Quên mật khẩu thì admin cấp lại ở `/settings/staff`.

---

## 4. Quy ước BẮT BUỘC

Kế thừa từ bản TCM và **vẫn áp dụng nguyên vẹn** ở đây. Vi phạm sẽ tạo vùng code lệch chuẩn.

### 4.1 Kiến trúc
- **Hàm thuần tách khỏi IO.** Công thức nghiệp vụ nằm ở `src/lib/*.ts`, nhận/trả số thuần, **không**
  gọi Prisma. Server Action nạp dữ liệu → gọi hàm thuần → ghi DB. Mẫu chuẩn: `computeCreativeCost`
  trong `lib/creative-cost.ts`, `taskOverdueDays` / `taskPhase` trong `lib/creative.ts` + `lib/projects.ts`.
- **Không tin số từ client** — server luôn tính lại từ payload thô.
- **Tiền = `BigInt` (VND) trong DB**, `Number` khi tính, ép ở biên. Không dùng float cho tiền.
- **Enum "mềm" đi qua `OptionSet`/`OptionItem`** để admin tự sửa trong Cài đặt (loại việc Creative,
  trạng thái công việc…). Chỉ hard-code khi state machine phụ thuộc — khi đó `code` cố định, nhãn
  lấy từ DB qua `pickLabel`.
- **SQLite single-writer:** giữ transaction ngắn, **fan-out notification SAU commit** (xem
  `spawnTasksForCreativeRequest`).

### 4.2 i18n — luật cứng
Mọi chuỗi hiển thị đi qua `next-intl`. **`messages/vi.json` và `messages/en.json` phải khớp key
tuyệt đối** (hiện **3774 key mỗi bên**). Kiểm trước mỗi lần giao việc:

```bash
node -e "const vi=require('./messages/vi.json'),en=require('./messages/en.json');function f(o,p=''){let k=[];for(const x in o){const q=p?p+'.'+x:x;if(o[x]&&typeof o[x]==='object')k=k.concat(f(o[x],q));else k.push(q)}return k}const V=new Set(f(vi)),E=new Set(f(en));console.log('only vi:',[...V].filter(k=>!E.has(k)).length,'only en:',[...E].filter(k=>!V.has(k)).length)"
```

Kết quả phải là `only vi: 0 only en: 0`.

⚠ Script này **chỉ kiểm key khớp nhau**. Nó KHÔNG bắt được: chuỗi hardcode trong JSX, key ghép lúc
chạy (`t(\`group${code}\`)` — thiếu key là trang ném MISSING_MESSAGE lúc mở), hay bản "dịch" en vẫn
còn tiếng Việt.

### 4.3 Ngày tháng — chỗ dễ sai nhất
- **Cột NGÀY nghiệp vụ theo quy ước UTC-midnight**: `dateOrNull()` parse `"YYYY-MM-DD"` → UTC.
  Viết script nhập liệu phải dựng bằng `Date.UTC(y, m, d)`; dùng `new Date(y, m, d)` sẽ lệch đúng
  7 tiếng (Asia/Saigon) → hiển thị lùi 1 ngày.
- **Mốc THỜI ĐIỂM THẬT** (`createdAt`, `submittedAt`, `deliveredAt`, `deadlineReminderSentAt`) thì
  ngược lại — so sánh với "bây giờ" phải dùng giờ ĐỊA PHƯƠNG. Trộn hai quy ước là nguồn của lớp lỗi
  "lệch đúng 1 ngày trong khung 0–7h sáng" mà bản TCM đã phải vá hai lần.
- Máy chạy app phải đặt `TZ=Asia/Ho_Chi_Minh`.

### 4.4 Số và ngày CHỐT CỨNG `vi-VN` — cố ý, đừng "sửa"
`NUMBER_LOCALE` / `DATE_LOCALE` ở `lib/utils.ts` là hằng, **không đọc ngôn ngữ giao diện**. Ngày
LUÔN `dd/mm/yyyy`, số luôn `1.234,5`, ở cả hai ngôn ngữ. Lý do: app từng chạy theo locale, xem bằng
tiếng Anh ra `MM/DD/YYYY` ⇒ hai người mở cùng một hạn công việc đọc ra hai ngày khác nhau. Ô NHẬP
theo cùng chuẩn (`DateField` mask `dd/mm/yyyy`). Muốn đổi thì phải đổi **đồng thời hiển thị VÀ ô
nhập**, không thì gõ `1,234.5` vào ô rồi lưu xong hiện `1.234,5` trong cùng một form.

### 4.5 UI
- Dùng lại component có sẵn trong `src/components/ui`: `DateField`, `NumberField`,
  `SearchableSelect`, `StaffAvatar`, `Badge`.
- Bảng nhiều dòng: wrapper `overflow-x-auto overflow-y-auto max-h-[70vh]` + header `sticky top-0`.
  Mobile: card `sm:hidden` song song với bảng desktop; **body không bao giờ cuộn ngang**.
- ⚠ **Drawer/dialog `position: fixed` không được nằm trong phần tử có `backdrop-blur` / `transform`
  / `filter`** — sẽ bị nhốt trong khung cha (đã từng làm vỡ menu mobile toàn app).
- ⚠ **Ô CHỮ trong form gọi server action phải là CONTROLLED.** React 19 gọi `requestFormReset` sau
  MỌI lần chạy action, **kể cả khi action trả lỗi** — để `defaultValue` là thứ người dùng vừa gõ bị
  trả về giá trị cũ ngay khi bị chặn vì thiếu một trường khác.
- ⚠ **Component giữ giá trị trong `useState` khởi tạo từ prop (`DateField`, trình soạn thảo) KHÔNG
  chạy lại khi prop đổi** — muốn ép dựng lại thì truyền `key`. Thiếu bước này là màn hình hiện dữ
  liệu cũ trong khi DB đã có dữ liệu mới, người dùng bấm Lưu là ghi đè ngược.
- ⚠ **Đừng gộp lỗi của nhiều `useActionState` bằng `??`** — mỗi hook giữ lỗi riêng và không tự xoá
  cho nhau, lỗi CŨ của thao tác này sẽ che lỗi MỚI của thao tác kia.

### 4.6 Migration
Dev DB là SQLite. Thêm cột → `npx prisma migrate dev --name <tên>`; migration phải **additive**
(cột nullable hoặc có default).

⚠ **Coi chừng `RedefineTables`**: `prisma migrate diff` rất hay sinh ra "DROP TABLE + dựng lại" cho
bảng nhiều khoá ngoại (`staff` là chỗ hay dính nhất). Gặp thì **viết tay `ALTER TABLE ... ADD COLUMN`**
thay vì dùng bản sinh ra — bản TCM đã phải làm vậy 5 lần.

---

## 5. Bản đồ code

**Route** (24 route sau build):

| Route | Quyền gác | Nội dung |
|---|---|---|
| `/` | — | chuyển thẳng sang `/creative` (cố ý không gác, xem `page.tsx`) |
| `/creative/requests` | `creative.view` | **NHẬN VIỆC** — người đặt việc gửi yêu cầu (⚠ TRANG chỉ đòi `creative.view`; nút gửi mới gác `creative.request.create` trong action) |
| `/creative` | `creative.view` | bảng task: chờ điều phối / đã về team / đang làm / chờ duyệt / đã trả |
| `/creative/my` | `creative.task.submit` | "Việc của tôi" — task đang gán cho mình, trễ hạn nổi lên đầu |
| `/creative/cost` | `creative.cost.view` | chi phí theo giờ, kế hoạch vs thực tế |
| `/settings` | `settings.view` | trang chủ Cài đặt (7 mục con) |
| `/settings/creative` | `settings.creative.manage` | quỹ lương theo vị trí + ma trận phân bổ + chu kỳ |
| `/settings/creative-squads` | `settings.creative.manage` | 3 team nhỏ, trưởng team, phân người |
| `/settings/staff` · `/departments` · `/roles` · `/options/[setCode]` · `/security` | tương ứng | nền tảng |
| `/reminders` | `creative.view` | task quá hạn, đọc lại từ dữ liệu (không phải hộp thông báo) |
| `/login` · `/change-password` · `/forgot-password` · `/reset-password` | — | xác thực |
| `/profile` · `/no-access` | — | cố ý không gác (`/no-access` mà gác là dựng lại vòng lặp 307) |
| `/api/notifications/poll` · `/api/staff-avatar/[id]` | chỉ kiểm ĐĂNG NHẬP → 401 | route API — cố ý không đòi mã quyền: một cái trả thông báo của chính mình, một cái trả ảnh đại diện |

**`src/lib`** (17 file): `prisma` · `auth` · `auth-session` · `password` · `current-staff` ·
`permissions` · `permission-catalog` · `creative` · `creative-cost` · `period` · `projects` ·
`reminders` · `job-runner` · `settings` · `mailer` · `staff-avatar-storage` · `utils`.

**Model** (19): `Department` `Role` `RolePermission` `Staff` `OptionSet` `OptionItem` `AuditLog`
`Notification` `Client` `Setting` `Project` `PasswordResetToken` `CreativeSquad` `CreativeTask`
`CreativeTaskApprover` `CreativeRequest` `CreativeSalaryBudget` `CreativeAllocationRatio`
`PositionSalary`.

⚠ `Client` và `Project` giữ lại vì task Creative **phải neo vào một công việc của một khách**, nhưng
bản mini **không có màn hình quản lý khách/dự án** — dữ liệu đến từ seed. Muốn thêm dự án thật thì
phải viết màn hình đó, hoặc nhập bằng script.

---

## 6. Nghiệp vụ Creative — vòng đời và bất biến

```
YÊU CẦU (người đặt việc)  →  TASK  →  ĐIỀU PHỐI về team  →  GIAO người  →  NỘP  →  DUYỆT  →  ĐÃ TRẢ
   /creative/requests                    (CD)              (CD/trưởng team)  (designer)  (1 hoặc N người)
```

Trạng thái task: `UNASSIGNED → ASSIGNED → SUBMITTED → (REVISION →) DELIVERED`, cộng `CANCELED`.
"Đang làm" = 4 trạng thái đầu (`ACTIVE_TASK_STATUSES`).

### Nhận việc → sinh task (`spawnTasksForCreativeRequest`)
- ⚠ **`CreativeRequest.deadline` là NOT NULL và được CHÉP XUỐNG từng task lúc sinh.** Đây chính là
  chỗ bản TCM để trống, làm bộ nhắc quá hạn thành **code chết suốt nhiều tháng** (đo được 0/5 task
  có hạn). Đừng biến cột này thành nullable.
- **IDEMPOTENT theo `(requestId, sourceItemLabel)`** — gửi lại / bấm hai lần / hai request song song
  đều không nhân đôi task. Ràng buộc `@@unique` ở DB là lưới chống cuối (bắt P2002 rồi bỏ qua).
- 6 hạng mục trên phiếu (`REQUEST_ITEM_LABELS`) gợi ý sẵn team nhỏ qua `SQUAD_CODE_BY_ORDER_LABEL`:
  Key visual / 2D → `GRAPHIC_2D`; 3D / bối cảnh / video → `MULTIMEDIA`; **`OTHER` không map** (CD tự
  quyết, task rơi vào nhóm "chờ điều phối"). ⚠ Mã hạng mục là khoá bất biến — nó vừa là
  `sourceItemLabel` trong DB vừa là khoá tra team; đổi mã là mất dấu task cũ.

### Điều phối (`routeCreativeTask`) — quyền `creative.task.assign`
Chọn team nhỏ + **deadline BẮT BUỘC** (chặn tận gốc cảnh task không hạn). Đổi hạn thì **xoá
`deadlineReminderSentAt`** để được nhắc lại theo hạn mới. Trưởng team nhận notification.

⚠ **KHÔNG có status `ROUTED`** — "đã về team" là THUỘC TÍNH (`squadId`), không phải giai đoạn. Board
tách nhóm bằng dữ liệu. Thêm status mới sẽ vỡ ngay khi CD giao thẳng nhảy cóc.

### Giao người (`assignCreativeTask`)
Hai đường vào: người có `creative.task.assign`, **HOẶC trưởng team nhỏ của chính task đó** —
⚠ kiểm **THEO BẢN GHI** (`squad.leadStaffId === me`), **không có mã quyền riêng**, đừng đi tìm
`requirePermission` tương ứng. Ba chốt chặn phải giữ:
1. assignee phải là Staff **đang hoạt động thuộc phòng CREATIVE**;
2. trưởng team chỉ giao **người trong team mình** cho **task của team mình**;
3. bỏ trống ô hạn thì **GIỮ hạn cũ**, không ghi đè thành null.

### Nộp bài (`submitCreativeTask`) — quyền `creative.task.submit`
Bắt buộc link thành phẩm + số giờ **bội số 0.25**. Task có cờ `cdApprovalNotRequired` thì đi thẳng
`DELIVERED` và báo cho người đặt việc; không thì `SUBMITTED` và báo người phải duyệt.

### Duyệt nhiều bên (`approveCreativeTask` / `rejectCreativeTask`)
- Task **CÓ** danh sách `CreativeTaskApprover`: chỉ người trong danh sách ký được — **dù có mã quyền
  `creative.task.approve` cũng không ký thay được**. Đủ MỌI chữ ký mới `DELIVERED`.
- Task **KHÔNG** có danh sách: đường cũ, một người có `creative.task.approve` bấm là xong. Dữ liệu
  cũ vì thế không đổi hành vi.
- ⚠ **Bất kỳ ai trả lại là XOÁ SẠCH chữ ký đã có** — vòng nộp mới duyệt lại từ đầu, vì chữ ký cũ ký
  cho bản cũ. Giao lại việc cũng dựng lại danh sách từ đầu.

### Khoá task theo vòng đời công việc (`lib/projects.ts`)
Dự án `FINISHED` còn **7 ngày ân hạn** (`FINISHED_GRACE_DAYS`) để Creative lưu file về, sau đó task
bị khoá. ⚠ Khoá là **phép tính thời gian trên `finishedAt`**, không query được bằng Prisma — phải
lọc ở JS sau khi nạp (xem `getCreativeDashboardStats`, `getCreativeOverdueTasks`).

### Nhắc quá hạn — bộ hẹn giờ
`src/instrumentation.ts` chạy `runDueJobs()` mỗi **5 phút** TRONG tiến trình Next (không cần cron
OS); layout render là lưới an toàn. Bản mini chỉ còn **1 job**: `creative-task-deadline`. "Vé chạy"
trong bảng `setting` (module `jobs`) bảo đảm mỗi chu kỳ chỉ một lượt chạy thật dù nhiều instance.
Sau khi khởi động phải thấy log `[jobs] scheduler bật — chu kỳ 5 phút`.

⚠ **Người nhận nhắc BẮT BUỘC gồm trưởng team nhỏ**, không chỉ người làm + người giao: task đã điều
phối nhưng CHƯA giao người thì hai người kia đều null → không gửi cho ai VÀ không set cờ, nên vòng
quét 5 phút lôi lại task đó **vĩnh viễn**.

### Chi phí theo giờ (`/creative/cost`)
- ⚠ **Là PHÂN BỔ quỹ lương theo giờ đã điền, KHÔNG phải tiền đã chi.** Đừng đọc thành chi phí thực.
- Lương theo **VỊ TRÍ**, không theo cá nhân (`positionTitle` free-text khớp `Staff.title`).
- ⚠ **Seed nạp 20.000.000đ/tháng cho mọi vị trí — SỐ MẪU.** Đừng đọc bảng chi phí để ra quyết định
  cho tới khi nhập lương thật ở `/settings/creative`.
- Chu kỳ rà soát (`creative.cost_review_cycle`, mặc định `MONTH`) đổi ở `/settings/creative`.

---

## 7. Phân quyền

- **Danh mục 17 mã ở CODE** (`src/lib/permission-catalog.ts`), **grant ở DB** (bảng
  `role_permission`, sửa ở `/settings/roles` tab "Ma trận quyền"). Danh mục để ở code vì mỗi mã phải
  có một chỗ `requirePermission()` tương ứng — thêm dòng vào DB sẽ tạo quyền không ai kiểm.
- **4 nhóm quyền**: `ADMIN` · `CREATIVE_DIRECTOR` (13 mã) · `CREATIVE_STAFF` (3 mã) · `REQUESTER`
  (3 mã). Grant mặc định khai ở `ROLE_GRANTS` trong `prisma/seed.ts`; seed **chỉ cấp cho role chưa
  có dòng grant nào** nên chỉnh tay trong ma trận không bị đè.
- **`ADMIN` là sàn cứng trong code** (`ALLOWED_ROLE_CODES` ở `lib/permissions.ts`) — luôn đủ 17
  quyền, **không có dòng grant nào trong DB**. Cố ý, để không ai tự khoá mình ra khỏi chính trang
  sửa ma trận. ⚠ Truy vấn "ai có quyền X" mà quên điều này thì admin không bao giờ có tên trong
  kết quả.
- ⚠ **Ba mã META chỉ ADMIN giữ**: `settings.roles.manage` · `settings.permissions.manage` ·
  `settings.security.manage`. Ai có chúng thì **tự cấp lại được mọi quyền khác** — cấp cho vai khác
  là vô hiệu hoá toàn bộ ma trận, âm thầm.
- ⚠ **Guard đặt ở câu lệnh ĐẦU TIÊN của mỗi `page.tsx` và mỗi server action.** Hai route API hiện
  chỉ kiểm ĐÃ ĐĂNG NHẬP (`getCurrentStaffId()` → 401) vì cả hai chỉ trả dữ liệu của chính người gọi
  / ảnh đại diện; route API nào chạm dữ liệu nghiệp vụ thì phải dùng `hasPermission()` rồi trả 403.
  **KHÔNG gate bằng `layout.tsx`** — layout không re-render khi
  điều hướng phía client và không chặn được server action. Ẩn mục khỏi menu (`nav-items.ts`) chỉ là
  trang trí.
- ⚠ **`requirePermission` KHÔNG đá về `/`** mà về trang hạ cánh hợp vai (`SAFE_LANDING`), cuối cùng
  là `/no-access`. Vì `/` chuyển sang `/creative` vốn gác `creative.view`, đá về `/` sẽ tạo **vòng
  lặp 307 vô hạn**. Trang `/no-access` CỐ Ý không gọi `requirePermission` — gác ở đó là dựng lại
  đúng vòng lặp vừa phá.
- **Đặc quyền kiểm THEO BẢN GHI, không có mã quyền** (đừng đi tìm): trưởng team nhỏ giao việc
  (`squad.leadStaffId`), người trong danh sách duyệt ký thành phẩm (`CreativeTaskApprover`).
- **act-as** gác `system.impersonate` xét theo **NGƯỜI ĐĂNG NHẬP THẬT** (`staffHasPermission`), vì
  `getCurrentStaffId()` trả về người bị mạo danh — gác bằng `requirePermission` là chính cánh cửa
  thoát bị khoá.
- ⚠ **Không có kiểm tự động nào đối chiếu "mã trong danh mục ↔ chỗ `requirePermission`".**
  `tsc`/`eslint`/`build` đều SẠCH khi seed cấp nhầm quyền — đây là lỗi dữ liệu, không phải lỗi kiểu.
  Cách duy nhất là dựng DB tạm rồi đếm.

---

## 8. Quy trình verify BẮT BUỘC trước khi coi là xong

```bash
npx tsc --noEmit          # phải sạch
npx eslint src --quiet    # phải sạch
# i18n parity — lệnh ở mục 4.2, phải 0/0
npx next build            # phải sạch, kiểm route list không mất route nào
```

Sau đó verify trên browser thật (`npm run dev`, cổng 3100) với đúng nghiệp vụ vừa sửa, đóng vai
đúng người (act-as). Thay đổi liên quan **tiền / công thức / phân quyền** phải đối chiếu bằng **số
cụ thể** — "trang không báo lỗi" không phải là verify.

⚠ **Repo chưa có test tự động** (cố ý). Đừng tự dựng hạ tầng test khi không được yêu cầu; muốn có
thì đề xuất trước.

⚠ Hai lớp lỗi mà `tsc` + `eslint` **không bắt được**, chỉ `next build` hoặc mở trang mới lộ:
- client component import file có `fs/promises` (`Module not found: Can't resolve 'fs/promises'`) —
  hằng dùng chung với ô upload phải để ở file THUẦN, không để ở file storage;
- `export type { X }` trong file `"use server"` làm **vỡ runtime** (`ReferenceError`); khai
  `export type Foo = {...}` thì không sao.

---

## 9. Deploy

**Chưa có.** Xem mục 1.1 — `scripts/deploy.sh` trỏ vào server của bản TCM đầy đủ và không được
dùng ở đây. Khi nào cần đưa bản mini lên máy chủ thì viết script riêng, đích riêng, DB riêng, tên
pm2 riêng; đừng sửa script cũ tại chỗ (rất dễ còn sót một biến trỏ về production thật).

Nếu vẫn dựng bằng tay thì hai bước bắt buộc theo đúng bài học của bản đầy đủ:
`prisma migrate deploy` **rồi `npm run db:seed`** (migrate chỉ tạo bảng `role_permission` RỖNG →
mọi role trừ ADMIN mất sạch quyền), và giải nén code xong phải **so cây file rồi xoá file mồ côi**
(tar không xoá file mà nguồn đã xoá → build hỏng vì trang cũ tham chiếu type đã gỡ).

---

## 10. Hạn chế đã biết / rác kế thừa

**Rác kế thừa từ bản đầy đủ — vô hại nhưng gây hiểu nhầm, chưa dọn:**

1. `scripts/` (deploy.sh + 3 file .bat + build-ctv-template.js) và `templates/` (biên bản CTV) —
   thuộc module đã cắt. `deploy.sh` là thứ **nguy hiểm**, xem mục 1.1.
2. `docs/PLAN-HISTORY.md` (337KB), `docs/CEO-AUDIT-2026-07.md`, `docs/hse/`,
   `COMMUNICATION_MODULE_PORTABLE_SPEC.md` (311KB) — lịch sử thiết kế của bản đầy đủ. Vẫn tra cứu
   được, nhưng phần lớn nói về module không tồn tại ở đây.
3. **`messages/*.json` vẫn mang đủ 34 namespace của bản đầy đủ (3774 key mỗi bên)** trong khi bản
   mini chỉ dùng vài namespace (`creative` 122, `creativeRequest` 36, `auth`, `nav`, `common`,
   `dashboard`, `reminders`, `validation` và một phần `settings`). Các namespace `projects` 639 ·
   `bidding` 367 · `inventory` 336 · `clients` 314 · `finance` 190 · `chat` 182 · `recruit` 148 …
   là **key chết**. Parity vẫn 0/0 nên không chặn gì; muốn dọn thì phải dọn **cả hai file cùng lúc**
   và chạy lại kiểm parity.
4. **`prisma/schema.prisma` còn cột và chú thích của module đã cắt**: `Project.stockCampaignOpenedAt`
   (kho), `Project.isoFolderUrl`, `Client.quoteTemplateCode` / `paymentTermDays`,
   `Staff.payrollExempt` / `isPlanningStaff`, `Department.costPrefix`, chú thích `Role.code` liệt kê
   20 role, `Notification.type` liệt kê ~40 loại trong khi mini chỉ phát **6**
   (`CREATIVE_TASK_ROUTED` · `_ASSIGNED` · `_NEEDS_APPROVAL` · `_DELIVERED` · `_REVISION` ·
   `_DEADLINE_REMINDER`). Không cột nào trong số đó được ghi nữa. ⚠ Xoá cột thì phải viết migration TAY (mục 4.6).
5. `src/components/layout/nav-items.ts` import **18 icon nhưng chỉ dùng 2**.

**Hạn chế thật của bản mini:**

6. **Không có màn hình quản lý khách hàng / công việc.** Dự án và khách đến từ seed; muốn thêm phải
   viết màn hình hoặc nhập bằng script (xem mục 5).
7. **Chi phí theo giờ chạy trên lương MẪU 20tr** — chưa dùng để ra quyết định được.
8. **"Quên mật khẩu" không dùng được** với tài khoản `@tcm.local` và chưa khai `SMTP_*` (mục 3).
9. **Chưa có test tự động**; verify bằng tsc/eslint/build + browser thủ công.
10. **Không có lịch sử phiên bản thành phẩm** — mỗi lần nộp ghi đè `deliverableLinkUrl`; số lần trả
    lại chỉ còn lại ở `revisionCount`.
11. **`creative.task.assign` vẫn là mã quyền phẳng** — ai có nó thì giao được MỌI task, kể cả task
    của team khác. Đường "trưởng team" là mở thêm một lối, không phải siết lại lối cũ.
12. Chưa có: đo tải theo tuần / thời gian chờ từng khâu, ước lượng khối lượng + độ ưu tiên, nối
    task theo thứ tự trước–sau.

---

## 11. Trạng thái tại thời điểm bàn giao

Nhánh `creative-mini`, commit cuối `0e6fa63` ("màn hình NHẬN VIỆC — yêu cầu sinh thẳng ra đầu việc").
Đo lại toàn bộ ngày 07/08/2026 trên chính thư mục này:

| Cửa kiểm | Kết quả |
|---|---|
| `npx tsc --noEmit` | **sạch** |
| `npx eslint src --quiet` | **sạch** |
| i18n parity | **only vi: 0 · only en: 0** (3774/3774) |
| `npx next build` | **sạch — 24 route** |
| `npx prisma migrate status` | **Database schema is up to date** (2 migration) |
| dev server (:3100) | `/login` 200 · `/`, `/creative*`, `/settings/*` → **307 về login** · `/api/notifications/poll` **401** · **error log trống** |

Dữ liệu trong `prisma/creative.db` (toàn bộ là **DỮ LIỆU MẪU**, không có dữ liệu thật của công ty):
6 nhân sự · 4 role · 19 dòng grant · 2 phòng ban · 3 team nhỏ · 2 khách · 3 công việc · 3 task ·
1 yêu cầu · 16 option item · 3 setting.

**Việc nên làm tiếp, theo thứ tự đề xuất:** nhập lương thật ở `/settings/creative` (để bảng chi phí
dùng được) → quyết định có dọn key i18n chết và cột schema chết không → nếu cần đưa lên máy chủ thì
viết đường deploy riêng (mục 9).
