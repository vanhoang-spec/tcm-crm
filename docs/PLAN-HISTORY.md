# TCM — Blueprint Kiến trúc Hệ thống Vận hành Nội bộ (CRM+)

> Trạng thái: ĐANG BÀN CẤU TRÚC (framework). Chưa code. Tài liệu này là bản khung sống, bồi đắp dần theo thảo luận với chủ dự án.

## Context — Vì sao làm

TCM là agency **event & activation** (~30-45 người, ~17 PIC, ~250 dự án/năm, 3 team ACC1/2/3 khác mô hình). Hiện dùng **3 board monday.com** như "ERP giả lập": schema lệch nhau (37 / 116 / 115 cột), tài chính nhập tay, không AR tự động, không đo margin/workload, handover rơi trách nhiệm thu tiền.

Hệ quả có bằng chứng: **28,4 tỷ công nợ** (75% doanh thu năm), **20,78 tỷ nghiệm thu 2026 chưa thu**, các ca lệch số không ai phát hiện (HA 2502 lệch 545tr), dự án Finished thiếu hồ sơ (FSC Adward 3,33 tỷ).

Chủ dự án mở rộng phạm vi: **không chỉ CRM** mà là **nền tảng vận hành nội bộ** gồm 8 module (khách hàng → bidding → dự án → chi phí → nhân sự → KPI/thưởng-phạt → lương → kho). Mục tiêu: một nguồn dữ liệu duy nhất, chuẩn hóa 3 team, bịt các chỗ chảy máu tiền, tự động hóa cảnh báo.

## Nguyên tắc thống nhất (đã chốt với chủ dự án)

1. **Breadth-first:** dựng khung (bảng + CRUD + trang setting) cho **cả 8 module trước**, rồi đi sâu nghiệp vụ/luật từng module.
2. **Thứ tự đi khung:** Nền tảng + **Quản lý dự án làm trục trước** (không phải "tài chính trước" như KB gợi ý).
3. **Admin-configurable:** mỗi module có lớp **Settings** để admin tự cấu hình (enum, ngưỡng, trạng thái, luật) — hệ thống là khung, chi tiết do admin dựng.
4. **MISA độc lập — KHÔNG tích hợp.** CRM self-contained. Bỏ mọi handoff/đồng bộ sang MISA trong KB.
5. **Salary rút gọn (không fully):** CRM tổng hợp KPI/thưởng/phạt theo kỳ rồi **xuất bảng lương** (thay Excel manual); KHÔNG tính lương đầy đủ (phụ cấp/khấu trừ/quyết toán) trong hệ thống.
6. **Luật nghiệp vụ cứng (từ KB):** margin ≥ 31% (cấu hình được); chặn Finished nếu thiếu CECO Liquid/Invoice; nghiệm thu → task xuất HĐ 7 ngày; handover phải có người chịu trách nhiệm thu; **tiền = BIGINT/VND, không float**; mọi thay đổi tiền có audit log.
7. **Song ngữ Việt/Anh**, giữ nguyên thuật ngữ nghiệp vụ tiếng Việt (CECO, Nghiệm thu, Thực Chi, CO/CE).
8. **Responsive web** (account chạy hiện trường dùng mobile).

## Kiến trúc tổng thể

```
NỀN TẢNG DÙNG CHUNG (Core Platform)
  • Identity & RBAC: Staff, Team, Department, Role, Permission
  • Master data: Client · Contact · Vendor
  • Settings Engine (admin cấu hình từng module)
  • Audit log · Money=BIGINT/VND · File store có version
  • Notification/Alert (email/Zalo/in-app) · Reporting & Dashboard layer

Trục DỰ ÁN nối:  ① CRM → ② Bidding → ③ Dự án ↔ ⑧ Inventory → ④ Cost Control
Trục CON NGƯỜI nối:  ⑤ Staff → ⑥ KPI/Thưởng-Phạt → ⑦ Salary (xuất bảng)
```

## 8 Module — khung dữ liệu cốt lõi

| # | Module | Thực thể chính | Trạng thái nguồn |
|---|--------|----------------|------------------|
| ① | **Khách hàng (B2B)** | Client, Contact; Client 360; cảnh báo tập trung KH (FR-11) | KB ✓ |
| ② | **Bidding & Contract** ⭐ module lớn, trước ③ | bidding_round (vòng deal R2–R5); **CECO ctract** (cost_sheet) + cost_line; contract; định tuyến CEO; simple/complex; margin 31% (2 tình huống); lý do fail; duyệt theo ngưỡng | KB ✓ |
| ③ | **Quản lý dự án** | Project + state machine; ProjectAssignment (đa nhân sự×dept×phase×%); Nghiệm thu; Handover; timeline bắt buộc | KB ✓ |
| ④ | **Cost Control** | CECO ctract↔liquid; Thực Chi; Invoice; Payment; AR aging + 4 nhóm công nợ; WIP; đối chiếu 3 chiều; cash flow | KB ✓ |
| ⑤ | **Staff Management** | Staff (mở rộng User), phòng ban, chức danh, capacity, timesheet/workload | 🆕 mới |
| ⑥ | **KPI / Thưởng–Phạt** | KPI định nghĩa + chấm điểm kỳ; Bonus (bid/introducer/KPI — đã có mầm trên monday); Penalty | 🆕 mới |
| ⑦ | **Salary (rút gọn)** | Tổng hợp KPI/thưởng/phạt theo kỳ → **xuất bảng lương** (không tính lương đầy đủ) | 🆕 mới |
| ⑧ | **Inventory** | Item/SKU theo chủng loại; kho; nhập–xuất–tồn; cấp phát/thu hồi theo dự án; tình trạng thiết bị | 🆕 mới |

### Khung Inventory (theo mô tả chủ dự án — chờ danh mục chi tiết)
Phân loại theo 2 trục:
- **Tính chất:** tiêu hao (consumable) · **tái sử dụng** (thiết bị điện tử, barrier, thùng rác) · **lắp ghép/kit** (booth, background, backdrop, kệ trưng bày) · vật tư kết cấu (sàn thép, khung sắt, ốp gỗ).
- **Sở hữu:** TCM sở hữu · **khách gửi giữ** (sản phẩm trưng bày, hàng khác của khách) · Others.
Nghiệp vụ: nhập/xuất/tồn, cấp phát theo dự án (nối Thực Chi ở ④), thu hồi + theo dõi tình trạng cho hàng tái sử dụng, custody cho hàng của khách. **Danh mục hàng tồn kho theo chủng loại sẽ do chủ dự án cung cấp.**

## Điểm nối giữa các module (tránh thiết kế rời rạc)
- **Project** = trục nối ①→②→③→④ và ⑧ (kho cấp vật tư → sinh Thực Chi ở ④).
- **CECO** nối ② (ctract) ↔ ④ (liquid) — version control để phát hiện trượt chi phí.
- **Staff** nối ③ (assignment/workload) → ⑥ (KPI) → ⑦ (Salary).
- **AR/thu tiền** (④) → **KPI thu tiền** của account (⑥) → **Salary** (⑦). Chuỗi giá trị cao nhưng dữ liệu **nhạy cảm** → RBAC chặt cho KPI/Lương.

## State machine dự án (từ KB — dùng cho module ③)
```
Bidding ─┬→ Failed (bắt buộc fail_reason) / Canceled
         └→ Processing (chặn nếu thiếu confirm email/PO/HĐ — FR-04)
              ├→ Handover (bắt buộc biên bản + người thu — FR-10)
              └→ Liquidation → Finished (CHẶN nếu thiếu CECO Liquid/Invoice — FR-02/06)
Pending ↔ mọi trạng thái
```

## Thứ tự module (chuẩn hóa)
`① Khách hàng · ② Bidding & Contract · ③ Quản lý dự án · ④ Cost Control · ⑤ Staff · ⑥ KPI/Thưởng-Phạt · ⑦ Salary · ⑧ Inventory` — riêng ⑧ Inventory tuy đánh số 8 nhưng đặt **sát ③ về mặt liên kết dữ liệu** (kho cấp vật tư cho dự án).

## Cách tiến hành (breadth-first)
- **Bước 0 — Sơ đồ trực quan:** module map + ERD toàn cảnh (đã vẽ, đang tinh chỉnh) để chủ dự án duyệt trước khi vào chi tiết.
- **Giai đoạn Khung:** dựng skeleton (bảng + trường + trang Settings) cho **cả 8 module** theo thứ tự chuẩn hóa ở trên; thống nhất Nền tảng (RBAC, master data, audit, notification) trước.
- **Đi sâu (sau khi có khung):** lần lượt theo trục, ưu tiên Nền tảng + ③ Dự án + ⑧ Inventory. (Lưu ý phụ thuộc: CECO ở ② feeds ④ — khi đi sâu ④ cần khung ② tối thiểu.)
- **Import dữ liệu lịch sử** (3 file Excel monday, schema lệch — FR-15) chạy song song khi khung Nền tảng + Dự án xong.

## Hạng mục còn để mở (chờ chốt / chủ dự án cung cấp)
- **Danh mục Inventory** theo chủng loại (chủ dự án sẽ gửi).
- Quy tắc **KPI/Thưởng-Phạt** cụ thể từng vai trò.
- **Stack công nghệ & hình thức triển khai** (self-host vs cloud) — KB gợi ý FastAPI/Node + PostgreSQL + React/Next.js; chưa chốt.
- Chi tiết mô hình **retainer (ACC2)** và **milestone billing (ACC3)** — làm ở lớp Settings từng module.

---

# KHUNG CHI TIẾT TỪNG MODULE
> Soạn lần lượt, chủ dự án duyệt từng phần. ERD là tài liệu sống — sửa khi phát hiện quan hệ chéo. Quy ước chung: khóa chính `id`; tiền = **BIGINT (VND)**; mọi bảng có `created_at/updated_at`, `is_deleted` (soft delete); trường tên song ngữ `*_vi/*_en` khi cần; mọi thay đổi số tiền → `audit_log`.

## 0 · NỀN TẢNG (Core Platform)
Nền tảng phải xong trước vì 8 module đều phụ thuộc. Gồm 3 nhóm: Identity/RBAC · Master data dùng chung · Dịch vụ nền (Settings, Audit, Notification, File).

### Identity & Phân quyền (RBAC)
- **`staff`** (nhân sự = user đăng nhập): `code`, `username`, `full_name`, `email`, `phone`, `department_id` FK, `team_id` FK nullable, `title`, `employment_type` (fulltime/parttime/cộng tác), `join_date`, `is_active`. (Chi tiết lương/hồ sơ để ở module ⑤.)
- **`team`**: `code` (A1|A2|A3), `name`, `lead_staff_id` FK, `is_active`.
- **`department`**: `code` (ACCOUNT|PLANNING|CREATIVE|OPE|PRO|PCC|FIN|HR|CEO), `name`. *(admin thêm/sửa)*
- **`role`**: `code`, `name`, `description` — vd CEO, AccountManager, Accountant, OpsLead, Warehouse, Admin.
- **`permission`**: `code` (vd `salary.view`, `kpi.manage`, `costsheet.approve`, `project.finish`), `description`.
- **`role_permission`** (N-N role↔permission) · **`staff_role`** (N-N staff↔role).
- ⚠ Dữ liệu nhạy cảm (Salary ⑦, KPI ⑥) chỉ mở theo permission; audit mọi truy cập.

### Master data dùng chung
- **`vendor`**: `code`, `name`, `category` (PCC|PRO|OPE|OTHER), `contact`, `phone`, `email`, `tax_code`, `is_active`. (client/contact thuộc module ①.)

### Dịch vụ nền
- **`option_set` + `option_item`** ⭐ (lõi "admin cấu hình"): danh mục động do admin quản lý — `option_set.code` (vd `project_type`, `channel`, `industry`, `fail_reason`, `kpi_type`, `inventory_category`, `payment_term`), `option_item` (`set_id`, `code`, `label_vi`, `label_en`, `sort`, `is_active`). Mọi enum "mềm" đi qua đây thay vì hard-code.
- **`setting`**: cấu hình theo module/scope — `module`, `key` (vd `min_margin_pct`), `value` (json), `scope` (GLOBAL|TEAM|PROJECT), `scope_ref`, `updated_by`, `updated_at`. Vd margin tối thiểu 31% là setting override được theo team/dự án.
- **`audit_log`** (FR-13): `entity_type`, `entity_id`, `field`, `old_value`, `new_value`, `action`, `changed_by`, `changed_at`, `reason`.
- **`notification`** + **`notification_rule`**: rule do admin cấu hình (trigger, delay, kênh in_app/email/zalo, escalate_to) → phục vụ chuỗi đòi nợ leo thang (FR-01/02) & cảnh báo margin/WIP. `notification`: `recipient_staff_id`, `type`, `title`, `body`, `entity_ref`, `channel`, `status`, `created_at`, `read_at`.
- **`document`** (file có version): `entity_type`, `entity_id`, `doc_type` (brief, proposal, CECO, contract, invoice, nghiệm thu…), `file_url`, `version`, `is_current`, `uploaded_by`, `uploaded_at`.

### Bổ sung dùng chung — vòng 2 (chủ dự án yêu cầu)

**A. Phân quyền dữ liệu theo team (row-level visibility) + chuyển khách**
- Khách hàng/dự án **scoped theo team Account**: staff chỉ thấy khách của team mình; CEO/Admin có permission `client.view_all` để thấy hết. (`client.owner_team_id` ở module ①.)
- **`client_transfer`**: chuyển khách từ Account này sang Account khác — `client_id`, `from_team_id`, `to_team_id`, `reason`, `transferred_by`, `approved_by`, `transferred_at`. Có audit; phân biệt với `handover` (chuyển *dự án*).

**B. `credential` — Thư viện năng lực TCM (share chung, quản theo ngành, version theo tháng, lưu LINK)**
- **`credential`**: `title`, `industry_id` (option `industry`, vd FMCG, Dược), `description`, `is_shared` (all team xem), `is_active`.
- **`credential_version`**: `credential_id`, `version_label` (theo tháng, vd `2026-07`), `storage_link` (Google Drive/OneDrive URL — **không lưu file trực tiếp**), `note`, `updated_by`, `updated_at`, `is_current`.

**C. Form CO/CE chuẩn theo loại hình + tool "make up" (dựng CE đề xuất từ CO)**
- **`costsheet_template`**: form CO/CE mẫu theo loại hình hợp đồng — `name`, `contract_type_id` (option: event lớn/vừa/nhỏ, activation…), `is_active`.
- **`costsheet_template_line`**: `template_id`, `department` (PCC|PRO|OPE|OTHER), `item_name`, `default_specs`, `default_qty`, `default_unit`, `default_unit_price`, `is_locked` (không cho make-up), `max_markup_pct` (trần make-up của line), `sort`.
- **Make-up engine** (runtime ở module ②): user tạo CO từ template rồi **edit/thêm/xóa line**; xong CO → tool sinh **CE "đề xuất"** = áp markup lên đơn giá/số lượng để đạt `min_margin` (mặc định 31%). Line `is_locked` giữ nguyên; line có `max_markup_pct` không vượt trần; **số cụ thể vẫn edit tay được**. Tham số markup nằm ở `setting` + template.

**D. `task` + `task_rule` — Task & Reminder engine (admin cấu hình, KHÔNG fix cứng)**
- **`task`**: `title`, `type`, `entity_ref`, `assignee_staff_id`, `due_date`, `status` (open|done|overdue|canceled), `source_rule_id`, `created_by/at`.
- **`task_rule`**: `code`, `trigger_event` (vd `acceptance_created`), `offset_days` (+7), `assignee_role`, `escalate_to_role`, `escalate_after_days`, `channels`, `is_active` — admin thêm/sửa/xóa sau. Seed sẵn rule "nghiệm thu → xuất HĐ +7 ngày" (FR-02). Chỉ chốt chặn state-machine là fix cứng.
- **Sinh mã** (service): tạo `code` chuẩn `T{seq:03d}{CLIENT}{YY}A{team}` — cấu hình seq theo năm/team.

### Trang Settings (admin) của Nền tảng
Quản lý: danh mục (option_set), phân quyền (role/permission + scope theo team), tổ chức (team/department), tham số hệ thống (setting: min_margin_pct…), rule cảnh báo (notification_rule) & **task_rule**, **form CO/CE mẫu** (costsheet_template + lock/max markup), **thư viện credential**, quy tắc sinh mã.

### Điểm còn mở
- Cơ chế auth cụ thể (local vs SSO) — quyết khi build.
- Mức chi tiết permission (theo module hay theo hành động) — đề xuất theo hành động (`module.action`).

## 2 · MODULE ② BIDDING & CONTRACT ⭐ (đang thực hiện)

### Context
Module lớn thứ 2, xây sâu ngay (không chỉ skeleton) — theo đúng pattern đã dùng cho module ① Khách hàng. Phủ giai đoạn từ **tiếp nhận đề bài → dựng CO/CE (margin 31%) → present & deal → ký hợp đồng → confirm email bàn giao ③**. Đây là nơi khai sinh `project` và `cost_sheet` (CECO ctract) — 2 bảng trục nối sang ③/④. Xem 2 flowchart đã vẽ (luồng chính + động cơ CO/CE).

### Quyết định đã chốt với chủ dự án
1. **`project` tạo ngay ở bước tiếp nhận** (status=Bidding) — một bản ghi xuyên suốt bid→exec→finish; bid thua = status Failed (đo win/loss trên chính project). KHÔNG tách Opportunity riêng.
2. **`bidding_round` log đầy đủ** từng vòng deal (số vòng, ngày, phản hồi khách, CE sửa, kết quả).
3. **`contract` bản ghi gọn** (trường dữ liệu, không workflow trạng thái draft/review/sign).
4. **Có cổng Go/No-Go** trước khi đốt nguồn lực — kích hoạt khi `complexity=complex` **HOẶC** `client.is_new` (khách mới hoàn toàn = rủi ro cao, soi kỹ dù dự án đơn giản).
5. **Định nghĩa `complexity`** (tiêu chí = TCM có phải tự sáng tạo concept không):
   - `simple` = khách **đã có idea/concept rõ ràng**, TCM chỉ **thực thi** → đi thẳng CO/CE (không qua Go/No-Go).
   - `complex` = khách **chỉ brief yêu cầu**, TCM phải **lên concept/ý tưởng + trình proposal** → Go/No-Go → brainstorm → planning concept (lặp chốt) → thiết kế & duyệt → CO/CE.

### Data model (Prisma — bảng mới)
- **`project`** (bảng trung tâm): `code` (auto `T{seq:03d}{CLIENT}{YY}A{team}`), `name` NOT NULL, `client_id` FK, `owner_team_id` FK (scope theo team như ①), `owner_id` FK staff (PIC), `status` enum (Bidding|Pending|Processing|Liquidation|Finished|Failed|Canceled|Handover), `project_type_id` (option), `complexity` (simple=khách có concept→thực thi; complex=khách chỉ brief→TCM lên concept+proposal), `go_nogo_status` (PENDING|GO|NOGO) + `go_nogo_note`/`by`/`at` (dùng khi complex HOẶC khách mới), `budget` BIGINT nullable (cho budget-down), `channel_id`/`scope`/`scale`/`venue`/`activity`, `fail_reason_id` (option, bắt buộc khi Failed) + `fail_reason_note`, `fiscal_year`. *(Trường timeline/assignment/handover thêm ở ③.)*
- **`bidding_round`**: `project_id`, `round_no`, `round_date`, `client_feedback`, `revised_ce` BIGINT, `outcome` (ongoing|accepted|rejected), `note`, `created_by/at`.
- **`cost_sheet`** (CECO): `project_id`, `version` (CTRACT — ② chỉ tạo bản này; LIQUID ở ④), `scenario` (COST_UP|BUDGET_DOWN), `template_id` FK nullable, `ce_total` BIGINT, `co_total` BIGINT (computed = Σ cost_line.amount), `chi_ho` BIGINT (ngoài margin), `vat_pct`, `margin_pct` (computed), `min_margin_pct` (default từ `setting`), `margin_override_by`/`margin_override_note`, `approved_by`/`approved_at`, `created_at`.
- **`cost_line`**: `cost_sheet_id`, `department` (PCC|PRO|OPE|OTHER), `item_name`, `specs`, `quantity`, `unit`, `unit_price` BIGINT, `amount` BIGINT (computed), `vendor_id` FK nullable, `is_locked`, `max_markup_pct`, `sort`, `note`.
- **`contract`**: `project_id`, `contract_no`, `contract_date`, `po_no`, `po_date`, `payment_term_days`, `template_source` (CLIENT|TCM), `signed` bool, `confirm_email_at` timestamp (mốc bắt đầu thực thi — cổng FR-04), `file_url`, `note`.

### State machine + cổng cứng (enforce ở server action)
- `Bidding → Failed` (bắt buộc `fail_reason_id`) · `→ Canceled` · `→ Processing` (**FR-04**: chặn nếu thiếu cả `confirm_email_at` VÀ `po_no` VÀ `signed`). `Pending ↔` mọi trạng thái.
- **Margin ≥ min_margin (31%)**: chặn approve cost_sheet HOẶC `margin_override_by` + note bắt buộc.
- **Go/No-Go**: bắt buộc khi `complexity=complex` HOẶC `client.is_new`. `go_nogo_status=NOGO` → cho chuyển Canceled/Failed; chỉ GO mới đi tiếp CO/CE. (simple + khách quen → bỏ qua, đi thẳng CO/CE.)
- **Duyệt theo ngưỡng (FR-12)**: `setting` ngưỡng giá trị — dưới ngưỡng & margin đạt & không phải budget-down → auto-approve; còn lại escalate CEO.
- Mọi thay đổi tiền + đổi status → `audit_log`.

### UI (theo pattern module ① — list/detail/form + server actions + i18n song ngữ)
- **`/bidding`** — danh sách project (lọc theo team/status/project_type, search), badge trạng thái, cảnh báo margin.
- **`/bidding/new`** — form tiếp nhận: tạo project (Bidding) + phân loại simple/complex.
- **`/bidding/[id]`** — workspace: khối Go/No-Go (nếu complex) · **CO/CE builder (make-up engine)** · hiển thị margin realtime + cổng duyệt · log deal rounds · sub-section contract · nút "→ Processing" (khóa theo FR-04) · audit log.
- **CO/CE builder**: chọn `costsheet_template` → dựng dòng CO (edit/thêm/xóa) → tool make-up sinh CE đề xuất (tôn trọng `is_locked` + `max_markup_pct`) → margin gate → submit duyệt.
- **Settings**: thêm option_set `project_type`, `contract_type`, `fail_reason`, `channel` (**tái dùng trang generic `/settings/options/[setCode]` sẵn có**); quản lý `costsheet_template`; `setting` min_margin_pct + ngưỡng auto-approve.

### Tái sử dụng (không viết lại)
[prisma.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\prisma.ts) · [utils.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\utils.ts) (`formatNumber`, `pickLabel`) · pattern validator zod-factory + i18n ở [validators/client.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\validators\client.ts) · pattern server action + audit ở [clients/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\clients\actions.ts) · UI [Combobox](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\ui\combobox.tsx)/[Badge](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\ui\badge.tsx)/[Button](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\ui\button.tsx) · trang generic option settings [settings/options/[setCode]](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\options) · `option_set`/`option_item`, team scoping, `current-staff`, `getTranslations` + messages.

### Verification (end-to-end trong browser, cả 2 ngôn ngữ)
Tạo project (Bidding) → phân loại complex → Go/No-Go=GO → dựng CO/CE từ template → make-up sinh CE → **test margin <31% bị chặn + override có lý do** → approve → log 2-3 deal rounds → đánh Thắng → tạo contract → **test chuyển Processing bị chặn khi thiếu confirm/PO/HĐ (FR-04)** → thêm confirm_email → chuyển Processing OK. Chạy `tsc --noEmit` + `lint` + `build` sạch; verify format số vi/en.

---

## Verification tổng (toàn hệ thống — tham chiếu)
- Test case bắt buộc từ KB: lệch invoice≠CE Liquid → cảnh báo; Finished thiếu CECO/invoice → chặn; handover → hiện công nợ 2 team; margin <31% → chặn/override có lý do; WIP dự án lớn hiện báo cáo.
- Chạy end-to-end 1 dự án mẫu qua đủ vòng: bid → CECO → contract → execution → nghiệm thu → invoice → payment → AR aging.

---

# BATCH: Trạng thái dự án (Settings) · Tiếp nhận Dự án (Brief link / Team pending / Notification) · CO/CE Full Redesign

## Context
Chủ dự án yêu cầu 3 việc trên module Bidding & Contract, dựa trên 1 file HTML tham khảo (`event-budget-agent`, mini-tool dự toán sự kiện độc lập) làm chuẩn cho CO/CE:
1. "Trạng thái dự án" hiện hard-code 8 string trong code (`Bidding/Pending/Processing/Liquidation/Finished/Failed/Canceled/Handover`) — cần chuyển sang admin quản lý được (thêm/bớt) qua Settings, giống mọi "soft enum" khác trong app.
2. Form "Tiếp nhận Dự án mới" thiếu 2 thứ: (a) link brief khách gửi (bắt buộc), (b) không có cách nào tạo project mà chưa biết giao cho team Account nào — cần 1 lựa chọn "Đợi BGĐ giao team Account" kèm cơ chế báo cho CEO + BD Director biết để vào xử lý (hệ thống hiện **chưa có notification model nào**, `/reminders` hiện là trang tính toán thuần túy không lưu DB).
3. CO/CE hiện chỉ là 1 bảng dòng phẳng (flat lines), không có khái niệm "hạng mục" (section), không có mẫu chuẩn theo Nhóm dự án, không có loại dòng (SL×đơn giá / % tổng / số tiền cố định), không tách khối "Chi hộ" có phí dịch vụ riêng, không có Phí QL dự án/Dự phòng/Chiết khấu ở cấp bảng — chủ dự án chọn xây **đầy đủ** như file tham khảo (đã hỏi & chốt qua AskUserQuestion). Đồng thời `approveCostSheet` đang là dead code (không có UI nào gọi) — cần định nghĩa và build flow duyệt thật.

Nguyên tắc bất biến phải giữ nguyên xuyên suốt: `coTotal`/`ceTotal`/`computeMarginPct`/margin gate 31%/CEO-override/auto-approve-threshold — mọi thứ mới phải cộng dồn vào `coTotal` (chi phí nội bộ) hoặc chỉ tác động lúc suy ra `ceTotal` (giá chào khách), **không** được tạo hệ thống tổng tiền song song. Chi hộ tiếp tục nằm ngoài margin hoàn toàn.

## A) Trạng thái dự án → admin-configurable (Settings)
- **Schema**: `Project.status String` → `Project.statusId String` FK `OptionItem` (relation `"ProjectStatus"`), index đổi theo `[ownerTeamId, statusId]`.
- **Seed**: `option_set` mới `project_status`, 8 `OptionItem` codes UPPERCASE (`BIDDING, PENDING, PROCESSING, LIQUIDATION, FINISHED, FAILED, CANCELED, HANDOVER`), label VI/EN = text hiện tại.
- **Code**: mọi so sánh `project.status === "X"` → `project.status.code === "X"` (sau khi include relation); mọi chỗ set status → resolve qua id (thêm helper cache `getStatusId(code)` trong `src/lib/bidding.ts` hoặc file mới `src/lib/project-status.ts`). Áp dụng cho toàn bộ actions trong [actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\actions.ts) (`createProject, decideGoNogo, markFailed, markClientCancel, moveToProcessing, moveToLiquidation, markFinished`), [bidding.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\bidding.ts) (bỏ `PROJECT_STATUSES` label-source, giữ mảng code cho thứ tự/filter), [bidding-ui.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\bidding-ui.ts) (`STATUS_TONE` đổi key sang code), [reminders.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\reminders.ts) (`getBiddingReminders` where status theo code, include relation), UI list/detail (`bidding/page.tsx`, `bidding/[id]/page.tsx`).
- **i18n**: xóa `bidding.status.*` (8 key, label giờ lấy từ DB qua `pickLabel`), thêm `settings.index.projectStatusTitle/Desc` + tile mới trong `/settings` trỏ `/settings/options/project_status` (tái dùng trang generic sẵn có, thêm 1 dòng vào `titleMap`).

## B) Bổ sung "Tiếp nhận Dự án mới": brief link + "Đợi BGĐ giao team Account" + Notification
- **Schema**: `Project.briefLinkUrl String` (bắt buộc, validate URL ở Zod không ở DB). `Project.ownerTeamId String` → `String?` (nullable), `ownerTeam Team?`. Model mới `Notification` (`id, recipientStaffId, type, title, body, projectId?, isRead Boolean @default(false), createdAt`) + relation `Staff.notifications` / `Project.notifications`.
- **Seed**: thêm Staff `title: "BD Director"` (chưa tồn tại — dùng `ceoDept` hoặc phòng phù hợp).
- **Sentinel pattern** (tái dùng đúng pattern `OTHER_INTRODUCER` trong [validators/client.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\validators\client.ts) + [client-form.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\clients\client-form.tsx)): thêm hằng `PENDING_TEAM_ASSIGNMENT` trong `src/lib/validators/project.ts`, thêm 1 `<option>` sentinel ngay trong select `ownerTeamId` ở [project-form.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\project-form.tsx). `createProject` resolve sentinel → `ownerTeamId: null` (helper `resolveOwnerTeamId` như `resolveIntroducerId`), trong cùng transaction tạo 2 `Notification` (CEO + BD Director, `type: "TEAM_ASSIGNMENT_NEEDED"`).
- **Action mới**: `assignProjectTeam(projectId, teamId)` — set `ownerTeamId`, đánh dấu `isRead=true` các Notification liên quan, ghi `AuditLog`. UI: form nhỏ inline trên `bidding/[id]/page.tsx` (component mới `assign-team-form.tsx`), chỉ hiện khi `ownerTeamId == null`.
- **Null-safe team ở mọi nơi**: `bidding/page.tsx` (badge "Chờ giao team" tone `warning` khi `ownerTeam == null`, thêm chip đếm số dự án chưa giao team cạnh tab filter), `bidding/[id]/page.tsx`, `reminders.ts` (`getBiddingReminders` include ownerTeam optional, không throw khi null), `bidding/[id]/edit/page.tsx` (defaultValues `ownerTeamId: project.ownerTeamId ?? PENDING_TEAM_ASSIGNMENT`).
- **Notifications trong /reminders**: thêm section 3 "Thông báo" — query toàn bộ `Notification` chưa đọc (không lọc theo current-staff vì app chưa có session thật, giống cách `/reminders` hiện đang show toàn bộ cho mọi người xem), nút "Đánh dấu đã đọc" (action mới `markNotificationRead` trong `src/app/(app)/reminders/actions.ts`). Bell badge ở [layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\layout.tsx) cộng thêm `unreadNotificationCount`.
- **i18n**: `bidding.new` (briefLink, briefLinkPlaceholder, ownerTeamPending), `bidding.list`/`detail` (teamUnassigned, unassignedCount, assignTeam), `reminders` (notificationsTitle, markRead, notificationEmpty).

## C) CO/CE — redesign đầy đủ theo file tham khảo (section-based)
**Schema** (SQLite dev — reset `prisma/migrations` + `dev.db`, `prisma migrate dev`, reseed lại, như các lần trước):
- `CostsheetTemplate` thêm `projectTypeId String?` (FK `project_type`, mỗi Nhóm dự án 1 mẫu chuẩn) — giữ `contractTypeId` song song (lọc bổ sung).
- Model mới `CostsheetTemplateSection` (`id, templateId, code, icon?, nameVi, nameEn?, colorSlot?, sort, isProxy Boolean, proxyFeeType? "PCT"|"FIXED", proxyFeeVal?`).
- `CostsheetTemplateLine`: thêm `sectionId` FK (bắt buộc), `lineType String @default("QTY_PRICE")` (`QTY_PRICE|FIXED|PERCENT_OF_TOTAL`), `fixedAmount BigInt?`, `percentVal Float?`; **bỏ** field `department` (section thay thế vai trò nhóm dòng).
- `CostSheet` thêm `mgmtFeePct/contingencyPct/discountPct Float @default(0)`, quan hệ `sections CostSheetSection[]`, và 2 field duyệt-từ-chối: `rejectedNote String?`, `rejectedAt DateTime?`, `rejectedById String?`.
- Model mới `CostSheetSection` (bản sao cấp instance của template section, thuộc về 1 `CostSheet`, có `lines CostLine[]`).
- `CostLine`: thêm `sectionId` FK (thay `department`), `lineType`, `fixedAmount`, `percentVal`.
- `OptionItem` thêm relation `templatesAsProjectType`.

**Công thức tính tiền (đầy đủ, giữ nguyên margin/CE/CO hiện có)**:
1. `directCo` = Σ amount của dòng `QTY_PRICE`+`FIXED` (mọi hạng mục KHÔNG phải Chi hộ).
2. `percentLinesTotal` = Σ dòng `PERCENT_OF_TOTAL`, mỗi dòng = `round(percentVal/100 × directCo)` (tính trên `directCo`, không đệ quy lên nhau — tránh vòng lặp).
3. `adjustedCoSubtotal = directCo + percentLinesTotal`.
4. `mgmtFeeAmt = round(adjustedCoSubtotal × mgmtFeePct/100)`; `contingencyAmt = round(adjustedCoSubtotal × contingencyPct/100)`.
5. **`coTotal` (lưu DB, giá vốn nội bộ)** `= adjustedCoSubtotal + mgmtFeeAmt + contingencyAmt`.
6. Hạng mục Chi hộ: `proxySubtotal` = Σ dòng chi hộ (chỉ `QTY_PRICE`/`FIXED`, không cho `PERCENT_OF_TOTAL`); phí dịch vụ = `PCT` → `round(proxySubtotal × proxyFeeVal/100)` hoặc `FIXED` → `proxyFeeVal`. **`chiHo` (lưu DB)** `= proxySubtotal + phí dịch vụ` — vẫn hoàn toàn ngoài margin, đúng bất biến hiện tại.
7. `ceTotal` vẫn do user nhập/make-up như hiện nay; builder thêm nút "gợi ý CE" = `round(coTotal × (1+vatPct/100) × (1-discountPct/100))` chỉ để prefill, không ép buộc. `computeMarginPct(ceTotal, coTotal)` và cổng margin 31%/override **không đổi logic**.
8. Tổng hiển thị cho khách (chỉ hiển thị, không lưu field riêng) `= ceTotal + chiHo`.

**Make-up engine** (`computeMakeupCe` trong [bidding.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\bidding.ts)): chỉ áp dụng cho dòng `QTY_PRICE`/`FIXED` không thuộc Chi hộ (tôn trọng `isLocked`/`maxMarkupPct` như hiện tại). Dòng `PERCENT_OF_TOTAL` và toàn bộ hạng mục Chi hộ **loại khỏi** markup (giữ nguyên giá trị đã cấu hình) — filter trước khi gọi hàm, hàm gốc không cần biết về section/proxy.

**Settings — CRUD mẫu CO/CE** (route mới, chưa từng có UI quản lý — hiện chỉ seed cứng): `/settings/costsheet-templates` (list) + `/settings/costsheet-templates/[id]` (editor: thông tin mẫu + Nhóm dự án + danh sách hạng mục, mỗi hạng mục có danh sách dòng, nút thêm/xóa/dời thứ tự đơn giản bằng nút lên/xuống — không cần drag-drop). `actions.ts` riêng cho CRUD template/section/line, ghi AuditLog theo pattern hiện có. Thêm tile trong `/settings` (`settings.index`) trỏ route này.

**Builder UI** ([cost-sheet-builder.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\cost-sheet-builder.tsx)) — viết lại từ state phẳng sang `Section[]` (mỗi section có `lines: Line[]`), mỗi dòng có selector "Loại dòng" quyết định input hiển thị (SL×đơn giá / số tiền cố định / %); hạng mục Chi hộ hiển thị tách riêng cuối bảng kèm control phí dịch vụ; thêm input `mgmtFeePct/contingencyPct/discountPct` ở khối cài đặt trên cùng (cạnh `vatPct` hiện có). Chọn mẫu: server truyền `matchingTemplates` (theo `projectTypeId` của dự án) + `allTemplates`, mặc định hiện `matchingTemplates`, có link "Xem tất cả mẫu" mở rộng. Vì payload lồng 2 cấp (section→line), submit qua 1 hidden input JSON (`sectionsJson`) thay vì flat `line_x_${i}` — validate bằng Zod schema mới `src/lib/validators/costsheet.ts`. `saveCostSheet` tính lại toàn bộ công thức ở server (không tin số từ client), replace-all section+line như pattern hiện tại.

**Approval flow** ("Lưu và trình duyệt" hiện dẫn vào chỗ chết — `approveCostSheet` không được UI nào gọi): khi không auto-approve, cost sheet ở trạng thái "Chờ CEO duyệt" — hiện badge + nút Duyệt/Từ chối trên `bidding/[id]/page.tsx` (component mới `approve-costsheet-actions.tsx`) gọi `approveCostSheet` (đã có, chỉ cần nối UI) và `rejectCostSheet` (mới — set `rejectedNote/rejectedAt/rejectedById`, tạo `Notification type COSTSHEET_REJECTED` cho PIC dự án, reset về editable ở lần save tiếp theo). Thêm section 4 "CO/CE chờ duyệt" trong `/reminders` (query mới `getPendingCostSheetApprovals()` trong `reminders.ts`, thuần computed như 2 hàm hiện có). Bell badge cộng thêm `pendingCostSheetApprovals`.

**i18n**: `bidding.costsheet` (line-type labels, mgmtFeePct/contingencyPct/discountPct, proxySectionTitle/proxyFeeType, pendingApproval/approve/reject/rejectNoteRequired), `settings.costsheetTemplates` (namespace CRUD, nhiều key — đảm bảo parity vi/en), `reminders.pendingCostsheetTitle`.

## Thứ tự triển khai (mỗi bước giữ app compile được)
1. Schema (cả 3 phần A/B/C cùng lúc) → reset migrations/dev.db → `prisma migrate dev`.
2. `prisma/seed.ts`: `project_status` option set, BD Director staff, project nullable-safe, template mẫu ≥2 Nhóm dự án (mỗi mẫu có hạng mục Chi hộ), vài Notification mẫu.
3. Helpers dùng chung: `bidding.ts` (status codes + công thức + filter make-up), `bidding-ui.ts`, `reminders.ts` (null-safe + 2 query mới), `validators/project.ts` (sentinel + briefLink), `validators/costsheet.ts` (mới).
4. i18n: thêm toàn bộ namespace/key mới vào cả vi.json/en.json trước (kể cả placeholder), chạy script parity.
5. Area A UI (status FK) — checkpoint compile nhỏ trước.
6. Area B UI (brief link, sentinel, notification, assign-team, reminders section 3, bell badge).
7. Area C — Settings CRUD template trước (builder sẽ cần data từ đây).
8. Area C — viết lại builder + saveCostSheet/approveCostSheet/rejectCostSheet.
9. Area C — approval UI trên detail page + reminders section 4 + bell badge công thức cuối.
10. Verify toàn bộ.

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx next build` — sạch.
- Script diff key vi.json/en.json — 0 lệch (như các lần trước).
- Browser E2E (dev server + Claude Browser tool): sửa label 1 status trong `/settings/options/project_status` → lưu đúng; tạo template CO/CE mới có 2 hạng mục (1 hạng mục đánh dấu Chi hộ có phí %) gắn Nhóm dự án, thêm dòng mixed loại; tạo project mới ở `/bidding/new` với brief link + chọn "Đợi BGĐ giao team Account" → detail hiện badge "Chờ giao team", `/reminders` hiện 2 notification mới (CEO+BD Director), bell badge +2, đánh dấu đã đọc giảm đúng; mở CO/CE builder trên project đó, load đúng mẫu theo Nhóm dự án, thêm/xóa dòng, đổi 1 dòng sang %, chỉnh phí Chi hộ, chạy make-up (xác nhận dòng %/Chi hộ không bị markup), lưu (ép margin dưới ngưỡng để test nhánh "Chờ CEO duyệt"); vào `/reminders` thấy mục CO/CE chờ duyệt, bấm Duyệt trên detail page → hết khỏi danh sách chờ; test nhánh Từ chối trên 1 sheet khác → tạo notification reject; cuối cùng dùng form gán team trên project đang "Chờ giao team" → badge đổi thành team thật, tab filter nhận đúng, notification liên quan chuyển isRead.

### File trọng yếu (batch này)
[prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · [src/lib/bidding.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\bidding.ts) · [src/app/(app)/bidding/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\actions.ts) · [src/app/(app)/bidding/cost-sheet-builder.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\cost-sheet-builder.tsx) · [src/lib/reminders.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\reminders.ts) · settings CRUD mới `src/app/(app)/settings/costsheet-templates/`.

---

# BATCH: Order các bộ phận (Brainstorm/Planning/Creative/Purchasing/Operation/Production) trước CO/CE

## Context
Ngay sau khi tiếp nhận dự án (có brief từ khách), trước khi dựng CO/CE, Account PIC cần "Order" các bộ phận nội bộ liên quan để lấy input (concept, báo giá vật phẩm/thiết bị/sản phẩm...) làm CO/CE. Quy trình chuẩn (khung 7 ngày ra Proposal): Day1 nhận brief → Day1/2 Account gửi Order → Day2-4 bộ phận làm & trả output → Day5-6 họp/sửa nội bộ → Day6 hoàn chỉnh CO/CE, trình duyệt → Day7 gửi Proposal cho khách. Hệ thống hiện có brief link + notification model (từ batch trước) nhưng chưa có khái niệm "Order nội bộ" hay accept-flow giữa các phòng ban.

6 lựa chọn (tick có/không trên UI, tick "có" mới bung form): **Họp brainstorm** (đặt lịch họp, mời nhiều người, KHÔNG có bước Accept — gửi là xong) và **5 loại Order phòng ban** (Planning/Creative/Purchasing/Operation/Production — CÓ bước Accept, phòng ban bấm "Chấp nhận" mới coi là đã nhận task). Department codes đã seed sẵn: `PLANNING`, `CREATIVE`, `PCC` (Purchasing), `OPE` (Operation), `PRO` (Production).

## Data model
Model mới trong `prisma/schema.prisma`:
```prisma
model ProjectOrder {
  id              String    @id @default(cuid())
  projectId       String
  department      String    // BRAINSTORM | PLANNING | CREATIVE | PCC | OPE | PRO
  status          String    @default("SENT") // SENT | ACCEPTED (BRAINSTORM luôn dừng ở SENT, không có Accept)
  briefLinkUrl    String?   // snapshot project.briefLinkUrl lúc gửi
  extraBriefInfo  String?
  outputRequest   String?   // dùng cho PLANNING|PCC|OPE|PRO (Creative dùng bảng con)
  desiredTimeline DateTime?
  meetingAt       DateTime? // chỉ BRAINSTORM
  meetingLocation String?   // chỉ BRAINSTORM
  meetingFormat   String?   // ONLINE | OFFLINE — chỉ BRAINSTORM
  sentAt          DateTime  @default(now())
  sentById        String?
  acceptedAt      DateTime?
  acceptedById    String?

  project      Project                    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sentBy       Staff?                     @relation("ProjectOrderSentBy", fields: [sentById], references: [id])
  acceptedBy   Staff?                     @relation("ProjectOrderAcceptedBy", fields: [acceptedById], references: [id])
  creativeItems ProjectOrderCreativeItem[]
  attendees     ProjectOrderAttendee[]

  @@unique([projectId, department]) // mỗi dự án tối đa 1 order đang hoạt động / bộ phận
  @@map("project_order")
}

model ProjectOrderCreativeItem { // checklist output riêng cho Creative
  id      String  @id @default(cuid())
  orderId String
  label   String  // KEY_VISUAL | DESIGN_2D | DESIGN_3D | SET_DESIGN | VIDEO | OTHER
  detail  String?
  order ProjectOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@map("project_order_creative_item")
}

model ProjectOrderAttendee { // người được mời họp brainstorm
  id      String @id @default(cuid())
  orderId String
  staffId String
  order ProjectOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  staff Staff        @relation(fields: [staffId], references: [id])
  @@unique([orderId, staffId])
  @@map("project_order_attendee")
}
```
`Project` thêm `orders ProjectOrder[]`. `Staff` thêm `projectOrdersSent`, `projectOrdersAccepted`, `projectOrderAttendances`. SQLite dev — reset migrations/dev.db như các batch trước.

**Setting mới** (tái dùng `getNumberSetting`, [src/lib/settings.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\settings.ts)): `module:"bidding", key:"order_response_days", value:"4"` — dùng để prefill gợi ý `desiredTimeline = project.createdAt + N ngày` (Day 4-5) trên form, không ép buộc. Thêm field này vào form Settings Bidding hiện có ([settings/bidding](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\bidding)) — không cần trang Settings riêng.

## Server actions
File mới `src/app/(app)/bidding/order-actions.ts` (tách khỏi `actions.ts` đã rất dài):
- `createBrainstormOrder(projectId, formData)`: parse `meetingAt/meetingLocation/meetingFormat/attendeeIds[]`, tạo `ProjectOrder(department:"BRAINSTORM", status:"SENT")` + `ProjectOrderAttendee` cho từng người chọn, tạo `Notification` (`type:"BRAINSTORM_MEETING_INVITE"`) gửi NGAY cho từng attendee (tiêu đề có tên dự án + thời gian họp). Không có accept.
- `createDepartmentOrder(projectId, department, formData)`: parse `extraBriefInfo/outputRequest/desiredTimeline` (riêng CREATIVE: đọc mảng checkbox `creative_item_{code}` + `creative_detail_{code}` thay vì `outputRequest`), snapshot `briefLinkUrl` từ project, tạo `ProjectOrder(status:"SENT", sentById)` (+ `ProjectOrderCreativeItem` nếu Creative), tìm `Staff` theo `departmentId` tương ứng (`prisma.staff.findMany({where:{department:{code: deptCode}, isActive:true}})`) rồi `notification.createMany` (`type:"DEPARTMENT_ORDER_RECEIVED"`) — tái dùng đúng pattern `notifyTeamAssignmentNeeded` trong [bidding/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\actions.ts).
- `acceptOrder(orderId)`: set `status:"ACCEPTED", acceptedAt, acceptedById`, revalidate — không notify thêm (ngoài phạm vi yêu cầu).

## UI
- Component mới `src/app/(app)/bidding/order-panel.tsx` (client) — render trong [bidding/[id]/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\[id]\page.tsx), chèn thành 1 `<section>` mới **ngay sau khối AssignTeamForm, TRƯỚC khối Go/No-Go** (tức trước cả CO/CE) — vì Order cần gửi ngay khi có brief, độc lập với quyết định Go/No-Go.
- 6 dòng tick (checkbox thuần UI, KHÔNG lưu DB khi chưa gửi): Họp brainstorm, Planning, Creative, Purchasing, Operation, Production.
  - Nếu **đã có `ProjectOrder`** cho bộ phận đó (SENT/ACCEPTED) → hiện thẳng thẻ trạng thái read-only (badge Chờ nhận/Đã nhận, thông tin đã gửi, nút "Chấp nhận" + dòng note nhỏ nếu đang SENT và không phải BRAINSTORM).
  - Nếu **chưa có** → tick mới bung form tương ứng (không tick = không hiện gì, không lưu gì).
- Form Brainstorm: ngày giờ họp, địa điểm (text), hình thức (Online/Offline select), **danh sách chọn nhiều người** — vì codebase chưa có multi-select component nào (đã xác nhận qua Explore), xây 1 checkbox-list cuộn nhỏ gọn tại chỗ (không cần component design-system riêng) liệt kê `Staff` đang active, mỗi dòng checkbox tên+chức danh. Nút "OK"/gửi lời mời.
- Form 5 phòng ban: hiển thị link brief (readonly, tự điền từ `project.briefLinkUrl`), textarea "Thông tin brief thêm", input ngày "Timeline mong muốn nhận" (default value = `project.createdAt + order_response_days` ngày, sửa được), và:
  - Planning/Purchasing/Operation/Production: 1 textarea "Yêu cầu output".
  - Creative: thay textarea bằng checklist 6 mục cố định (Key visual/Thiết kế 2D/Thiết kế 3D/Thiết kế bối cảnh/Video/Khác), mỗi mục có checkbox + ô "chi tiết" chỉ hiện khi tick.
  - Nút "Gửi" submit → tạo order ngay (không có trạng thái draft trung gian).
- Card trạng thái khi đã gửi: hiện lại toàn bộ thông tin đã nhập (read-only) + badge trạng thái; nếu `status="SENT"` (không phải BRAINSTORM) hiện nút "Chấp nhận" (gọi `acceptOrder`) kèm dòng chữ nhỏ: *"Nếu bạn chưa đồng ý task hay timeline này, vui lòng liên hệ ngay đến {PIC/team Account phụ trách} để thảo luận và thống nhất. Cảm ơn!"* — nội dung `{...}` lấy từ `project.owner?.fullName ?? project.ownerTeam?.code`.

## i18n
Namespace mới `bidding.order` (vi+en đầy đủ theo quy tắc parity hiện có): tiêu đề panel, nhãn 6 bộ phận, field labels (meeting: thời gian/địa điểm/hình thức/người mời/gửi lời mời; department order: link brief/thông tin brief thêm/yêu cầu output/timeline mong muốn/gửi), 6 nhãn checklist Creative + placeholder chi tiết, trạng thái (Chờ nhận/Đã nhận), nút Chấp nhận + dòng note kèm placeholder `{name}`. Thêm `settings.bidding.orderResponseDays`/Hint cho field Setting mới.

## Thứ tự triển khai
1. Schema (`ProjectOrder` + 2 bảng con + relations) → reset migrations/dev.db → `prisma migrate dev`.
2. Setting `order_response_days` (thêm vào seed.ts cùng nhóm setting `bidding` hiện có).
3. `order-actions.ts` (3 action ở trên).
4. i18n `bidding.order` + `settings.bidding.orderResponseDays*` (vi+en, chạy parity script).
5. Settings: thêm field `orderResponseDays` vào form `/settings/bidding` (`bidding-settings-form.tsx` + `actions.ts` cùng thư mục).
6. `order-panel.tsx` (6 tick-rows + 2 dạng form + card trạng thái) + chèn vào `bidding/[id]/page.tsx`.
7. Verify.

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx next build` — sạch; script diff vi.json/en.json — 0 lệch.
- Browser E2E: mở 1 project ở trạng thái Bidding → tick "Họp brainstorm" → điền giờ/địa điểm/hình thức + chọn 2 người → gửi → xác nhận card trạng thái hiện, `/reminders` mục Thông báo có 2 notification mới (1/người). Tick "Creative" → điền brief thêm + tick 2 mục checklist (VD Key visual + Video) kèm chi tiết + timeline → Gửi → xác nhận Notification gửi cho đúng Staff thuộc department CREATIVE, card hiện "Chờ nhận". Bấm "Chấp nhận" trên card đó → badge chuyển "Đã nhận", note biến mất. Lặp lại nhanh cho 1 bộ phận còn lại (VD Purchasing) để xác nhận field "Yêu cầu output" dạng text hoạt động đúng (khác Creative). Kiểm tra default `desiredTimeline` prefill đúng = ngày tạo dự án + giá trị Setting `order_response_days`. Test tiếng Anh cho toàn bộ panel.

### File trọng yếu (batch này)
[prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · `src/app/(app)/bidding/order-actions.ts` (mới) · `src/app/(app)/bidding/order-panel.tsx` (mới) · [src/app/(app)/bidding/[id]/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\[id]\page.tsx) · [src/app/(app)/settings/bidding](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\bidding).

---

# BATCH: Module ③ Project Management (khung) + Guest Portal (magic-link) — Creative chỉ vẽ flow

## Context
Bắt đầu module ③ — trục nối mọi bộ phận. Dự án thắng thầu ở ② chuyển sang thực thi trên **cùng bảng `Project`** (không tạo bảng dự án mới). Nghiệp vụ mới cần khung: (1) phân vai **Project Owner** (Account cấp trên, duyệt) vs **Project Leader** (nhân sự Account chạy timeline); (2) **Project Team đa phòng ban** (core Creative/PRO/OPE/PCC + support Planning/HR/IT); (3) **Master Timeline 2 lớp** — Internal (toàn TCM) và External (chia sẻ cho khách), dựng internal trước rồi chọn item share, Owner duyệt trước khi lộ; (4) **Guest Portal** cho PIC khách vào bằng **magic-link token** xem External Timeline, **sửa giới hạn ở item được đánh cờ**, xác nhận/bình luận.

Quyết định đã chốt với chủ dự án (AskUserQuestion): **đợt này chỉ build Project Management** (Creative vẽ flow trước, build đợt kế — xem sơ đồ đã trình bày); **dựng khung Timeline ngay với cấu trúc chung**, tinh chỉnh cột/định dạng sau khi chủ dự án gửi **file master timeline thật** (bản đơn giản/phức tạp quyết định sau); guest dùng **magic-link** (không mật khẩu); guest **sửa giới hạn ở mục được mở cờ**.

**Ràng buộc nền tảng (từ Explore):** app hiện KHÔNG có auth/session/RBAC nào; `getCurrentStaffId()` là stub trả CEO. **Nội bộ giữ nguyên stub** — chỉ dựng phiên đăng nhập thật cho **guest** (blast radius nhỏ). Department **`IT` chưa tồn tại** (phải seed); `HR` có nhưng chưa có staff. `Project` chưa có leader/assignment/timeline. `Contact` (PIC khách) chưa có field credential. `Setting` hỗ trợ JSON + scope (chỉ có `getNumberSetting`, cần thêm getter JSON/scoped). Tiền = BigInt; hàm thuần kiểu `lib/bidding.ts`. Editor lồng nhiều cấp theo mẫu `settings/costsheet-templates/[id]`. Chưa có UI timeline/gantt nào — dựng từ đầu. Nav `projects` (③) đang là placeholder `soon` → kích hoạt.

## A) Data model (Prisma — reset dev DB + migrate như các batch trước)
- **`Project`**: thêm `leaderId String?` (FK Staff, relation "ProjectLeader") = Project Leader. Giữ `ownerId` hiện có làm **Project Owner** (Account cấp trên duyệt). Cả hai nên là staff department `ACCOUNT` (validate app-side, không cứng ở DB).
- **`ProjectMember`** (mới, `@@map("project_member")`): `id, projectId, staffId, roleInProject String` (LEADER|CORE|SUPPORT), `note String?`, `createdAt`. `@@unique([projectId, staffId])`. Quan hệ project (Cascade) + staff. Department suy ra từ `staff.department` (core = Creative/PRO/OPE/PCC, support = Planning/HR/IT — chỉ là phân loại hiển thị, không cứng).
- **`TimelineItem`** (mới, `@@map("timeline_item")`) — bảng lõi Master Timeline, 1 bảng chứa cả field internal + override external:
  - Internal: `id, projectId, parentId String?` (Phase→Task; item cha có con), `title, startDate DateTime?, endDate DateTime?, ownerStaffId String?, departmentCode String?, statusId String?` (option_set mới `timeline_status`), `sort Int`.
  - External override: `isShared Boolean @default(false)`, `externalPublished Boolean @default(false)` (Owner duyệt mới true), `externalTitle String?`, `externalStartDate DateTime?`, `externalEndDate DateTime?`, `clientEditable Boolean @default(false)` (cờ "cho khách sửa"), `clientStatus String?` (PENDING|CONFIRMED|NEEDS_DISCUSSION — guest ghi), `clientNote String?` (guest ghi).
  - Quan hệ: project (Cascade), self-relation parent/children, ownerStaff Staff?, status OptionItem?. `@@index([projectId, sort])`.
  - **External Timeline = các item `isShared && externalPublished`**, hiển thị `externalTitle ?? title`, `externalStartDate ?? startDate`… Guest chỉ ghi được `clientStatus`/`clientNote` và CHỈ khi `clientEditable`.
- **`TimelineComment`** (mới, `@@map("timeline_comment")`): `id, itemId, authorType String` (STAFF|GUEST), `authorStaffId String?`, `authorGuestId String?`, `body, createdAt`. Cho luồng xác nhận/bình luận từ cả 2 phía.
- **`GuestInvite`** (mới, `@@map("guest_invite")`) — danh tính guest + magic-link:
  - `id, projectId, contactId String?` (nối `Contact` PIC khách nếu có), `email, name`, `tokenHash String @unique` (LƯU HASH của token, không lưu token thô), `expiresAt DateTime?, revokedAt DateTime?, lastAccessAt DateTime?, createdById String?, createdAt`. Quan hệ project (Cascade), contact optional.
- **`Staff`**: thêm back-relations (`projectsLed`, `projectMemberships`, `timelineItemsOwned`, `timelineComments`).
- **OptionSet mới** `timeline_status` (seed: NOT_STARTED / IN_PROGRESS / BLOCKED / DONE) — tái dùng trang generic `/settings/options/[setCode]` + drag-thứ-tự đã có.

## B) Guest magic-link auth (phần greenfield — làm cẩn thận, đây là session THẬT đầu tiên của app)
- **Route group mới `(guest)`** tách hẳn `(app)`: `src/app/(guest)/layout.tsx` KHÔNG có Sidebar/Header nội bộ — chỉ header dự án + External Timeline. `src/app/(guest)/portal/page.tsx`.
- **Tạo lời mời** (trong workspace `/projects/[id]`, action `createGuestInvite`): sinh token ngẫu nhiên (`crypto.randomBytes(32).toString("base64url")`), lưu **hash** (`sha256`) vào `GuestInvite.tokenHash`, trả token thô 1 lần để Account copy link `/(guest)/portal?token=…`. Có nút thu hồi (`revokeGuestInvite` → set `revokedAt`) và hạn `expiresAt`.
- **Đăng nhập guest**: route xử lý token (vd `src/app/(guest)/portal/enter/route.ts` hoặc trong page): hash token → tra `GuestInvite` (chưa hết hạn, chưa thu hồi) → set **cookie httpOnly ký** `guest_session` (ưu tiên JWT ký bằng secret env, hoặc lưu 1 dòng session tạm) chứa `{inviteId, projectId}` → cập nhật `lastAccessAt` → vào portal. **Không mật khẩu, không cho guest tự tạo tài khoản.**
- **Helper mới** `src/lib/guest-session.ts`: `getGuestSession()` đọc/verify cookie → `{inviteId, projectId} | null`. Dùng ở mọi server action guest.
- **Chốt bảo mật (enforce server-side, KHÔNG tin client):**
  - Guest chỉ thấy đúng `projectId` trong session; mọi query external filter `isShared && externalPublished`.
  - Action guest (`guestUpdateItem`, `guestAddComment`) phải: verify session → item thuộc đúng project → `clientEditable === true` → chỉ cho ghi `clientStatus`/`clientNote`/comment; field khác từ chối.
  - Ghi guest → tạo `Notification` cho Account/Leader (type mới `EXTERNAL_TIMELINE_UPDATED`).
- **KHÔNG đụng auth nội bộ**: `getCurrentStaffId()` giữ stub. Không thêm login nội bộ đợt này.

## C) UI / routes nội bộ
- Kích hoạt nav `projects` (③) `status:"active"` trong [nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts).
- **`/projects`** (list): dự án đã qua bidding (status PROCESSING/LIQUIDATION/HANDOVER/FINISHED — dự án thực thi), theo mẫu list + card mobile của `/bidding`. Lọc theo team/status/search.
- **`/projects/[id]`** (workspace) — các `<section>` card theo mẫu detail hiện có:
  1. Header dự án + badge + Owner/Leader (form gán `assignProjectRoles`).
  2. **Project Team**: thêm/xóa `ProjectMember` (Combobox staff), phân core/support theo department.
  3. **Internal Master Timeline**: editor Phase→Task (mẫu 3 cấp `costsheet-template`: thêm/xóa/dời `sort`, sửa title/ngày/owner/status). Mỗi item có toggle **Share ra ngoài** + cờ **cho khách sửa** + (khi share) field external override.
  4. **External review & publish**: Owner duyệt item Leader đã đổi → `externalPublished`. Nút "Tạo link mời khách" + danh sách `GuestInvite` (copy link / thu hồi).
  5. Comment/nhật ký.
  - Mobile: rút gọn theo pattern `sm:hidden` card + note "xem đầy đủ trên máy tính" như batch trước.
- **Settings**: thêm option_set `timeline_status` vào titleMap trang generic; (tùy chọn) 1 setting `projects.timeline_reminder_days`.

## D) Reminders
- Thêm `getTimelineReminders()` (computed thuần) hoặc `checkTimelineDeadlineReminders()` (idempotent no-cron như `checkOrderDeadlineReminders`) cho item timeline sắp/đã quá hạn chưa DONE → notify owner + Leader. Cộng vào bell badge ở [layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\layout.tsx).

## E) Seed
- Thêm **department `IT`** + vài staff mẫu (IT, HR) để test Project Team đa phòng ban.
- Thêm `leaderId` cho vài project mẫu; vài `ProjectMember`; option_set `timeline_status`; 1 project mẫu có Internal Timeline vài item (1-2 item shared+published) + 1 `GuestInvite` mẫu để test portal.

## F) i18n
- Namespace mới `projects` (list/detail/team/timeline/roles/guest-invite) + `guest` (portal khách) + `nav.projects` đã có. Thêm `settings.index.timelineStatus*`. Parity vi/en 0 lệch (script như cũ).

## Creative (CHỈ vẽ flow đợt này — build đợt kế)
Sơ đồ đã trình bày. Khung dự kiến (build sau): `/creative` gom mọi `ProjectOrder(department="CREATIVE")`; `CreativeTask` (assignee, taskType, status, dueDate, estHours/actHours/revisionCount/qualityRating) cho giao việc nội bộ + performance; bộ **cost per task** = `CreativeSalaryBudget` (lương tháng/vị trí, period-scoped) + ma trận `CreativeAllocationRatio` (vị trí × loại task → %) → `computeCostPerTask` (hàm thuần `src/lib/creative.ts`); chu kỳ review (setting `creative.cost_review_cycle`: MONTH|QUARTER|HALF|YEAR); editor ma trận theo mẫu costsheet-template 3 cấp. Tái dùng vòng đời Order + notification + reminder no-cron.

## Deferred / chờ chủ dự án
- **Định dạng Master Timeline chi tiết** (cột, cấp Phase/Task, bản đơn/phức tạp): tinh chỉnh sau khi có **file thật**. Khung `TimelineItem` cố ý tổng quát để hứng.
- Auth nội bộ thật + RBAC/team-scoping: ngoài phạm vi đợt này (giữ stub CEO).

## Thứ tự triển khai (mỗi bước giữ app compile được)
1. Schema (Project.leaderId + ProjectMember + TimelineItem + TimelineComment + GuestInvite + relations) → reset migrations/dev.db → `prisma migrate dev`.
2. Seed: dept IT + staff HR/IT, option_set timeline_status, leader + members + timeline mẫu + guest invite mẫu.
3. Helpers: `src/lib/guest-session.ts`, getter JSON/scoped trong `src/lib/settings.ts` (nếu cần), reminders bổ sung, (tùy) `src/lib/projects.ts` thuần.
4. i18n: thêm namespace `projects` + `guest` (vi/en, chạy parity).
5. Actions nội bộ: `src/app/(app)/projects/actions.ts` (roles, members, timeline CRUD + share/publish, createGuestInvite/revoke).
6. UI nội bộ: `/projects` list + `/projects/[id]` workspace (5 section) + kích hoạt nav + settings option.
7. Guest portal: route group `(guest)`, portal page + enter/verify token + `guestUpdateItem`/`guestAddComment` (enforce chốt bảo mật) + cookie phiên.
8. Reminders + bell badge.
9. Verify.

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx next build` — sạch. Script diff key vi/en — 0 lệch.
- Browser E2E (dev server + Claude Browser, cả vi/en, cả desktop 1280 + mobile 375):
  - Tạo/mở 1 dự án thực thi → gán Owner + Leader → thêm ProjectMember từ Creative + HR + IT.
  - Dựng Internal Timeline vài Phase/Task, đổi ngày/owner/status, dời thứ tự.
  - Đánh dấu share 2 item, 1 item bật "cho khách sửa"; Owner publish.
  - Tạo magic-link → mở ở tab guest (route `(guest)`): xác nhận CHỈ thấy item shared+published, KHÔNG thấy sidebar nội bộ, KHÔNG thấy dự án khác.
  - Guest sửa `clientStatus`/note ở item mở cờ (OK), thử item không mở cờ (bị chặn) → notify về Account.
  - Thu hồi link → guest mất quyền vào. Kiểm mobile rút gọn + note "xem trên máy tính".

### File trọng yếu (batch này)
[prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · `src/lib/guest-session.ts` (mới) · [src/lib/reminders.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\reminders.ts) · `src/app/(app)/projects/**` (mới) · `src/app/(guest)/**` (mới) · [nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts) · [layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\layout.tsx) · messages/vi.json · messages/en.json.

---

# BATCH: Module Creative — Dashboard realtime + quản lý Task (cost-per-task để đợt sau)

## Context
Module Creative mới: nơi tập trung quản lý mọi task giao cho team Creative, giao việc nội bộ, luồng duyệt của CD (Creative Director), đếm giờ, theo dõi hiệu quả, notification từng khâu, trả thành phẩm qua link. Hiện **chưa có** khái niệm task/assignment/giờ/revise/CD-duyệt nào (xác nhận qua Explore) — toàn bộ là greenfield. Neo tái dùng: `ProjectOrder(CREATIVE).sentById` = người ORDER; option_set + UI kéo-thả cho danh mục task admin sửa được; pattern Notification + bell; StatCard ở dashboard tổng quan.

Quyết định đã chốt (AskUserQuestion):
1. **Cost-per-task (lương + ma trận phân bổ + chu kỳ review) để ĐỢT SAU.** Đợt này build phần vận hành; dữ liệu giờ/revise tích lũy ngay để đợt sau tính cost ngược lại.
2. **Task tự sinh từ checklist của Order Creative** (Order từ Account/Planning, mang theo Project + Khách hàng). **CD quyết định giao từng task cho ai.**
3. **Khóa cứng task**: project → CANCELED/FAILED ⇒ mọi task CHƯA trả (≠ DELIVERED) bị khóa sang CANCELED, read-only ở Creative. Project → FINISHED ⇒ **cho Creative 7 ngày** (lưu về local server TCM) rồi mới khóa. Trạng thái khác không đụng task.

## Định nghĩa & mô hình
- **Task** = 1 tác vụ cụ thể team Creative phải làm. Phase của task (BIDDING/WORKING) **tính realtime** từ `project.status.code`: WORKING = `EXECUTION_STATUS_CODES` (PROCESSING/LIQUIDATION/HANDOVER/FINISHED), BIDDING = BIDDING/PENDING.
- Vòng đời: `UNASSIGNED` (vừa sinh từ checklist) → CD giao → `ASSIGNED` → NV bấm GỬI → nếu `cdApprovalNotRequired` ⇒ `DELIVERED` (báo người ORDER); ngược lại ⇒ `SUBMITTED` (báo CD) → CD **Duyệt** ⇒ `DELIVERED` / **Trả lại** ⇒ `REVISION` (revisionCount++, báo NV) → NV GỬI lại. `CANCELED` = bị khóa theo project.

## Schema (Prisma — reset dev DB + migrate như các batch trước)
- **`CreativeTask`** (`@@map("creative_task")`): `id, projectId, orderId String?` (ProjectOrder CREATIVE nguồn), `orderedById String?` (snapshot người ORDER = order.sentById, fallback project.ownerId), `sourceItemLabel String?` (dedupe khi tự sinh từ checklist), `taskTypeId String?` (option_set `creative_task_type`), `title, detail String?`, `status String @default("UNASSIGNED")`, `assigneeId String?, assignedById String?, assignedAt DateTime?`, `cdApprovalNotRequired Boolean @default(false)`, `deadline DateTime?`, `deliverableLinkUrl String?`, `hoursSpent Float?` (bội số 0.25), `submittedAt DateTime?`, `revisionCount Int @default(0)`, `reviewedById String?, reviewedAt DateTime?`, `deliveredAt DateTime?`, `createdAt/updatedAt`. Quan hệ: project (Cascade), order?(SetNull/Cascade), taskType OptionItem?, assignee/assignedBy/reviewedBy/orderedBy Staff?. Index `[projectId, status]`, `[assigneeId, status]`.
- **`Project.finishedAt DateTime?`** — set trong `markFinished` (mốc tính 7 ngày grace).
- **`Staff`** back-relations: `creativeTasksAssigned`, `creativeTasksCd`, `creativeTasksReviewed`, `creativeTasksOrdered`.
- **`OptionItem`** back-relation `creativeTasksAsType`.
- **`Notification`** comment += `CREATIVE_TASK_ASSIGNED | CREATIVE_TASK_NEEDS_APPROVAL | CREATIVE_TASK_DELIVERED | CREATIVE_TASK_REVISION`.
- **OptionSet mới** `creative_task_type` (admin add/sửa/xóa/kéo-thả qua trang generic sẵn có): 2D Key visual, 2D adapt POSM, 3D Booth, 3D Sân khấu, Bảng vẽ kỹ thuật, Final Artwork (FA), Video.

## Lib mới `src/lib/creative.ts` (hàm thuần + tái dùng)
- Hằng: `CREATIVE_TASK_STATUSES`, `ACTIVE_TASK_STATUSES` (≠ DELIVERED/CANCELED), `taskPhase(statusCode) → "BIDDING"|"WORKING"`.
- `spawnTasksForCreativeOrder(orderId)` — idempotent theo `(orderId, sourceItemLabel)`: mỗi `ProjectOrderCreativeItem` chưa có task thì tạo 1 CreativeTask UNASSIGNED (title từ label+detail, `orderedById` = order.sentById ?? project.ownerId). Gọi từ `order-actions.createDepartmentOrder` khi department=CREATIVE (sau khi tạo creativeItems).
- `lockCreativeTasksForProject(projectId)` — set mọi task ≠ DELIVERED/CANCELED → CANCELED. Gọi từ terminal actions.
- `isTaskLocked(statusCode, finishedAt) → boolean` — true nếu project CANCELED/FAILED, hoặc FINISHED & `finishedAt + 7d < now`. Dùng ở UI + guard action.
- `getCreativeDashboardStats()` — tổng hợp realtime: tổng task active chia BIDDING/WORKING, theo từng member, số project active chia BIDDING/WORKING, breakdown theo loại task; per-member performance (số task, giờ TB, tỉ lệ duyệt-lần-1 = revisionCount 0). **Không cost** đợt này.

## Server actions `src/app/(app)/creative/actions.ts` (guard `isTaskLocked` trước mọi mutate)
- `assignCreativeTask(taskId, formData)` — CD set `assigneeId, taskTypeId, cdApprovalNotRequired, deadline` → ASSIGNED, notify assignee (`CREATIVE_TASK_ASSIGNED`).
- `submitCreativeTask(taskId, formData)` — NV set `deliverableLinkUrl` + `hoursSpent` (validate >0, bội số 0.25) → nếu `cdApprovalNotRequired` ⇒ DELIVERED + notify `orderedById` (`CREATIVE_TASK_DELIVERED`, body=link); ngược lại ⇒ SUBMITTED + notify `assignedById` (`CREATIVE_TASK_NEEDS_APPROVAL`).
- `approveCreativeTask(taskId)` — CD ⇒ DELIVERED + notify orderer.
- `rejectCreativeTask(taskId, formData)` — CD ⇒ REVISION, `revisionCount++`, notify assignee (`CREATIVE_TASK_REVISION`, kèm note).
- `createCreativeTask(formData)` — CD tạo task lẻ (chọn project + taskType + title) → UNASSIGNED.
- `deleteCreativeTask(taskId)` — chỉ xóa task UNASSIGNED.
- Tất cả revalidate `/creative` (+ `/reminders`).

## Sửa file hiện có
- [bidding/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\actions.ts): gọi `lockCreativeTasksForProject(projectId)` trong `markFailed`, `markClientCancel`, và nhánh NO-GO của `decideGoNogo`; set `finishedAt: new Date()` trong `markFinished`.
- [bidding/order-actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\order-actions.ts): trong `createDepartmentOrder`, nếu department=CREATIVE thì gọi `spawnTasksForCreativeOrder(order.id)` sau khi tạo creativeItems. **KHÔNG đổi form checklist Order hiện có** (giữ 6 nhãn cũ làm nguồn sinh task; CD chọn `creative_task_type` chính xác lúc giao) — hạn chế rủi ro cho module Bidding đang chạy.

## UI
- **`/creative/page.tsx`** (server): (1) **Dashboard** — dãy StatCard (copy pattern từ `app/page.tsx`): Tổng task đang làm [BIDDING|WORKING], Số project đang làm [BIDDING|WORKING], + bảng per-member (task đang làm chia BIDDING/WORKING, giờ TB, % duyệt-lần-1); (2) **Task board** — client component `task-board.tsx`: nhóm theo trạng thái (Chờ giao / Đang làm / Chờ CD duyệt / Đã trả / Đã khóa), mỗi task 1 hàng mở rộng với form phù hợp vai trò (CD: giao/duyệt/trả; NV: GỬI kèm link + giờ). Badge BIDDING/WORKING + loại task. Task bị khóa → read-only + nhãn lý do (Cancel/Failed/hết 7 ngày FINISHED). Form "Tạo task lẻ" cho CD. Lọc theo project/assignee/phase.
- Mobile: rút gọn theo pattern `sm:hidden` card + note "xem đầy đủ trên máy tính".
- **Nav**: thêm mục "Creative" vào [nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts) (icon Palette, active).
- **Settings**: đăng ký `creative_task_type` (tile trong `/settings` + titleMap trong `settings/options/[setCode]/page.tsx` + `settings.index.creativeTaskType*`).
- **Reminders/bell**: notification Creative tự cộng vào bell (đếm toàn bộ unread) — không cần section riêng.

## i18n
Namespace mới `creative` (dashboard labels, trạng thái task, nhãn BIDDING/WORKING, action giao/GỬI/duyệt/trả/tạo, field giờ/link/deadline/CD-không-cần-duyệt, per-member metrics) + `nav.creative` + `settings.index.creativeTaskType*`. Parity vi/en 0 lệch.

## Seed
- OptionSet `creative_task_type` (7 mục).
- Vài nhân sự CREATIVE (Senior Designer, 3D Artist…) để dashboard per-member có dữ liệu.
- 1 Order Creative mẫu trên T002 (WORKING) + 1 trên T001 (BIDDING) với checklist → chạy `spawnTasksForCreativeOrder` → sinh task mẫu; set sẵn vài task ở các trạng thái (assigned/submitted/delivered, có giờ + revisionCount) để Dashboard hiện số realtime + demo per-member.

## Hạn chế đã biết (nêu rõ)
- **Không RBAC**: "cost chỉ admin/HR/CD xem" là của đợt cost sau; ngay cả khi có, do `getCurrentStaffId` là stub (luôn CEO) nên gate chỉ mang tính danh nghĩa cho tới khi có auth thật. Vai trò "CD" hiện đại diện bằng người `assignedById` (người giao task) để định tuyến notify duyệt.
- Notification/bell vẫn global (chưa lọc theo người nhận) — nhất quán các batch trước.

## Thứ tự triển khai
1. Schema (CreativeTask + Project.finishedAt + relations + option back-rel) → reset migrations/dev.db → migrate.
2. Seed: creative_task_type, nhân sự Creative, order + task mẫu.
3. `src/lib/creative.ts` (hằng + spawn + lock + isTaskLocked + dashboard stats).
4. i18n `creative` + `nav.creative` + `settings.index.creativeTaskType*` (parity).
5. Sửa bidding/actions.ts (lock + finishedAt) & order-actions.ts (spawn).
6. `creative/actions.ts` (6 action) + `creative/page.tsx` + `task-board.tsx` + nav + settings đăng ký.
7. Verify.

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx next build` — sạch. Diff key vi/en — 0 lệch.
- Browser E2E (dev server + Claude Browser, cả vi/en, desktop 1280 + mobile 375):
  - `/creative`: Dashboard hiện số task chia BIDDING/WORKING, per-member, số project — khớp seed.
  - CD giao 1 task UNASSIGNED (chọn loại + người + deadline, KHÔNG tick CD-duyệt) → ASSIGNED, notify assignee.
  - NV bấm GỬI: nhập link Drive + giờ 1.5 (chặn giờ lẻ ≠ bội 0.25) → SUBMITTED, notify CD (assignedById).
  - CD **Trả lại** kèm note → REVISION, revisionCount=1, notify NV. NV GỬI lại → SUBMITTED. CD **Duyệt** → DELIVERED, notify người ORDER kèm link.
  - Task khác tick "CD không cần duyệt" → NV GỬI → DELIVERED thẳng, notify ORDER.
  - Khóa: ở /bidding, đánh dấu 1 project THUA/HỦY → về /creative thấy task project đó chuyển CANCELED, read-only. Test FINISHED: đánh dấu Finished → task vẫn sửa được (trong 7 ngày), hiện nhãn grace.
  - Settings: `/settings/options/creative_task_type` thêm/sửa/kéo-thả 1 loại → phản ánh ở form giao task.

### File trọng yếu (batch này)
[prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · `src/lib/creative.ts` (mới) · `src/app/(app)/creative/**` (mới) · [bidding/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\actions.ts) · [bidding/order-actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\order-actions.ts) · [nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts) · [settings/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\page.tsx) · messages/vi.json · messages/en.json.

---

# BATCH: Module ③ Project — Master Timeline (mẫu Gantt/Checklist) · Workspace sub-route · Tự sinh ORDER từ PIC · CO/CE version tracking · Liquidation

## Context
Khâu quan trọng nhất ngay đầu workflow thực thi: Account/Project Leader lập **Master Timeline (có team gọi "checklist")** cho cả dự án. Chủ dự án gửi **2 file thật** để chuẩn hóa:
- **JBVN "Master timeline"** (Convention 2026 — sự kiện lớn, lead-time dài): dạng **Gantt** — cột là **ngày** trải ~7 tuần; hàng có Duration/Deadline; nặng về **vòng revise thiết kế** (Design lần 1 → Feedback → Duyệt màu → Test chất liệu → Sản xuất) và lead-time sản xuất. Cấu trúc **3 cấp**: Section (A/B/C = JBVN/VENUE/DESIGN/BALLROOM…) → Item (Photobooth 1, Standee, Áo thun…) → Sub-task. Cột: **No. | Items | Chi tiết | PIC TCM | PIC | Status | Duration | Deadline | [lưới ngày] | Event**. `PIC TCM` = người nội bộ (Duyên); `PIC` = bên chịu trách nhiệm (TCM/JBVN/vendor Marvy). Status: done/working/waiting/pending.
- **KUN "Checklist"** (Đường trượt — activation/roadshow, nhanh, nặng logistics): dạng **checklist + BOM + ma trận nhân sự**. Hai khối: (1) **Ma trận HR** — hàng = vai trò (MC, PG/PB, Mascot, Sup, Helper), cột = khu vực hoạt động (Phát leaflet, Check in, Bán hàng, Game…), ô = số lượng; (2) **Checklist**: **STT | Danh mục | Diễn giải | ĐVT | Số lượng | PIC (Chuẩn bị / Thực hiện) | Ngày | Ghi chú**. Nhóm theo Phase La Mã (I. CHUẨN BỊ, II. HÀNG HÓA) → nhóm con (Thiết kế-in ấn/Teasing-Event, Nhân sự, Vận chuyển, Set up…). Ngày là mốc đơn (done/WIP/25-12). Ghi chú theo dõi tái sử dụng ("Tái sử dụng tke An Giang") + liên hệ vendor.

⇒ **2 archetype khác biệt thật.** Đây là batch **tinh chỉnh** khung `TimelineItem` (đã cố ý tổng quát ở batch ③ trước) dựa trên file thật.

### Quyết định đã chốt với chủ dự án (AskUserQuestion)
1. **1 model chung + nhiều mẫu (template) theo Nhóm dự án + 2 kiểu xem: GANTT (JBVN) và CHECKLIST/BOM (KUN)** — admin cấu hình cột hiển thị. (Không dùng 1 form phẳng cứng; không tách form silo riêng biệt.)
2. **Tách sub-route + thanh nav dọc riêng trong workspace dự án** (không dồn 1 trang dài scroll).
3. **PIC trên Timeline → gom thành ORDER _nháp_ theo bộ phận; Leader duyệt/sửa + set timeline mong muốn rồi mới gửi** (có cổng duyệt, idempotent, không auto-send).
4. **CO/CE: snapshot mỗi lần lưu (v1,v2,v3…) + so sánh từng dòng** (item nào thêm/xóa/sửa gì, chênh bao nhiêu tiền) + đánh dấu bản hợp đồng gốc (baseline). Bản sống hiện tại = version cuối realtime.

### Ràng buộc nền tảng (từ Explore — đã xác minh verbatim)
- Workspace `/projects/[id]` hiện là **4 card phẳng xếp dọc**: Roles → Team → Internal Timeline → Guest invites. **Không có** sub-nav/anchor. Sidebar toàn cục **phẳng tuyệt đối** (`NavItem` không có `children`; `Sidebar` chỉ render link phẳng) → sub-module phải là **left-rail cục bộ trong workspace** (đúng ý "nằm dưới Project khi vào 1 dự án"), không hack sidebar toàn cục.
- `TimelineItem` **đã có `ownerStaffId` (staff id thật) + `departmentCode`** → automation PIC→ORDER **resolve sạch** (staff → `department.code`), không cần match theo tên (tên staff **không unique**, toàn hệ thống dùng id). Editor hiện chỉ render **2 cấp** (Phase→Task) — cần nâng lên **3 cấp** để khớp file thật.
- **ORDER panel hiện nằm ở `/bidding/[id]`** (`order-panel.tsx` + `order-actions.ts`), KHÔNG ở Projects. `ProjectOrder` **unique `(projectId, department)`**; department order dùng 1 field text `outputRequest` (chỉ Creative có bảng con `ProjectOrderCreativeItem`). Chưa có tùy chọn ORDER cho **HR/IT**.
- **CO/CE chỉ sống ở `/bidding/[id]`**: **một `CostSheet` version `CTRACT`/dự án, ghi đè tại chỗ** (upsert `findFirst`→update + `deleteMany` sections). **Không có bảng revision** — `AuditLog` chỉ lưu snapshot tiến (`newValue` JSON tổng tiền), không old-vs-new theo dòng. `LIQUID` **đã khai báo trong enum nhưng chưa dùng ở đâu**. Liquidation hiện = status + 2 cờ kế toán trên `Contract` (`accountantConfirmedAt`, `acceptanceDocsConfirmedAt`), chưa có CECO Liquid.
- Money = BigInt; hàm thuần kiểu `lib/bidding.ts`. Editor lồng nhiều cấp theo mẫu `settings/costsheet-templates/[id]` (Template→Section→Line, đủ CRUD + move sort). Notification fan-out: `staff.findMany({where:{department:{code},isActive:true}})` → `notification.createMany`.

---

## A) Data model (Prisma — reset dev DB + migrate như các batch trước)

### A1. Mẫu Master Timeline (mirror họ `CostsheetTemplate`)
- **`TimelineTemplate`**: `id, name, projectTypeId String?` (FK `project_type`), `viewMode String @default("GANTT")` (GANTT|CHECKLIST), `columnsJson String?` (danh sách cột bật/tắt: pic/pic2/accountable/duration/deadline/qty/unit/status), `isActive Boolean, createdAt/updatedAt`. Relations: projectType OptionItem?, `sections TimelineTemplateSection[]`.
- **`TimelineTemplateSection`**: `id, templateId, code, nameVi, nameEn?, sort`. Cascade.
- **`TimelineTemplateItem`**: `id, sectionId, parentLabel String?` (gợi ý gom Item; null=Item cấp 1), `title, defaultDepartmentCode String?, defaultDurationDays Int?, defaultUnit String?, defaultQty Float?, sort`. Cascade. (Seed khung Phase→Item→Task; runtime khi tạo timeline từ mẫu sẽ vật hóa thành `TimelineItem`.)

### A2. `TimelineItem` — thêm cột tùy chọn (phủ cả 2 archetype)
- `quantity Float?`, `unit String?` (KUN BOM).
- `secondaryOwnerStaffId String?` + relation `"TimelineItemOwner2"` (KUN: PIC Chuẩn bị vs Thực hiện; JBVN: PIC phụ).
- `accountableParty String?` (JBVN cột "PIC" = TCM/JBVN/vendor — free text, không FK).
- `templateItemId String?` (provenance từ mẫu, không FK cứng).
- Giữ `parentId` self-relation; **editor nâng lên render 3 cấp** (Phase→Item→Task) — schema không đổi, chỉ UI đệ quy thêm 1 tầng.

### A3. Ma trận nhân sự (KUN) — sub-feature
- **`ProjectStaffing`** (bảng phẳng đơn giản): `id, projectId, roleLabel, zoneLabel, headcount Int @default(0), sort`. Cascade. Render dạng **lưới sửa được** (hàng=roleLabel distinct, cột=zoneLabel distinct) trong Timeline khi `viewMode=CHECKLIST`. (Không làm pivot-table phức tạp; gom distinct ở app-side.)

### A4. Order tổng quát hóa (PIC→ORDER)
- **`ProjectOrderItem`** (mới, tổng quát hóa `ProjectOrderCreativeItem`): `id, orderId, sourceTimelineItemId String?` (provenance, idempotent key), `label, detail String?, desiredReceiptAt DateTime?, status String @default("PENDING")` (PENDING|DONE), `sort`. Cascade theo order; `sourceTimelineItem` relation optional (SetNull).
- **`ProjectOrder`**: thêm `origin String @default("MANUAL")` (MANUAL|TIMELINE) và `isDraft Boolean @default(false)` (cổng draft→dispatch). Mở rộng department cho **HR, IT**.
- **Creative spawn refactor**: `spawnTasksForCreativeOrder` đọc từ `ProjectOrderItem` (thay `ProjectOrderCreativeItem`). **Giữ lại** `ProjectOrderCreativeItem` + form checklist Creative ở `order-panel.tsx` (bidding) để **không phá module đang chạy**, nhưng khi sync từ timeline thì tạo `ProjectOrderItem`. → 2 nguồn hội tụ vào cùng `ProjectOrder`. (Ghi rõ đây là điểm cần verify kỹ.)

### A5. CO/CE revisions
- **`CostSheetRevision`**: `id, costSheetId, revNo Int, isBaseline Boolean @default(false), ceTotal BigInt, coTotal BigInt, chiHo BigInt, marginPct Float, note String?, createdById String?, createdAt, snapshotJson String` (JSON đầy đủ sections+lines để diff). Index `[costSheetId, revNo]`. Cascade theo costSheet.

---

## B) Automation: PIC trên Timeline → ORDER nháp
- **Helper mới `src/lib/project-orders.ts`**: `syncTimelineOrders(projectId)` — nạp `timelineItems` (include ownerStaff.department); gom theo **department resolve** (`ownerStaff.department.code` ưu tiên, fallback `departmentCode`); với mỗi department **upsert `ProjectOrder(origin:"TIMELINE", isDraft:true, department)`** rồi **reconcile `ProjectOrderItem`** idempotent theo `sourceTimelineItemId` (thêm dòng mới, gỡ dòng timeline đã xóa, giữ `desiredReceiptAt`/`detail` Leader đã sửa). **KHÔNG notify** (còn nháp). ACCOUNT tự phụ trách → bỏ qua. Reuse pattern fan-out có sẵn.
- **`dispatchOrder(orderId)`**: set `isDraft=false`; notify staff bộ phận (`DEPARTMENT_ORDER_RECEIVED`); nếu CREATIVE → `spawnTasksForCreativeOrder`. Đây là "cổng gửi" của Leader.
- **`updateOrderItem(itemId, formData)`**: Leader sửa `detail`/`desiredReceiptAt`/`label` từng dòng.
- **Trigger sync**: nút **"Làm mới ORDER từ Timeline"** trên tab ORDER (chủ động, tránh churn mỗi keystroke) + gọi kèm sau `createTimelineItem/updateTimelineItem/deleteTimelineItem`. HR/IT xuất hiện khi có item timeline gán người thuộc HR/IT (dự án lớn).

---

## C) Workspace sub-route + nav rail cục bộ
Chuyển `/projects/[id]` (1 trang) → **layout + 5 tab**:
- **`src/app/(app)/projects/[id]/layout.tsx`** (mới): header tóm tắt dự án (giữ block hiện có) + **`WorkspaceNav`** (left-rail dọc, client component `usePathname` active) list 5 mục. Trên mobile: rail thành thanh ngang cuộn + note "xem đầy đủ trên máy tính".
- **Tab & route:**
  1. `/projects/[id]` (**Overview**): Roles + Team + Guest invites (giữ nguyên component `RolesForm`/`TeamManager`/`GuestInviteManager` — chỉ **di chuyển** khỏi trang gốc).
  2. `/projects/[id]/timeline` (**Master Timeline**): chọn mẫu (template picker theo `projectTypeId`) → editor 3 cấp + cột theo `viewMode`/`columnsJson` + (checklist mode) lưới `ProjectStaffing`. Giữ toàn bộ share/publish/clientEditable hiện có.
  3. `/projects/[id]/orders` (**ORDER**): danh sách ORDER nháp gom theo bộ phận (gồm HR/IT) + sửa từng `ProjectOrderItem` + set `desiredReceiptAt` + nút **Gửi** (dispatch) + card trạng thái đã gửi (reuse khái niệm từ `order-panel.tsx`). Brainstorm vẫn ở bidding (giai đoạn tiền dự án) — không nhân đôi.
  4. `/projects/[id]/co-ce` (**CO/CE**): **reuse `cost-sheet-builder.tsx`** trên **cùng `CostSheet` CTRACT** (chính là "CO mang xuống từ Bidding" — cùng 1 bản ghi, không copy) + **"Lịch sử phiên bản"** (list `CostSheetRevision`) + **"So sánh"** 2 revision → bảng diff. Cho phép tiếp tục sửa khi khách phát sinh yêu cầu.
  5. `/projects/[id]/liquidation` (**Liquidation**): bề mặt hóa các control liquidation hiện có (xác nhận kế toán hợp đồng xong / đủ hồ sơ nghiệm thu, chuyển Finished, handover). CECO Liquid (version `LIQUID`) để đợt sau — nêu rõ.
- `bidding/[id]/page.tsx` giữ nguyên CO/CE builder cho **giai đoạn Bidding**; cùng sửa 1 sheet ⇒ revision ghi bất kể sửa ở đâu.

## D) CO/CE version tracking + diff
- Trong `saveCostSheet` ([bidding/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\actions.ts)): sau khi tính totals + ghi sheet (trong cùng `$transaction`), **tạo `CostSheetRevision`** với `revNo = maxRev+1`, `snapshotJson` = toàn bộ sections+lines vừa lưu (+ totals). Baseline: `isBaseline=true` cho revision tạo tại thời điểm dự án vào PROCESSING (đánh dấu trong `moveToProcessing`), hoặc nút "Đánh dấu bản gốc".
- **Diff view** (`src/lib/costsheet-diff.ts` thuần): so 2 `snapshotJson`, match dòng theo `(sectionCode, itemName)`; phân loại **added/removed/changed**; với changed hiện old→new của qty/unitPrice/amount + **chênh lệch tiền từng dòng** và **tổng chênh**. UI bảng ở tab CO/CE.

## E) Settings — CRUD mẫu Timeline
- **`/settings/timeline-templates`** (list) + **`/settings/timeline-templates/[id]`** (editor) — **mirror y hệt** `settings/costsheet-templates/**` (template-create-form, template-info-form, section-create-form, section-editor + `actions.ts` CRUD + AuditLog). Thêm chọn `viewMode` + bật/tắt cột (`columnsJson`) + gán `projectTypeId`. Tile trong `/settings` + i18n `settings.index.timelineTemplates*`.

## F) Seed (2 mẫu từ file thật)
- **"Convention/Gala (Gantt)"** ~ JBVN: sections VENUE/DESIGN/BALLROOM…, item mẫu (Photobooth, Standee, Áo thun) + sub-task revise (Design→Feedback→Duyệt→Sản xuất), `viewMode:GANTT`, cột pic/pic2/duration/deadline.
- **"Activation/Roadshow (Checklist)"** ~ KUN: sections Chuẩn bị/Thiết kế-in ấn/Nhân sự/Vận chuyển/Set up/Hàng hóa, item có qty/unit, `viewMode:CHECKLIST`, cột qty/unit/pic(prep+exec) + vài dòng `ProjectStaffing` mẫu.
- 1 dự án thực thi dùng mỗi mẫu, vài `TimelineItem` gán PIC thuộc CREATIVE/PRO/OPE/HR để demo sync ORDER nháp; 1 `CostSheet` có 2-3 `CostSheetRevision` để demo diff.

## G) i18n
Namespace: `projects.nav` (5 tab), mở rộng `projects.timeline` (template picker, cột qty/unit/pic2/accountable, staffing matrix, 3 cấp), `projects.orders` (draft/dispatch/desiredReceipt/HR-IT), `projects.coce` (revision list, compare, diff added/removed/changed, baseline), `projects.liquidation`, `settings.timelineTemplates`. Parity vi/en 0 lệch (script như cũ).

## Best practice (khuyến nghị đã áp dụng)
- **1 data model + preset templates + view modes** thay vì 1 form cứng hay N silo — chuẩn thị trường (monday/Smartsheet/Asana): schema chung, "view" quyết định cột/bố cục.
- **Draft-then-dispatch** cho ORDER: cổng duyệt tránh gửi sớm/nhầm khi timeline chưa xong; sync **idempotent** theo `sourceTimelineItemId`.
- **Immutable revision snapshots** cho CO/CE (chuẩn theo dõi change-order/variation hợp đồng): bản sống = nguồn sự thật realtime + baseline marker + diff tiền từng dòng.
- **Sub-routes > 1 trang scroll dài**: nhanh, deep-link, tách tải.
- **Provenance links** (`templateItemId`, `sourceTimelineItemId`) để chuỗi timeline→order→task truy vết được.

## Thứ tự triển khai (mỗi bước giữ app compile được — batch lớn, chạy tuần tự, checkpoint từng phần)
1. Schema (A1–A5 + cột TimelineItem + ProjectOrder.origin/isDraft + HR/IT) → reset migrations/dev.db → `prisma migrate dev`.
2. Seed 2 mẫu timeline + samples + revisions.
3. Helpers: `project-orders.ts` (sync/dispatch/updateItem), `costsheet-diff.ts`, ghi `CostSheetRevision` trong `saveCostSheet`, refactor `spawnTasksForCreativeOrder` đọc `ProjectOrderItem`.
4. i18n (tất cả namespace mới, parity).
5. **Sub-route restructure**: layout + `WorkspaceNav` + di chuyển Roles/Team/Guest vào Overview + tạo 5 route rỗng — checkpoint compile.
6. Tab **Timeline**: template picker + editor 3 cấp + cột theo viewMode + staffing matrix.
7. Tab **ORDER**: sync nháp + review/dispatch UI + HR/IT.
8. Tab **CO/CE**: reuse builder + revision history + diff viewer.
9. Tab **Liquidation**: bề mặt hóa control hiện có.
10. Settings **timeline-templates** CRUD (mirror costsheet-templates).
11. Verify toàn bộ.

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx next build` — sạch. Script diff key vi/en — 0 lệch.
- Browser E2E (dev server + Claude Browser, cả vi/en, desktop 1280 + mobile 375):
  - Vào 1 dự án thực thi → thanh nav 5 tab hoạt động, deep-link đúng.
  - **Timeline (Gantt)**: chọn mẫu Convention → vật hóa Section→Item→Sub-task 3 cấp; gán PIC Creative/PRO + PIC phụ; đổi ngày/status/duration.
  - **ORDER**: bấm "Làm mới từ Timeline" → thấy ORDER nháp gom theo bộ phận (gồm HR/IT nếu có PIC thuộc HR/IT); sửa 1 dòng + set ngày mong muốn nhận → **Gửi** → bộ phận nhận notification, Creative sinh task (verify chuỗi timeline→order→task).
  - **CO/CE**: mở tab → thấy đúng sheet CTRACT (mang xuống từ Bidding); sửa 1 dòng (giả lập khách phát sinh) → lưu → tạo revision v2; **So sánh v1↔v2** → bảng diff hiện đúng dòng đổi + chênh lệch tiền + badge baseline.
  - **Liquidation**: control xác nhận kế toán hiển thị đúng theo status.
  - **Checklist archetype**: dự án khác chọn mẫu Roadshow → cột qty/ĐVT + PIC(Chuẩn bị/Thực hiện) + lưới ma trận nhân sự sửa được.
  - Settings: `/settings/timeline-templates` tạo/sửa mẫu, đổi viewMode + cột → phản ánh ở tab Timeline.
  - Mobile: nav rail rút gọn + note "xem đầy đủ trên máy tính".

### File trọng yếu (batch này)
[prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · `src/lib/project-orders.ts` (mới) · `src/lib/costsheet-diff.ts` (mới) · [src/lib/creative.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\creative.ts) (refactor spawn) · [bidding/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\actions.ts) (ghi revision) · `src/app/(app)/projects/[id]/layout.tsx` + `timeline/` + `orders/` + `co-ce/` + `liquidation/` (mới) · [projects/[id]/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\page.tsx) (→ Overview) · [projects/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\actions.ts) · `src/app/(app)/settings/timeline-templates/**` (mới, mirror costsheet-templates) · messages/vi.json · messages/en.json.

---

# BATCH: Master Timeline — đổi sang bảng dày (spreadsheet) như CO/CE để xem nhiều dòng cùng lúc

## Context
Editor Master Timeline hiện tại ([timeline-editor.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\timeline-editor.tsx)) dùng pattern `<details>` lồng nhau: mỗi hạng mục **thu gọn** chỉ hiện `title + ngày` trong dòng summary, muốn xem/sửa phải bấm bung ra 1 form cao cho **từng item một** → không thể liếc nhiều dòng cùng lúc, và 2 trường quan trọng nhất user cần (PIC + Trạng thái) **bị giấu** trong summary. Chủ dự án yêu cầu trình bày **giống format CO/CE** (bảng dày, nhiều dòng inline-edit) để nhìn được nhiều dòng; thông tin quan trọng nhất = **description (title) + PIC + timeline (ngày)**.

Mục tiêu: viết lại phần trình bày của `timeline-editor.tsx` thành **bảng lưới dày, chỉnh sửa trực tiếp inline** như [cost-sheet-builder.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\cost-sheet-builder.tsx), **giữ nguyên toàn bộ server action + schema + luồng share/publish/guest** (không đụng dữ liệu/nghiệp vụ).

## Ràng buộc & quyết định (đã xác minh từ code)
- **KHÔNG bulk "Save all" kiểu CO/CE.** CO/CE dùng 1 form + `sectionsJson` replace-all. Timeline KHÔNG được replace-all vì: (a) guest ghi `clientStatus`/`clientNote` lên từng `TimelineItem`, (b) `TimelineComment` FK theo `itemId`, (c) share/publish là workflow theo id. ⇒ **giữ per-row action theo id** (`updateTimelineItem`/`create`/`delete`/`move`/`publish`/`unpublish` — [projects/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\actions.ts), **không sửa**). Density đạt bằng layout, không phải bằng cách gộp save.
- **Nested-form**: dòng cần nhiều action (update + delete + move + publish) → không lồng `<form>` được. Dùng **thuộc tính HTML5 `form="upd-<id>"`**: mọi input của 1 dòng (kể cả field trong drawer) trỏ về 1 `<form id="upd-<id>" action={updateBound} className="hidden">` (form rỗng, ẩn — vẫn submit đủ input qua `form=` attr). Các nút delete/move/publish là `<form>` nút-đơn riêng đặt ở ô "thao tác" (không lồng trong form update).
- Cột hiển thị vẫn theo cấu hình mẫu hiện có (`columns`/`cols`: pic2/qty/unit/accountable/status…) truyền từ [timeline/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\timeline\page.tsx) — **không đổi page**.
- 3 cấp Phase→Hạng mục→Công việc giữ nguyên (thể hiện bằng thụt lề + nền đậm dòng Phase). Reuse `formatDate`, `Badge`, i18n `projects.timeline`.

## Thiết kế UI mới (timeline-editor.tsx — chỉ đổi presentation)
- **1 lưới CSS grid dày** cho mỗi dự án (bọc `overflow-x-auto` + `min-w-[...]` như bảng CO/CE để mobile cuộn ngang). Header cột dính (title/PIC/bắt đầu/kết thúc/trạng thái/…). Mỗi item = 1 hàng gồm các **ô input inline** (không bung mới thấy):
  - **Cột luôn hiện (ưu tiên cao nhất):** `Title` (text, thụt theo cấp, có chevron bung drawer) · `PIC` (select owner) · `Bắt đầu` (date) · `Kết thúc` (date) · `Trạng thái` (select, nếu `cols.has("status")`).
  - **Cột theo cấu hình mẫu (hiện inline nếu có trong `cols`):** `Số lượng`/`ĐVT` (checklist KUN). `pic2`/`accountable`/`department` đẩy vào **drawer** để hàng không quá rộng.
  - **Ô chỉ báo + thao tác:** badge `Đã duyệt/Chờ Owner`/`Cho khách sửa`; nút **Lưu** (chỉ hiện khi hàng "dirty"); nút bung **drawer** (▾); ↑/↓ move; Xóa.
- **Inline dirty-save:** mỗi input `onChange` → đánh dấu id vào `dirtySet` (useState ở cấp editor); nút "Lưu" của hàng chỉ hiện khi id ∈ dirtySet; submit xong revalidate → props mới, clear dirty. Không có nút Lưu rải khắp khi chưa sửa → nhìn sạch như bảng.
- **Drawer mỗi hàng** (bung bằng chevron, chiếm full-width `grid-column:1/-1`): chứa các field còn lại **cùng trỏ `form="upd-<id>"`**: `PIC phụ`, `Bên chịu trách nhiệm`, `Phòng ban`, khối **Share** (isShared/clientEditable + externalTitle/externalStart/externalEnd khi shared), nút **publish/unpublish**, và hiển thị **client feedback** (clientStatus/clientNote) read-only. Giữ nguyên toàn bộ tên field `name=...` hiện tại để `updateTimelineItem` nhận đúng.
- **Thêm dòng:** giữ form "add" gọn 1 dòng cho mỗi cấp (Thêm Phase ở cuối; Thêm hạng mục dưới mỗi Phase; Thêm công việc con dưới mỗi hạng mục) — bind `createTimelineItem` như cũ.
- **Phase/Hạng mục/Công việc:** thụt lề theo depth (tính từ chuỗi parentId); dòng Phase in đậm + nền `surface-2`.
- **Mobile:** bảng cuộn ngang (`overflow-x-auto`) như CO/CE; giữ note "xem đầy đủ trên máy tính" nếu cần (đã có sẵn ở tab).

## i18n (bổ sung `projects.timeline`, parity vi/en)
Thêm khóa header/điều khiển: `colTitle`, `colPic` (dùng lại `owner`?), `colStart`/`colEnd` (dùng lại `start`/`end`), `colStatus` (dùng lại `status`), `advanced` (nhãn nút bung drawer, vd "Chi tiết"), `collapseRow`/`expandRow` (aria). Đa số tái dùng khóa sẵn có (`owner`, `start`, `end`, `status`, `quantity`, `unit`, `save`, `remove`, `moveUp`, `moveDown`, `shareToggle`, `clientEditableToggle`, `publish`, `unpublish`, `externalTitle`, `secondaryOwner`, `accountableParty`, `department`, `clientStatusLabel`…). Chỉ thêm ~3–5 khóa mới (`colTitle`, `advanced`, `rowDetail`). Chạy script parity.

## Không đụng tới
- `projects/actions.ts` (server actions timeline) · `prisma/schema.prisma` · [timeline/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\timeline\page.tsx) (đã truyền `columns`) · staffing matrix · guest portal.

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx next build` — sạch. Parity vi/en 0 lệch.
- Browser E2E (dev + Claude Browser, desktop 1280 + mobile 375, cả vi/en) trên tab `/projects/[id]/timeline`:
  - Thấy **nhiều dòng cùng lúc** dạng bảng: mỗi dòng hiện Title + PIC + ngày + trạng thái inline (không cần bung).
  - Sửa PIC + ngày inline ở 2–3 dòng → nút "Lưu" hiện đúng dòng dirty → lưu → giá trị giữ đúng (verify DB / re-render).
  - Bung drawer 1 dòng → tick Share + nhập external title → Lưu → Owner publish → badge đổi "Đã duyệt lộ khách". Kiểm guest portal vẫn chỉ thấy item shared+published (không hồi quy).
  - Kiểm dòng có `clientStatus`/`clientNote` (guest đã ghi) vẫn hiển thị đúng trong drawer, KHÔNG bị mất sau khi lưu dòng khác (chứng minh không replace-all).
  - Mẫu Checklist (KUN): cột Số lượng/ĐVT hiện inline. Mẫu Gantt (JBVN): cột pic2/accountable nằm trong drawer.
  - Mobile: bảng cuộn ngang, không vỡ layout.

### File trọng yếu (batch này)
[timeline-editor.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\timeline-editor.tsx) (viết lại presentation) · messages/vi.json · messages/en.json. (Tham chiếu pattern: [cost-sheet-builder.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\cost-sheet-builder.tsx) `LinesTable`.)

---

# BATCH: Module ④ Chi phí & Công nợ — Tạm ứng (sâu) · Thanh toán NCC · Công nợ (khung)

## Context
Xây module ④ tại `/finance`, 3 sub-module **dàn hàng ngang on-top** (mirror `workspace-nav` vừa làm): **Tạm ứng · Thanh toán NCC · Công nợ**. Trọng tâm là **Tạm ứng thực hiện dự án**: kéo phần CO (chi phí nội bộ) từ CO/CE (Quản lý dự án) xuống để đề nghị tạm ứng theo từng dòng chi phí, định tuyến qua Kế toán (thực chi bằng hard copy), và CFO đặt hạn mức tạm ứng cho từng NV (check chéo toàn bộ dự án).

### Ràng buộc kỹ thuật đã xác minh (từ Explore)
- **`CostLine.id`/`CostSheetSection.id` bị tạo lại mỗi lần `saveCostSheet`** (deleteMany sections → cascade xóa lines → tạo lại). ⇒ **KHÔNG gắn tạm ứng theo `CostLine.id`.** Danh tính ổn định = **`sectionCode ‖ itemName`** (đúng key `costsheet-diff.ts` đang dùng). Live line có `vendorId`; `snapshotJson` thì KHÔNG có vendor/id/sort.
- **CO nội bộ** = các dòng thuộc section `isProxy=false` (loại Chi hộ). `computeCostSheetTotals` trong [bidding.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\bidding.ts): mỗi CostLine đã lưu sẵn `amount` (BigInt).
- Nav `finance` đang `status:"soon"` → đổi `"active"` ([nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts)).
- **Dept `FIN` đã seed nhưng CHƯA có staff** nào; chưa có title Kế toán/CFO. Notification fan-out theo `where:{title:{in:[...]}}` hoặc `where:{department:{code:"FIN"}}`. `getCurrentStaffId()` vẫn stub CEO → RBAC chỉ danh nghĩa (nhất quán các batch trước).
- Settings chỉ có `getNumberSetting` (GLOBAL). Tiền = BigInt + `toNum` + `formatNumber`.

### Quyết định đã chốt với chủ dự án (AskUserQuestion)
1. **CO ở Tạm ứng = bản ĐỒNG BỘ read-only từ CO/CE + nút Refresh.** CO/CE vẫn ở Quản lý dự án (bản gốc, giữ make-up engine + versioning). Finance kéo bản sao CO (chỉ dòng nội bộ) xuống, khớp theo `sectionCode‖itemName`; Refresh đồng bộ lại khi version đổi, **giữ nguyên lịch sử tạm ứng** đã gắn.
2. **Thanh toán NCC + Công nợ = khung best-practice** (tạo/lọc/đánh dấu đã trả + AR aging 4 nhóm). Đối chiếu 3 chiều / WIP / dòng tiền để đợt sau.

## A) Route + nav (dàn ngang on-top)
- `finance` nav → `active`.
- `src/app/(app)/finance/layout.tsx` + `finance-nav.tsx` (client, mirror `workspace-nav.tsx`): 3 tab ngang `bg-brand-600` khi active, cuộn ngang mobile.
  - `/finance` (**Tạm ứng** — mặc định) · `/finance/vendor-payments` (**Thanh toán NCC**) · `/finance/debt` (**Công nợ**).

## B) Data model (Prisma — reset dev DB + migrate như các batch trước)
- **`FinanceCostLine`** — bản đồng bộ CO nội bộ (finance-side snapshot):
  `id, projectId, lineKey String` (=`sectionCode‖itemName`), `sectionCode, sectionName, itemName, specs String?, amount BigInt` (chi phí nội bộ dòng), `vendorId String?, sourceRevNo Int` (revNo đã đồng bộ), `sort Int, isStale Boolean @default(false)` (dòng đã bị đổi/xóa ở version mới — giữ lại vì có lịch sử tạm ứng), `createdAt/updatedAt`. Quan hệ project (Cascade), vendor?. `@@unique([projectId, lineKey])`. `advances Advance[]`.
- **`Advance`** — 1 bản ghi / 1 lần tạm ứng (lần 1/2/…):
  `id, financeCostLineId, projectId` (denormalize để check chéo), `installmentNo Int, amount BigInt, advanceType String` (VENDOR|STAFF), `recipientVendorId String?, recipientStaffId String?, bankName String?, bankAccountNo String?, bankAccountHolder String?, note String?, status String @default("REQUESTED")` (REQUESTED|DISBURSED|SETTLED|CANCELED), `requestedById, requestedAt, disbursedById String?, disbursedAt DateTime?, settledById String?, settledAt DateTime?, settleNote String?`. Quan hệ financeCostLine (Cascade), project, recipientVendor?, recipientStaff?, requestedBy/disbursedBy/settledBy Staff. `@@index([recipientStaffId, status])`, `@@index([projectId])`.
- **`VendorPayment`** (khung NCC): `id, vendorId, projectId String?, amount BigInt, dueDate DateTime?, paidDate DateTime?, status String @default("SCHEDULED")` (SCHEDULED|PAID), `invoiceNo String?, note String?, createdById, createdAt/updatedAt`. Quan hệ vendor, project?.
- **`ClientInvoice`** (khung Công nợ — hỗ trợ milestone billing nhiều HĐ/dự án): `id, projectId, clientId, invoiceNo, invoiceDate DateTime, amount BigInt, dueDate DateTime?, note String?, createdById, createdAt`. Quan hệ project (Cascade), client. `payments ClientPayment[]`.
- **`ClientPayment`**: `id, invoiceId, amount BigInt, paidDate DateTime, method String?, note String?, createdById, createdAt`. Quan hệ invoice (Cascade).
- **Back-relations**: Project (`financeCostLines`, `advances`, `vendorPayments`, `clientInvoices`), Vendor (`vendorPayments`, `advancesReceived`), Client (`invoices`), Staff (recipient/requested/disbursed/settled advances + createdBy các bảng). Notification `type` += `ADVANCE_REQUESTED | ADVANCE_DISBURSED | ADVANCE_SETTLED | AR_OVERDUE_REMINDER`.

## C) Lib `src/lib/finance.ts` (hàm thuần + đồng bộ)
- **`syncFinanceCostLines(projectId)`**: nạp CostSheet CTRACT mới nhất (sections+lines); lọc **non-proxy**; mỗi dòng tính `lineKey`; **upsert** vào `FinanceCostLine` theo `(projectId,lineKey)` — cập nhật amount/vendor/section/sort, `isStale=false`, `sourceRevNo=revNo mới nhất`; dòng cũ không còn trong set → `isStale=true` (KHÔNG xóa, giữ lịch sử). Trả `{added, updated, staled}`.
- **`getStaffAdvanceQuota(staffId)`**: quét **TẤT CẢ** `Advance` `advanceType="STAFF"`, `recipientStaffId=staffId`, `status ∈ {REQUESTED,DISBURSED}` (đang giữ, chưa hoàn ứng) trên mọi dự án → `openCount = count`, `outstandingAmount = Σ amount`; so `finance.max_advance_count_per_staff` + `finance.max_outstanding_advance_amount_per_staff`. Trả `{openCount, outstandingAmount, maxCount, maxAmount, blockedByCount, blockedByAmount, blocked}`.
- **`lineRemaining(financeCostLineId)`**: `amount − Σ advances(status≠CANCELED).amount` (không cho tổng tạm ứng vượt giá trị dòng).
- **`getArOverdueItems(teamCode?)`** (thuần computed cho /reminders): invoice có `dueDate < nay` & còn dư (`amount − Σ payments > 0`).

## D) Actions `src/app/(app)/finance/actions.ts`
- `refreshFinanceCostLines(projectId)` → syncFinanceCostLines + revalidate `/finance`.
- `requestAdvance(financeCostLineId, formData)`: validate `amount ≤ lineRemaining`; nếu `advanceType=STAFF` → `getStaffAdvanceQuota(recipientStaffId)`, **blocked → trả error** ("Vượt hạn mức — vui lòng hoàn ứng đợt cũ trước"). Tạo `Advance(status:"REQUESTED", installmentNo=count+1)`; notify staff dept `FIN` (`ADVANCE_REQUESTED`); trả `{success, hardCopyNotice:true}` để UI hiện dòng **"Bạn vui lòng hoàn tất thủ tục tạm ứng bằng bản hard copy với P. Kế toán"**.
- `confirmAdvanceDisbursed(advanceId)`: Kế toán "Xác nhận tạm ứng xong" → `DISBURSED`; notify `requestedById` (`ADVANCE_DISBURSED`).
- `settleAdvance(advanceId, formData)`: "Hoàn ứng" (Kế toán) → `SETTLED` (giải phóng hạn mức); notify.
- `cancelAdvance(advanceId)`: rút đề nghị `REQUESTED` → `CANCELED`.
- NCC: `createVendorPayment(formData)`, `markVendorPaymentPaid(id)`. Công nợ: `createClientInvoice(formData)`, `recordClientPayment(invoiceId, formData)`.
- Tất cả revalidate `/finance*` (+ `/reminders`). Ghi AuditLog theo pattern hiện có.

## E) UI
- **`/finance` (Tạm ứng)**: bộ chọn dự án (dropdown dự án thực thi PROCESSING/LIQUIDATION/HANDOVER/FINISHED, `?project=id`) + **nút Refresh** (hiện `sourceRevNo` + lần đồng bộ). Banner hạn mức + **bảng NV đang giữ tạm ứng (chéo dự án)** để CFO thấy. **Bảng CO dày** (mirror grid CO/CE/timeline): cột `Hạng mục · Dòng · Giá trị · Đã ứng · Còn lại · [Tạm ứng]`; dòng `isStale` gắn nhãn cảnh báo (đặc biệt nếu đã ứng > giá trị mới). Mở 1 dòng → danh sách **installment (lần 1/2/…)** (loại/người nhận/thông tin CK/badge trạng thái + nút Kế toán "Xác nhận tạm ứng xong"/"Hoàn ứng") + form **tạm ứng mới**: `amount ≤ Còn lại`, radio **"Ứng trực tiếp cho NCC" / "Ứng cho NV TCM"** (chọn NCC prefill từ `line.vendorId` / hoặc chọn NV), 3 ô thông tin CK (số TK/ngân hàng/chủ TK) **bắt buộc**, nút **"Gửi đề nghị tạm ứng"** → hiện dòng hard-copy notice.
- **`/finance/vendor-payments`**: list + lọc theo NCC/dự án/trạng thái; tạo phiếu chi; đánh dấu đã trả; tổng chưa trả/đã trả.
- **`/finance/debt`**: list công nợ theo khách/dự án; tạo hóa đơn + ghi nhận thanh toán; còn lại + **AR aging 4 nhóm** (chưa tới hạn / quá 1–30 / 31–60 / >60 ngày, tính từ `dueDate`); lọc theo team.
- Mobile: bảng cuộn ngang như CO/CE; ưu tiên cột chính.

## F) Settings (CFO) — mirror `settings/bidding` trio
- `/settings/finance` (page + form + actions): `max_advance_count_per_staff` (mặc định 3), `max_outstanding_advance_amount_per_staff` (mặc định 50.000.000). `upsertSetting` module `"finance"`. Thêm card vào [settings/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\page.tsx).

## G) Seed
- Thêm staff dept `FIN`: **Kế toán** (title "Kế toán", `ketoan@tcm.vn`) + **CFO** (title "CFO", `cfo@tcm.vn`).
- 2 setting `finance.*`; đồng bộ `FinanceCostLine` cho 1–2 dự án thực thi (hoặc để Refresh); vài `Advance` ở các trạng thái (REQUESTED/DISBURSED, cả VENDOR & STAFF); 1–2 `VendorPayment`; 1–2 `ClientInvoice` + `ClientPayment` (1 quá hạn để demo AR aging + reminder).

## H) i18n + Reminders/bell
- Namespace mới `finance` (nav 3 tab, advances/vendorPayments/debt, trạng thái, form CK, hard-copy notice, quota banner) + `nav.finance` (đã có) + `settings.finance`. Parity vi/en.
- `getArOverdueItems` → thêm section "Công nợ quá hạn" ở [/reminders](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\reminders\page.tsx) + cộng bell badge ở [layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\layout.tsx) (mirror `getAcceptanceSignReminders`).

## Hạn chế đã biết (nêu rõ)
- Không RBAC thật (stub CEO) → "chỉ CFO/Kế toán xem" là danh nghĩa. Hạn mức chéo dự án track theo `recipientStaffId` của tạm ứng loại STAFF (người GIỮ tạm ứng); tạm ứng NCC không tính vào hạn mức NV. Đối chiếu 3 chiều/WIP/dòng tiền: đợt sau.

## Thứ tự triển khai (giữ app compile được)
1. Schema (5 model + relations + Notification type) → reset migrations/dev.db → migrate.
2. Seed (FIN staff, settings, sample finance data).
3. `src/lib/finance.ts` (sync + quota + remaining + AR overdue); getter số dùng `getNumberSetting`.
4. i18n `finance` + `settings.finance` + reminders section (parity).
5. Nav active + `finance/layout.tsx` + `finance-nav.tsx`.
6. `finance/actions.ts` + tab **Tạm ứng** (`/finance/page.tsx` + grid + installment forms) — phần sâu nhất.
7. Tab **Thanh toán NCC** + tab **Công nợ** (khung).
8. Settings `/settings/finance` (mirror bidding) + card.
9. Reminders/bell (AR quá hạn).
10. Verify.

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx next build` — sạch. Parity vi/en 0 lệch.
- Browser E2E (dev + Claude Browser, vi/en, desktop + mobile):
  - `/finance` → chọn dự án → **Refresh** → thấy bảng CO nội bộ (đúng dòng non-proxy, khớp giá trị CO/CE).
  - Mở 1 dòng → tạo tạm ứng **lần 1** loại "Ứng cho NV TCM" (nhập CK) → "Gửi đề nghị" → hiện dòng hard-copy + notification tới Kế toán; **thử ứng vượt Còn lại → bị chặn**.
  - Kế toán "Xác nhận tạm ứng xong" → DISBURSED, notify người đề nghị. Tạo **lần 2** cho cùng dòng (tổng ≤ giá trị dòng).
  - CFO đặt `max_advance_count_per_staff=1` ở `/settings/finance` → NV đó tạm ứng lần mới **bị chặn "hoàn ứng đợt cũ trước"**; "Hoàn ứng" 1 đợt → được ứng lại. Kiểm **chéo 2 dự án** cho cùng NV (tổng lần/tổng tiền tính gộp).
  - Sửa CO/CE ở Quản lý dự án (đổi giá 1 dòng) → về `/finance` bấm **Refresh** → dòng cập nhật giá trị mới, tạm ứng cũ còn nguyên; xóa 1 dòng CO/CE → Refresh → dòng thành `isStale` (không mất tạm ứng).
  - NCC: tạo phiếu chi → đánh dấu đã trả. Công nợ: tạo hóa đơn quá hạn + ghi 1 thanh toán một phần → thấy còn lại + đúng nhóm AR aging; `/reminders` hiện "Công nợ quá hạn", bell +1.

### File trọng yếu (batch này)
[prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · `src/lib/finance.ts` (mới) · [src/lib/reminders.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\reminders.ts) · [src/lib/settings.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\settings.ts) · `src/app/(app)/finance/**` (mới: layout, finance-nav, page=Tạm ứng, vendor-payments, debt, actions) · `src/app/(app)/settings/finance/**` (mới, mirror settings/bidding) · [nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts) · [layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\layout.tsx) · [reminders/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\reminders\page.tsx) · messages/vi.json · messages/en.json. (Tham chiếu: [workspace-nav.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\workspace-nav.tsx), [costsheet-diff.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\costsheet-diff.ts), [settings/bidding](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\bidding).)

---

# BATCH: Module ⑨ Communication — Internal chat (Phase 1: 1-1 + group + roles + mentions + link; attachments/contact/poll = Phase 2)

## Context
Chủ dự án muốn tích hợp 1 kênh **internal communication** (chat nội bộ) vào CRM. Yêu cầu đầy đủ: chat 1-1 & group; group có nhiều admin, add/exit thành viên, admin bổ nhiệm member→admin, đổi tên & avatar group; bật/tắt notification theo từng người; system message khi thành viên join/exit; @mention 1 hoặc nhiều người + @all; gửi file/hình/video (≤10MB) / contact nội bộ / link (2 ô text+link) / poll (question + options + 4 setting); super-admin xem mọi group chat; tư vấn lưu trữ tin nhắn/file trên local server.

**3 khác biệt cốt lõi so với các module hiện có (xác minh từ Explore):**
1. **Chưa có auth/identity thật** — `getCurrentStaffId()` ([src/lib/current-staff.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\current-staff.ts)) là stub luôn trả `ceo@tcm.vn`; header avatar hardcode `"CEO"`. Chat là feature DUY NHẤT vô nghĩa nếu không biết "tôi là ai" (1-1, exit, promote, unread/mute theo người).
2. **Chưa có real-time** — không websocket/SSE/polling; bell badge chỉ là server re-render + `revalidatePath`.
3. **Chưa có upload binary** — toàn app lưu "file" dạng URL string ([Project.briefLinkUrl], [Contract.fileUrl], [CreativeTask.deliverableLinkUrl]); không có `writeFile`/`sharp`/S3/`public/uploads` nào. Attachment là subsystem hoàn toàn mới.

### Quyết định đã chốt với chủ dự án (AskUserQuestion)
1. **Identity = "Act as" switcher** (không xây login/password thật đợt này): dropdown chọn nhân sự → ghi cookie ký; `getCurrentStaffId()` đọc cookie đó (fallback CEO nếu trống). Blast radius nhỏ, đủ test toàn bộ chat theo nhiều người.
2. **Chia 2 phase.** **Phase 1** (batch này): chat 1-1 + group, admin/member roles (nhiều admin), add/exit/promote, đổi tên group, system message join/leave/rename, mute per-member, @mention + @all, super-admin xem all, **+ gửi link (ô text + ô link, người nhận mở được)**. **Phase 2** (batch sau): upload file/hình/video ≤10MB + avatar group + share contact nội bộ + poll.
3. **Real-time = polling ngắn** (~3–5s khi mở hội thoại), nâng cấp SSE sau.
4. **Attachment store (Phase 2) = local disk ngoài `public/` + route handler có auth** (metadata trong DB, serve qua `GET /api/chat/attachments/[id]` kiểm tra membership). Chi tiết ở mục "Tư vấn lưu trữ".

## Tư vấn lưu trữ nội dung (theo best practice, self-hosted local server)
- **Text tin nhắn + mọi metadata → DATABASE** (Prisma). Nhỏ, cần order/paginate/search. KHÔNG bao giờ nhét binary vào DB.
- **Attachment (file/hình/video/avatar) → LOCAL FS, KHÔNG vào DB, KHÔNG vào `public/`** (Phase 2):
  - Thư mục ngoài web root: `storage/uploads/` (gitignore), shard theo ngày `2026/07/…`. Dùng `public/` = serve tĩnh không kiểm soát truy cập → sai với "internal only".
  - Tên file lưu = id ngẫu nhiên (cuid); tên gốc chỉ là metadata → chống path-traversal/enumerate/trùng.
  - DB lưu: `storageKey, originalName, mimeType, sizeBytes`, media `width/height/durationMs`, optional `thumbnailKey`, optional `sha256` (dedup).
  - **Validate server-side**: hard-reject >10MB (ảnh/video), allowlist MIME + sniff magic-byte (KHÔNG tin extension/Content-Type client), chặn file thực thi.
  - **Serve qua Route Handler có auth**: `GET /api/chat/attachments/[id]` → resolve acting staff → check là member của conversation (hoặc super-admin) → stream bytes. Không lộ path FS.
  - Bọc `saveAttachment()/readAttachment()` trả `storageKey` (không phải absolute path) → sau đổi local→S3/MinIO không sửa call-site. Giữ binary ngoài DB cũng giúp migrate SQLite→Postgres & backup gọn.
  - Video thumbnail/transcode (ffmpeg) = ngoài scope; chỉ phát file. `sharp` cho thumbnail ảnh = optional.

## A) Nền tảng: "Act as" switcher (điều kiện tiên quyết, làm TRƯỚC chat)
- **`src/lib/current-staff.ts`**: sửa `getCurrentStaffId()` đọc cookie `act_as_staff` (httpOnly, ký/verify bằng secret env — tái dùng ý tưởng cookie phiên guest ở `src/lib/guest-session.ts`); nếu không có/không hợp lệ → fallback `ceo@tcm.vn` (giữ nguyên hành vi cũ cho các module khác). Thêm `getCurrentStaff()` trả cả object (id, fullName, title, department) để header/chat dùng.
- **Server action mới** `setActAsStaff(staffId)` (vd `src/app/(app)/act-as/actions.ts` hoặc gộp vào `src/i18n/actions.ts` cùng chỗ set cookie locale) → set cookie + `revalidatePath("/")`.
- **UI**: dropdown chọn nhân sự cạnh language-switcher trong [header.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\header.tsx) (thay avatar hardcode "CEO" bằng tên/nhân sự đang "act as", initials từ `fullName`). Client component nhỏ, list `Staff` active.
- ⚠ Ghi rõ: đây là công cụ DEMO thay cho auth thật; mọi "quyền" (admin group, super-admin) vẫn danh nghĩa cho tới khi có đăng nhập thật. Nhưng đủ để test đúng nghiệp vụ chat theo người.

## B) Data model (Prisma — reset dev DB + migrate như các batch trước)
- **`Conversation`** (`@@map("conversation")`): `id, type String` (DIRECT|GROUP), `name String?` (group), `avatarKey String?` (group, Phase 2), `createdById String?, createdAt, updatedAt`. DIRECT: name/avatar null, tiêu đề suy ra từ người còn lại. Relations: members, messages, createdBy Staff?.
- **`ConversationMember`** (`@@map("conversation_member")`): `id, conversationId, staffId, role String @default("MEMBER")` (ADMIN|MEMBER), `notificationsMuted Boolean @default(false)`, `lastReadAt DateTime?` (unread theo người), `joinedAt DateTime @default(now())`. `@@unique([conversationId, staffId])`, `@@index([staffId])`. **Exit = hard delete row** (đơn giản, nhất quán "không soft-delete" của app) + phát system message. Relations: conversation (Cascade), staff.
- **`Message`** (`@@map("message")`): `id, conversationId, senderId String?` (null cho SYSTEM), `type String @default("TEXT")` (TEXT|LINK|SYSTEM; Phase 2 thêm FILE|IMAGE|VIDEO|CONTACT|POLL), `body String?` (text/nội dung), `systemEvent String?` (MEMBER_JOINED|MEMBER_LEFT|MEMBER_ADDED|GROUP_RENAMED|ROLE_PROMOTED|GROUP_AVATAR_CHANGED — render i18n + tên người), `linkUrl String?, linkText String?` (type=LINK: 2 ô), `createdAt, editedAt DateTime?`. `@@index([conversationId, createdAt])`. Relations: conversation (Cascade), sender Staff?, mentions.
- **`MessageMention`** (`@@map("message_mention")`): `id, messageId, staffId String?` (null nếu isAll), `isAll Boolean @default(false)`. `@@index([staffId])`. Dùng để notify + highlight. Cascade theo message.
- **Phase 2 (chỉ khai báo trong plan, làm batch sau)**: `MessageAttachment` (storageKey/originalName/mimeType/sizeBytes/width/height/durationMs/thumbnailKey/sha256), `sharedContactStaffId` trên Message (type=CONTACT), `Poll`(messageId, question, allowMultiple, anonymous, showResultsAfterVote, closesAt) + `PollOption`(pollId, text, sort) + `PollVote`(pollOptionId, staffId) `@@unique([pollOptionId, staffId])`.
- **`Staff`** back-relations: `conversationMemberships`, `messagesSent`, `messageMentions`, `conversationsCreated`.
- **`Notification.type`** += `CHAT_MENTION | CHAT_MESSAGE` (comment list, free-text như hiện tại).

## C) Lib `src/lib/chat.ts` (hàm thuần + guard)
- `getOrCreateDirectConversation(meId, otherId)` — tìm DIRECT có đúng 2 member {me, other} hoặc tạo mới (idempotent).
- `listConversationsForStaff(staffId)` — mọi conversation staff là member + last message + unread count (messages `createdAt > member.lastReadAt`). Super-admin (title CEO hoặc setting `communication.super_admin_titles`) → thêm chế độ xem-all (read-only).
- `assertMember(conversationId, staffId)` / `assertAdmin(...)` — guard cho actions (throw nếu không phải member/admin). Super-admin bypass xem, KHÔNG bypass gửi (chỉ member mới gửi).
- `parseMentions(body, memberIds)` — tách `@all` và `@tên` → trả danh sách staffId + isAll (client gửi kèm mảng id đã chọn để chắc chắn, hàm chỉ validate thuộc member).
- `markConversationRead(conversationId, staffId)` — set `lastReadAt = now`.
- Notification fan-out: khi gửi message → tạo `Notification` cho member (trừ sender, trừ `notificationsMuted`), type `CHAT_MESSAGE`; riêng người bị @mention (hoặc @all) → `CHAT_MENTION` (mention **bỏ qua mute** — tin quan trọng). Tái dùng pattern `createMany` như `notifyFinanceDept`.

## D) Actions `src/app/(app)/chat/actions.ts` (guard trước mọi mutate)
- `startDirectChat(otherStaffId)` → getOrCreate → redirect `/chat/[id]`.
- `createGroup(formData)` — name + chọn thành viên (Combobox multi, tái dùng checkbox-list pattern brainstorm); creator = ADMIN. System message MEMBER_ADDED cho từng người.
- `sendMessage(conversationId, formData)` — type TEXT hoặc LINK (linkText/linkUrl); parse mentions; tạo message + mentions + notifications.
- `addMembers(conversationId, staffIds[])` (member hoặc admin) → tạo member + system MEMBER_ADDED. `leaveConversation(conversationId)` (self exit) → xóa member + system MEMBER_LEFT (nếu admin cuối rời & còn member → promote member cũ nhất, hoặc chặn — chốt: tự động promote member join sớm nhất). `promoteToAdmin(conversationId, staffId)` (admin) → role=ADMIN + system ROLE_PROMOTED. `renameGroup(conversationId, name)` (admin) → update + system GROUP_RENAMED. `toggleMute(conversationId)` (self) → lật `notificationsMuted`. `markRead(conversationId)`.
- Tất cả `revalidatePath("/chat", "/chat/[id]")` + AuditLog cho hành động quản trị (rename/promote/add/remove) theo pattern hiện có.
- **Polling endpoint**: `GET /api/chat/[id]/messages?after=<messageId|iso>` (Route Handler, Node runtime) → trả message mới hơn cursor cho client poll mỗi ~4s; guard membership.

## E) UI
- **Nav**: thêm mục "Trò chuyện/Chat" vào [nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts) (icon `MessagesSquare`, `status:"active"`).
- **`/chat/layout.tsx`** — 2 cột: trái = danh sách hội thoại (search + nút "Chat mới"/"Tạo nhóm"), phải = khung hội thoại (children). Mobile: 1 cột, list → detail (route-based).
- **`/chat/page.tsx`** — empty state + danh sách; **`/chat/[id]/page.tsx`** — header hội thoại (tên/nhóm, số thành viên, nút quản trị nếu admin: đổi tên/thêm/promote/mute/exit) + luồng message (SYSTEM render nhạt giữa dòng; mention highlight; LINK render ô text + link bấm mở `target=_blank rel=noopener`) + composer (textarea + chọn @mention từ member + nút "Đính kèm link" mở 2 ô text/link). Client component poll mỗi ~4s gọi route handler, append message mới, auto-scroll; `markRead` khi mở/nhận.
- **Super-admin view**: `/chat` thêm toggle "Xem tất cả nhóm (quản trị)" chỉ hiện với super-admin → list mọi GROUP conversation read-only (không cho gửi).
- Mobile: rút gọn theo pattern `sm:hidden` + note "xem đầy đủ trên máy tính".

## F) Settings
- `/settings/communication` (nhẹ): `communication.super_admin_titles` (mặc định "CEO"), `communication.message_poll_seconds` (mặc định 4). Tile trong [settings/page.tsx]. (Phase 2 thêm giới hạn size, allowlist MIME.)

## G) Seed
- Vài nhân sự đã có (đa phòng ban) để test act-as & group. Tạo mẫu: 1 DIRECT (CEO ↔ 1 account), 1 GROUP 3–4 người (1 người là admin thứ 2) với vài message TEXT + 1 LINK + vài system message (join). 2 setting `communication.*`.

## H) i18n + Reminders/bell
- Namespace mới `chat` (nav, list, conversation, composer, roles admin/member, system events 6 loại với placeholder `{name}`/`{oldName}`/`{newName}`, mention/@all, link text/url, mute on/off, exit, tạo nhóm, super-admin view) + `nav.chat` + `settings.communication` + `header.actAs`. System message render bằng i18n theo `systemEvent` (KHÔNG hardcode như notification cũ). Parity vi/en 0 lệch.
- Notification chat tự cộng vào bell (đếm unread global như hiện tại).

## Hạn chế đã biết (nêu rõ)
- Không auth thật → "act as" là công cụ demo; quyền admin/super-admin danh nghĩa. Polling 4s ≠ realtime tức thời (đủ nội bộ ~30–45 người). Exit = hard delete member (mất lịch sử đã đọc của người đó — chấp nhận). Phase 1 KHÔNG có upload; link chia sẻ bằng URL.

## Thứ tự triển khai (giữ app compile được)
1. **Act-as switcher** (A): sửa current-staff.ts + action + header dropdown — checkpoint compile (không đụng module khác vì fallback CEO).
2. Schema Phase 1 (Conversation/ConversationMember/Message/MessageMention + relations + Notification type) → reset migrations/dev.db → migrate.
3. Seed mẫu chat + settings.
4. `src/lib/chat.ts` (getOrCreate/list/guards/mentions/markRead/notify).
5. i18n `chat` + `nav.chat` + `settings.communication` + `header.actAs` (parity).
6. `chat/actions.ts` + route handler polling.
7. UI: nav active + `/chat` layout + list + `/chat/[id]` (composer + poll client + system render + mention + link) + super-admin toggle.
8. Settings `/settings/communication` + card.
9. Verify.
10. (Phase 2 batch sau: attachment subsystem + avatar group + contact share + poll.)

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx next build` — sạch. Script diff key vi/en — 0 lệch.
- Browser E2E (dev + Claude Browser, vi/en, desktop 1280 + mobile 375):
  - **Act-as**: đổi người ở header → tên/initials đổi; các module khác vẫn chạy (fallback OK).
  - Act-as = CEO → "Chat mới" 1-1 với 1 account → gửi text → act-as = account đó → thấy tin, unread giảm khi mở.
  - Tạo group 3 người (CEO admin) → system "đã thêm X"; đổi act-as sang member → gửi text có `@all` và `@tên` → act-as người được tag thấy notification `CHAT_MENTION` (bell +1) dù đã mute; người mute khác KHÔNG nhận `CHAT_MESSAGE`.
  - Admin promote 1 member → member đó act-as thấy quyền admin (đổi tên/thêm người); đổi tên group → system GROUP_RENAMED hiển thị i18n đúng.
  - Member exit → system MEMBER_LEFT; nếu admin cuối exit → member sớm nhất auto-promote.
  - Gửi LINK (ô text + ô link) → người nhận bấm mở tab mới.
  - Super-admin bật "Xem tất cả nhóm" → thấy group không phải member, read-only (không composer).
  - Polling: mở 2 tab act-as 2 người trong cùng group → gửi ở tab A → tab B tự hiện sau ~4s không cần reload.
  - Mobile: list→detail điều hướng được, composer không vỡ.

### File trọng yếu (batch này)
[current-staff.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\current-staff.ts) · [header.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\header.tsx) · [prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · `src/lib/chat.ts` (mới) · `src/app/(app)/chat/**` (mới: layout, page, [id]/page, actions) · `src/app/api/chat/[id]/messages/route.ts` (mới, polling) · [nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts) · `src/app/(app)/settings/communication/**` (mới) · [settings/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\page.tsx) · messages/vi.json · messages/en.json. (Tham chiếu: [guest-session.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\guest-session.ts) cho cookie ký, [finance-nav.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\finance\finance-nav.tsx) cho sub-nav, [timeline_comment] dual-author cho Message.)

---

# BATCH: Module ③ Project — Tab Operations (Vận hành) · Import Excel thuê ngoài → lưới sửa → xuất Biên bản CTV (Word điền sẵn)

## Context
Bộ phận Operations (OPE) thuê nhân sự ngoài (CTV = cộng tác viên) phục vụ hiện trường, trả **theo ngày công** hoặc **trọn gói theo job cho từng người**. Quy trình giấy tờ dựa trên 2 file mẫu thật (đã đọc kỹ nội dung):
- **Excel `Bang chi tiet thanh toan thue ngoai.xlsx`** (form BM08/QT.TCM.16): nhân sự hiện trường điền sau khi hoàn thành task/job. Sheet chính `BM8_TT` = header dự án + bảng **27 cột × tối đa ~58 người** (dòng 15–72). 27 cột: STT, Họ tên, Giới tính, Ngày sinh, Quốc tịch, Số CCCD/Passport, Ngày cấp, Nơi cấp, Địa chỉ thường trú, Mã số thuế, Số TK NH, Tên ngân hàng, Chi nhánh, SĐT, Tên event, Ngày thực hiện, Ngày nghiệm thu, Địa điểm thực hiện, Hạng mục công việc, ĐVT (Gói/Ngày), Số lượng, Đơn giá, Thành tiền, Gross/Net (G/N), Thuế TNCN, Thực nhận, Ghi chú. (Sheet `CHILO` = chuyển khoản NH hàng loạt — phụ trợ, KHÔNG dùng; 2 sheet ẩn `DSid`/`dstinhNH` = danh mục tỉnh/NH — bỏ qua.)
- **Word `BM06 & BM09_BB TT THUE NGOAI.docx`**: 2 biểu mẫu trong 1 file — **BM06 BIÊN BẢN THỎA THUẬN THUÊ NGOÀI** (hợp đồng) + **BM09 BIÊN BẢN XÁC NHẬN HOÀN THÀNH DỊCH VỤ** (nghiệm thu). Bên A = TCM (cố định trong template), Bên B = CTV (điền từ placeholder `[{Token}]`). ~22 placeholder map 1:1 với cột Excel. Nguyên tắc (comment trong Excel): **"Mỗi dịch vụ = một biên bản"** → 1 dòng Excel = 1 dịch vụ = 1 biên bản (cùng người nhiều dịch vụ = nhiều dòng).

Mục tiêu: tab **Operations** trong workspace dự án cho phép **import Excel → hiện lưới sửa được → soát/sửa → nút "TẠO HỢP ĐỒNG CTV" → xuất file Word đã điền sẵn cho từng người** (in cho CTV ký, mang về TCM ký/đóng dấu, làm thủ tục thanh toán/hoàn ứng).

## Quyết định đã chốt với chủ dự án (AskUserQuestion)
1. **Xuất file Word đã điền sẵn** (KHÔNG tự convert PDF) → chỉ cần `docxtemplater`, **không** cần LibreOffice/Puppeteer/PDF engine. PDF = bước nâng cấp tương lai (ghi rõ "để mở").
2. **Thuế TNCN + Thực nhận: lấy nguyên từ Excel** (không tự tính) → **không** cần engine thuế/gross-net.
3. **Hồ sơ CTV: chỉ lưu theo từng dự án** (dòng phẳng) → **không** model party persistent, **không** dedupe CCCD.
4. **Import Excel + sửa trên lưới**: import xong hiện bảng chỉnh sửa được để soát/sửa trước khi tạo hợp đồng.

## Ràng buộc kỹ thuật đã xác minh (3 Explore + đọc trực tiếp 2 file)
- **Chưa có thư viện office/PDF/Excel nào** trong `package.json` (Next 16.2.10, React 19, Prisma 6.19, Zod 4). Thêm: `exceljs` (đọc xlsx) + `docxtemplater` + `pizzip` (điền docx). KHÔNG thêm PDF engine.
- **Placeholder trong Word bị cắt vụn ra nhiều `<w:r>` run** (VD `[{`+`Ho_va_ten`+`}]` ở 3 run; `S`+`0_`+`TK`+`_`+`NH`) ⟹ KHÔNG find-replace thô. `docxtemplater` xử lý run-splitting tự động. NHƯNG tag không được chứa `/`, dấu cách, dấu tiếng Việt; template dùng delimiter `[{ }]`; tên placeholder gốc **không nhất quán** (`S0_TK_NH` vs `So_TK_NH`, `Ngay_thuc_hien ` thừa cách, `Ngay_nghiệm_thu ` có dấu, `So_CCCD/Passport` có `/`). ⟹ **setup 1 lần: chuẩn hoá template** → tạo `templates/ctv-bien-ban.docx` (bản sạch trong repo), đổi hết placeholder về tag hợp lệ + thống nhất, giữ nguyên 100% layout/nội dung/điều khoản/chữ ký. File gốc = tài liệu tham chiếu.
- **Excel lưu ngày lẫn lộn**: ô text (`01/02/2000`) và ô serial Excel (`46423` → exceljs trả `Date`). Parser xử lý cả 2: `Date`→format `dd/mm/yyyy`, string→giữ. Tiền là số → `BigInt`.
- **Tab workspace data-driven**: thêm tab = sửa mảng `TABS` [workspace-nav.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\workspace-nav.tsx) + object `labels` [layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\layout.tsx) + key i18n + tạo `page.tsx`.
- **Lưới nhập nhiều dòng**: bê pattern [cost-sheet-builder.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\cost-sheet-builder.tsx) — mảng `useState` phẳng + `nextKey`, add/update/remove, `<table>` `overflow-x-auto` cell input nhỏ, submit 1 hidden `JSON.stringify`, server Zod parse + replace-all.
- **Lưu file nhị phân**: [chat-storage.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\chat-storage.ts) có `saveChatAttachment/readChatAttachment`, `FILE_MIME_TYPES` **đã gồm xlsx+docx+pdf**, chia thư mục theo ngày, chống traversal. Nhận File từ FormData: pattern `updateGroupAvatar`. Route trả file: [attachments/[id]/route.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\api\chat\attachments\[id]\route.ts) (đổi `Content-Disposition: attachment`). `runtime="nodejs"`, Next 16 `params` là Promise.
- Tiền **BigInt VND**; `formatNumber`/`toNum` [utils.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\utils.ts); `audit()`+`notifyFinanceDept` [finance/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\finance\actions.ts); `getCurrentStaffId()`.
- **OPE hiện chỉ là department order chung**, không có concept CTV/labor/payment → toàn bộ là surface mới.

## A) Data model (Prisma — SQLite dev, reset migrations/dev.db + `prisma migrate dev`)
- **`CtvBatch`** (`@@map("ctv_batch")`) — 1 đợt thuê ngoài của 1 dự án: `id, projectId, name?`, header từ Excel: `programFrom String?`, `programTo String?`, `teamLeader String?`, `workLocation String?`, `sourceFileKey String?` (storageKey file Excel đã upload), `createdById String?, createdAt, updatedAt`. Quan hệ project (Cascade), `rows CtvContract[]`. `@@index([projectId])`.
- **`CtvContract`** (`@@map("ctv_contract")`) — 1 dòng = 1 dịch vụ = 1 biên bản. Đủ 27 cột (đa số String để in "y nguyên"; tiền BigInt để cộng Tổng): `id, batchId, sort Int` (STT), `fullName, gender?, dateOfBirth?`(string)`, nationality?, idNumber?`(CCCD/Passport)`, idIssueDate?`(string)`, idIssuePlace?, permanentAddress?, taxCode?, bankAccountNo?, bankName?, bankBranch?, phone?, eventName?, executionDate?`(string)`, acceptanceDate?`(string)`, executionLocation?, workItem?, unit?`(Gói/Ngày free text)`, quantity Float?, unitPrice BigInt?, amount BigInt?`(Thành tiền)`, grossNet?`(G/N)`, pitTax BigInt?`(Thuế TNCN lấy nguyên)`, netReceived BigInt?`(Thực nhận lấy nguyên)`, note?, generatedFileKey String?`(docx đã điền)`, generatedAt DateTime?, createdAt, updatedAt`. Quan hệ batch (Cascade). `@@index([batchId, sort])`.
- **`Project`** += back-relation `ctvBatches CtvBatch[]`.
- **`Notification.type`** += `CTV_CONTRACTS_GENERATED` (tuỳ chọn — báo Kế toán).

## B) Thư viện + template
- Deps: `exceljs`, `docxtemplater`, `pizzip` (CommonJS, Node runtime).
- **`templates/ctv-bien-ban.docx`** (mới, trong repo, KHÔNG trong `public/`): bản chuẩn hoá của Word gốc — giữ nguyên bố cục BM06+BM09, đổi `[{...}]` → tag docxtemplater sạch (thống nhất tên, bỏ `/`/dấu cách/dấu tiếng Việt). Kèm file ghi mapping tag ↔ cột Excel.

## C) Lib mới `src/lib/ctv.ts` (thuần + IO)
- `CTV_COLUMNS` — định nghĩa 27 cột (key, nhãn vi/en, kiểu string|number|money) — nguồn chung cho parser + lưới + validator.
- `parseCtvExcel(buffer): { header, rows }` — `exceljs` đọc sheet `BM8_TT`; header ở ô cố định; quét dòng 15→ tới khi STT rỗng/"Tổng cộng"; map 27 cột theo vị trí A..AA; chuẩn hoá ngày + tiền. KHÔNG tính thuế.
- `fillCtvDocx(templateBuffer, row, batch): Buffer` — `PizZip`+`Docxtemplater` (delimiter/tag đã chuẩn hoá) đổ 1 row + header → docx đã điền (cả BM06+BM09).
- `zipCtvDocs(files): Buffer` (tuỳ chọn, `pizzip`) — gói nhiều docx thành ZIP "Tải tất cả".
- `ctvBatchTotal(rows): bigint` — cộng cho dòng Tổng cộng.

## D) Server actions `src/app/(app)/projects/[id]/operations/actions.ts`
- `createCtvBatch(projectId, formData)`.
- `importCtvExcel(batchId, formData)` — guard File/MIME xlsx/size → `saveChatAttachment` (sourceFileKey) → `parseCtvExcel` → **replace-all** rows của batch + lưu header. Audit.
- `saveCtvRows(batchId, formData)` — hidden `rowsJson` → Zod (`src/lib/validators/ctv.ts`) → replace-all rows. Audit.
- `generateCtvContracts(batchId)` — đọc `templates/ctv-bien-ban.docx`; mỗi row `fillCtvDocx` → `saveChatAttachment(docxMime)` → set `generatedFileKey/generatedAt`; (tuỳ chọn) `notifyFinanceDept`. Audit.
- `deleteCtvBatch` / `deleteCtvRow`. Tất cả `revalidatePath` + `audit()`.

## E) API route tải file
- **`src/app/api/ctv/[id]/route.ts`** (`runtime="nodejs"`, `dynamic="force-dynamic"`): GET theo `CtvContract.id` → guard → `readChatAttachment(generatedFileKey)` → `Content-Disposition: attachment; filename="BBTT_{tên}.docx"`. Mirror `attachments/[id]`. (Có thể `?type=source` tải Excel gốc, `?zip=1` cấp batch tải tất cả.)

## F) UI
- **Kích hoạt tab**: `operations` vào `TABS` (`seg:"/operations"`) + `labels` + key `projects.nav.operations` (vi/en).
- **`operations/page.tsx`** (server): liệt kê `CtvBatch` + nút "Tạo đợt mới"; mở batch → render lưới.
- **`operations-grid.tsx`** (client, mirror cost-sheet-builder): header batch (tên/Nhóm trưởng/Địa điểm/ngày) sửa được; nút **Import Excel** (`.xlsx`) → `importCtvExcel` → nạp lưới; **lưới 27 cột** `overflow-x-auto` cell input, add/xoá/sửa, STT auto, cột tiền `formatNumber`, dòng **Tổng cộng**; nút **Lưu** (`rowsJson`→`saveCtvRows`); nút **TẠO HỢP ĐỒNG CTV** → `generateCtvContracts` → danh sách người + link **Tải biên bản (.docx)** từng người + **Tải tất cả (ZIP)**; badge dòng đã tạo. Mobile cuộn ngang + note.
- **Không thêm settings** (thuế không tính, ĐVT free text). Để mở: option set `ctv_unit_type` nếu sau cần danh mục.

## G) i18n
Namespace `projects.operations` (vi+en, parity): tiêu đề tab/panel, nhãn 27 cột, nút Import/Lưu/Tạo hợp đồng/Tải docx/Tải ZIP, header batch, trạng thái đã tạo, thông báo import (số dòng). Thêm `projects.nav.operations`.

## H) Seed
- 1 `CtvBatch` mẫu + 2–3 `CtvContract` (dữ liệu 2 dòng mẫu Excel: Trần Văn A — Gói 500k Net; Trần Văn B — Gói 10tr Gross) để test lưới + generate.
- Copy `templates/ctv-bien-ban.docx` vào repo (asset, không seed DB).

## Thứ tự triển khai (mỗi bước giữ app compile được)
1. `npm i exceljs docxtemplater pizzip`. Tạo `templates/ctv-bien-ban.docx` (chuẩn hoá placeholder) + ghi mapping.
2. Schema (`CtvBatch`+`CtvContract`+relation+Notification type) → reset migrations/dev.db → `prisma migrate dev`.
3. Seed batch/rows mẫu.
4. `src/lib/ctv.ts` + `src/lib/validators/ctv.ts`.
5. i18n `projects.operations` + `projects.nav.operations` (parity).
6. Actions `operations/actions.ts` + route `api/ctv/[id]/route.ts`.
7. UI: kích hoạt tab + `operations/page.tsx` + `operations-grid.tsx`.
8. Verify.

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx next build` — sạch. Diff key vi/en — 0 lệch.
- Browser E2E (dev + Claude Browser, vi/en, desktop 1280 + mobile 375):
  - Mở dự án thực thi → tab **Operations** hiện, tạo đợt mới.
  - **Import** đúng file `Bang chi tiet thanh toan thue ngoai.xlsx` → lưới nạp đúng 2 dòng mẫu (đủ 27 cột; serial `46423` → `dd/mm/yyyy`; tiền đúng; Gross/Net N/G). Header (Code/Địa điểm/Nhóm trưởng) đúng.
  - Sửa 1 ô + thêm 1 dòng tay → **Lưu** → reload giữ đúng (replace-all không mất dòng khác).
  - **TẠO HỢP ĐỒNG CTV** → mỗi người 1 link; tải 1 `.docx`, mở kiểm BM06+BM09 điền đúng tên/CCCD/NH/hạng mục/đơn giá/thành tiền/thực nhận/ngày/Code/địa điểm; không còn `[{…}]` sót; layout giữ nguyên. Tải **ZIP** OK.
  - Mobile cuộn ngang + note.
- **Kiểm thủ công quan trọng (không tự động)**: mở file `.docx` xuất ra bằng Word thật để xác nhận 100% khớp mẫu gốc (font Nunito, bảng, chữ ký) — tool browser không mở được Word.

## Hạn chế đã biết / để mở
- **Chỉ xuất Word** (theo yêu cầu) — PDF nâng cấp sau: LibreOffice + `soffice --convert-to pdf` trong `generateCtvContracts`, không đổi phần còn lại.
- **Thuế/Thực nhận lấy nguyên Excel** — không tính lại. Muốn auto-tính 10%/gross-net sau → helper thuần trong `ctv.ts`, cột đã có sẵn.
- **Hồ sơ CTV phẳng theo dự án** — không dedupe CCCD. Muốn tái sử dụng sau → tách `Ctv` party + upsert CCCD.
- **Bên A = TCM cố định** trong template — dùng công ty khác thì thay `templates/ctv-bien-ban.docx` + thông tin Bên A (không đụng code).
- Không RBAC thật (stub CEO) — nhất quán toàn app.

### File trọng yếu (batch này)
`templates/ctv-bien-ban.docx` (mới) · [prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · `src/lib/ctv.ts` (mới) · `src/lib/validators/ctv.ts` (mới) · `src/app/(app)/projects/[id]/operations/**` (mới: page, operations-grid, actions) · `src/app/api/ctv/[id]/route.ts` (mới) · [workspace-nav.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\workspace-nav.tsx) · [projects/[id]/layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\layout.tsx) · messages/vi.json · messages/en.json. (Tái dùng: [chat-storage.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\chat-storage.ts), [cost-sheet-builder.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\cost-sheet-builder.tsx), [attachments/[id]/route.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\api\chat\attachments\[id]\route.ts), [finance/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\finance\actions.ts).)

---

# BATCH (ngoài CRM): Sổ tay HS&E song ngữ cho TCM (Marketing agency — Below The Line) → xuất Word + PDF, brand hoàn chỉnh

## Context
Ở vai trò BoD, TCM cần **ban hành một Sổ tay An toàn – Sức khỏe – Môi trường (HS&E / ATSKMT)** chính thức, chi tiết, theo **best practice của ngành marketing agency chuyên Below The Line** (sự kiện/activation/roadshow, dựng–tháo booth & POSM, nhân sự hiện trường PG/PB/promoter, thuê ngoài production/rigging). Đây **không phải task code CRM** — là một **văn bản deliverable** riêng, nhưng phải mang **nhận diện thương hiệu TCM** (logo + brand kit) đã dùng trong CRM để nhất quán.

**Quyết định đã chốt với chủ dự án (AskUserQuestion):**
1. **Định dạng: Word (.docx) nguồn sửa được + bản PDF in sẵn.**
2. **Phạm vi: Sổ tay HS&E TOÀN DIỆN** (bao trùm cả "Chương trình + Quy trình + Huấn luyện" trong 1 cuốn).
3. **Song ngữ: Tiếng Việt là thân bài chính; Tiếng Anh dạng tóm tắt** — mỗi chương có hộp "English summary", tiêu đề song ngữ, và một **Phụ lục thuật ngữ song ngữ (VI–EN glossary)**. Riêng **Tuyên bố Chính sách HS&E** (trang ký ban hành) làm **song ngữ đầy đủ** vì đây là tuyên ngôn cam kết.

## Brand kit TCM (đã trích xuất từ CRM — áp dụng vào văn bản)
- **Logo:** `D:\TCM\TCM_AI_CRM\TCM_CRM\public\brand\logo.png` (lockup đầy đủ "TCM · Est 2000 · TARGETED MARKETING", 2189×923, nền trong suốt) cho trang bìa + `public\brand\mark.png` cho header các trang.
- **Màu brand** (từ `src\app\globals.css`): xanh chủ đạo **brand-600 `#0068E6`** / brand-500 `#0B84FA`; ramp `#eef6ff → #061d40` (brand-50 `#EEF6FF`, brand-100 `#DCECFF`, brand-700 `#0052B8`, brand-900 `#0A3269`, brand-950 `#061D40`).
- **Ngữ nghĩa:** success `#16A34A` (thực hành tốt), warning `#D97706` (cảnh báo), danger `#DC2626` (nguy hiểm/nghiêm trọng).
- **Trung tính:** ink/foreground `#0F172A`, muted `#64748B`, surface-2 `#F6F8FB`, border `#E2E8F0`; bo góc `--radius: 10px`.
- **Font:** brand dùng **Nunito** cho tài liệu xuất (khớp template hợp đồng CTV), fallback Arial.
- **Footer chuẩn:** "TCM — Targeted Marketing · Est 2000" + mã tài liệu + số trang.

## Ràng buộc kỹ thuật sản xuất (đã kiểm read-only)
- Máy **KHÔNG có** LibreOffice (`soffice`), **KHÔNG có** pandoc, **KHÔNG có** Python → không dùng được các converter docx↔pdf thông thường. **Chỉ có Node v24.18.**
- ⟹ **Giải pháp Node-native, một nguồn nội dung → hai renderer** (tránh soạn 2 lần):
  - **`content.mjs`** — toàn bộ nội dung Sổ tay dưới dạng cấu trúc dữ liệu (mảng block: heading cấp 1–3, đoạn văn `{vi, en?}`, bảng, hộp callout `note/warning/danger/good`, danh sách, ngắt trang, hộp "English summary"). Đây là **nguồn sự thật duy nhất**.
  - **Renderer A → `.docx`**: dùng thư viện npm **`docx`** (dolanmiu/docx, thuần Node) dựng Word có: trang bìa brand, mục lục (TOC field), heading style màu brand, bảng viền brand, callout tô nền (`#FFFBEB`/`#FEF2F2`/`#ECFDF3`), header (logo mark) + footer (số trang), ảnh logo nhúng từ `public\brand\logo.png`.
  - **Renderer B → `.pdf`**: dựng **HTML in-sẵn** (CSS `@page`, print, màu brand, logo base64) từ cùng `content.mjs`, rồi **Puppeteer** (Chromium bundled) render HTML → PDF. Nếu Chromium tải/chạy được → xuất PDF tự động; nếu môi trường chặn tải Chromium → **fallback**: giao bản **HTML in-sẵn** + hướng dẫn "Mở .docx bằng Word → Save as PDF" (người dùng có Word, đã gửi .docx/.xlsx trước đó).
- **Cô lập hoàn toàn khỏi app Next**: đặt trong thư mục riêng `docs/hse/` **có `package.json` + `node_modules` riêng** (deps `docx`, `puppeteer`) — **KHÔNG** thêm dep vào `package.json` gốc của CRM (giữ nguyên build app). Thêm `docs/hse/node_modules` + file output vào `.gitignore` (hoặc commit output tùy chủ dự án).

## Cấu trúc Sổ tay HS&E (toàn diện — chuẩn ngành BTL agency)
Tham chiếu chuẩn: **Luật An toàn, vệ sinh lao động 84/2015/QH13** + Nghị định 39/2016/NĐ-CP & 44/2016/NĐ-CP; **ISO 45001:2018** (OH&S) và **ISO 14001:2015** (Môi trường); thông lệ quản lý an toàn sự kiện (event safety) quốc tế.

**Phần đầu (Front matter):**
- Trang bìa (logo lockup, tiêu đề "SỔ TAY AN TOÀN – SỨC KHỎE – MÔI TRƯỜNG / HEALTH, SAFETY & ENVIRONMENT MANUAL", mã tài liệu `TCM-HSE-MAN-01`, phiên bản, ngày hiệu lực, phân loại lưu hành nội bộ).
- Trang kiểm soát tài liệu (lịch sử phiên bản; bảng Soạn thảo / Rà soát / Phê duyệt — HS&E Coordinator / HR / **BoD ký ban hành**).
- Mục lục (TOC).
- **Tuyên bố Chính sách HS&E** — song ngữ đầy đủ, có dòng chữ ký BoD.

**Phần 1 — Nền tảng:** 1) Mục đích, phạm vi & đối tượng áp dụng · 2) Văn bản pháp lý & tiêu chuẩn tham chiếu · 3) Định nghĩa & từ viết tắt (HS&E, PPE, JSA, PTW, TBT…) · 4) Chính sách & nguyên tắc HS&E.

**Phần 2 — Tổ chức & Trách nhiệm:** 5) Sơ đồ tổ chức HS&E & phân vai (BoD, Điều phối HS&E, PM/Event Manager, Cán bộ an toàn hiện trường, Trưởng bộ phận, Nhân viên, **CTV/nhân sự hiện trường**, Nhà thầu) · 6) Hội đồng/đối thoại HS&E · 7) Ma trận năng lực & huấn luyện bắt buộc.

**Phần 3 — Quản lý rủi ro:** 8) Nhận diện mối nguy & đánh giá rủi ro (phương pháp JSA + ma trận rủi ro 5×5) · 9) **Sổ đăng ký rủi ro đặc thù BTL** (dựng/tháo, làm việc trên cao, điện tạm, cháy nổ, đám đông, thời tiết ngoài trời, di chuyển thiết bị…) · 10) Hệ thống Giấy phép làm việc (PTW: trên cao / công việc nóng / điện).

**Phần 4 — Kiểm soát vận hành (quy trình đặc thù BTL):** 11) An toàn dựng & tháo dỡ (booth, backdrop, truss, sân khấu) · 12) Làm việc trên cao (rigging, treo banner, ánh sáng) · 13) An toàn điện tạm & máy phát · 14) Nâng/mang vác thủ công & vận chuyển vật tư/POSM · 15) Phòng cháy chữa cháy & hiệu ứng đặc biệt (pyro) · 16) Quản lý đám đông & an toàn công chúng · 17) An toàn giao thông & di chuyển hiện trường · 18) **An toàn nhân sự hiện trường / PG–PB–promoter** (làm ngoài trời, sốc nhiệt, làm việc đơn độc, phòng chống quấy rối) · 19) Quản lý HS&E nhà thầu/vendor (production, rigging) · 20) Chương trình PPE.

**Phần 5 — Sức khỏe & phúc lợi:** 21) Sức khỏe nghề nghiệp (sốc nhiệt, tư thế/ergonomics, mệt mỏi do giờ sự kiện kéo dài) · 22) Sơ cấp cứu & y tế hiện trường · 23) Vệ sinh & an toàn thực phẩm tại sự kiện, bệnh truyền nhiễm · 24) Sức khỏe tinh thần & phúc lợi.

**Phần 6 — Ứng phó khẩn cấp:** 25) Kế hoạch ứng phó khẩn cấp (sơ tán, cháy, y tế, thời tiết cực đoan ngoài trời) · 26) Báo cáo – điều tra sự cố & hành động khắc phục.

**Phần 7 — Môi trường:** 27) Chính sách & khía cạnh môi trường (rác thải, vật liệu POSM, đồ nhựa dùng 1 lần, năng lượng) · 28) Quản lý chất thải & **sự kiện xanh/bền vững** (phân loại, tái sử dụng POSM, giảm phát thải).

**Phần 8 — Huấn luyện & truyền thông:** 29) Chương trình huấn luyện & **đào tạo nhập môn (induction) cho nhân sự hiện trường/CTV** · 30) Họp an toàn đầu ca / briefing trước sự kiện (Toolbox Talk) · 31) Truyền thông, biển báo & chiến dịch an toàn.

**Phần 9 — Giám sát & cải tiến:** 32) Kiểm tra & đánh giá (audit) hiện trường · 33) Đo lường hiệu quả & KPI HS&E (chỉ số dẫn/chỉ số trễ) · 34) Rà soát của lãnh đạo & cải tiến liên tục.

**Phụ lục (biểu mẫu & checklist — nhãn song ngữ, sẵn sàng in dùng):** A. Chính sách HS&E (bản ký) · B. Mẫu Đánh giá rủi ro/JSA · C. **Checklist kiểm tra an toàn site sự kiện** · D. Giấy phép làm việc (trên cao/nóng/điện) · E. Mẫu Báo cáo sự cố · F. Biên bản Toolbox Talk / briefing · G. **Phiếu huấn luyện an toàn & cam kết ký tên cho nhân sự hiện trường/CTV** · H. Bảng tiền đánh giá HS&E nhà thầu · I. Danh bạ khẩn cấp & sơ đồ leo thang · J. Sổ cấp phát PPE · K. Nhật ký quản lý chất thải · L. Ma trận huấn luyện · **M. Thuật ngữ song ngữ VI–EN (glossary).**

## Cách trình bày song ngữ (áp dụng nhất quán)
- Tiêu đề chương: **VI (dòng chính) — EN (dòng phụ, cỡ nhỏ, màu muted)**.
- Thân bài: tiếng Việt đầy đủ.
- Cuối mỗi chương: hộp brand-50 nền nhạt **"English summary"** — 3–6 gạch đầu dòng tóm tắt chương bằng tiếng Anh.
- Nhãn bảng/biểu mẫu/callout: song ngữ ngắn (VI / EN).
- Phụ lục M: bảng đối chiếu thuật ngữ 2 cột VI–EN.

## Thứ tự triển khai
1. Tạo thư mục cô lập `docs/hse/` + `package.json` riêng; `npm i docx puppeteer` **trong thư mục đó** (không đụng app). Cập nhật `.gitignore`.
2. Viết `docs/hse/content.mjs` — soạn TOÀN BỘ nội dung Sổ tay (VI thân bài + EN summary mỗi chương + glossary) theo cấu trúc trên. (Đây là phần nặng nhất — nội dung thật, chi tiết, best-practice.)
3. Viết `docs/hse/build-docx.mjs` (renderer `docx` → `TCM-HSE-Manual.docx`): trang bìa, TOC, style heading/màu brand, header logo + footer số trang, bảng, callout, nhúng logo.
4. Viết `docs/hse/build-html.mjs` (renderer HTML in-sẵn, CSS `@page`+brand+logo base64 → `TCM-HSE-Manual.html`) + `docs/hse/build-pdf.mjs` (Puppeteer render HTML → `TCM-HSE-Manual.pdf`).
5. Chạy build cả 2; kiểm tra output.
6. Bàn giao đường dẫn `.docx` + `.pdf` (+ `.html` fallback).

## Verification
- Chạy `node docs/hse/build-docx.mjs` và `node docs/hse/build-pdf.mjs` — không lỗi; file `.docx`, `.pdf`, `.html` được tạo với dung lượng hợp lý (> 0, có nhiều trang).
- Mở **PDF** bằng Claude Browser (`navigate` tới `file://…/TCM-HSE-Manual.pdf` hoặc mở HTML) để **chụp ảnh xác nhận trực quan**: trang bìa có logo + màu brand đúng, mục lục, heading màu brand-700, callout tô màu warning/danger/good, header/footer, tiêu đề song ngữ, hộp "English summary". Kiểm cả trang bìa + 1–2 trang nội dung + 1 phụ lục biểu mẫu.
- **Kiểm thủ công (người dùng)**: mở `.docx` bằng Word thật để xác nhận TOC cập nhật được, font Nunito/Arial, bảng & callout giữ định dạng, logo nét — vì tool không mở được Word. Nếu Puppeteer không tải được Chromium → nêu rõ và bàn giao `.html` in-sẵn + hướng dẫn "Word → Save as PDF".

## Hạn chế / để mở
- **Không có converter hệ thống** (LibreOffice/pandoc/Python) → PDF đi qua Puppeteer; nếu chặn tải Chromium, PDF do người dùng xuất từ Word/HTML (đã có fallback).
- **EN dạng tóm tắt** theo yêu cầu (không dịch toàn văn) — nếu sau cần song ngữ đầy đủ từng đoạn, mở rộng `content.mjs` (mỗi block đã có sẵn khe `en`).
- Nội dung là **khung best-practice tổng quát ngành BTL**; số liệu/danh bạ khẩn cấp/tên người ký cụ thể của TCM cần chủ dự án điền vào chỗ `[…]` trước khi ban hành chính thức.
- Đây là **deliverable độc lập** — không ảnh hưởng schema/app CRM; không migrate DB, không đụng `messages/*.json`.

### File trọng yếu (batch này)
`docs/hse/package.json` (mới, cô lập) · `docs/hse/content.mjs` (mới — nguồn nội dung) · `docs/hse/build-docx.mjs` (mới) · `docs/hse/build-html.mjs` + `docs/hse/build-pdf.mjs` (mới) · output `docs/hse/TCM-HSE-Manual.docx` + `.pdf` + `.html`. Tài sản dùng lại: `public/brand/logo.png`, `public/brand/mark.png`, brand tokens từ `src/app/globals.css`.

---

# BATCH: Module Creative — Giai đoạn A (siết seam với khung CRM) + Giai đoạn B (Cost-per-task: Kế hoạch vs Thực tế)

## Context
Module Creative đã xây xong **phần vận hành** (đợt 1): vòng đời task, khóa cascade, dashboard, task board. Flowchart ghi rõ phần **cost-per-task để "đợt sau"** — đó là phần còn thiếu duy nhất về tính năng. NHƯNG audit code thực tế phát hiện **8 lỗ ở seam nối Creative ↔ khung CRM**, trong đó có lỗi làm **dashboard đếm sai vĩnh viễn**. Vì cost-per-task tính TỪ số task + giờ theo kỳ, xây cost trên bộ đếm sai ⇒ tiền sai từ ngày đầu. Do đó: **vá seam trước (A), rồi mới cost (B)** — đúng yêu cầu chủ dự án "giữ chắc cấu trúc khung CRM, kết nối Creative với khung chung thật chắc, flow rõ ràng logic".

### Quyết định đã chốt với chủ dự án (AskUserQuestion)
1. **Làm cả A + B** trong 1 đợt, tuần tự.
2. **Cost = Kế hoạch vs Thực tế**: cùng 1 quỹ lương, phân bổ 2 cách — theo ma trận % (kế hoạch) vs theo `hoursSpent` thực tế — hiện cả 2 + chênh lệch. Đúng DNA CO/CE, CECO ctract-vs-liquid của CRM này.
3. **Lương theo VỊ TRÍ (`Staff.title`), KHÔNG theo cá nhân** — app chưa có RBAC thật (chỉ có "act as" demo, ai cũng thấy mọi thứ) nên không được lộ lương từng người.
4. **KHÔNG thêm tab Creative trong workspace dự án** — Creative giữ tập trung ở `/creative`.

### Hiện trạng đã kiểm chứng (đọc code, không suy đoán)
- Đã có: `src/lib/creative.ts` (178 dòng), `creative/{actions.ts (6 action), page.tsx, task-board.tsx}`, model `CreativeTask`, seed 5 task mẫu + 3 nhân sự CREATIVE (title: "Creative Lead"/"Senior Designer"/"3D Artist"), option_set `creative_task_type` (7 mục), ~60 key i18n. **Mọi action đều được UI gọi — không có action chết.**
- Spawn task đọc **2 nguồn hội tụ vào cùng 1 ProjectOrder**: `creativeItems` (checklist tick tay ở `/bidding`) + `items` (dòng gom từ Master Timeline ở `/projects`), idempotent theo `(orderId, sourceItemLabel)`.
- `EXECUTION_STATUS_CODES` ([projects.ts:4]) gồm `FINISHED` ⇒ `taskPhase("FINISHED")` = `"WORKING"`.
- `getStringSetting` **đã có sẵn** ([src/lib/settings.ts]) — dùng ngay cho cycle, không cần thêm. `upsertSetting` là helper **private copy-paste theo từng module settings** (xem `settings/finance/actions.ts:10`) — copy nguyên với `module:"creative"`.

---

## GIAI ĐOẠN A — vá 8 lỗ seam

**A1. Dashboard đếm sai vĩnh viễn (nghiêm trọng nhất).** `getCreativeDashboardStats` ([creative.ts:125]) query task active **không lọc lock**; task của dự án FINISHED quá grace 7 ngày vẫn `ASSIGNED` mãi ⇒ đếm vào "Tổng task đang làm" mãi mãi. Cùng 1 trang: board hiện "Đã khóa" nhưng dashboard đếm "đang làm" — **2 con số mâu thuẫn**. Sửa: partition ở JS bằng `isTaskLocked` sẵn có (không biểu diễn được bằng Prisma vì là phép tính thời gian trên `finishedAt`); query đã `include project.status` nên đủ dữ liệu; `byMember` đọc cùng mảng nên fix luôn. **Thêm `staleLocked: number`** vào `CreativeDashboardStats` + 1 card riêng — không âm thầm bỏ số.

**A2. 2 nhánh cùng nghiệp vụ, hành vi khác nhau.** `dispatchProjectOrder` ([projects/actions.ts:262]) sinh task Creative nhưng không revalidate `/creative` ⇒ task vô hình. Nhánh `/bidding` lại đúng ([order-actions.ts:136]). Sửa: **KHÔNG** nhét `/creative` vào `revalidateProject` (helper này bị ~20 action gọi — sẽ xóa cache `/creative` vô cớ); thay vào đó revalidate **có điều kiện tại call site**, mirror `order-actions.ts:136`. Mở rộng `dispatchOrder` trả `{ sent, department }` (boolean hiện đang bị caller vứt đi → nới rộng miễn phí).
- **Lỗ kèm theo**: `addProjectOrderItem` thêm dòng vào Order Creative **đã dispatch** → dòng đó không bao giờ thành task. Spawn idempotent nên gọi lại an toàn khi `!order.isDraft && department==="CREATIVE"`.

**A3. `markFinished` ([bidding/actions.ts:751-771]) revalidate thiếu.** FINISHED mở grace Creative ⇒ thiếu `/creative`; đồng thời đẩy dự án ra khỏi `getBiddingReminders`/`getTimelineOverdueItems` ⇒ thiếu `/reminders`. Thêm cả 2. Soát `markLiquidation` ngay trên cho cùng lỗ `/reminders`.

**A4. Chuỗi timeline→order→task đi 1 chiều, không có tín hiệu về.** Task `DELIVERED` không đẩy `ProjectOrderItem.status` → `DONE`.
- Thêm **`CreativeTask.orderItemId String?`** + relation `ProjectOrderItem?` **`onDelete: SetNull`** (bắt buộc: `ProjectOrderItem` cascade từ `ProjectOrder`, mà `CreativeTask.order` đã là SetNull) + `@@index([orderItemId])` + back-relation `ProjectOrderItem.creativeTasks`. **KHÔNG parse chuỗi `TL:`** — `?? it.id` ([creative.ts:78]) khiến không phân biệt được id nào, và label checklist bắt đầu bằng `TL:` sẽ đụng.
- **Giữ nguyên `sourceItemLabel` làm khóa dedupe** (không đụng idempotency); chỉ set thêm `orderItemId: it.id` cho nhánh timeline, `null` cho nhánh checklist.
- **Backfill trong migration** (công thức label khả nghịch): `UPDATE creative_task SET orderItemId = (SELECT poi.id FROM project_order_item poi WHERE poi.orderId = creative_task.orderId AND ('TL:' || COALESCE(poi.sourceTimelineItemId, poi.id)) = creative_task.sourceItemLabel) WHERE sourceItemLabel LIKE 'TL:%' AND orderId IS NOT NULL;`
- Flip DONE ở **2 điểm**: nhánh `deliverStraight` của `submitCreativeTask` + `approveCreativeTask`. Guard `if (!task.orderItemId) return;`.
- **Phải sửa kèm**: `done()` ([creative/actions.ts:35]) chỉ revalidate `/creative`+`/reminders` — DONE hiện ở `/projects/[id]/orders` nên sẽ vô hình. Đổi `done(projectId?)` → thêm `revalidatePath('/projects/{id}/orders')`. Mọi caller đã có `task.projectId`.
- **Không làm**: KHÔNG tự set `ProjectOrder.status = DONE` — đó là việc của `submitOrderResult` (cần `resultLinkUrl`). Không cần un-DONE (`reject` chỉ đi từ SUBMITTED, mà SUBMITTED chưa set DONE).

**A5. `CreativeTask.deadline` không có nhắc quá hạn** (trong khi `ProjectOrder` có `deadlineReminderSentAt`). Mirror **chính xác** pattern no-cron sẵn có trong `src/lib/reminders.ts`:
- Thêm `CreativeTask.deadlineReminderSentAt DateTime?`.
- `checkCreativeTaskDeadlineReminders()` (void, ghi Notification) — copy 5 bất biến của `checkOrderDeadlineReminders` ([reminders.ts:210]): guard `length===0`, cờ `deadlineReminderSentAt: null` **nằm trong WHERE** (idempotency key ở SQL), `Set` recipient dedupe, `createMany` rồi update cờ **từng dòng**, **title tiếng Việt hardcode** (`reminders.ts` không có `getTranslations` — không được thêm).
- `getCreativeOverdueTasks(teamCode?)` (thuần computed) — mirror `getTimelineOverdueItems` ([reminders.ts:170]).
- Lock là phép tính thời gian ⇒ không query được: WHERE `deadline lte now` + `status in ACTIVE` + cờ null, `include project.status`, rồi `.filter(t => !isTaskLocked(...))` ở JS trước khi notify.
- **`assignCreativeTask` phải reset `deadlineReminderSentAt: null` khi đổi `deadline`** — nếu không, task dời hạn sẽ không bao giờ được nhắc lại (`checkAcceptanceSignReminders` ghi rõ ý này trong doc-comment).
- Wire vào `layout.tsx` (**cả 2 `Promise.all`** — `check*` fire-and-forget + `get*` cộng vào `reminderCount`) + section mới ở `reminders/page.tsx`.

**A6. `avgHours` dùng `formatPercent` ([creative/page.tsx:142]) — ĐÍNH CHÍNH: KHÔNG phải bug.** `formatPercent` ([utils.ts:20]) không nhân 100, không thêm `%` — chỉ format thập phân ⇒ `"8,0h"` hiện **đúng**. Đây là **lỗi đặt tên** gây hiểu nhầm. Vá tối thiểu, **zero behavior change**: thêm `formatDecimal(value, locale, digits=1)` vào `utils.ts`, cho `formatPercent` delegate sang nó (giữ ~13 caller cũ nguyên vẹn), `page.tsx:142` dùng `formatDecimal`.

**A7. 2 action bỏ qua guard lock.** `deleteCreativeTask` ([actions.ts:142]) → đổi sang `loadUnlocked` (1 dòng, khớp 4 action kia). `createCreativeTask` ([actions.ts:126]) → thêm `include:{status:true}` + `isTaskLocked` guard. `page.tsx:30` chỉ loại FAILED/CANCELED → giữ nguyên `notIn` (narrow ở DB cho rẻ) + thêm JS filter `!isTaskLocked(p.status.code, p.finishedAt)`.

**A8. Dead code — promote, đừng xóa bừa.**
- `CREATIVE_TASK_STATUSES`/`CreativeTaskStatus` không ai import (status là string trần khắp nơi) → **làm nó gánh việc thật**: `ACTIVE_TASK_STATUSES: readonly CreativeTaskStatus[]` (chứng minh compile-time active ⊂ all) + type `TaskData.status` = `CreativeTaskStatus` để key `board.group*` kiểm được. Chấp nhận 1 cast có chú thích ở ranh giới `page.tsx` (cột DB là `String`) — có tiền lệ ở `creative.ts:26`.
- **Đính chính danh sách key chết**: `board.allProjects/allAssignees/allPhases/allTeams/allOrderers` **CÓ dùng**. 5 key chết thật là `board.filterProject/filterAssignee/filterPhase/filterTeam/filterOrderer` — chết vì **5 `<select>` filter không có accessible name nào**. → **Wire thành `aria-label`**: key sống lại + vá luôn lỗ a11y.
- `task.lockedFinishedGrace` — chết **và không thể tới được** (`page.tsx:40` đặt `graceDaysLeft = locked ? null : ...` ⇒ task locked không bao giờ có ngày để hiện) → **xóa**. `task.deliveredBy`/`task.submittedBy` — chết, `TaskData` còn chưa map `reviewedBy`/`submittedAt` → **xóa** (không phát minh UI mới trong batch vá lỗi). `status.*` (6 key) — **byte-identical** với `board.group*` → **xóa**. Xóa đối xứng ở **cả `vi.json` và `en.json`**.

---

## GIAI ĐOẠN B — Cost-per-task (Kế hoạch vs Thực tế, theo vị trí)

### ⚠ 2 sự thật phải ghi vào code comment + UI copy (nếu không sẽ bị đọc sai)
1. **`actualCost` là PHÂN BỔ, không phải chi phí thực chi.** Lương vẫn trả dù có task hay không. UI phải ghi **"phân bổ theo giờ thực tế"**, TUYỆT ĐỐI không ghi "chi phí thực tế" — CFO sẽ đọc thành tiền đã chi. Đây là điểm yếu của phép so sánh với CO/CE: CE là số đo thật, "thực tế" ở đây thì không.
2. **Chênh lệch ở cấp VỊ TRÍ ≈ 0 về mặt cấu trúc.** Vì `actualCost = pool × actual%` ⇒ `Σ_T actualCost[p][T] ≡ pool_p`, còn `Σ_T plannedCost[p][T] ≡ pool_p × (Σratio/100)`. Chênh lệch chỉ có ý nghĩa ở **từng ô (vị trí × loại task)** và **tổng theo cột loại task**. Ghi rõ, không thì sẽ có người dựng KPI card "tổng chênh lệch" luôn hiện 0đ rồi báo là bug.

### Data model (migration `creative_cost_model`)
```prisma
model CreativeSalaryBudget {
  id                String   @id @default(cuid())
  positionTitle     String   // khớp Staff.title (CREATIVE)
  periodCode        String   // "2026-M07" | "2026-Q3" | "2026-H2" | "2026"
  monthlySalary     BigInt   // VND/tháng cho MỘT người ở vị trí này
  headcountOverride Int?     // null = suy ra live từ Staff; set = chốt cứng cho kỳ đã đóng
  note              String?
  @@unique([positionTitle, periodCode])
  @@map("creative_salary_budget")
}
model CreativeAllocationRatio {
  id            String @id @default(cuid())
  positionTitle String
  taskTypeId    String
  periodCode    String
  percent       Float  @default(0) // 0..100
  taskType OptionItem @relation("CreativeRatioTaskType", fields: [taskTypeId], references: [id], onDelete: Cascade)
  @@unique([positionTitle, taskTypeId, periodCode])
  @@map("creative_allocation_ratio")
}
```
- `taskTypeId` **required ⇒ `onDelete: Cascade`** (xóa loại task thì ratio phải chết theo) — khác `CreativeTask.taskTypeId` (optional → SetNull). Thêm back-relation `OptionItem.creativeRatiosAsType`.
- **headcount suy ra live** từ `count(Staff active, department CREATIVE, title = positionTitle)`; `headcountOverride` để chốt kỳ đã đóng (nếu không, chạy lại báo cáo Q1 vào Q4 sau khi 1 designer nghỉ sẽ âm thầm định giá lại Q1).
- Setting `creative.cost_review_cycle` = `MONTH|QUARTER|HALF|YEAR` (default `MONTH`) qua `getStringSetting` sẵn có + **wrap validate enum** (`getStringSetting` không validate).

### `src/lib/creative-cost.ts` (file MỚI — `creative.ts` đã 178 dòng, sẽ phình ~400; repo đã tách kiểu này: `finance.ts` vs `cashflow.ts`)
- `parsePeriodCode(code) -> {start, end, months} | null` · `currentPeriodCode(cycle, date)`.
- **`months` PHẢI parse từ chính `periodCode`, KHÔNG lấy từ setting hiện hành** — nếu không, đổi cycle sẽ định giá lại toàn bộ kỳ đã lưu.
- `computeCreativeCost(input)` **thuần** (nhận/trả `number`, không BigInt — `BigInt × Float` không typecheck; `Number()` ở biên, `Math.round()` ở cuối; tiền lệ `reminders.ts:154`) + `getCreativeCostReport(periodCode)` (IO wrapper).
- Công thức: `pool_p = monthlySalary_p × headcount_p × months`; `plannedCost[p][T] = pool_p × ratio[p][T]/100`; `actualPercent[p][T] = hours[p][T] / totalHours_p`; `actualCost[p][T] = pool_p × actualPercent[p][T]`; `variance = actual − planned`; `costPerTask[T] = cost[T] / deliveredCount[T]`.
- Kỳ = `deliveredAt: { gte: start, lt: end }` — **KHÔNG** dùng `status:"DELIVERED"` đơn thuần (dòng cũ có thể `deliveredAt` null).

### Edge case — hành vi CHỐT (nguyên tắc: cảnh báo & hiện ra, không bịa số, không âm thầm bỏ)
| Ca | Hành vi |
|---|---|
| Vị trí không có ratio | `planned=0`, pool vẫn tính, `unallocatedPlannedCost = pool`, cảnh báo `NO_RATIOS`. **Không chia đều** (= bịa số). |
| `totalHours_p = 0` | `actualPercent = 0` (không NaN, không chia đều), cảnh báo `NO_HOURS`. |
| Task `hoursSpent = null` | Góp 0 giờ nhưng **vẫn đếm vào `deliveredCount[T]`** ⇒ `costPerTaskActual` bị hụt ⇒ cảnh báo `TASKS_MISSING_HOURS` là **bắt buộc hiện**, không phải tùy chọn. Không impute trung bình. |
| Task `taskTypeId = null` | **Tính vào `totalHours_p`, loại khỏi `hours[p][T]`** ⇒ `Σ actualPercent < 100`, phần dư hiện thành dòng "Chưa phân loại". Lương đã thực sự chi cho việc đó — chuẩn hóa lại chỉ trên task có loại sẽ **giấu** nó đi. |
| Task `assigneeId = null` | Không quy được → loại khỏi mọi giờ, cảnh báo `TASKS_MISSING_ASSIGNEE`. |
| `Staff.title = null` | Bucket sentinel "chưa gán vị trí" — không âm thầm bỏ. |
| Ratio ≠ 100% | **KHÔNG chuẩn hóa.** Dùng đúng số nhập. `unallocatedPlannedCost = pool × (1 − sum/100)`, âm nếu vượt — hiện số âm. Cảnh báo `RATIO_SUM_NOT_100`. Form hiện tổng live, đỏ khi ≠100 **nhưng vẫn cho lưu** (bản nháp). Chuẩn hóa = giấu lỗi typo; DNA CRM này là cảnh-báo-và-hiện (margin gate, CO/CE approval). |
| Vị trí có giờ nhưng không có budget | `pool=0` ⇒ tiền 0, **nhưng vẫn hiện giờ + `deliveredCount`**, cảnh báo `NO_BUDGET` để admin thấy "vị trí này ship 14 task mà ghi 0đ". |
| `headcount = 0` | `pool=0`, cảnh báo `NO_HEADCOUNT` (gỡ bằng `headcountOverride`). |
| `percent` ngoài 0..100 | Chặn ở action (`Number.isFinite && 0..100`), cùng shape với `saveFinanceSettings`. Không clamp trong hàm thuần. |
| `deliveredCount[T] = 0` | `costPerTask = null` → hiện `"—"`, **không bao giờ `Infinity`/`NaN`**. `planned>0 && count=0` chính là tín hiệu ("ngân sách cho KV mà không ship cái nào"). |

### `positionTitle` là free-text — 3 biện pháp bắt buộc (KHÔNG thêm FK: không có bảng nào để trỏ)
1. Picker ở `/settings/creative` là `<select>` lấy từ `DISTINCT Staff.title WHERE department=CREATIVE AND isActive` — admin không gõ tay được.
2. Báo cáo cảnh báo dòng budget mồ côi (không khớp nhân sự CREATIVE active nào).
3. headcount **luôn scope `department: {code:"CREATIVE"}`** ("Senior Designer" có thể tồn tại ở phòng khác).
- Nợ kỹ thuật ghi rõ: mô hình đúng là option_set `creative_position` + `Staff.titleId`, nhưng buộc migrate `Staff` toàn app → ngoài phạm vi đợt này.

### UI
- `creative/layout.tsx` + `creative/creative-nav.tsx` — **mirror `finance/{layout,finance-nav}.tsx` verbatim** (label resolve server-side rồi truyền xuống; nav là client component không dùng `useTranslations`). 2 tab: `board` (`/creative`, seg `""`) · `cost` (`/creative/cost`). i18n `creative.nav.*` (sibling của `finance.nav`).
- `creative/cost/page.tsx` — period selector bằng `Link` + `?period=` searchParam (**copy khối team-tab của `reminders/page.tsx:49-68`**); bảng ma trận vị trí × loại task (mỗi ô: %KH vs %TT + tiền + chênh); banner cảnh báo; bảng cost/task theo loại.
- `settings/creative/*` — **mirror `settings/finance` CHỈ cho scalar cycle** (form phẳng, 1 `{error?,success?}`, validate gộp 1 `if`, 1 `t("errorInvalid")`, `revalidatePath` cả settings page lẫn mọi route tiêu thụ). Bảng lương N dòng → **mirror `settings/options/[setCode]/option-item-row.tsx`** (mỗi dòng 1 `<form action={bound}>`). Ma trận N×7 → 1 form bulk, `name={`${title}__${taskTypeId}`}`. Card ở `settings/page.tsx` — icon `Coins`/`Calculator` (`Palette` đã dùng cho `creative_task_type`).
- Chuyển cycle MONTH→QUARTER: báo cáo `2026-Q3` sẽ không thấy dòng `2026-M*`. **Hiện "chưa có ngân sách cho kỳ này" + nút "copy từ kỳ trước". KHÔNG tự quy đổi M→Q.**

---

## Thứ tự triển khai (giữ app compile ở mọi bước)
**Batch A — không đụng schema:** 1) `utils.ts` thêm `formatDecimal`, `formatPercent` delegate → 2) `page.tsx:142` dùng `formatDecimal` (A6) → 3) `creative/actions.ts` guard lock cho delete/create (A7) → 4) `page.tsx:30` JS lock filter (A7) → 5) `getCreativeDashboardStats` partition + `staleLocked` + card + i18n (A1) → 6) `projects/actions.ts` revalidate có điều kiện + re-spawn ở `addProjectOrderItem` (A2) → 7) `markFinished` +`/creative` +`/reminders`, soát `markLiquidation` (A3) → 8) i18n cleanup + `aria-label` + type `CreativeTaskStatus` (A8) — **bước duy nhất lan tỏa, chạy `tsc --noEmit` ở đây**.

**Batch B — 1 migration gộp A4+A5:** 1) schema `CreativeTask += orderItemId, deadlineReminderSentAt` + relation + index + `ProjectOrderItem.creativeTasks`; migration kèm backfill SQL ở trên → 2) spawn set `orderItemId` (A4) → 3) `markOrderItemDone` helper + `done(projectId?)` (A4) → 4) `reminders.ts`: `checkCreativeTaskDeadlineReminders` + `getCreativeOverdueTasks` + reset cờ trong `assignCreativeTask` (A5) → 5) `layout.tsx` (cả 2 `Promise.all` + `reminderCount`) + section `reminders/page.tsx` + i18n (A5).

**Batch C — Phase B:** 1) schema 2 model mới + back-relation → migration (chưa ai import → compile) → 2) `lib/creative-cost.ts` (chưa ai render → compile) → 3) `settings/creative/*` + card + i18n (**nhập liệu có trước mọi nơi tiêu thụ**) → 4) `creative-nav` + `layout` + i18n → 5) `creative/cost/page.tsx` → 6) seed budget + ratio cho 3 title × 7 loại (**bắt buộc** — không thì `dev.db` mới render trang rỗng trông như hỏng).

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx next build` — sạch. Script diff key vi/en — 0 lệch.
- **A1 (bằng chứng số):** query DB trước/sau — tạo 1 dự án FINISHED với `finishedAt` lùi 30 ngày + 1 task `ASSIGNED`; trước fix dashboard đếm nó vào "đang làm", sau fix nó rơi vào `staleLocked`, và **board + dashboard khớp nhau**.
- **A2:** `/projects/[id]/orders` → sync → dispatch Order Creative → `/creative` **thấy task ngay** (không cần reload thủ công). So sánh nhánh `/bidding` cho ra hành vi y hệt. Thêm 1 dòng vào order Creative đã gửi → task mới xuất hiện.
- **A4:** task từ timeline → DELIVERED → `/projects/[id]/orders` dòng đó chuyển `DONE` (chứng minh tín hiệu về đã đóng). Task từ checklist (orderItemId null) → không crash.
- **A5:** set `deadline` quá hạn → layout render → đúng 1 notification, chạy lại **không** sinh thêm (idempotent); dời deadline → được nhắc lại; bell badge +1; `/reminders` có section mới.
- **B:** `/settings/creative` nhập lương 3 vị trí + ma trận; `/creative/cost` hiện ma trận KH vs TT + chênh. **Test đủ edge case**: xóa 1 ratio (`NO_RATIOS`), task `hoursSpent` null (`TASKS_MISSING_HOURS` + cost/task hụt), task không loại (dòng "Chưa phân loại"), ratio tổng 90% (`unallocated` dương) và 110% (âm), vị trí không budget (`NO_BUDGET`, vẫn hiện giờ), kỳ không có task (`costPerTask = "—"`, không NaN). Đổi cycle → hiện "chưa có ngân sách" + copy kỳ trước.
- Browser E2E cả vi/en, desktop 1280 + mobile 375.

## Hạn chế đã biết (nêu rõ, không giấu)
- **"Thực tế" là PHÂN BỔ theo giờ, không phải tiền đã chi.** Chênh lệch cấp vị trí ≈ 0 do cấu trúc — chỉ đọc ở cấp ô (vị trí × loại) và cột loại task.
- `positionTitle` free-text; đổi title → budget mồ côi → cảnh báo (không tự sửa). Nợ: option_set `creative_position` + `Staff.titleId`.
- Nhân sự đổi vị trí giữa kỳ: quy theo title **hiện tại** (`Staff.title` không có lịch sử). Không xây title history.
- Không RBAC thật (act-as demo) → lương theo vị trí ai cũng xem được; đó là lý do KHÔNG lưu lương cá nhân.
- `taskPhase("FINISHED")="WORKING"` ⇒ sau fix A1, "WORKING" = (FINISHED còn trong grace) ∪ (đang thực thi thật). Chấp nhận được, nhưng đừng đọc thành "đang sản xuất".

### File trọng yếu (batch này)
[src/lib/creative.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\creative.ts) · `src/lib/creative-cost.ts` (mới) · [src/lib/reminders.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\reminders.ts) · [src/lib/utils.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\utils.ts) · [prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · [creative/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\creative\actions.ts) · [creative/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\creative\page.tsx) · [creative/task-board.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\creative\task-board.tsx) · `src/app/(app)/creative/{layout,creative-nav,cost/page}.tsx` (mới) · `src/app/(app)/settings/creative/**` (mới) · [projects/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\actions.ts) · [bidding/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\actions.ts) · [layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\layout.tsx) · [reminders/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\reminders\page.tsx) · messages/vi.json · messages/en.json. (Mirror: [finance-nav.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\finance\finance-nav.tsx), [settings/finance](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\finance), [settings/options/[setCode]](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\options).)

---

# BATCH: Module ⑧ Inventory (Kho) — hub HCM + sub-hub · CSV import · chuyển kho 2 bước · xuất/trả event · bộ tách phần · mobile-first

## Context
Module ⑧ Kho cho agency BTL: kho tổng HCM + kho phụ linh động (admin thêm trong Settings), danh mục import CSV ban đầu, **chỉ theo dõi SỐ LƯỢNG (không theo dõi giá trị — bỏ nối Thực Chi ④ so với blueprint cũ)**, chuyển qua lại giữa các kho, xuất đồ cho team OPE/PRO đi event (gắn dự án, đồ tái sử dụng phải trả về), UI ưu tiên điện thoại vì nhân viên hiện trường dùng mobile. Nav ⑧ `/inventory` + `nav.inventory` đã đặt chỗ sẵn (`status:"soon"` → active); data layer hoàn toàn greenfield (không có model kho nào).

### Quyết định đã chốt với chủ dự án (AskUserQuestion)
1. **Bộ tách phần: quản ở cấp TỪNG PHẦN.** Món cha khai "số phần tách" (2–4) → hệ thống tự sinh mã con `CODE-1`/`CODE-2`/… Tồn kho/chuyển/xuất đều thao tác trên phần; báo cáo hiện "số bộ đủ" = min(tồn các phần).
2. **2 loại giao dịch riêng:** CHUYỂN KHO (đổi vị trí vĩnh viễn) vs XUẤT CHO EVENT (gắn dự án; đồ tái sử dụng phải TRẢ VỀ + nhắc quá hạn; đồ dùng một lần trừ tồn luôn).
3. **Chuyển kho 2 bước gửi/nhận:** bên gửi tạo phiếu (PENDING, trừ kho nguồn ngay) → bên nhận "Đã nhận" (ghi số thực nhận ≤ số gửi; chênh lệch hiện vĩnh viễn trên phiếu, không auto-normalize).
4. **CSV: tôi định nghĩa format chuẩn** + nút tải file CSV mẫu ngay trên trang import.

### Ruling thiết kế (từ Plan agent — đã đồng thuận)
- **Số lượng = `Int`** (không Float): hàng event đếm được; Int giữ guard `>= qty` và phép `min()` bộ đủ chính xác tuyệt đối.
- **Stockable ⇔ `partCount === 1`** (1 quy tắc duy nhất, không thêm boolean thứ 2 để khỏi lệch): cha bộ (`partCount` 2–4) KHÔNG mang tồn kho, chỉ là "mặt danh mục" (tên/nhóm/ĐVT/tái-sử-dụng — sửa cha lan xuống phần con). `partCount` BẤT BIẾN sau khi tạo (muốn đổi cấu trúc: vô hiệu bộ cũ, tạo bộ mới).
- **Ledger bất biến + bảng số dư derived:** `StockDocument`(+lines) là sổ cái append-only; `StockBalance` (kho×item) và `ProjectHolding` (dự án×item, đồ tái sử dụng đang ở hiện trường) cập nhật CÙNG transaction. KHÔNG edit/xóa phiếu COMPLETED — sửa sai bằng phiếu ĐIỀU CHỈNH bù (ghi note tham chiếu mã phiếu). CANCELED chỉ cho TRANSFER đang PENDING (hoàn tồn kho nguồn).
- **Guard chống âm kho DUY NHẤT đúng dưới concurrency:** `tx.stockBalance.updateMany({where:{warehouseId,itemId,quantity:{gte:qty}},data:{decrement}})` — count 0 ⇒ throw ⇒ rollback. TUYỆT ĐỐI không read-then-write. Tương tự cho `ProjectHolding` khi trả đồ.
- **TRANSFER trừ nguồn lúc GỬI** (hàng đã rời kho thật — nếu chỉ trừ lúc nhận thì kho nguồn xuất trùng được). Hàng "đang vận chuyển" = computed từ phiếu PENDING, hiện riêng. Nhận: `receivedQuantity ≤ quantity` từng dòng (thừa hàng → phiếu ADJUST riêng, không over-receive). ISSUE/RETURN 1 bước (COMPLETED ngay) — chỉ TRANSFER 2 bước theo yêu cầu.
- **Mã phiếu:** `{NK|DC|CK|XE|TH}-{YYMM}-{seq3}` — count theo tháng + retry P2002 (max 3) vì count-based có race; `code @unique` là backstop.
- **CSV parser tự viết** (~40 dòng thuần trong `src/lib/inventory-csv.ts`): BOM, CRLF, quote, **sniff delimiter `,`/`;`** (Excel VN hay xuất `;`). Không thêm dep (papaparse) cho 1 màn hình; exceljs CSV path là stream-based, vụng với Buffer. Import all-or-nothing: 1 dòng lỗi → trả bảng lỗi kèm số dòng, không import gì.
- **CSV mẫu qua route handler** (`items/sample-csv/route.ts`) sinh từ CHÍNH hằng cột parser dùng (1 nguồn sự thật) + BOM UTF-8 + `Content-Disposition: attachment` — không để file tĩnh trong `public/`.
- **KHÔNG tích hợp vào workspace dự án** (chủ dự án đã chốt giữ tập trung): `/inventory/documents?project=` lọc theo dự án; mục "Đồ đang ở hiện trường" trên trang tồn kho.

## A) Data model (Prisma — migration `inventory_module`, KHÔNG reset DB, chỉ thêm bảng mới)
6 model mới (đầy đủ định nghĩa như Plan agent đã chốt, tóm tắt):
- **`Warehouse`** (`@@map("warehouse")`): `code @unique, name, location?, isMain @default(false)` (chỉ 1 kho isMain — enforce app layer), `isActive, note?`, timestamps.
- **`InventoryItem`** (`@@map("inventory_item")`): `code @unique, name, categoryId?` (FK OptionItem `inventory_category`, SetNull), `unit?` (free text), `isReusable @default(true)`, `partCount Int @default(1)` (2–4 = bộ cha, không stockable), `parentItemId?` (self-relation "InventoryItemParts", **Cascade**), `partNo?`, `isActive, note?`. Index `[parentItemId]`, `[categoryId]`.
- **`StockDocument`** (`@@map("stock_document")`): `code @unique, type` (IMPORT|ADJUST|TRANSFER|ISSUE|RETURN), `status @default("COMPLETED")` (PENDING chỉ TRANSFER | COMPLETED | CANCELED), `fromWarehouseId?, toWarehouseId?, projectId?` (bắt buộc ISSUE/RETURN, SetNull), `expectedReturnAt?` (ISSUE có dòng tái sử dụng), `returnReminderSentAt?` (idempotent, reset khi đổi hạn), `note?, createdById?, confirmedById?/At?, canceledById?/At?`. Index `[type,status]`, `[projectId]`, `[status,expectedReturnAt]`. Kho theo type: IMPORT/ADJUST/RETURN→to; ISSUE→from; TRANSFER→cả hai.
- **`StockDocumentLine`** (`@@map("stock_document_line")`): `documentId` (Cascade), `itemId, quantity Int` (>0; riêng ADJUST cho phép âm, khác 0), `receivedQuantity Int?` (TRANSFER thực nhận), `note?, sort`. `@@unique([documentId, itemId])`.
- **`StockBalance`** (`@@map("stock_balance")`): `warehouseId, itemId, quantity Int @default(0)`, `@@unique([warehouseId,itemId])`.
- **`ProjectHolding`** (`@@map("project_holding")`): `projectId` (Cascade), `itemId, quantity`, `@@unique([projectId,itemId])` — đồ tái sử dụng đang ở hiện trường = Σ ISSUE − Σ RETURN.
- Back-relations: `OptionItem.inventoryItemsAsCategory`, `Project.stockDocuments/inventoryHoldings`, `Staff` ×3 (created/confirmed/canceled). `Notification.type` comment += `INVENTORY_TRANSFER_INCOMING | INVENTORY_RETURN_OVERDUE`.

## B) Seed
- `seedOptionSet("inventory_category", ...)`: BOOTH (Booth/Quầy kệ), POSM, SOUND_LIGHT (Âm thanh ánh sáng), UNIFORM (Đồng phục/PG kit), TOOL (Dụng cụ thi công), CONSUMABLE (Vật tư tiêu hao).
- Upsert kho tổng `{code:"HCM", name:"Kho tổng HCM", isMain:true}` + 1 kho phụ mẫu (`DN` Đà Nẵng) để demo chuyển kho.
- Vài `InventoryItem` mẫu (1 tiêu hao, 1 tái sử dụng, 1 bộ 3 phần) + phiếu IMPORT khởi tạo tồn + 1 TRANSFER PENDING + 1 ISSUE quá hạn trả (demo reminder).

## C) Lib
- **`src/lib/inventory.ts`**: hằng `DOC_TYPES/DOC_CODE_PREFIX/DOC_STATUS`; thuần `buildDocCode`, `partItemCode`, `isStockable`, `completeSets(partQtys)=min`; helper transaction `debitBalance/creditBalance/debitHolding/creditHolding` (nhận `tx`, guard bằng conditional updateMany như trên), `nextDocCode(tx,type,now)`; IO reads `getStockOverview({warehouseId?,categoryId?,q?})` (nhóm phần con dưới cha + số bộ đủ), `getProjectHoldings(projectId?)`, `getPendingTransfers()`, `getInTransitQuantities()`.
- **`src/lib/inventory-csv.ts`** (thuần, không IO): `INVENTORY_CSV_COLUMNS` = `Mã | Tên | Nhóm hàng | ĐVT | Tái sử dụng (Y/N) | Số phần tách | Kho | Số lượng | Ghi chú`; `parseCsv(text)`; `parseInventoryCsv(buffer) -> {rows, errors[{line,message}]}` (validate header, qty nguyên ≥0, partCount ∈ {"",1..4}, Y/N, mã trùng trong file, mã đã tồn tại DB check ở action); **dòng bộ (`Số phần tách`≥2): `Số lượng` = số BỘ đủ → credit số đó cho TỪNG phần con**; `buildSampleCsv()` (3 dòng ví dụ đủ 3 kiểu).
- **`src/lib/reminders.ts`** (mở rộng file hiện có): `getInventoryReturnReminders()` (ISSUE COMPLETED, `expectedReturnAt < now`, dự án còn holding > 0) + `checkInventoryReturnReminders()` (mirror pattern `check*` hiện có: WHERE thêm `returnReminderSentAt: null`, notify createdBy + staff OPE/PRO active, type `INVENTORY_RETURN_OVERDUE`, stamp cờ; reset cờ trong action `updateExpectedReturn`). Wire cả 2 vào `layout.tsx` (2 `Promise.all`) + section mới `/reminders`.

## D) Actions
- **`settings/warehouses/actions.ts`**: create/update (P2002 → lỗi thân thiện; tick isMain → transaction clear isMain kho khác); chặn vô hiệu khi còn tồn > 0 hoặc đang trên TRANSFER PENDING.
- **`inventory/items/actions.ts`**: `createItem` ($transaction tạo cha + sinh phần con mã `-1..-N`); `updateItem` (lan category/isReusable xuống phần; TỪ CHỐI đổi partCount; từ chối lật isReusable khi còn holding; từ chối deactivate khi còn tồn/holding); `importItemsCsv` (mirror `importCtvExcel`: File check, cap 1MB/500 dòng, Buffer, parse, mã đã tồn tại → reject dòng, $transaction tạo item+phần + 1 phiếu IMPORT COMPLETED/kho + credit tồn; lưu file gốc qua `saveChatAttachment`).
- **`inventory/documents/actions.ts`**: validate dòng chung (item active + stockable + qty nguyên dương + không trùng item) rồi: `createImportDoc`/`createAdjustDoc` (COMPLETED ngay; ADJUST cho âm, debit guard); `createTransferDoc` (from≠to, PENDING + debit nguồn + notify OPE/PRO `INVENTORY_TRANSFER_INCOMING`); `confirmTransferReceive` (guard idempotent `updateMany({where:{id,status:"PENDING"}})` — count 0 → "đã xử lý"; `0 ≤ receivedQuantity ≤ quantity` từng dòng; credit đích theo thực nhận); `cancelTransfer` (PENDING→CANCELED + hoàn nguồn); `createIssueDoc` (projectId bắt buộc ∈ `EXECUTION_STATUS_CODES`; `expectedReturnAt` bắt buộc nếu có dòng tái sử dụng; debit nguồn; credit holding cho dòng tái sử dụng); `createReturnDoc` (chọn dự án → prefill outstanding; `0 < qty ≤ holding` guard; credit kho đích bất kỳ; trả thiếu + note = chênh lệch hiện, không auto-normalize); `updateExpectedReturn` (field duy nhất sửa được sau COMPLETED trên ISSUE; reset cờ nhắc). Tất cả: audit() local + revalidatePath, **notification fan-out SAU commit** (SQLite single-writer — giữ transaction ngắn).

## E) Routes/UI (mobile-first, 375px là target chính)
```
src/app/(app)/inventory/
  layout.tsx + inventory-nav.tsx     // mirror finance-nav: tabs stock(seg:"") · documents · items
  page.tsx                           // Tồn kho: filter kho/nhóm/search; mobile card sm:hidden / desktop table;
                                     //   bộ hiện "X bộ đủ" + bung dòng phần; mục "Đồ đang ở hiện trường" (theo dự án);
                                     //   mobile: lưới 2×2 nút to h-12 → Chuyển kho / Xuất event / Trả về / Nhận hàng (badge số phiếu chờ)
  documents/page.tsx + actions.ts    // list + filter type/status/?project=; TRANSFER PENDING ghim đầu trang
  documents/new/{transfer,issue,return,import,adjust}/page.tsx  // 1 trang / 1 flow
  documents/doc-line-editor.tsx      // client dùng chung: KHÔNG bảng to trên mobile — flow thêm-từng-dòng:
  documents/item-picker.tsx          //   "+ Thêm hàng" → bottom-sheet search (h-11, hiện tồn live tại kho nguồn)
                                     //   → stepper số lượng (−/+ h-11 w-11, inputMode="numeric") → dòng = card gỡ được
                                     //   submit = thanh sticky bottom (h-12 w-full)
  documents/[id]/page.tsx + receive-form.tsx  // chi tiết + badge chênh lệch; form nhận từng dòng prefill = số gửi
  items/page.tsx + actions.ts + item-form.tsx + import-form.tsx  // danh mục + CSV import (bảng lỗi kèm số dòng)
  items/sample-csv/route.ts          // GET → BOM + buildSampleCsv(), text/csv attachment
src/app/(app)/settings/warehouses/   // mirror costsheet-templates: page + actions + warehouse-form
```
- `nav-items.ts:37` `soon`→`active`. Settings: 2 tile mới (`/settings/warehouses` icon Warehouse; `/settings/options/inventory_category` icon Boxes) + titleMap.
- Select kho/dự án dùng `<select>` native `h-11` (picker native tốt hơn dropdown custom trên phone).

## F) i18n
Namespace `inventory` (nav/stock/documents/items/holdings — nhãn type & status phiếu, chênh lệch, đang vận chuyển, lỗi import `{line}`, số bộ đủ…) + `settings.warehouses` + `settings.index.warehousesTitle/Desc + inventoryCategoryTitle/Desc` + section reminders. Title notification hardcode tiếng Việt (tiền lệ finance). Parity vi/en 0 lệch.

## Thứ tự triển khai (mỗi bước compile được)
1. Schema + migration + seed → 2. `inventory-csv.ts` + phần thuần `inventory.ts` → 3. Settings warehouses + option set + tiles + i18n → 4. Nav active + layout/nav + trang Tồn kho → 5. Danh mục items (CRUD + sinh phần) → 6. CSV import + sample route → 7. Phiếu: IMPORT/ADJUST trước → TRANSFER (+confirm/cancel) → ISSUE/RETURN (+holding) → 8. Reminders + notifications + bell → 9. Polish (bộ đủ, badge chênh lệch, quick actions mobile) → 10. Verify.

## Verification
- `npx tsc --noEmit` · `npx eslint src` · `npx next build` — sạch; parity vi/en 0 lệch; migrate + seed re-run idempotent.
- Browser E2E (dev + Claude Browser, vi/en, desktop 1280 + **mobile 375**):
  1. Settings: tạo "Kho Đà Nẵng"; thử vô hiệu kho HCM còn tồn → bị chặn.
  2. Items: tạo bộ 3 phần `BOOTH01` → tự sinh BOOTH01-1..3; edit không đổi được partCount.
  3. CSV: tải file mẫu → upload lại → item + phiếu NK sinh đúng; file có mã trùng + qty sai → bảng lỗi theo dòng, không import gì.
  4. Tồn kho: bộ hiện "X bộ đủ" = min tồn các phần theo kho.
  5. Chuyển 5 cái HCM→ĐN: nguồn trừ ngay, "đang vận chuyển" = 5; nhận 4 → ĐN +4, phiếu hiện chênh 1 vĩnh viễn; hủy 1 phiếu PENDING khác → hoàn nguồn; double-submit nhận (2 tab) → tab 2 báo "đã xử lý".
  6. Xuất event (dự án executing, 1 dòng tái sử dụng + 1 tiêu hao, hạn trả hôm qua): tiêu hao mất luôn, tái sử dụng vào "đang ở hiện trường"; reload layout → đúng 1 notification (idempotent); trả một phần vào ĐN → holding giảm, ĐN tăng; trả quá số đang giữ → chặn.
  7. Âm kho: xuất quá tồn → lỗi theo item, không ghi một phần (tồn nguyên vẹn).
  8. Mobile 375: flow xuất event trọn vẹn qua bottom-sheet picker + stepper + sticky submit; hamburger hiện "Kho hàng" active.

## Hạn chế đã biết / để mở
- Không RBAC thật (act-as demo) — ai cũng thao tác được mọi kho; v2: field "thủ kho" trên Warehouse để định tuyến notification chính xác (hiện fan-out OPE/PRO).
- Không theo dõi giá trị/khấu hao (đúng yêu cầu). Không barcode/QR (chưa có hạ tầng — để mở v2, schema `code` đã sẵn để in mã).
- Mất/hỏng khi trả: v1 xử bằng trả thiếu + note rồi phiếu ADJUST bù (hint trên UI); v2 có thể thêm cờ `isWriteOff` per-line.
- `partCount` bất biến; đổi cấu trúc bộ = vô hiệu bộ cũ + tạo bộ mới.

### File trọng yếu (batch này)
[prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · `src/lib/inventory.ts` + `src/lib/inventory-csv.ts` (mới) · [src/lib/reminders.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\reminders.ts) · `src/app/(app)/inventory/**` (mới) · `src/app/(app)/settings/warehouses/**` (mới) · [nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts) · [layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\layout.tsx) · [reminders/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\reminders\page.tsx) · messages/vi.json · messages/en.json. (Mirror: [finance-nav.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\finance\finance-nav.tsx), [settings/costsheet-templates](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\costsheet-templates), [operations/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\operations\actions.ts) cho import file, [bidding/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\page.tsx) cho dual-render mobile.)

---

# BATCH: AUDIT TOÀN DIỆN — 12 fix (3 MED, 9 LOW), KHÔNG đổi cấu trúc

## Context
Chủ dự án yêu cầu audit toàn bộ CRM đã build, đối chiếu flow với mô tả đã chốt, tìm lỗi và lên kế hoạch fix — không được thay đổi cấu trúc, mọi thay đổi hành vi phải duyệt trước. 3 Explore agents đã quét chéo toàn bộ module. **Kết quả tổng thể: cấu trúc đúng như đã chốt** — các bất biến lớn đều xác nhận đúng bằng code: ledger kho (guard chống âm conditional-updateMany duy nhất, append-only, transfer 2 bước idempotent), engine phép năm (prorate + carry-over 31/3 dùng trước), CO/CE (coTotal server-side, chi hộ ngoài margin, make-up loại % + proxy, revision trong transaction), state machine FR-04, lock cascade Creative, sync Timeline→ORDER idempotent giữ chỉnh sửa tay, guest portal (hash token, enforce server-side), tạm ứng (remaining + quota chéo dự án), chat guards, i18n parity 1823/1823, sticky headers (25 bảng đúng pattern trừ 3 chỗ dưới đây), sidebar resize không hydration mismatch.

Tìm thấy 12 lỗi thật (bằng chứng file:line từ audit). Đã duyệt với chủ dự án 1 quyết định hành vi: **bell đếm kép → sửa theo hướng "đếm qua notification"** (bỏ 3 danh sách computed khỏi reminderCount; trang /reminders giữ nguyên).

## Fixes (theo severity)

### MED
1. **Planning: 2 action review không guard khóa dự án CANCELED/FAILED** — `projects/[id]/planning/actions.ts`: `confirmFinalProposal` (:174) và `requestProposalRevision` (:142) chỉ check `version.status === "IN_REVIEW"`, không gọi `isPlanningJobLocked` (các action khác đều guard qua `loadUnlockedJob`). Fix: include `project.status` trong query + guard `isPlanningJobLocked(project.status.code, job.finalConfirmedAt)` đầu cả 2 action — mirror `loadUnlockedJob`.
2. **Bell đếm kép 3 nguồn** — `(app)/layout.tsx:51-52`: bỏ `acceptanceItems.length + creativeItems.length + inventoryItems.length` khỏi `reminderCount` (3 nguồn này đã có notification bền vững từ check* được đếm trong `unreadNotifications`). Vẫn giữ query get* cho trang /reminders — chỉ đổi công thức đếm. Các nguồn thuần computed (care/bidding/pendingApprovals/timeline/AR) giữ nguyên trong count.
3. **Seed ghi đè roleId chỉnh tay** — `prisma/seed.ts:1725`: vòng `staffRoleAssignments` update vô điều kiện → re-seed revert chỉnh sửa của admin ở /settings/roles. Fix: chỉ gán khi `roleId === null` (`updateMany({where:{id, roleId:null}})`) — seed chỉ điền chỗ trống, không ghi đè.

### LOW
4. **Planning tự-notify** — `planning/actions.ts`: khi Manager tự giao cho chính mình / tự làm, các notify (STAGE_ASSIGNED, RESULT_SUBMITTED) gửi cho chính người thao tác. Fix: skip notify khi `recipientId === currentStaffId`.
5. **submitProposalVersion race unique versionNo** — `@@unique([jobId, versionNo])` có thể ném P2002 không bắt khi double-submit. Fix: bọc create trong try/catch P2002 → return im lặng (coi như duplicate submit).
6. **moveToProcessing không kiểm trạng thái nguồn** — `bidding/actions.ts:651`: gọi được trên dự án FAILED/CANCELED nếu có chứng từ. Fix: guard `["BIDDING","PENDING"].includes(project.status.code)` mới cho chuyển.
7. **CostSheetRevision thiếu unique DB** — schema: `@@index([costSheetId, revNo])` → thêm `@@unique([costSheetId, revNo])` (migration additive; dữ liệu hiện tại đã unique do transaction tuần tự).
8. **Sticky vô tác dụng ở timeline-editor** — `projects/[id]/timeline-editor.tsx:147,185`: wrapper grid chỉ có `overflow-x-auto`, HeaderCell `sticky top-0` không kích hoạt. Fix: thêm `overflow-y-auto max-h-[70vh]` vào wrapper (cùng pattern 25 bảng khác).
9. **Sticky vô tác dụng ở costsheet-templates** — `settings/costsheet-templates/page.tsx:33`: wrapper thiếu `max-h/overflow-y` (file này lệch pattern do sed không khớp chuỗi lồng wrapper). Fix cùng cách.
10. **Sticky top-bleed ở cashflow** — `finance/cashflow/page.tsx:48`: scroll container có `p-4` → header dính dưới padding, lộ dải 16px. Fix: chuyển overflow+max-h vào inner div không padding (section giữ p-4).
11. **Comment Notification.type thiếu** — schema:279 thêm `CREATIVE_TASK_DEADLINE_REMINDER` (doc-only).
12. **importItemsCsv không retry P2002 khi sinh mã phiếu NK** — `inventory/items/actions.ts:209`: đường import thiếu wrapper retry mà `documents/actions.ts createDocWithRetry` có. Fix: bọc `$transaction` trong retry P2002 (max 3) mirror `createDocWithRetry`.

## KHÔNG sửa (báo cáo, ngoài phạm vi fix)
- RBAC vẫn danh nghĩa (chưa auth thật) — đúng quy ước toàn app đã chốt.
- Race check* reminders lý thuyết (parallel layout renders) — pre-existing, đã báo trước đây, chấp nhận.

## Thứ tự & Verification
1. Fix #7 (schema + `prisma migrate dev --name costsheet_revision_unique`, KHÔNG reset DB) → 2. Fixes code #1–#6, #8–#12 → 3. Fix #3 seed + chạy lại seed xác nhận không revert role đã đổi tay.
- `npx tsc --noEmit` + `npx eslint src` + `npx next build` sạch; parity vi/en không đổi (không thêm key i18n).
- E2E chọn lọc: (a) đánh dấu 1 dự án FAILED có Planning version IN_REVIEW → gọi confirm/revision bị chặn; (b) bell: so số chuông trước/sau = giảm đúng phần đếm kép, /reminders vẫn hiện đủ section; (c) đổi role 1 staff tay → re-seed → role giữ nguyên; (d) timeline editor + costsheet-templates + cashflow: header dính đúng khi cuộn trong khung (javascript_tool đo getBoundingClientRect như lần trước).

### File trọng yếu
`src/app/(app)/projects/[id]/planning/actions.ts` · `src/app/(app)/layout.tsx` · `prisma/seed.ts` · `prisma/schema.prisma` · `src/app/(app)/bidding/actions.ts` · `src/app/(app)/projects/[id]/timeline-editor.tsx` · `src/app/(app)/settings/costsheet-templates/page.tsx` · `src/app/(app)/finance/cashflow/page.tsx` · `src/app/(app)/inventory/items/actions.ts`

---

# BATCH: Module ⑤ Nhân sự — Chấm công & Ca làm việc (lịch tuần theo bộ phận · confirm+notify · phép năm 12 ngày carry-over 31/3 · HR xuất Excel)

## Context
Module chấm công + ca làm việc tại nav ⑤ `/staff` (đang "soon"). Khung chuẩn: **40h/tuần = 2 ca × 4h/ngày, T2–T6**; cho xếp bù T7/CN bằng cách đổi ca ngày thường (miễn đủ tổng giờ tuần); **làm tối/cuối tuần KHÔNG tính tăng ca**; tháng công = ngày đầu → ngày cuối tháng dương lịch (mục tiêu tính lương); trưởng bộ phận xếp lịch tuần cho NV trong bộ phận mình rồi **confirm → mỗi NV nhận notification in-app**; HR xuất Excel chấm công đầy đủ mọi lúc.

### Quyết định đã chốt (AskUserQuestion)
1. **Danh mục ca cố định trong Settings** — admin định nghĩa khung ca 4h (Sáng/Chiều/Tối...), trưởng bộ phận chỉ chọn ca gắn vào ngày.
2. **Lịch confirm = công, đánh dấu ngoại lệ** (không check-in/out). **KÈM engine phép năm**: 12 ngày/năm tiêu chuẩn, ngày chưa dùng gia hạn đến **31/3 năm sau** (quá là mất); theo dõi nghỉ ốm, nghỉ không lương, và nghỉ khác (kèm lý do).
3. **Tuần đã confirm sửa được** → re-confirm → NV nhận notification MỚI về lịch thay đổi.
4. **Loại nghỉ = option_set mở** (`leave_type`), seed: ANNUAL (phép năm)/SICK (ốm)/UNPAID (không lương)/ABSENT (vắng không phép)/OTHER (khác — bắt buộc note).

### Ràng buộc nền (Explore đã xác minh)
- Department/Team **chưa có field lead** — thêm `Department.leadStaffId` + seed lead theo staff sẵn có. Không RBAC thật (act-as) → gate danh nghĩa, nhất quán toàn app.
- exceljs 4.4 mới chỉ READ — **WRITE xlsx là greenfield**: `new ExcelJS.Workbook()` → `xlsx.writeBuffer()`, serve qua route handler mirror [api/ctv/[id]/route.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\api\ctv\[id]\route.ts) (runtime nodejs, contentDisposition RFC 6266).
- Chưa có helper tuần/lưới lịch nào — tự viết `src/lib/timekeeping.ts` (week-start Monday local, thuần).
- Chưa có field time-of-day nào — lưu `String "HH:mm"` (hợp style no-timezone của app).

## A) Data model (migration `timekeeping_module`, KHÔNG reset DB)
- **`Department.leadStaffId String?`** + relation `lead Staff? @relation("DepartmentLead")` + back-rel `Staff.departmentsLed`.
- **`WorkShift`** (`@@map("work_shift")`): `code @unique, name, startTime "HH:mm", endTime "HH:mm", hours Float` (nhập, mặc định 4), `sort, isActive`, timestamps. Settings CRUD mirror warehouses.
- **`ScheduleWeek`** (`@@map("schedule_week")`): `departmentId FK, weekStart DateTime` (Thứ 2 00:00 local), `status @default("DRAFT")` (DRAFT|CONFIRMED), `confirmedById?/At?`, timestamps. `@@unique([departmentId, weekStart])`.
- **`ShiftAssignment`** (`@@map("shift_assignment")`): `weekId FK (Cascade), staffId FK, date DateTime` (00:00 local, nằm trong tuần), `shiftId FK WorkShift`, `leaveTypeId String?` (FK OptionItem `leave_type`, SetNull — **null = làm bình thường**; set = ca này nghỉ theo loại), `note?` (bắt buộc app-side khi OTHER), timestamps. `@@unique([staffId, date, shiftId])`, index `[weekId]`, `[staffId, date]`.
  - Giờ công thực = leaveType null ? shift.hours : 0. **Phép năm đếm theo ca: 1 ca 4h = 0.5 ngày phép.**
- `Notification.type` += `SCHEDULE_CONFIRMED | SCHEDULE_UPDATED`.
- Settings scalar module `"timekeeping"`: `standard_week_hours` (40), `annual_leave_days` (12), `carryover_deadline` ("03-31").

## B) Lib `src/lib/timekeeping.ts` (thuần + IO)
- Thuần: `weekStartOf(date)` (Monday 00:00 local), `addDays`, `weekDays(weekStart) -> Date[7]`, `fmtWeekRange`, `monthRange(ym)`, `shiftHours(assignment)`.
- **`computeLeaveBalance(staffId, year, opts)`** — thuần trên data đã nạp: entitlement = `annual_leave_days` **prorate theo tháng** từ `firstWorkDate` (chuẩn luật VN 1 ngày/tháng); carry-over = phần chưa dùng năm trước, chỉ còn giá trị đến 31/3 (`carryover_deadline`); used = Σ ca ANNUAL × 0.5 ngày; trả `{entitlement, carriedOver, carryoverValidUntil, used, remaining}`. Quy tắc trừ: **dùng carry-over trước** (hết hạn sớm hơn), rồi tới quota năm hiện tại.
- IO: `getWeekSchedule(departmentId, weekStart)` (week + assignments + staff của dept), `getMonthlyTimesheet(ym)` (mọi staff active × ngày trong tháng → giờ công + loại nghỉ, cho cả trang Chấm công lẫn Excel), `getMyWeek(staffId, weekStart)`.

## C) Actions `src/app/(app)/staff/actions.ts`
- `toggleAssignment(departmentId, weekStartISO, staffId, dateISO, shiftId)` — chưa có → tạo (upsert ScheduleWeek DRAFT nếu chưa có); có → xóa. Guard: staff thuộc dept, date trong tuần, shift active.
- `setAssignmentLeave(assignmentId, prev, formData)` — set/clear `leaveTypeId` + `note` (OTHER bắt buộc note).
- `confirmWeek(weekId)` — set CONFIRMED + confirmedBy/At; notify **từng NV có ≥1 ca trong tuần**: type = lần đầu `SCHEDULE_CONFIRMED` / đã confirm trước đó `SCHEDULE_UPDATED`, title kèm khoảng tuần, body tóm tắt số ca. Sửa tuần đã CONFIRMED: cho phép (toggle vẫn chạy) — UI hiện badge "đã sửa sau confirm, cần confirm lại".
- Excel export qua route handler (không phải action): **`src/app/api/timekeeping/export/route.ts`** `GET ?month=YYYY-MM` — ExcelJS write: sheet "Chấm công {MM-YYYY}": cột Mã NV | Họ tên | Bộ phận | Team | ngày 1..31 (mỗi ô = giờ công hoặc mã nghỉ P/Ô/KL/V/K) | Tổng giờ KH | Tổng giờ thực | Ngày phép | Ngày ốm | Ngày KL | Vắng | Ghi chú. Header đậm, freeze 4 cột đầu, cột T7/CN tô nền nhạt. contentDisposition mirror ctv route.

## D) UI — `/staff` (nav ⑤ soon→active) + sub-nav 3 tab (mirror finance-nav)
1. **`/staff` (Lịch làm việc, seg "")**: chọn Bộ phận (default = dept mình lead, fallback dept mình) + điều hướng tuần ←→; **lưới tuần**: hàng = NV bộ phận, cột = T2..CN (T7/CN nền nhạt), mỗi ô = chip các ca (bấm toggle; chip ca có nghỉ hiện màu theo loại + click mở form đổi loại nghỉ/note); cột cuối = **Σ giờ tuần/NV** badge (xanh = đủ `standard_week_hours`, vàng ≠); nút **Confirm tuần** + trạng thái/confirmedBy/At + cảnh báo "đã sửa sau confirm". Mobile: **"Lịch của tôi"** — card list ca tuần này/tuần sau của staff đang act-as (`sm:hidden`), lưới đầy đủ cuộn ngang.
2. **`/staff/timesheet` (Chấm công)**: chọn tháng ←→; bảng mọi staff: tổng giờ KH/thực, ngày phép/ốm/KL/vắng trong tháng; nút **Xuất Excel** (link route export). 
3. **`/staff/leave` (Phép năm)**: bảng mọi staff: quota (prorate), carry-over (+hạn 31/3), đã dùng, còn lại — từ `computeLeaveBalance`.
- **Settings**: `/settings/shifts` (CRUD WorkShift mirror warehouses) + tile; option_set `leave_type` tile + titleMap; `/settings/timekeeping` (3 scalar, mirror settings/finance) + tile.

## E) Seed
- `Department.leadStaffId`: gán lead sẵn có (ACCOUNT→Thảo, CREATIVE→Creative Lead, OPE/PRO/PCC/PLANNING→lead từng dept, HR→HR Lead, FIN→CFO, CEO→CEO).
- `WorkShift`: SANG 08:00–12:00, CHIEU 13:00–17:00, TOI 18:00–22:00 (4h mỗi ca).
- Option_set `leave_type`: ANNUAL/SICK/UNPAID/ABSENT/OTHER (label VI/EN).
- Settings `timekeeping.*` 3 giá trị.
- 1 tuần mẫu CONFIRMED cho dept CREATIVE (2 NV × T2–T6 × 2 ca = đủ 40h; 1 NV có 1 ca T6 đổi thành làm T7 + 1 ca ANNUAL leave) — demo đủ mọi nhánh.

## F) i18n
Namespace `staff` (nav 3 tab, lưới tuần, confirm, leave form, timesheet, leave balance) + `settings.shifts` + `settings.timekeeping` + `settings.index.*` tiles. Title notification hardcode tiếng Việt (tiền lệ). Parity vi/en 0 lệch.

## Thứ tự triển khai
1. Schema (leadStaffId + 3 model + Notification comment) → migrate → seed. 2. `lib/timekeeping.ts` (+ test thuần computeLeaveBalance bằng tsx script: prorate, carry-over hết hạn 31/3, dùng carry-over trước). 3. i18n. 4. Settings (shifts CRUD + timekeeping scalar + leave_type tile). 5. Nav active + layout/staff-nav + actions + lưới tuần + confirm/notify. 6. Timesheet tab + route export Excel. 7. Leave tab. 8. Verify.

## Verification
- tsc/eslint/build sạch; parity vi/en 0 lệch; script tsx test `computeLeaveBalance` (3 ca: đủ năm, prorate giữa năm, carry-over quá 31/3 bị mất).
- Browser E2E (vi/en, desktop 1280 + mobile 375): xếp lịch 1 NV đủ 10 ca T2–T6 → badge 40h xanh; bỏ 2 ca T6 + thêm 2 ca T7 → vẫn 40h xanh (không tăng ca); confirm → NV nhận notification; sửa 1 ca → cảnh báo → re-confirm → notification "cập nhật"; đánh dấu 1 ca ANNUAL → tab Phép năm trừ 0.5 ngày; `/staff/timesheet` số khớp; **tải Excel về mở kiểm cột** (kiểm bằng script đọc lại buffer bằng exceljs); mobile "Lịch của tôi" hiện ca của staff đang act-as.

## Hạn chế đã biết
- Không RBAC thật → "chỉ trưởng bộ phận sửa lịch dept mình" là danh nghĩa (ai cũng đổi act-as được) — nhất quán toàn app.
- Không check-in/out thực; công = lịch confirm − ngoại lệ (đúng quyết định). Không tính tăng ca (đúng yêu cầu).
- Phép năm prorate theo tháng tròn từ firstWorkDate; staff thiếu firstWorkDate → coi như đủ năm (cảnh báo trên tab Phép năm).

### File trọng yếu (batch này)
[prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · `src/lib/timekeeping.ts` (mới) · `src/app/(app)/staff/**` (mới: layout, staff-nav, page lưới tuần, timesheet/, leave/, actions.ts) · `src/app/api/timekeeping/export/route.ts` (mới) · `src/app/(app)/settings/shifts/**` + `settings/timekeeping/**` (mới) · [nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts) · [settings/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\page.tsx) · messages/vi.json · messages/en.json.

---

# BATCH: Module ⑥ KPI — Khung lương 75/25 (fix 75% + quỹ performance 25% chia theo matrix điểm)

## Context
BoD muốn chuyển từ lương cố định 100% sang khung 75/25 cho các team Account (3 team A1/A2/A3 tách biệt)/Planning/Creative/Operations/Production: giữ 75% fix, 25% còn lại gom thành **quỹ performance theo từng team/bộ phận mỗi tháng**, chia lại cho NV trong team theo **matrix chấm điểm** — dựa trên margin dự án hoàn thành trong tháng + điểm đánh giá từng NV (bộ tiêu chí xây dần, thêm được trong quá trình vận hành). Ai điểm cao nhận phần performance cao hơn.

### Quyết định BoD đã chốt (AskUserQuestion)
1. **Quỹ 25% = zero-sum, luôn chia đủ 100%** — margin KHÔNG co giãn quỹ ở phase 1. Kiến trúc vẫn build engine hệ số margin (curve floor/cap trong Settings, mặc định floor=cap=1.0 → trung hòa) để BoD bật chế độ co giãn sau này mà không đổi code. Margin mỗi pool luôn được TÍNH và HIỂN THỊ trên dashboard (transparency trước, gắn tiền sau).
2. **Tháng team không có dự án finished trong cửa sổ tính margin**: hệ số áp cho pool trống là **setting linh hoạt, admin chỉnh được từng tháng** (đúng tính mùa vụ ngành event) — `kpi.empty_window_factor`, mặc định 1.0.
3. **Margin vượt target 31%: trần 100%, chưa thưởng thêm** — cap là setting (`cap_factor=1.0`), scheme thưởng vượt để phase sau.
4. **Lead/trưởng bộ phận NẰM TRONG quỹ team mình, BoD/CEO chấm điểm** (matrix tiêu chí có `appliesTo` để tách bộ tiêu chí cấp quản lý nếu cần).

### Ràng buộc nền tảng (đã xác minh từ code — trust)
- **Margin dự án finished**: `Project.finishedAt` chỉ được set bởi `markFinished` ([bidding/actions.ts:754]); margin lấy từ `CostSheetRevision.marginPct` (bản mới nhất của sheet CTRACT) fallback `computeMarginPct(ceTotal, coTotal)` ([bidding.ts:48]) trên sheet live. **LIQUID sheet không tồn tại trong thực tế** — CTRACT (hoặc revision `sentToLiquidationRevisionId`) là nguồn margin duy nhất. Thiếu sheet → loại dự án + cảnh báo.
- **Lệch grain pool**: Account = `Team` (A1/A2/A3, `Project.ownerTeamId`); các phòng khác = `Department` (codes PLANNING/CREATIVE/OPE/PRO; PCC/FIN/HR/IT/CEO ngoài khung — hiện ghi chú "ngoài khung" trên dashboard). PoolKey = `TEAM:A1` | `DEPT:CREATIVE`.
- **Attribution margin cho pool không-Account**: `ProjectOrder.department` là tín hiệu tham gia bền nhất (unique per project×dept, sinh cả tay lẫn tự động từ Timeline); `ProjectMember` điền thưa không dùng làm nguồn chính. Dept D nhận margin của các dự án finished có ≥1 ProjectOrder dept D (không-draft).
- **Lương theo VỊ TRÍ, không theo cá nhân** — ràng buộc no-RBAC (act-as demo, ai cũng xem được mọi thứ) giống hệt quyết định đã chốt ở Creative cost. Mirror `CreativeSalaryBudget`.
- **Tiền lệ mirror trực tiếp**: period engine + pure-compute-with-warnings ([creative-cost.ts]: parsePeriodCode/currentPeriodCode/shiftPeriodCode, discriminated-union warnings); matrix bulk-form `ratio_<i>_<key>` + transaction upsert ([settings/creative/ratio-matrix-form.tsx] + [actions.ts saveRatioMatrix]); attendance từ `getMonthlyTimesheet(ym)` ([timekeeping.ts:185], chỉ tuần CONFIRMED); Excel export ([api/timekeeping/export/route.ts]); nav placeholder `/kpi` đã có ([nav-items.ts:40], `nav.kpi` i18n sẵn).

## Thiết kế nghiệp vụ (phương án chốt)

### Công thức
- Mỗi pool P (tháng M): `base_P = Σ (lương full theo vị trí của NV active trong P) × pool_percent (25%)`.
- `teamFactor_P = curve(marginWeighted_P)` — piecewise linear: ≤ `floor_margin_pct` (15) → `floor_factor`; ramp tuyến tính tới 1.0 tại `target_margin_pct` (31); trên target → `cap_factor`. **Phase 1: floor=cap=1.0 ⇒ teamFactor luôn 1.0 (zero-sum), margin chỉ hiển thị.** Pool trống dự án trong cửa sổ → `empty_window_factor` (chỉnh hàng tháng).
- `marginWeighted_P` = trung bình margin **trọng số theo ceTotal** của các dự án finished trong **cửa sổ trượt `margin_window_months` (mặc định 3) kết thúc tại tháng M**, thuộc pool theo attribution ở trên.
- `poolAmount_P = base_P × teamFactor_P`.
- Điểm NV i: `weightedScore_i = Σ_c (weight_c × score_ic / scaleMax_c)` trên các tiêu chí áp dụng cho pool của i.
- `attendance_i = clamp(workedHours/plannedHours, 0, 1)` từ timesheet CONFIRMED (không có timesheet → 1.0 + cảnh báo `NO_TIMESHEET`).
- **`payout_i = poolAmount_P × (weightedScore_i × attendance_i) / Σ_pool (weightedScore × attendance)`**.
- Edge chốt cứng: NV chưa được chấm điểm nào → **chặn chốt kỳ** (`MISSING_SCORES` blocking, không default điểm); pool 1 người → nhận thẳng 25% của mình × teamFactor, điểm optional (`SINGLE_MEMBER_POOL`); NV `firstWorkDate` sau cuối kỳ → loại; NV thiếu dòng lương vị trí → loại khỏi base + `NO_SALARY_FOR_TITLE`; Σweight tiêu chí ≠ chuẩn → cảnh báo không chặn (tiền lệ RATIO_SUM_NOT_100).
- **Tiêu chí AUTO phase 1 (2 cái)**: `ATTENDANCE` (worked/planned) + `CREATIVE_ONTIME` (% CreativeTask delivered ≤ deadline) — prefill vào matrix làm giá trị gợi ý, **lưu thành KpiScore khi save** (lead sửa được, lịch sử đóng băng). Phase 2: care-overdue/AR cho Account, revision count.

### Data model (Prisma — migration additive `kpi_module`, KHÔNG reset DB)
```prisma
model PositionSalary { // lương full theo vị trí — mirror CreativeSalaryBudget, generalize mọi phòng
  id String @id @default(cuid())
  positionTitle  String   // khớp Staff.title
  departmentCode String   // ACCOUNT | PLANNING | CREATIVE | OPE | PRO
  periodCode     String   // "2026-M07"
  monthlySalary  BigInt   // VND full (100%) — 75/25 tách bằng setting pool_percent
  note String?, createdAt, updatedAt
  @@unique([positionTitle, departmentCode, periodCode])  @@map("position_salary")
}
model KpiCriterion {
  id String @id @default(cuid())
  code String @unique, nameVi String, nameEn String?, description String?
  appliesTo String @default("ALL")   // ALL | ACCOUNT (phủ A1-3) | PLANNING | CREATIVE | OPE | PRO | LEAD
  weight Float @default(1), scaleMax Int @default(5)
  sourceType String @default("MANUAL")  // MANUAL | AUTO
  autoKey String?                       // ATTENDANCE | CREATIVE_ONTIME
  sort Int @default(0), isActive Boolean @default(true)
  activeFromPeriod String?, activeToPeriod String?   // period-scoped, KHÔNG hard-delete
  createdAt, updatedAt
  scores KpiScore[]  @@map("kpi_criterion")
}
model KpiScore {
  id String @id @default(cuid())
  criterionId String, staffId String, periodCode String
  score Float, note String?, scoredById String?
  createdAt, updatedAt
  criterion KpiCriterion @relation(..., onDelete: Cascade)
  staff Staff @relation("KpiScoreStaff", ...); scoredBy Staff? @relation("KpiScoreScoredBy", ...)
  @@unique([criterionId, staffId, periodCode])  @@index([staffId, periodCode])  @@map("kpi_score")
}
model KpiPeriod { // snapshot-on-close, mirror CostSheetRevision.snapshotJson
  id String @id @default(cuid())
  periodCode String, poolKey String        // "TEAM:A1" | "DEPT:CREATIVE"
  status String @default("OPEN")           // OPEN | CLOSED
  teamFactor Float?, poolAmount BigInt?, marginWeighted Float?
  resultJson String?                       // toàn bộ output computeKpiAllocation của pool lúc chốt
  closedAt DateTime?, closedById String?
  createdAt, updatedAt
  closedBy Staff? @relation(...)
  @@unique([periodCode, poolKey])  @@map("kpi_period")
}
```
Back-relations: `Staff.kpiScores`, `Staff.kpiScoresGiven`, `Staff.kpiPeriodsClosed`. Settings module `"kpi"` (GLOBAL): `pool_percent`(25), `target_margin_pct`(31), `floor_margin_pct`(15), `floor_factor`(1.0), `cap_factor`(1.0), `empty_window_factor`(1.0), `margin_window_months`(3).

### Lib
- **Tách `src/lib/period.ts`**: move `parsePeriodCode`/`currentPeriodCode`/`shiftPeriodCode`/`ParsedPeriod` từ [creative-cost.ts] ra file chung (re-export từ creative-cost để không sửa caller — zero behavior change), KPI dùng chung. KPI chạy chu kỳ THÁNG cố định (`YYYY-Mmm`).
- **`src/lib/kpi.ts`** (mirror shape creative-cost.ts): thuần `computeTeamFactor(marginWeighted|null, params)`, `computeKpiAllocation(input): KpiReport` (number in/out, BigInt→Number ở biên, round cuối); IO `getKpiReport(periodCode)` — nạp staff active + team/dept, PositionSalary (period ≤ hiện tại, mới nhất), KpiScore, dự án finished trong cửa sổ + CTRACT sheet/revision mới nhất, `getMonthlyTimesheet`, settings; nếu `KpiPeriod` CLOSED → hydrate từ `resultJson` (KHÔNG tính lại). Warnings union: `NO_SALARY_FOR_TITLE | MISSING_SCORES (blocking) | NO_FINISHED_PROJECTS | NO_COSTSHEET_MARGIN | NO_TIMESHEET | SINGLE_MEMBER_POOL | WEIGHTS_SUM_WARN | NO_ACTIVE_CRITERIA | STAFF_NO_POSITION`.
- Auto-score helpers: `computeAutoScores(periodCode)` → map staffId→{ATTENDANCE, CREATIVE_ONTIME} (scale về scaleMax của tiêu chí).

### Actions + Routes/UI
- **`/kpi`** (nav `soon`→`active`, module ⑥): page server + period selector `?period=` (mirror creative/cost). Bố cục: (1) hàng **pool cards** — mỗi pool: base 25%, danh sách dự án attributed (code/tên/margin/ce), marginWeighted, teamFactor (badge "zero-sum: hệ số chưa gắn tiền" khi floor=cap=1), poolAmount; (2) **khối chấm điểm** per pool — bulk matrix NV × tiêu chí (pattern `ratio_<i>_<key>`, prefill AUTO), action `saveKpiScores(poolKey, periodCode, formData)` transaction upsert + audit; (3) **bảng kết quả** — NV, weightedScore, attendance, share %, payout VND; (4) panel cảnh báo (warningText pattern); (5) nút **"Chốt kỳ"** (`closeKpiPeriod(periodCode)`) — chặn khi còn blocking warning; ghi `KpiPeriod` CLOSED + snapshot + AuditLog; nút **Xuất Excel**.
- **`src/app/api/kpi/export/route.ts`**: ExcelJS — sheet tổng hợp + 1 sheet/pool (NV | vị trí | lương full | 75% fix | điểm | attendance | share | payout 25% | tổng nhận), mirror timekeeping export (contentDisposition RFC6266, header đậm, freeze).
- **`/settings/kpi`** (+ card ở settings/page.tsx): 3 khối — (a) CRUD tiêu chí (bảng + form thêm/sửa/vô hiệu, appliesTo select, weight/scaleMax, AUTO khóa autoKey); (b) form tham số (7 setting, mirror settings/finance scalar form — `empty_window_factor` có hint "chỉnh theo mùa vụ, áp cho pool trống dự án"); (c) bảng lương vị trí theo kỳ (mirror salary-budget UI của settings/creative + nút copy kỳ trước).
- `actions.ts`: `saveKpiScores`, `closeKpiPeriod`, `reopenKpiPeriod` (chỉ khi chưa export/chưa qua kỳ sau — đơn giản: cho phép + audit); settings actions: criteria CRUD, saveKpiSettings, savePositionSalary, copyPositionSalaries.

### i18n + Seed
- Namespace `kpi` (dashboard/pool/score-matrix/results/close/export/warnings) + `settings.kpi` (criteria/params/salaries) — vi/en parity script như mọi batch.
- Seed: 7 settings; 8 tiêu chí mẫu (Chất lượng công việc, Deadline & cam kết, Tinh thần hợp tác, Chủ động & sáng kiến, Tuân thủ quy trình — MANUAL ALL; Chuyên cần — AUTO ATTENDANCE; Giao đúng hạn — AUTO CREATIVE_ONTIME appliesTo CREATIVE; Quản lý team — MANUAL appliesTo LEAD); `PositionSalary` cho các cặp (title, dept) distinct hiện có với số placeholder; vài `KpiScore` mẫu tháng hiện tại cho 1-2 pool để dashboard có số demo.

## Thứ tự triển khai (giữ compile mỗi bước)
1. Schema 4 model + relations → migration additive (pattern `migrate diff` → hand-write → `migrate deploy` → `generate`) → seed.
2. `src/lib/period.ts` (extract) + re-export từ creative-cost — checkpoint tsc.
3. `src/lib/kpi.ts` (thuần + IO + auto-scores) + test tsx thuần cho computeTeamFactor/computeKpiAllocation (pool trống, 1 người, thiếu điểm, floor/cap, attendance).
4. i18n `kpi` + `settings.kpi` (parity).
5. `/settings/kpi` (criteria CRUD + params + position salaries) — nhập liệu trước nơi tiêu thụ.
6. `/kpi` dashboard + score matrix + results + close + nav active.
7. Excel export route.
8. Verify.

## Verification
- `npx tsc --noEmit` · `npx eslint src` · `npx next build` sạch; parity vi/en 0 lệch; test thuần computeKpiAllocation pass các edge case.
- Browser E2E (vi/en, desktop 1280 + mobile 375): `/settings/kpi` thêm 1 tiêu chí + nhập lương 2 vị trí; `/kpi` chọn tháng hiện tại → pool cards hiện đúng base = Σ lương × 25%, margin/dự án attributed khớp DB (đối chiếu query trực tiếp); chấm điểm matrix 1 pool → bảng kết quả chia đúng tỷ lệ (kiểm tay 1 case: 2 NV điểm 4 vs 2 → payout tỉ lệ ~2:1 sau attendance); NV chưa chấm → nút Chốt kỳ bị chặn + cảnh báo; chấm đủ → Chốt kỳ OK → `KpiPeriod` CLOSED, reload hiện từ snapshot (đổi 1 setting → số CLOSED không đổi — chứng minh đóng băng); tải Excel đọc lại bằng exceljs script kiểm cột/tổng; pool không có dự án finished trong 3 tháng → hiện `empty_window_factor` + cảnh báo.

## Hạn chế đã biết (nêu rõ)
- **Zero-sum phase 1**: teamFactor luôn 1.0 (floor=cap=1.0) — margin hiển thị minh bạch nhưng CHƯA gắn tiền; BoD bật co giãn sau bằng cách hạ `floor_factor` trong Settings, không cần sửa code. Khuyến nghị vận hành: chạy shadow 1-2 tháng cho quen số trước khi bật.
- **Lương theo vị trí, không cá nhân** — chấp nhận sai số khi 2 người cùng title khác lương thật; đổi được khi có auth/RBAC thật (per-person cần quyền xem). Không RBAC thật → trang KPI/lương ai cũng xem được (nhất quán toàn app, đã cảnh báo nhiều lần).
- Attribution qua ProjectOrder phụ thuộc kỷ luật tạo ORDER; dự án finished không có order dept nào → margin chỉ vào pool Account (owner team), các dept khác nhận cảnh báo. OPE/PRO/PCC không có dữ liệu giờ công per-task → điểm các dept này thuần manual + attendance.
- Khung 25% về pháp lý nên ban hành dưới dạng "thưởng hiệu quả theo quy chế" (Điều 104 BLLĐ 2019) thay vì khấu trừ lương — việc soạn quy chế nằm ngoài CRM, đã lưu ý BoD.

### File trọng yếu (batch này)
[prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · `src/lib/period.ts` (mới, extract) · [src/lib/creative-cost.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\creative-cost.ts) (re-export period) · `src/lib/kpi.ts` (mới) · `src/app/(app)/kpi/**` (mới: page, score-matrix-form, actions) · `src/app/api/kpi/export/route.ts` (mới) · `src/app/(app)/settings/kpi/**` (mới) · [nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts) · [settings/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\page.tsx) · messages/vi.json · messages/en.json. (Mirror: [creative-cost.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\creative-cost.ts), [settings/creative/ratio-matrix-form.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\creative\ratio-matrix-form.tsx), [api/timekeeping/export/route.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\api\timekeeping\export\route.ts), [timekeeping.ts getMonthlyTimesheet](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\timekeeping.ts).)

---

# BATCH: Dashboard nâng cấp — KPI kinh doanh theo team, Cashflow MTD, tiến độ task theo bộ phận (số tỷ lệ màu + drill-down)

## Context
Dashboard `/` hiện chỉ có 2 query giả (tổng KH active + tổng team) và 2 card placeholder "—". BGĐ cần dashboard thật: (1) khối kinh doanh theo từng team Account A1/A2/A3 + tổng công ty (KH active/tổng, dự án đang chạy tháng này/YTD, dự án đang bidding); (2) khối Cashflow MTD (đã thu/sẽ thu, đã chi/sẽ chi) — CHỈ phòng CEO thấy; (3) khối tiến độ 6 bộ phận (Account theo từng team + Creative/Planning/Operations/Production/Purchasing) dạng "trễ/tổng". Mọi số liệu hiện tỷ lệ tô màu (số cần chú ý tô đỏ/vàng, tổng tô thường) và bấm vào số nào dẫn thẳng tới danh sách lọc đúng chỉ tiêu đó.

### Quyết định đã chốt (AskUserQuestion)
1. **Cashflow MTD theo tháng dương lịch, KHÔNG áp buffer 14 ngày** của `/finance/cashflow` (trang đó là dự báo cửa sổ trượt, tách biệt hoàn toàn — không sửa, không tái dùng `getCashflowForecast`).
2. **4 bộ phận Account/OPE/PRO/PCC + Planning dùng Timeline (TimelineItem) làm nguồn "task" đại diện** — vì chưa có bảng task riêng cho các bộ phận này (chỉ Creative có `CreativeTask` thật). Khi build sâu từng module sau này sẽ bổ sung task gắn liền Timeline để tracking chuẩn hơn — dashboard hiện tại chấp nhận đây là proxy, sẽ nâng cấp nguồn sau mà không đổi giao diện card.
3. **Phòng ban CEO + chức danh CFO được xem đủ dữ liệu toàn công ty + khối Cashflow** (`department.code === "CEO"` HOẶC `title === "CFO"` — CFO nằm trong phòng FIN nên không gate được bằng department; kế toán viên khác trong FIN KHÔNG thấy). Account staff chỉ thấy team mình; NV các phòng khác (Creative/Planning/OPE/PRO/PCC) thấy tổng công ty (khối 1, không tách team) + card bộ phận mình trong khối 3, không thấy Cashflow.

### Ràng buộc đã xác minh (trust, không suy đoán)
- Dashboard hiện tại: `src/app/(app)/page.tsx` (66 dòng), `StatCard` là component nội bộ (không export) — KHÔNG dùng cho batch này, tạo mới `StatRatio`/`StatValue` dùng chung, để nguyên `StatCard` cũ không đụng.
- `Client.statusId` là FK **lưu sẵn** vào option_set `client_status` (ACTIVE/INACTIVE/POTENTIAL), tự động cập nhật qua `recomputeClientStatus()` ([client-status.ts]) mỗi khi lưu Contract — dùng thẳng `status.code`, không tính lại. `Client.isActive` là cờ soft-delete, khác hoàn toàn với status kinh doanh — 2 khái niệm KHÔNG được gộp nhầm trên card.
- `Project.ownerTeamId` **nullable** (dự án "chờ giao team") — tổng công ty (ALL) sẽ ≠ A1+A2+A3 khi có dự án chưa gán team; card tổng công ty hiển thị đúng bằng cách đếm tất cả, không cộng dồn 3 team.
- `/clients` hiện chỉ nhận `{team?, q?}` — **chưa có `status` param** → phải thêm 1 dòng where mới (additive, không đổi hành vi mặc định) để drill-down "KH active" hoạt động được.
- `/projects` nhận `{team?, status?, q?}`, mặc định lọc `EXECUTION_STATUS_CODES = ["PROCESSING","LIQUIDATION","HANDOVER","FINISHED"]` ([projects.ts:4]). `/bidding` nhận `{team?, status?, q?}`, không lọc mặc định (8 status).
- `getCashflowForecast()` ([cashflow.ts]) là dự báo cửa sổ trượt 7/30 ngày + buffer 14 ngày, **chưa từng đọc** `ClientPayment.paidDate`/`VendorPayment.paidDate`/`Advance.disbursedAt` → phải viết mới hoàn toàn cho MTD-actual, KHÔNG sửa file cũ.
- `ClientPayment{invoiceId, amount BigInt, paidDate}` không có `projectId` — muốn lọc theo team phải join `invoice.project.ownerTeam`. `ClientInvoice.dueDate` nullable (fallback `invoiceDate`). `Advance` KHÔNG có `dueDate` — REQUESTED advance tính như khoản sắp chi ngay (đúng quy ước `cashflow.ts` đang dùng).
- Chỉ `CreativeTask` có bảng task thật với `deadline` + status; đã có sẵn `getCreativeDashboardStats()` ([creative.ts:126]) và `getCreativeOverdueTasks(teamCode?)` ([reminders.ts:264]) — **tái dùng, không viết lại**. `PlanningStage.dueAt` tồn tại nhưng không bao giờ được set khi spawn ([planning.ts:62-71]) → không dùng làm nguồn Planning, dùng Timeline thay.
- `TimelineItem{ownerStaffId?, departmentCode?, endDate?, statusId(option_set timeline_status: NOT_STARTED|IN_PROGRESS|BLOCKED|DONE)}` — nguồn chung cho Account/Planning/OPE/PRO/PCC. Resolve phòng ban: `ownerStaff?.department?.code ?? departmentCode` (đúng pattern [project-orders.ts:13-19], nhưng KHÔNG lọc qua `ORDERABLE_DEPARTMENTS` vì danh sách đó loại trừ ACCOUNT). Seed hiện tại mỏng — PCC chưa có hạng mục nào làm chủ (`departmentCode`/`ownerStaffId`) → sẽ bổ sung seed để card không hiện 0 cho mọi bộ phận.
- `getCurrentStaff()` ([current-staff.ts]) hiện chỉ include `department`, chưa có `team`/`role` — mở rộng include khi cần.
- KHÔNG có tiền lệ gate theo role trong toàn bộ `src/` — `Role`/`roleId` là nominal theo đúng comment trong schema. Việc phân quyền hiển thị dashboard theo `department.code === "CEO"` là **hiển thị-only**, không phải bảo mật thật (nhất quán với toàn bộ app, ghi chú rõ trong code).

## Thiết kế

### 1. Component dùng chung `src/components/ui/stat-ratio.tsx` (mới)
- `StatRatio` — số tỷ lệ "trễ/tổng", cả 2 nửa đều là `<Link>` riêng, nửa "cần chú ý" tô `text-danger`, nửa tổng tô `text-foreground` thường. Giữ nguyên khung `rounded-xl border border-border bg-surface p-5` như `StatCard` cũ.
- `StatValue` — 1 số tiền/số đơn có màu + link (cho card kinh doanh dạng "active/tổng" không phải "trễ/tổng", và card Cashflow).
- KHÔNG đụng 4 card cũ đã có (`StatCard` dashboard, `StatSplit` creative, `SummaryCard` co-ce/liquidation) — để riêng, tránh regression.

### 2. Lib mới `src/lib/dashboard.ts`
- `getBusinessVolume(teamCode: string | undefined, now: Date)`: KH active/tổng (theo `status.code==="ACTIVE"` / `isActive:true`), dự án đang chạy tháng này/YTD (`processingAt >= đầu tháng` cho "trong tháng"; `status IN EXECUTION_STATUS_CODES AND fiscalYear = năm hiện tại` cho YTD), dự án đang bidding (`status IN ["BIDDING","PENDING"]`).
- `getBusinessVolumeAllTeams(now)`: chạy song song A1/A2/A3 + ALL (không cộng dồn — đếm trực tiếp toàn bộ để không lệch khi có dự án chưa gán team).
- `getCashflowMtd(now)`: đã thu = Σ `ClientPayment.paidDate` trong tháng; sẽ thu = Σ outstanding của `ClientInvoice` có `(dueDate ?? invoiceDate)` từ hôm nay đến cuối tháng; đã chi = Σ `VendorPayment(status PAID, paidDate trong tháng)` + Σ `Advance(disbursedAt trong tháng)`; sẽ chi = Σ `VendorPayment(SCHEDULED, dueDate ≤ cuối tháng)` + Σ `Advance(REQUESTED)`. BigInt→Number tại điểm cộng dồn.
- `getDeptTaskRatios(teamCode: string | undefined, now: Date)`: trả mảng theo 6 bucket (`TEAM:A1|A2|A3` cho Account, `CREATIVE|PLANNING|OPE|PRO|PCC`). Creative tái dùng `getCreativeDashboardStats()` + `getCreativeOverdueTasks()`; 5 bucket còn lại query 1 lần `TimelineItem` (include `project.status`, `project.ownerTeam`, `ownerStaff.department`) rồi bucket ở JS theo `resolveDept` + đếm `endDate < now && status.code !== "DONE"`.
- Toàn bộ hàm thuần tính toán tách khỏi IO tối thiểu (mirror mức độ kpi.ts, không cần warnings union vì đây là dashboard chỉ đọc).

### 3. `src/lib/permissions.ts` (mới, tối thiểu)
- `getDashboardScope()`: đọc `getCurrentStaff()` mở rộng `include:{department:true, team:true}`. `isExec = department.code === "CEO" || title === "CFO"` → `canSeeAllTeams = canSeeCashflow = isExec`. Account staff (`department.code==="ACCOUNT"`) → `visibleTeams=[team.code]`. Còn lại (Creative/Planning/OPE/PRO/PCC, kể cả kế toán viên FIN không phải CFO) → `visibleTeams=["ALL"]`, không cashflow, không tách team, nhưng có `highlightDept` = department code của họ để tô đậm card bộ phận mình trong khối 3.
- Comment đầu file: "⚠ Chỉ hiển thị — chưa phải kiểm soát truy cập thật, chờ auth thật (nhất quán current-staff.ts)."

### 4. Mở rộng `/clients` — thêm `status` searchParam (additive)
`src/app/(app)/clients/page.tsx`: `searchParams: Promise<{team?, status?, q?}>`, thêm `status: status ? {code: status} : undefined` vào where. Không đổi mặc định khi không truyền.

### 5. Viết lại `src/app/(app)/page.tsx`
- Gọi `getDashboardScope()` trước, rồi `Promise.all` các getter theo scope.
- Khối 1 (Kinh doanh): CEO thấy 4 nhóm (A1/A2/A3 + Tổng công ty), Account thấy 1 nhóm (team mình), nhóm khác thấy 1 nhóm (Tổng công ty, không tách). Mỗi nhóm 3 `StatValue`: KH active/tổng → `/clients?status=ACTIVE&team=X` | `/clients?team=X`; dự án đang chạy tháng/YTD → `/projects?team=X` (đã lọc execution mặc định) cho cả 2 vế (không có param YTD riêng, ghi rõ đây là cùng 1 view); dự án bidding → `/bidding?status=BIDDING&team=X`.
- Khối 2 (Cashflow) — chỉ render nếu `scope.canSeeCashflow`: 4 `StatValue` tiền, không có link (chưa có route filter theo MTD ở `/finance` — hiển thị-only, không tạo URL giả).
- Khối 3 (Tiến độ bộ phận): `StatRatio` cho từng bucket theo `scope.visibleTeams`/`highlightDept`. Link nửa "trễ" → `/reminders` (Creative dùng `/creative`); nửa "tổng" → `/projects?team=` tương ứng khi có team, còn lại hiển thị-only (không có list Timeline riêng theo bộ phận hiện nay).
- Giữ lại card roadmap cũ ở cuối trang.

### 6. Seed bổ sung (`prisma/seed.ts`)
Thêm ~6-8 `TimelineItem` demo phủ đủ Account/Planning/OPE/PRO/PCC (đặc biệt PCC — hiện chưa có hạng mục nào làm chủ), có ít nhất 1 dòng quá hạn (`endDate` trong quá khứ, status ≠ DONE) mỗi bộ phận để card không hiện toàn 0.

### 7. i18n
Thêm vào namespace `dashboard` (vi/en, parity script): `sectionBusiness, sectionCashflow, sectionTasks, companyTotal, teamLabel, activeClients, activeClientsSub, runningProjects2, runningProjectsSub, biddingProjects, cashIn, cashInActual, cashInRemaining, cashOut, cashOutActual, cashOutRemaining, taskOverdueRatio, deptAccount, deptCreative, deptPlanning, deptOperations, deptProduction, deptPurchasing, displayOnlyHint`.

## Thứ tự triển khai
1. `stat-ratio.tsx` (kiểm token `text-danger` có sẵn — dùng luôn, không cần thêm token mới).
2. `src/lib/permissions.ts`.
3. `src/lib/dashboard.ts` (3 getter + wrapper all-teams).
4. `/clients` thêm `status` param.
5. i18n vi/en (parity).
6. Viết lại `src/app/(app)/page.tsx`.
7. Seed bổ sung TimelineItem 5 bộ phận.
8. Verify.

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx next build` sạch; parity vi/en 0 lệch.
- Browser E2E (vi/en, desktop 1280 + mobile 375): act-as CEO seed → thấy đủ 4 nhóm kinh doanh + Cashflow + 8 card bộ phận (kể cả PCC không còn 0); bấm số "KH active" → `/clients?status=ACTIVE&team=A1` lọc đúng; bấm "dự án bidding" → `/bidding?status=BIDDING` lọc đúng; act-as **CFO** → thấy Cashflow + toàn công ty; act-as **Kế toán TCM** (cùng phòng FIN nhưng không phải CFO) → KHÔNG thấy Cashflow (chứng minh gate theo title hoạt động đúng); act-as 1 Account NV (team A2) → chỉ thấy nhóm A2, không thấy Cashflow; act-as 1 Creative NV → thấy Tổng công ty (không tách team) + card Creative được highlight, không thấy Cashflow.
- Đối chiếu tay: `inActual` Cashflow so với `SELECT SUM(amount) FROM client_payment WHERE paidDate trong tháng` chạy trực tiếp qua Prisma script; 1 card bộ phận (vd PCC) so với query TimelineItem thủ công.

### File trọng yếu (batch này)
`src/components/ui/stat-ratio.tsx` (mới) · `src/lib/permissions.ts` (mới) · `src/lib/dashboard.ts` (mới) · [src/app/(app)/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\page.tsx) · [src/app/(app)/clients/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\clients\page.tsx) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · messages/vi.json · messages/en.json. (Tái dùng: [src/lib/creative.ts getCreativeDashboardStats](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\creative.ts) · [src/lib/reminders.ts getCreativeOverdueTasks](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\reminders.ts) · [src/lib/projects.ts EXECUTION_STATUS_CODES](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\projects.ts) · [src/lib/current-staff.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\current-staff.ts).)

---

# BATCH: Nhân sự thật (42 người, từ file Excel) thay toàn bộ demo + Xóa/Inactive nhân sự + Sơ đồ tổ chức (Org Chart)

## Context
Chủ dự án cung cấp file `D:\TCM\TCM_AI_CRM\Source\Danh sach NS.xlsx` (sheet "Fulltime TCM", 42 dòng, cột: STT | MSNV | Họ và tên | Nơi công tác | Phòng ban | Vị trí công việc | Quản lý trực tiếp | Giới tính | Điện thoại | Ngày sinh | Email Công ty | Ngày bắt đầu làm việc | Role) — đây là danh sách nhân sự **thật** tính đến hôm nay. Yêu cầu: (1) xóa toàn bộ ~16-18 user demo hiện có, thay bằng đúng 42 người + role thật; (2) bổ sung nút Xóa + Inactive cho nhân sự trong `/settings/staff`; (3) dùng cột "Quản lý trực tiếp" để dựng **sơ đồ tổ chức** thật (org chart) — đặt ngay dưới mục Knowledge Base trong sidebar, luôn cập nhật realtime, có xuất ảnh/PDF (áp dụng cho HR Manager — nominal, không gate thật, nhất quán toàn app).

**3 quyết định đã chốt với chủ dự án (AskUserQuestion):**
1. **Reset sạch dữ liệu demo, seed lại kịch bản tương đương bằng người thật** — không giữ nguyên rồi "recast" (tránh gán lịch sử giả cho người thật), không xóa hẳn không seed lại (vẫn cần dữ liệu ví dụ để xem/test). Tức: cùng SỐ LƯỢNG/HÌNH DẠNG kịch bản demo hiện có (4 dự án, 4 khách hàng, bidding, chat, KPI, chấm công, Creative task, tạm ứng, timeline...) nhưng do đúng người thật (theo phòng ban/team tương ứng) đứng tên thay vì tên demo.
2. **Xuất ảnh/PDF org chart: SVG + PNG qua canvas trình duyệt, PDF qua lệnh In (Ctrl+P → Save as PDF)** — KHÔNG cài thêm dependency nào (không puppeteer/canvas-server/jspdf/sharp/html2canvas).
3. **Xóa nhân sự: xóa thật (hard delete) + tự dọn các bảng RESTRICT-FK an toàn trước khi xóa**, kèm xác nhận 2 bước (gõ đúng họ tên để xác nhận) — đây là chỗ đầu tiên trong toàn app có confirm dialog, lệch có chủ đích khỏi quy ước "không confirm" hiện có vì đây là thao tác không thể hoàn tác và xóa cả một CON NGƯỜI khỏi hệ thống, không phải 1 dòng cấu hình.

### Ràng buộc kỹ thuật đã xác minh (3 Explore agent, đọc thật code)
- **`Staff` model** hiện có: `id, code?(unique), fullName, email(unique), phone?, title?, departmentId?, teamId?, roleId?, avatarKey?, dateOfBirth?, firstWorkDate?, isActive, createdAt, updatedAt` + ~60 back-relation. **CHƯA có** `managerId`, `gender`, `workLocation`.
- **FK trỏ vào Staff** — đã audit từng migration.sql thật, chia 3 nhóm:
  - **RESTRICT** (chặn xóa nếu còn tham chiếu): `Notification.recipientStaffId`, `ClientTransfer.transferredById`, `ProjectOrderAttendee.staffId`, `ProjectMember.staffId`, `ConversationMember.staffId`, `ShiftAssignment.staffId`.
  - **CASCADE** (tự xóa theo): `MessageReaction.staffId`, `MessageDeletion.staffId`, `PollVote.staffId`, `KpiScore.staffId`.
  - **SET NULL** (~40 FK còn lại): Project.ownerId/leaderId, CostSheet.*, Contract.*, CreativeTask.*, Advance.*, Conversation/Message.*, TimelineItem.owner*, Planning*.*, StockDocument.*, Department.leadStaffId, ScheduleWeek.confirmedById, KpiPeriod.closedById...
  - `AuditLog.changedBy` và `SpecialOccasionLog.refId` là **String trần, không có FK** — xóa staff để lại tham chiếu "mồ côi" nhưng không lỗi, không cascade (chấp nhận được, không thể dọn sạch mà không phá lịch sử audit).
- **`src/lib/current-staff.ts`** `getCurrentStaffId()`: cookie "act as" trước, không có thì fallback cứng `prisma.staff.findUnique({where:{email:"ceo@tcm.vn"}})` → **PHẢI sửa email fallback trước tiên** (trước khi đụng gì khác) vì đây là danh tính mặc định của TOÀN BỘ app khi chưa "act as" — nếu xóa demo mà không sửa chỗ này, mọi action không guard sẽ ghi `null` vào `createdById`/`changedBy`.
- **`prisma/seed.ts`**: staff tạo qua `upsert({where:{email}, update:{}, create:{...}})`, không có `deleteMany`. ~16-18 biến demo (`ceo, thao, yen, ha, bdDirector, orderLeadByCode[PLANNING/CREATIVE/PCC/OPE/PRO], hrStaff, itStaff, accountant, cfo, seniorDesigner, artist3d, planner, adminStaff`) được tham chiếu xuyên suốt ~1900 dòng seed cho MỌI module (client/project/bidding/chat/timekeeping/KPI/creative/planning/finance/inventory...). Nhóm "GIA ĐÌNH TCM" (chat all-staff) và `Department.leadStaffId` map (10 phòng ban) là 2 chỗ cần cẩn thận nhất.
- **Role catalog đã đúng từ batch trước** (không đụng): ADMIN, BOARD_OF_MANAGEMENT, CFO, ACCOUNTANT_STAFF, HR_MANAGER, HR_STAFF, ADMIN_STAFF, ACCOUNT_DIRECTOR, ACCOUNT_MANAGER, ACCOUNT_STAFF, CREATIVE_DIRECTOR, CREATIVE_STAFF, PLANNING_MANAGER, PLANNING_STAFF, OPERATIONS_MANAGER, OPERATIONS_STAFF, PRODUCTION_MANAGER, PRODUCTION_STAFF, PURCHASING_MANAGER, PURCHASING_STAFF, IT_STAFF.
- **`/settings/staff`** hiện đã list toàn bộ staff (kể cả inactive, không filter) dạng bảng sticky-header, chưa có action theo dòng. Quy ước hàng-action đã thiết lập ở nơi khác (`teams/team-row.tsx`, `warehouses/warehouse-row.tsx`, `shifts/shift-row.tsx`): 1 `<form action={boundAction}>`/dòng, `useActionState`, checkbox `isActive` + nút Lưu; guard khi deactivate tham khảo `warehouses/actions.ts` (chặn nếu còn tham chiếu). **Không nơi nào trong Settings có confirm dialog** — batch này là ngoại lệ đầu tiên, có chủ đích.
- **Xuất ảnh/PDF**: package.json chỉ có `exceljs, docxtemplater, pizzip` — KHÔNG có puppeteer/canvas/jspdf/sharp/html2canvas/d3/mermaid/reactflow/dagre. Có sẵn pattern sinh SVG server-side thuần (`src/lib/celebration-cards.ts`, `src/lib/welcome-card.ts`) — hàm thuần trả về SVG string, `xmlEscape()` cục bộ, `viewBox` cố định, `<text>` font hệ thống, không `foreignObject`. Đây là pattern tái dùng cho org chart.
- **Nav**: `src/components/layout/nav-items.ts` — mảng phẳng, mục `kb` (Knowledge Base) là mục cuối cùng trước `SETTINGS_ITEM`. Chèn mục mới ngay sau `kb`, `module: null`.

## A) Schema — thêm field cho Staff (additive, KHÔNG reset ngay ở bước này)
```prisma
model Staff {
  ...
  gender        String?   // "Nam" | "Nữ" — text thuần từ Excel, không option_set (không module nào khác cần catalog cấu hình được cho field này)
  workLocation  String?   // "TPHCM" | "HÀ NỘI" — tương tự, text thuần
  managerId     String?   // NGƯỜI QUẢN LÝ TRỰC TIẾP thật (khác Role.parentRoleId — đó là phân cấp role chung chung, không phải người cụ thể)
  manager       Staff?    @relation("StaffManager", fields: [managerId], references: [id], onDelete: SetNull)
  reports       Staff[]   @relation("StaffManager")
}
```
`onDelete: SetNull` khớp tiền lệ `Department.leadStaffId`. Xóa 1 manager → cấp dưới trực tiếp có `managerId=null`, org chart tự hiển thị họ như 1 "root" phụ — chấp nhận được, không cần logic tái-gán cha.

Migration: sửa `schema.prisma` → `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` → soát file `migration.sql` sinh ra (SQLite thêm cột FK cần kiểu redefine-table như các batch trước, xem `20260722000000_role_description` làm mẫu tối giản nếu chỉ là cột thường) → `prisma migrate deploy` → `prisma generate`. Bước này áp lên **DB hiện tại** trước (không mất dữ liệu demo), verify `tsc --noEmit` sạch (field mới chưa ai dùng).

## B) Sửa fallback danh tính — LÀM TRƯỚC TIÊN, độc lập
[`src/lib/current-staff.ts`](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\current-staff.ts): đổi `email: "ceo@tcm.vn"` → `email: "nvhoang@tcmbtl.com"` (CEO thật kiêm super-admin, đã tồn tại từ batch RBAC trước). Grep toàn repo `"ceo@tcm.vn"` — phải về 0 kết quả trong `src/` (lịch sử migration.sql cũ giữ nguyên, không đụng).

## C) Viết lại `prisma/seed.ts` — khối tạo staff
### Dữ liệu 42 người (nhập nguyên văn từ Excel — KHÔNG suy đoán field nào)
Khai báo `STAFF_ROWS` (mảng literal 42 phần tử) với đủ: `code | fullName | location(TPHCM/HÀ NỘI) | deptExcel | title | managerName | gender(Nam/Nữ) | phone | dob[dd,mm,yyyy] | email | firstWorkDate[dd,mm,yyyy] | roleText`. Dữ liệu đầy đủ 42 dòng đã được xác nhận trong phiên làm việc (STT 1-42, từ NGUYỄN ĐẠO BÌNH/Chairman tới BÙI THỊ THÙY TRANG/Purchasing Executive) — copy verbatim, không bịa thêm.

**1 người KHÔNG có email** (STT 27, NGUYỄN THANH BÌNH, Security Guard, MSNV TCM-0040): `Staff.email` là `@unique` + bắt buộc → sinh placeholder xác định `nguyenthanhbinh.tcm0040@tcm.internal` (ghi rõ trong comment code đây là placeholder do nguồn thiếu email thật).

### Bảng tra cứu (map literal trong seed.ts)
- `DEPT_MAP`: General→CEO, "Account 1/2/3"→ACCOUNT, Creative→CREATIVE, Finance→FIN, HR→HR, Operation→OPE, Planning→PLANNING, Production→PRO, Purchasing→PCC.
- `TEAM_MAP`: "Account 1"→A1, "Account 2"→A2, "Account 3"→A3, còn lại null.
- `ROLE_MAP`: "CEO cum Super Admin"→ADMIN, "Board of Management"→BOARD_OF_MANAGEMENT, "CFO"→CFO, "Accounting Staff"→ACCOUNTANT_STAFF, "HR Manager"→HR_MANAGER, "Administration Staff"→ADMIN_STAFF, "IT support"→IT_STAFF, "Account Manager"→ACCOUNT_MANAGER, "Account Staff"→ACCOUNT_STAFF, "Creative Director"→CREATIVE_DIRECTOR, "Creative Staff"→CREATIVE_STAFF, "Operations Manager"→OPERATIONS_MANAGER, "Operations Staff"→OPERATIONS_STAFF, "Production Manager"→PRODUCTION_MANAGER, "Production Staff"→PRODUCTION_STAFF, "Purchasing Manager"→PURCHASING_MANAGER, "Purchasing Staff"→PURCHASING_STAFF, "Planning Staff"→PLANNING_STAFF. **Không dòng nào map ACCOUNT_DIRECTOR/PLANNING_MANAGER/HR_STAFF → 3 role này để trống sau import, đúng thực tế, KHÔNG tự gán bừa ai vào.**
- Lưu ý: cột "Vị trí công việc" (Staff.title, vd "Account Director" của Trần Thu Hà) và cột "Role" (RBAC, "Account Manager") là 2 field khác nhau, KHÔNG cố ép khớp — giữ nguyên đúng như Excel.

### 2 vòng upsert
- **Vòng 1**: mỗi dòng → `prisma.staff.upsert({where:{email}, update:{}, create:{...departmentId/teamId/roleId/dateOfBirth/firstWorkDate/gender/workLocation}})`, đồng thời build `const staffByFullName = new Map<string,{id}>()` (dữ liệu 42 dòng KHÔNG trùng tên — verify khi chạy).
- **Vòng 2**: dòng nào có `managerName` khác null → `prisma.staff.update({where:{email}, data:{managerId: staffByFullName.get(managerName).id}})`. NGUYỄN ĐẠO BÌNH (Chairman) không có manager → root cây tổ chức.
- Dòng 2 (nvhoang@tcmbtl.com) đã tồn tại từ trước — vì bước D reset sạch DB nên `update:{}` không kích hoạt (row chưa tồn tại lúc chạy lại), field tạo mới đầy đủ theo Excel bình thường.

### Ánh xạ biến demo cũ → người thật (giữ tên biến, đổi nguồn dữ liệu — hạn chế diff phần còn lại của file)
| biến cũ | người thật (email) | lý do |
|---|---|---|
| `ceo` | nvhoang@tcmbtl.com (NGUYỄN VĂN HOÀNG) | CEO+Admin thật sẵn có |
| `thao` | hhphuoc@tcmbtl.com (HỒ HỒNG PHƯỚC, Account Manager A1) | |
| `yen` | httanh@tcmbtl.com (HỨA THỊ TRÂM ANH, Senior Account Manager A2) | người A2 senior nhất |
| `ha` | ttha@tcmbtl.com (TRẦN THU HÀ, Account Director A3) | lead team A3 |
| `bdDirector` **và** `orderLeadByCode["PRO"]` | hsbao@tcmbtl.com (HỒ SĨ BẢO, BD & Production Director) | **1 người thật giữ cả 2 vai trò** (đúng title thật) — 2 biến trỏ cùng 1 id, không cần người khác |
| `orderLeadByCode["CREATIVE"]` | nhhiep@tcmbtl.com (NGUYỄN HOÀNG HIỆP, Creative Director) | |
| `orderLeadByCode["PLANNING"]` **và** `planner` | dmngoc@tcmbtl.com (DƯƠNG MỸ NGỌC) | **chỉ có 1 người Planning thật** — 2 biến trỏ cùng 1 id; kiểm tra kỹ mọi chỗ seed giả định 2 người khác nhau (vd PlanningJob assign cho chính người giao — nếu có guard "không tự giao cho mình" phải bỏ qua bước đó hoặc chọn kịch bản khác cho riêng Planning) |
| `orderLeadByCode["PCC"]` | datuyet@tcmbtl.com (ĐÀM ÁNH TUYẾT, Purchasing Manager) | |
| `orderLeadByCode["OPE"]` | thhan@tcmbtl.com (TRẦN HOÀI HẬN, Senior Operation Manager) | |
| `hrStaff` | tthyen@tcmbtl.com (TRẦN THỊ HẢI YẾN, Senior HR Manager) | |
| `itStaff` | tdvu@tcmbtl.com (TRƯƠNG ĐÌNH VŨ, IT Executive — dept Excel = HR) | |
| `accountant` | ltpanh@tcmbtl.com (LÊ THỊ PHƯƠNG ANH, MSNV TCM-0039) | |
| `cfo` | pthuyen@tcmbtl.com (PHẠM THU HUYỀN) | |
| `seniorDesigner` | lmquang@tcmbtl.com (LÊ MINH QUANG, Design Manager) | |
| `artist3d` | ntcam@tcmbtl.com (NGUYỄN THANH CẦM, 3D Designer) | |
| `adminStaff` | lnchau@tcmbtl.com (LÊ NGỌC CHÂU, Assistant HR Manager, MSNV TCM-0010, role ADMIN_STAFF) | Nguyễn Thanh Bình cũng ADMIN_STAFF nhưng không có email thật → dùng người này cho mọi seed cần gửi notification/chat thật |

**26 người còn lại** (Trần Thị Mỹ Ái, các Account Staff/Executive, Operations Staff, v.v.) — chỉ tạo qua Vòng 1, KHÔNG cần biến riêng, không đóng vai trong kịch bản demo cụ thể nào — vẫn xuất hiện đầy đủ ở danh sách nhân sự/roles/org chart/nhóm chat "GIA ĐÌNH TCM".

### 2 chỗ cần sửa tay cẩn thận
- **Nhóm chat "GIA ĐÌNH TCM"**: đổi vòng lặp tạo `ConversationMember` từ danh sách biến demo cứng sang lặp **toàn bộ 42 người** vừa tạo ở Vòng 1 (`Object.values(staffByFullName)` hoặc tương đương).
- **`Department.leadStaffId` map** (10 phòng ban): ACCOUNT→ttha (Director, cao nhất), CREATIVE→nhhiep, FIN→pthuyen, HR→tthyen, OPE→thhan, PRO→hsbao, PCC→datuyet, PLANNING→dmngoc, CEO→nvhoang, **IT→null** (0 nhân sự phòng IT sau khi import theo đúng Excel — Trương Đình Vũ nằm phòng HR — để trống, không gán ép).
- **Xóa hẳn khối `staffRoleAssignments` cũ** (RBAC gán role thủ công theo danh sách 15 người) — dư thừa vì Vòng 1 đã gán `roleId` trực tiếp từ `ROLE_MAP` cho từng người. Grep `staffRoleAssignments` xác nhận không nơi nào khác dùng trước khi xóa.

## D) Reset DB + seed lại
1. Dừng dev server đang chạy.
2. `npx prisma migrate reset --force --skip-seed` (xóa sạch + replay toàn bộ migrations, gồm migration mới ở bước A).
3. `npx prisma db seed` (chạy seed.ts đã viết lại ở bước C).
4. Verify nhanh bằng script Prisma: `staff` count = 42, `nvhoang@tcmbtl.com` có `roleId`→ADMIN và `managerId`→id của Chairman.

## E) `/settings/staff` — thêm Inactive + Xóa
- [`page.tsx`](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\staff\page.tsx): include thêm `manager:{select:{fullName:true}}`; thêm cột `colGender, colLocation, colManager, colStatus, colActions`; thay `<tr>` tĩnh bằng component `<StaffRow>` (client) theo đúng pattern `warehouse-row.tsx`.
- **`staff-row.tsx`** (mới): 1 form Lưu trạng thái (`isActive` checkbox, mirror `warehouse-row.tsx`) + khối Xóa riêng.
- **`actions.ts`** thêm:
  - `updateStaffStatus(staffId, prev, formData)`: chặn tự-deactivate chính mình (so `staffId` với `getCurrentStaffId()`), chặn deactivate nếu là **ADMIN cuối cùng còn active** (đếm `staff.count({roleId: adminRole.id, isActive:true, id:{not:staffId}})`).
  - `deleteStaff(staffId, prev, formData)`: trong `$transaction` — (1) guard tự-xóa mình + guard ADMIN cuối cùng (như trên); (2) dọn 6 bảng RESTRICT theo `staffId`: `notification.deleteMany`, `clientTransfer.deleteMany({where:{transferredById:staffId}})` (chỉ field này, các field khác của ClientTransfer là SET NULL), `projectOrderAttendee.deleteMany`, `projectMember.deleteMany`, `conversationMember.deleteMany`, `shiftAssignment.deleteMany`; (3) `staff.delete` — 4 bảng CASCADE + ~40 SET NULL tự xử lý ở DB; (4) audit `entityType:"staff", action:"DELETE"`; (5) `revalidatePath`.
- **UI xác nhận 2 bước** (lệch có chủ đích khỏi quy ước "không confirm"): nút "Xóa" mở panel inline (client `useState`, KHÔNG submit ngay) hiện tên nhân sự + cảnh báo + ô nhập text — nút "Xác nhận xóa" chỉ enable khi gõ đúng `fullName`; nút "Hủy" đóng panel. Không dùng modal/dialog lib (không có sẵn trong repo) — chỉ `<div>` điều kiện.
- i18n mới trong `settings.staff` (vi+en, cùng vị trí 2 file): `colGender, colLocation, colManager, colStatus, colActions, active, inactive, deleteBtn, cancelBtn, deleteWarning, deleteConfirmPlaceholder, errorCannotDeactivateSelf, errorLastAdmin, errorCannotDeleteSelf, noManager`.

## F) Sơ đồ tổ chức (Org Chart)
- **Nav**: [`nav-items.ts`](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts) — thêm 1 dòng ngay sau mục `kb`: `{module:null, labelKey:"orgchart", href:"/orgchart", icon: Network, status:"active"}` (icon `Network` từ lucide-react — thêm import).
- **`src/app/(app)/orgchart/page.tsx`** (mới, server component): `prisma.staff.findMany({where:{isActive:true}, include:{department, team, role, manager:{select:{id:true}}}})` → dựng cây trong bộ nhớ theo `managerId` (root = `managerId===null`, thường là Chairman). Không cache/snapshot gì — mỗi lần vào trang query lại DB sống → tự động "realtime" đúng nghĩa, không cần hạ tầng thêm.
- **`src/lib/org-chart-svg.ts`** (mới, mirror `celebration-cards.ts`): thuật toán layout tự viết (không có d3/dagre) — BFS gán `depth` từng node theo cấp; trong mỗi depth, đặt x theo thứ tự con dưới cha (leaf lấy slot x tuần tự, node cha lấy x = trung bình con); box cố định (vd 200×90px), khoảng cách hàng cố định (vd 140px) — đủ cho ~42 node/4-5 cấp. Mỗi node = `<g>` gồm tên, chức danh, badge phòng ban/team, khung tròn initials (tái dùng cách fallback avatar hiện có nếu tìm thấy component tương tự, không thì tự vẽ initials đơn giản). Đường nối = `<path>`/`<line>` từ giữa-đáy cha tới giữa-đỉnh con. Cân nhắc tách `xmlEscape()` dùng chung ra `src/lib/svg-utils.ts` (đang bị lặp code ở `celebration-cards.ts` + `welcome-card.ts`) và dùng lại ở đây.
- **`src/app/(app)/orgchart/orgchart-client.tsx`** (mới, client): nhận SVG string từ server (`dangerouslySetInnerHTML` trong wrapper div) + 2 nút:
  - "Tải PNG": đọc `<svg>` trong DOM → `XMLSerializer` → vẽ lên `<canvas>` (scale 2x cho nét) → `canvas.toBlob()` → tải file, hoàn toàn client-side.
  - "In PDF": `window.print()` + CSS `@media print` (thêm vào `globals.css`) ẩn sidebar/header, co giãn SVG vừa trang — dùng tính năng "Save as PDF" có sẵn của trình duyệt/OS.
  - Cả 2 nút hiển thị cho mọi người xem trang (không gate thật) — ghi chú code rõ đây là nominal, đúng quy ước "chưa gate tính năng thật" xuyên suốt app; câu "áp dụng cho HR Manager" hiểu là ý nghĩa sử dụng (HR Manager là người cần dùng nhất), không phải kiểm soát truy cập kỹ thuật.
- i18n namespace `orgchart` mới (title, desc, downloadPng, printPdf...) + `nav.orgchart` — chèn `nav.orgchart` ngay sau `nav.kb` ở cả 2 file.

## Thứ tự triển khai (giữ app chạy được ở mỗi checkpoint)
1. **B trước tiên**: sửa fallback `current-staff.ts` → verify tsc.
2. **A**: schema thêm `gender/workLocation/managerId` → migration → deploy → generate → verify tsc (field chưa dùng, không lỗi).
3. **C**: viết lại toàn bộ khối tạo staff trong `seed.ts` theo đúng cấu trúc trên.
4. **D**: `migrate reset --force --skip-seed` → `db seed` → verify số liệu.
5. i18n: `settings.staff` keys mới + namespace `orgchart` + `nav.orgchart` (vi/en, parity script).
6. **E**: actions (`updateStaffStatus`, `deleteStaff`) + `staff-row.tsx` + `page.tsx` cập nhật.
7. **F**: `org-chart-svg.ts` (+ tách `svg-utils.ts` nếu làm) → `orgchart/page.tsx` → `orgchart-client.tsx` → nav → CSS print.
8. Verify toàn bộ.

## Verification
- `npx tsc --noEmit`, `npx eslint src` sạch; script Node diff key vi.json/en.json — 0 lệch (như mọi batch trước).
- Reseed xong, mở browser:
  - `/settings/staff`: đúng 42 dòng, toàn tên thật, đúng phòng ban/team/chức danh/role theo bảng mapping — không còn tên demo nào (`CEO TCM`, `thao@tcm.vn`...).
  - `/settings/roles`: `ACCOUNT_DIRECTOR`, `PLANNING_MANAGER`, `HR_STAFF` — 0 người giữ (để trống đúng thực tế); soát chéo vài role khác đúng theo `ROLE_MAP`.
  - `/orgchart`: NGUYỄN ĐẠO BÌNH là root duy nhất; NGUYỄN VĂN HOÀNG ngay dưới; soát 2-3 nhân viên lá (vd TRẦN THỊ KIM NHI dưới HỨA THỊ TRÂM ANH) đúng nhánh quản lý thật.
  - Bấm "Tải PNG" → file ảnh tải về không rỗng, mở xem đúng sơ đồ. Bấm "In PDF" → hộp thoại in mở, sơ đồ hiển thị đầy đủ (sidebar/header đã ẩn qua CSS print).
  - `/settings/staff`: thử deactivate chính mình (người đang act-as) → bị chặn đúng lỗi. Thử xóa 1 nhân sự chưa có hoạt động gì → xóa thành công. Thử xóa 1 nhân sự có trong nhóm chat "GIA ĐÌNH TCM" / có notification → xóa thành công (tự dọn RESTRICT trước), sau đó vào `/chat` và `/reminders` xác nhận KHÔNG lỗi (SET NULL/CASCADE đã tự xử lý đúng).

### File trọng yếu (batch này)
[prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · [src/lib/current-staff.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\current-staff.ts) · [src/app/(app)/settings/staff/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\staff\actions.ts) · [src/app/(app)/settings/staff/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\staff\page.tsx) · `src/app/(app)/settings/staff/staff-row.tsx` (mới) · `src/lib/org-chart-svg.ts` (mới) · `src/app/(app)/orgchart/page.tsx` + `orgchart-client.tsx` (mới) · [src/components/layout/nav-items.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\nav-items.ts) · [src/app/globals.css](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\globals.css) · messages/vi.json · messages/en.json. (Tham chiếu pattern: [src/lib/celebration-cards.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\celebration-cards.ts), [settings/warehouses/warehouse-row.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\settings\warehouses) cho row-action pattern.)

---

# BATCH: Chat (giải tán nhóm/1-1 · xóa thành viên · popup không bị che) + Workflow task nội bộ theo bộ phận (Planning/Operations/Production/Purchasing) sinh từ Master Timeline

## Context
Chủ dự án yêu cầu 4 nhóm chỉnh sửa:
1. **Chat**: (a) admin nhóm giải tán nhóm (đã có `disbandGroup` + confirm) — giữ; (b) chat 1-1: **1 trong 2 người** được giải tán (CHƯA có); (c) popup nút "…" của tin nhắn khi tin sát mép trên bị che — cần **tự lật xuống/kẹp trong viewport** (hiện `absolute bottom-full`, không lật); (d) admin **xóa 1 thành viên bất kỳ** khỏi nhóm (CHƯA có — hiện chỉ tự rời + phong admin).
2. **Fix bug Planning**: task tạo trong Master Timeline cho phòng Planning không tự sinh sang sub-module Planning. Nguyên nhân (đã xác minh code): `spawnPlanningJobForOrder` ([planning.ts:55]) **không đọc `order.items`** — chỉ tạo 1 job 3 stage cố định (Research/Design brief/Proposal), không biến từng dòng timeline thành task giao được. Creative làm đúng (`spawnTasksForCreativeOrder` [creative.ts:58] đọc `order.items`).
3. **Thêm tab "Production"** cạnh Operations + **chuyển "Nghiệm thu" (liquidation) ra cuối** hàng tab workspace dự án.
4. **Workflow nội bộ theo bộ phận**: các tab Planning/Operations/Production/Purchasing **tự sinh task đầu vào** từ Master Timeline hoặc từ Order của Account → lead giao xuống **từng nhân viên (theo tên/email)** → có deadline tracking → nhân viên làm xong **gửi kết quả (link) + số giờ (bội số 0.25h, tối thiểu 15 phút)**.

### Quyết định đã chốt với chủ dự án (AskUserQuestion)
1. **Phạm vi**: Planning + Operations + Production + **thêm tab Purchasing (PCC)** — đủ 5 bộ phận (Creative đã có riêng ở `/creative`, KHÔNG đụng).
2. **Thời điểm sinh task**: **giữ cổng "Gửi" ở tab Order** (dispatch) — task chỉ hiện sau khi Account/Leader bấm Gửi (nhất quán Creative). Không auto khi lưu timeline.
3. **Planning**: **giữ luồng Proposal cũ (Research→Design brief→Proposal + duyệt version)** + thêm mục "Task từ timeline" mới bên cạnh. KHÔNG thay thế.

### Ràng buộc nền tảng (đã xác minh 3 Explore)
- **Không có model task chung**: chỉ Creative (`CreativeTask`, giàu nhất) + Planning (`PlanningJob`/`Stage`/`Version`). PCC/OPE/PRO chỉ có `ProjectOrder` với 1 field `resultLinkUrl`/`resultSentAt`. ⇒ tạo model chung mới, KHÔNG đụng `CreativeTask` (giữ module Creative đang chạy).
- `ORDERABLE_DEPARTMENTS` ([projects.ts:15]) đã gồm PLANNING/CREATIVE/PCC/OPE/PRO/HR/IT. `dispatchOrder` ([project-orders.ts:101]) đã rẽ nhánh CREATIVE→spawnTasksForCreativeOrder, PLANNING→spawnPlanningJobForOrder. `ProjectOrderItem` (dòng gom từ timeline, `sourceTimelineItemId`) đã tổng quát. `markOrderItemDone` + `isTaskLocked`/`finishedGraceDaysLeft` ([creative.ts]) đã project-generic.
- Lock cascade gọi tay ở 3 chỗ bidding: NOGO ([bidding/actions.ts:254]), thua ([:632]), hủy ([:650]) — nơi gọi `lockCreativeTasksForProject`.
- Reminders no-cron: `checkCreativeTaskDeadlineReminders` ([reminders.ts:295]) — mẫu idempotent (cờ `deadlineReminderSentAt` trong WHERE, reset khi đổi deadline).
- Validate giờ (bội 0.25): `!Number.isFinite(h)||h<=0||!Number.isInteger(h*4)` ([creative/actions.ts:80]).
- Chat: `disbandGroup` (GROUP-only, chặn "GIA ĐÌNH TCM") + `leaveConversation` (GROUP-only) đã có; `promoteToAdmin` dùng `assertAdmin`. **Không có** `removeMember` / DIRECT delete. Popup "…" ở [chat-conversation.tsx:594-625] dùng `absolute bottom-full` (+ reaction picker :565, seen-by :522 cùng pattern). `MessageMention`/system events chưa có `MEMBER_REMOVED`.

---

## A) Data model (Prisma — migration additive `department_task_module`, KHÔNG reset DB)
Model mới `DepartmentTask` (mirror `CreativeTask`, thêm `department`; KHÔNG đụng CreativeTask):
```prisma
model DepartmentTask {
  id                      String    @id @default(cuid())
  projectId               String
  department              String    // PLANNING | PCC | OPE | PRO
  orderId                 String?   // ProjectOrder nguồn
  orderItemId             String?   // ProjectOrderItem (dòng timeline) — đẩy DONE khi DELIVERED
  orderedById             String?   // snapshot người ORDER (order.sentById ?? project.ownerId) — nơi trả kết quả
  sourceKey               String?   // idempotent: "TL:{sourceTimelineItemId ?? itemId}" | "ORDER:{orderId}"
  title                   String
  detail                  String?
  status                  String    @default("UNASSIGNED") // UNASSIGNED|ASSIGNED|SUBMITTED|REVISION|DELIVERED|CANCELED
  assigneeId              String?
  assignedById            String?
  assignedAt              DateTime?
  leadApprovalNotRequired Boolean   @default(false) // tick → GỬI thẳng cho người ORDER, không cần lead duyệt
  deadline                DateTime?
  deliverableLinkUrl      String?
  hoursSpent              Float?    // bội số 0.25
  submittedAt             DateTime?
  revisionCount           Int       @default(0)
  reviewedById            String?
  reviewedAt              DateTime?
  deliveredAt             DateTime?
  deadlineReminderSentAt  DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  // relations: project(Cascade), order(SetNull), orderItem(SetNull), orderedBy/assignee/assignedBy/reviewedBy Staff(SetNull)
  @@index([projectId, department, status]) @@index([assigneeId, status]) @@index([orderItemId]) @@map("department_task")
}
```
- Back-relations: `Project.departmentTasks`, `ProjectOrder.departmentTasks`, `ProjectOrderItem.departmentTasks`, `Staff` ×4 (assigned/assignedBy/reviewed/ordered).
- `Message.systemEvent` doc += `MEMBER_REMOVED`. `Notification.type` comment += `DEPT_TASK_ASSIGNED | DEPT_TASK_NEEDS_APPROVAL | DEPT_TASK_DELIVERED | DEPT_TASK_REVISION | DEPT_TASK_DEADLINE_REMINDER`.
- **Refactor nhỏ tránh import chéo Creative**: chuyển `isTaskLocked`/`finishedGraceDaysLeft`/`FINISHED_GRACE_DAYS` + `markOrderItemDone` sang `src/lib/projects.ts` (nhà project-generic), **re-export từ creative.ts** để không sửa caller Creative (zero behavior change).

## B) Lib `src/lib/department-tasks.ts` (thuần + IO, mirror creative.ts)
- Hằng `DEPARTMENT_TASK_STATUSES`, `ACTIVE_DEPARTMENT_TASK_STATUSES`, `DEPARTMENT_TASK_DEPARTMENTS = ["PLANNING","PCC","OPE","PRO"]`.
- **`spawnTasksForDepartmentOrder(orderId)`** — idempotent theo `(orderId, sourceKey)`: nạp order + `items`; mỗi `ProjectOrderItem` chưa có task → tạo `DepartmentTask(department=order.department, sourceKey="TL:{sourceTimelineItemId ?? id}", orderItemId=it.id, title=it.label, detail=it.detail, deadline=it.desiredReceiptAt, orderedById=order.sentById ?? project.ownerId, status:UNASSIGNED)`. **Nếu order KHÔNG có item nào** (order Account nhập tay, chỉ `outputRequest`) → tạo 1 task `sourceKey="ORDER:{orderId}"`, title từ `outputRequest`/`extraBriefInfo` → phủ "task từ phần giao việc của Account". Chỉ chạy khi `order.department ∈ DEPARTMENT_TASK_DEPARTMENTS`.
- `lockDepartmentTasksForProject(projectId)` — updateMany `notIn [DELIVERED,CANCELED]` → CANCELED.
- `getDepartmentTasks(projectId, department)` — IO cho board (include assignee/orderedBy + project.status để tính lock).

## C) Wire spawn + lock
- **`project-orders.ts dispatchOrder`**: sau nhánh CREATIVE/PLANNING hiện có, thêm `if (DEPARTMENT_TASK_DEPARTMENTS.includes(order.department)) await spawnTasksForDepartmentOrder(orderId)`. **Planning nhận CẢ HAI**: `spawnPlanningJobForOrder` (proposal) + `spawnTasksForDepartmentOrder` (task từ timeline) — đúng quyết định "giữ + thêm".
- **`bidding/order-actions.ts createDepartmentOrder`**: mirror — sau khi tạo order, nếu dept ∈ DEPARTMENT_TASK_DEPARTMENTS thì spawn (cho order gửi thẳng từ Bidding).
- **`projects/actions.ts addProjectOrderItem`**: thêm nhánh `!isDraft && dept ∈ DEPARTMENT_TASK_DEPARTMENTS` → re-spawn (mirror nhánh Creative đã có).
- **Lock**: gọi `lockDepartmentTasksForProject(projectId)` cạnh mọi lời gọi `lockCreativeTasksForProject` ([bidding/actions.ts] NOGO/thua/hủy). `markFinished` đã set `finishedAt` → grace tự áp qua `isTaskLocked`.

## D) Actions `src/app/(app)/projects/[id]/department-task-actions.ts` (department suy từ task, guard `isTaskLocked` trước mọi mutate — mẫu `loadUnlocked`)
- `assignDepartmentTask(taskId, formData)` — lead set `assigneeId` (staff của phòng đó), `deadline`, `leadApprovalNotRequired`; reset `deadlineReminderSentAt=null`; → ASSIGNED; notify assignee `DEPT_TASK_ASSIGNED`.
- `submitDepartmentTask(taskId, formData)` — NV set `deliverableLinkUrl` + `hoursSpent` (validate bội 0.25, >0); nếu `leadApprovalNotRequired` → DELIVERED + `markOrderItemDone` + notify `orderedById` `DEPT_TASK_DELIVERED`; ngược lại → SUBMITTED + notify `assignedById` `DEPT_TASK_NEEDS_APPROVAL`.
- `approveDepartmentTask(taskId)` — lead: SUBMITTED→DELIVERED + `markOrderItemDone` + notify orderer.
- `rejectDepartmentTask(taskId, formData)` — SUBMITTED→REVISION, `revisionCount++`, notify assignee `DEPT_TASK_REVISION` kèm note.
- `createDepartmentTask(projectId, department, formData)` / `deleteDepartmentTask(taskId)` (chỉ UNASSIGNED). Tất cả `revalidatePath` tab tương ứng + `/reminders`, ghi AuditLog.

## E) UI
- **Tabs** ([workspace-nav.tsx] TABS + [layout.tsx] `Labels`/`labels`): thứ tự mới `overview, timeline, orders, coce, planning, operations, production, purchasing, liquidation` (Production cạnh Operations, thêm Purchasing, **Nghiệm thu cuối cùng**). Thêm key `projects.nav.production` + `projects.nav.purchasing`.
- **Board dùng chung** `src/app/(app)/projects/[id]/department-task-board.tsx` (client, mirror [creative/task-board.tsx]): nhóm theo trạng thái; form theo vai:
  - UNASSIGNED → form giao: **select nhân viên (hiện Tên — email)** lọc `department.code === tab-dept` active, `DateField` deadline, checkbox "không cần lead duyệt" + nút Xóa.
  - ASSIGNED|REVISION → form GỬI: input `deliverableLinkUrl` + input `hoursSpent` (`type=number step=0.25 min=0.25 required`).
  - SUBMITTED → nút Duyệt + form Trả lại (note).
  - DELIVERED → link + giờ + ngày (readonly). Task locked → readonly + nhãn lý do (Cancel/Failed/hết grace Finished). Form "Tạo task lẻ" cho lead. Mobile cuộn ngang + note "xem trên máy tính".
- **Trang tab**:
  - `production/page.tsx` (mới), `purchasing/page.tsx` (mới): chỉ render board (department "PRO"/"PCC").
  - `operations/page.tsx`: thêm `<section>` board **phía trên** khối CTV hiện có (coexist — không đụng CTV Excel/Word).
  - `planning/page.tsx`: thêm `<section>` "Task từ timeline" (board department "PLANNING") **bên cạnh** luồng Proposal hiện có (giữ nguyên).

## F) Reminders/bell
- `checkDepartmentTaskDeadlineReminders()` + `getDepartmentTaskOverdueTasks(teamCode?)` — mirror bản Creative ([reminders.ts:295/264]): WHERE `deadline lte now` + status active + cờ null + `.filter(!isTaskLocked)`; notify assignee + assignedById; stamp cờ. Wire vào [layout.tsx] (cả 2 `Promise.all`) + section mới `/reminders`.

## G) Chat (4 việc)
- **(1) Giải tán nhóm + confirm**: ĐÃ CÓ (`disbandGroup` + `window.confirm(t("disbandGroupConfirm"))`). Giữ nguyên.
- **(2) Giải tán chat 1-1**: action mới `dissolveDirectConversation(conversationId)` — `assertMember` (bất kỳ 1 trong 2), type phải DIRECT, `conversation.delete` (cascade sạch cây), redirect `/chat`. UI: nút nhỏ (icon Trash) ở **header DIRECT** ([chat/[id]/page.tsx:173-210], hiện chưa có control nào) → `window.confirm(dissolveDirectConfirm)` → gọi action. i18n `dissolveDirect`/`dissolveDirectConfirm`.
- **(3) Popup "…" không bị che**: trong [chat-conversation.tsx], khi mở menu đo `buttonRef.getBoundingClientRect()` so viewport → chọn hướng dọc: đủ chỗ trên (`top >= ~ước lượng cao menu`) thì giữ `bottom-full` (mở lên), thiếu chỗ (tin sát mép trên) thì **mở xuống** `top-full` (đổi `mb-1`→`mt-1`); giữ logic lật ngang `mine?right-0:left-0`. Áp cùng cách cho reaction picker (:565) + seen-by (:522) để nhất quán. Không cần portal — chỉ đổi class theo state hướng tính lúc mở.
- **(4) Admin xóa thành viên bất kỳ**: action mới `removeMember(conversationId, staffId)` — `assertAdmin`, GROUP only, không cho tự xóa mình (dùng Leave), chặn xóa khi nhóm "GIA ĐÌNH TCM"; `conversationMember.delete` + `addSystemMessage(..., "MEMBER_REMOVED", tên)`. UI: nút "Xóa khỏi nhóm" cạnh nút Phong admin trong danh sách thành viên [group-manager.tsx:122-151] (chỉ hiện với admin, không hiện cho chính mình) + `window.confirm(removeMemberConfirm)`. Thêm `MEMBER_REMOVED` vào SystemLine renderer + i18n `removeMember`/`removeMemberConfirm`/`sysRemoved`.

## H) i18n
- `chat`: `dissolveDirect, dissolveDirectConfirm, removeMember, removeMemberConfirm, sysRemoved`.
- `projects.nav`: `production, purchasing`.
- Namespace mới `projects.deptTasks` (vi/en parity): tiêu đề board, nhãn 6 trạng thái, action giao/GỬI/duyệt/trả/tạo/xóa, field giờ/link/deadline/không-cần-duyệt, empty state, badge locked. Reminders section key. Title notification hardcode tiếng Việt (tiền lệ). Parity script 0 lệch.

## I) Seed
- Trên 1 dự án WORKING: gán vài `TimelineItem` cho PLANNING/OPE/PRO/PCC → dispatch order tương ứng → sinh `DepartmentTask` mẫu; set sẵn vài task ở các trạng thái (ASSIGNED/SUBMITTED/DELIVERED có giờ + revisionCount) để board có dữ liệu demo per-dept. Nhân sự các phòng đã có sẵn từ import 42 người.

## Thứ tự triển khai (giữ compile mỗi bước)
1. Schema `DepartmentTask` + relations + comment (systemEvent/Notification) → migration additive → generate → verify tsc.
2. Refactor chuyển `isTaskLocked`/`finishedGrace*`/`markOrderItemDone` sang `projects.ts` + re-export creative.ts → verify tsc (zero behavior change).
3. `src/lib/department-tasks.ts` (spawn/lock/get) → verify tsc.
4. Wire spawn (dispatchOrder + createDepartmentOrder + addProjectOrderItem) + lock (3 site bidding).
5. i18n (`projects.deptTasks` + `projects.nav.*` + chat keys) → parity.
6. `department-task-actions.ts` + `department-task-board.tsx`.
7. Tabs: workspace-nav + layout + `production/page.tsx` + `purchasing/page.tsx` + board vào operations/planning.
8. Reminders + bell + section.
9. Chat: `dissolveDirectConversation` + `removeMember` + popup flip + UI header DIRECT/group-manager + system MEMBER_REMOVED.
10. Seed mẫu → reseed.
11. Verify.

## Verification
- `npx tsc --noEmit` · `npx eslint src` · `npx next build` sạch; parity vi/en 0 lệch.
- Browser E2E (vi/en, desktop 1280 + mobile 375):
  - **Tabs**: mở dự án WORKING → thứ tự tab đúng (Production cạnh Operations, Purchasing sau đó, **Nghiệm thu cuối**).
  - **Fix Planning + workflow**: Master Timeline thêm 1 task gán PIC Planning + 1 gán PIC PRO/OPE/PCC → tab Orders bấm **Gửi** → mở tab Planning thấy mục "Task từ timeline" có task đó (proposal cũ vẫn còn); tab Production/Operations/Purchasing thấy task. Lead **giao cho 1 NV (chọn theo Tên — email)** → ASSIGNED, NV nhận notification. NV **GỬI** link + giờ 1.5 (chặn 1.3 lẻ ≠ bội 0.25) → SUBMITTED → lead **Trả lại** (REVISION, count=1) → NV GỬI lại → lead **Duyệt** → DELIVERED + dòng timeline nguồn chuyển DONE ở tab Orders + người ORDER nhận notification. Task tick "không cần lead duyệt" → GỬI thẳng DELIVERED.
  - **Order tay của Account** (không qua timeline): tạo department order từ Bidding → dispatch → sinh 1 task từ `outputRequest`.
  - **Lock**: đánh 1 dự án THUA/HỦY → task các phòng chuyển CANCELED readonly. FINISHED → còn sửa trong grace 7 ngày.
  - **Reminders**: set deadline quá hạn → layout render sinh đúng 1 notification (idempotent), bell +1, `/reminders` có section mới; dời deadline → nhắc lại được.
  - **Chat**: (2) mở chat 1-1 → nút giải tán ở header → confirm → xóa, về `/chat`, người kia cũng mất hội thoại. (3) mở menu "…" ở tin **sát mép trên** → popup mở xuống, hiện đủ không bị cắt (đo `getBoundingClientRect().top` của popup ≥ 0); tin ở giữa vẫn mở lên. (4) admin nhóm → danh sách thành viên có nút "Xóa khỏi nhóm" → confirm → thành viên biến mất + system message "đã xóa X"; non-admin không thấy nút.

### File trọng yếu (batch này)
[prisma/schema.prisma](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\schema.prisma) · [prisma/seed.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\prisma\seed.ts) · `src/lib/department-tasks.ts` (mới) · [src/lib/projects.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\projects.ts) (nhận lock/markOrderItemDone) · [src/lib/creative.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\creative.ts) (re-export) · [src/lib/project-orders.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\project-orders.ts) · [src/lib/reminders.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\reminders.ts) · [src/app/(app)/bidding/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\actions.ts) · [src/app/(app)/bidding/order-actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\order-actions.ts) · [src/app/(app)/projects/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\actions.ts) · `src/app/(app)/projects/[id]/department-task-actions.ts` + `department-task-board.tsx` (mới) · `src/app/(app)/projects/[id]/production/page.tsx` + `purchasing/page.tsx` (mới) · [projects/[id]/operations/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\operations) · [projects/[id]/planning/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\planning) · [workspace-nav.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\workspace-nav.tsx) · [projects/[id]/layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\projects\[id]\layout.tsx) · [chat/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\chat\actions.ts) · [chat/[id]/page.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\chat\[id]\page.tsx) · [chat-conversation.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\chat\chat-conversation.tsx) · [group-manager.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\chat\group-manager.tsx) · messages/vi.json · messages/en.json. (Mirror: [creative/task-board.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\creative\task-board.tsx), [creative.ts spawnTasksForCreativeOrder](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\creative.ts).)

---

# BATCH: FIX giao diện MOBILE hỏng (drawer bị nhốt trong header) + hardening viewport + rà soát mobile toàn app

## Context
Sau khi deploy live (`http://192.168.1.111:3000`, đang test qua `app.tcmbtl.com`), giao diện trên điện thoại (cả iOS Safari lẫn Android Chrome) bị vỡ: menu mobile mở ra nhưng backdrop mờ chỉ phủ dải trên cùng, panel trắng chỉ cao ~64px, chữ nav ("Thiết lập hệ thống", "Tổng quan"…) tràn ra ngoài đè lên tiêu đề trang. Nhân viên hiện trường dùng mobile là chính → phải fix trước khi vận hành rộng.

## Nguyên nhân gốc (đã xác minh code, không suy đoán)
[header.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\header.tsx): mobile drawer (`<div className="fixed inset-0 z-40 lg:hidden">`, dòng 81-96) nằm **BÊN TRONG** thẻ `<header>` có class `backdrop-blur` (dòng 33). Theo spec CSS Filter Effects, `backdrop-filter` (và `filter`/`transform`) biến phần tử thành **containing block cho mọi descendant `position: fixed`** → `fixed inset-0` của drawer bị tính theo khung header (cao 64px, sticky) thay vì viewport. Hệ quả đúng như ảnh chụp: backdrop `bg-black/40` chỉ phủ đúng dải header; panel `absolute inset-y-0` chỉ cao 64px; `SidebarContent` (h-full = 64px) tràn nội dung ra ngoài không nền → chữ nav đè lên `<h1>` của trang. Cả iOS lẫn Android đều cùng hành vi vì cùng implement rule containing-block này.

Đã grep toàn `src/`: các `fixed inset-0` khác (chat dialogs, item-picker inventory, schedule-grid staff) đều nằm trong `<main>` không có ancestor mang `backdrop-blur`/`transform`/`filter` → KHÔNG bị lỗi này, không đụng. `(guest)/layout.tsx` header cũng có `backdrop-blur` nhưng không chứa fixed-descendant nào → chỉ cần lưu ý, không sửa.

Phát hiện phụ: app **không có `export const viewport`** ở root layout (dựa hoàn toàn vào default của Next) — thêm tường minh để hardening.

## Fix 1 — Đưa drawer ra NGOÀI `<header>` (fix chính, cấu trúc)
[src/components/layout/header.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\header.tsx): bọc return trong fragment `<>…</>`; giữ nguyên `<header>` (dòng 33-79, gồm cả banner impersonating) và **chuyển khối drawer (dòng 81-96) ra sau `</header>`**, thành sibling. Không đổi bất kỳ class nào của drawer (`fixed inset-0 z-40 lg:hidden` + backdrop + panel `w-72 bg-surface`) — cấu trúc drawer vốn đúng, chỉ sai chỗ đặt. Ancestor mới của drawer là các `<div>` flex thuần trong `(app)/layout.tsx` (không filter/transform) → `fixed` hoạt động theo viewport đúng chuẩn.

## Fix 2 — Viewport export tường minh (hardening)
[src/app/layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\layout.tsx): thêm `export const viewport: Viewport = { width: "device-width", initialScale: 1 };` (import type từ `next`). Không đổi gì khác.

## Fix 3 — Rà soát mobile toàn app sau fix (verification sweep, chỉ sửa nếu phát hiện lỗi thật)
Chạy dev server + Claude Browser ở **375×812 (mobile preset)**, cả light/dark, đi qua các trang chính: `/` (dashboard), `/clients`, `/bidding`, `/projects/[id]` (workspace rail ngang), `/creative`, `/finance`, `/inventory` (module mobile-first), `/staff`, `/chat`, `/reminders`, `/settings`. Với mỗi trang kiểm: (a) mở/đóng drawer hoạt động — backdrop phủ toàn màn, panel cao full, bấm nav điều hướng + tự đóng; (b) không tràn ngang body (bảng phải cuộn trong wrapper `overflow-x-auto` riêng); (c) header đặc, không lộ nội dung xuyên qua. Lỗi phát sinh (nếu có) sửa tại chỗ theo pattern sẵn có (`sm:hidden` card / `overflow-x-auto`) — KHÔNG redesign gì thêm.

## Deploy lên server live
Sau khi verify local: copy 2 file đổi (`header.tsx`, `app/layout.tsx` + file nào sửa thêm ở Fix 3) lên server qua tar-over-ssh như quy trình đã dùng, `npm run build` trên server, `pm2 restart tcm-crm`. Người dùng kiểm lại trên điện thoại thật (iOS + Android).

## Verification
- `npx tsc --noEmit` + `npx eslint src` sạch (không đụng i18n — không cần parity).
- Browser E2E mobile 375: drawer mở phủ toàn màn có backdrop, đóng bằng backdrop/X/nav-click; "Tổng quan" không còn bị chữ đè; lặp lại ở dark mode; desktop 1280 không hồi quy (sidebar resize vẫn hoạt động).
- Sau deploy: user xác nhận trên điện thoại thật qua app.tcmbtl.com.

### File trọng yếu
[src/components/layout/header.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\components\layout\header.tsx) (fix chính — chuyển drawer ra ngoài header) · [src/app/layout.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\layout.tsx) (viewport export) · các file phát sinh từ sweep Fix 3 (nếu có).

---

# ĐÁNH GIÁ: Khả năng import "hoàn chỉnh" file CO/CE thật (AMHL — T012AHL26A1) vào CRM

> **Đây là tài liệu ĐÁNH GIÁ KHẢ THI + KHUYẾN NGHỊ — chưa code gì.** Chủ dự án chọn: (1) chỉ đánh giá khả thi, (2) coi cả 2 dự án (Black Friday + Christmas Décor) là **1 Project gộp 1 CO/CE**. Nguồn: `D:\TCM\OneDrive - TCM\Sales\Customer\Aon\T012AHL26A1_TCM_CECO_AMHL_Christmas Decor.xlsx`.

## Context — Vì sao đánh giá
Trước khi mất công viết trình import Excel→CO/CE, cần biết model CO/CE hiện tại của CRM có "chứa" nổi một file báo giá THẬT của TCM hay không, và mức độ mất mát dữ liệu khi import. File này là báo giá thật (form BM02/QT.TCM.15), rất giàu cấu trúc → là phép thử tốt nhất.

## A. File thật gồm gì (đã đọc kỹ 6 sheet)
- **1 workbook = 1 chương trình, 2 dự án** dùng chung mã `T012AHL26A1`, khách **AMHL**, team **ACC1**, PIC **Hồng Phước**, địa điểm Hạ Long, 11–12/2026.
- **3 sheet nhìn thấy:** `Xmas Decoration` (CE 2.055 tỷ), `Black Friday` (CE 509tr), `TỔNG HỢP` (gộp 2 dự án thành 1 báo giá, margin gộp **32.48%**).
- **3 sheet ẩn:** `Danh muc` (danh mục 11 khoản mục chi phí DA001–DA011), `BM05_DT Chi phí Field` + `BM06_DT Chi phí khác` (2 form dự toán chi phí nội bộ chi tiết — nhiều `#REF!`, gần như trống, là công cụ phụ trợ).
- **Mỗi sheet dự án = bảng CE|CO song song:**
  - CE (cột A–I, "BÁO GIÁ" cho khách): STT · Hạng mục · Mô tả (song ngữ dài) · Kích thước · ĐVT · SL · Đơn giá · **Thành tiền (=SL×ĐG)** · Ghi chú.
  - CO (cột K–X, chi phí nội bộ): SL · Đơn giá · Thành tiền · **VAT 8% · TNCN 10% · TNDN 20%** · Total · PIC · Document · **Supplier** · Payment · Note · **Item Code (tự sinh = mã-NN)**.
  - **3 cấp:** Mục La Mã (I/II/III/IV) → nhóm con (vd "Center Court", "Model Kids", "Black Friday gifts") → dòng.
  - Footer: Tổng CE → **Phí agency 10% (cộng trên CE)** → CE trước VAT → VAT 8% → CE gồm VAT; khối CO: CO−VAT, **Chi hộ**, CO tính thưởng, CE tính thưởng, **Margin = (CE_thưởng − CO_thưởng)/CE_thưởng**.

## B. Model CO/CE hiện tại của CRM chứa được gì (đã xác minh code)
- `CostSheet` (1 bản `CTRACT`/dự án): `ceTotal` (1 SỐ tổng cấp bảng), `coTotal`, `chiHo`, `vatPct`, `mgmtFeePct`, `contingencyPct`, `discountPct`, `minMarginPct=31`, override. [prisma/schema.prisma:801].
- `CostSheetSection`: code, nameVi/nameEn, **`isProxy`** (chi hộ) + proxyFeeType/Val, sort. [schema:873].
- `CostLine`: `lineType` (QTY_PRICE|FIXED|PERCENT_OF_TOTAL), itemName, specs, quantity, unit, **`unitPrice` (CHỈ chi phí nội bộ CO)**, fixedAmount, percentVal, amount(computed), vendorId, isLocked, maxMarkupPct, note. [schema:892].
- Công thức: `computeCostSheetTotals` (coTotal, chiHo) + `computeMarginPct(ce,co)`; make-up engine suy CE **từ CO × markup**. [src/lib/bidding.ts:48/62/139]. Payload lưu: `costSheetPayloadSchema` (sections + lines phẳng). [validators/costsheet.ts].
- Đã có **pattern import Excel tái dùng được** (upload → parse → xem trước → xác nhận) ở module Khách hàng: `parseClientsExcel` + action 2-mode `importClientsFromExcel` + form `ImportClientForm`. **Nhưng CHƯA có trình parse CO/CE nào.**

## C. Bảng đối chiếu (Excel → CRM)
| Đặc điểm trong file | CRM có? | Kết luận |
|---|---|---|
| Mục lớn I/II/III/IV | `CostSheetSection` | ✅ khớp thẳng |
| Dòng: tên/quy cách/ĐVT/SL/ghi chú | `CostLine` | ✅ khớp thẳng |
| **Chi phí nội bộ CO/dòng (SL×ĐG=Thành tiền)** | `quantity × unitPrice = amount` | ✅ khớp thẳng |
| Margin gate 31% + override | `minMarginPct` + override | ✅ khớp |
| Chi hộ | `Section.isProxy` + fee | ⚠️ được, nhưng file đánh chi hộ theo **1 dòng/1 nhóm con** (con trỏ `Q99=H50`, `Q85=H71`), phải gom lại thành 1 *section* Chi hộ riêng |
| Supplier (tên NCC dạng chữ) | `CostLine.vendorId` (khớp theo id, KHÔNG tự tạo) | ⚠️ phải map chữ→vendor id thủ công |
| **Giá bán CE theo TỪNG DÒNG (SL×ĐG=Thành tiền cột H)** | ❌ Không có CE/dòng — CE chỉ là **1 số tổng** cấp bảng | ❌ **VƯỚNG LỚN** |
| **Phân cấp 3 tầng (mục→nhóm con→dòng)** | ❌ chỉ 2 tầng (section→line) | ⚠️ phải "ép phẳng" tầng 3 vào tên nhóm/tên dòng |
| **Thuế theo dòng VAT/TNCN/TNDN** | ❌ chỉ VAT cấp bảng | ⚠️ mất chi tiết thuế/dòng |
| **1 dòng CE tách ra nhiều dòng CO** (vd tiết mục = đồng ca+phối nhạc+biên đạo+trang phục) | ❌ 1 dòng = 1 amount | ⚠️ phải gộp nhiều dòng CO thành 1, hoặc tách CE — đằng nào cũng méo |
| **FOC/giảm giá nhét thẳng vào công thức ô** (`=G15*F15-15000000`, `*70%`, `*50%`) | ❌ không có giảm giá/dòng | ⚠️ chỉ đọc được KẾT QUẢ, mất ý nghĩa "FOC 30%" |
| **Dòng "Optional"** (phương án thay thế, KHÔNG cộng tổng) | ❌ mọi dòng đều cộng | ⚠️ phải nhận diện & loại/đánh dấu, nếu không sẽ cộng dư |
| Phí agency 10% (cộng **trên CE**) | `mgmtFeePct` (nhưng cộng **trên CO**) | ⚠️ khác vị trí bản chất |
| Item Code, PIC, Document, Payment/dòng | ❌ không có cột | ➖ bỏ được (phụ) |
| Mô tả song ngữ VI/EN | 1 ô `specs` | ⚠️ phải nối chuỗi |
| 2 dự án trong 1 file | user chọn gộp 1 Project | ✅ theo lựa chọn — gộp section 2 sheet vào 1 CostSheet |
| Layout tự do, **2 sheet đặt nhãn header khác nhau**, merged-cell khác nhau | parser cột cố định (như clients) | ⚠️ parser dễ gãy nếu file lệch mẫu |

## D. Kết luận khả thi
**Import "HOÀN CHỈNH" (tự động, không mất mát, khớp 100%) = KHÔNG khả thi** với (model CRM hiện tại) × (file freeform hiện tại). 5 điểm chặn cứng:
1. **Không có CE theo dòng.** File hand-price CE độc lập từng dòng (markup mỗi dòng chênh nhau 20–40%, không theo 1 tỉ lệ) → make-up engine "CE = CO×markup đều" của CRM **không tái tạo được** báo giá này. Import chỉ giữ được 1 số CE tổng, **mất toàn bộ bảng giá CE chi tiết cho khách**.
2. **Chỉ 2 tầng** vs file 3 tầng → phải ép phẳng, mất cấu trúc nhóm con.
3. **Không có thuế/dòng** (VAT/TNCN/TNDN) → mất khối thuế nội bộ.
4. **Quan hệ 1 CE → N CO** không biểu diễn được 1:1.
5. File là **báo giá tự do do người soạn tay** (FOC nhét công thức, dòng Optional, 2 sheet khác mẫu) → parser cột-cố-định kiểu clients-import **dễ gãy**, không "hoàn chỉnh" tự động được.

**Ngược lại, import HỖ TRỢ (đỡ ~80% công gõ, rồi account chỉnh tay) = KHẢ THI.** Giữ được: sections + dòng (tên/quy cách/ĐVT/SL) + **chi phí nội bộ CO/dòng** + note + gợi ý chi hộ + đặt `ceTotal` = tổng CE trong file. Phần CE/dòng có thể nhét tạm vào `note` để không mất thông tin.

## E. Khuyến nghị (3 hướng — nên chọn A hoặc A+C)
- **Hướng A — Chuẩn hoá mẫu báo giá trước (khuyến nghị nếu muốn dùng lâu dài).** Khoá form BM02 về layout cột-cố-định: bỏ FOC nhét-công-thức (tách cột "giảm %"), thêm cột cờ "Chi hộ"/"Optional", thống nhất header 2 sheet. Khi nguồn sạch → parser mới import **gần trọn vẹn**. Chi phí: kỷ luật phía Account khi lập báo giá, không phải code lớn.
- **Hướng C — Trình import HỖ TRỢ (không đổi schema).** Viết `parseCostSheetExcel` + trang xem-trước/xác-nhận **tái dùng nguyên pattern `clients-import`** ([src/lib/clients-import.ts], [clients/import/*]); commit dùng lại logic `saveCostSheet`. Chấp nhận các mất mát ở mục C. Đây là cách rẻ, nhanh, thực dụng — nhưng vẫn **không phải "hoàn chỉnh"**, account phải soát lại (nhất là CE/dòng, dòng Optional, gộp 1:N).
- **Hướng B — Mở rộng model CRM** (thêm CE/dòng + tầng 3 + thuế/dòng): **KHÔNG khuyến nghị.** Đụng schema `CostLine`/`CostSheet`, viết lại builder + toàn bộ công thức margin/make-up + revision + diff → rủi ro cao, và **mâu thuẫn triết lý** make-up engine (CE suy từ CO). Chỉ nên làm nếu "CE chi tiết theo dòng" là yêu cầu nghiệp vụ bắt buộc phải lưu trong CRM.

**Đề xuất gọn:** trước mắt coi file như **tài liệu đính kèm** (link/upload ở CO/CE hoặc KB) để không mất bản gốc; nếu cần dữ liệu sống trong CRM thì đi **A + C** (chuẩn hoá mẫu rồi import hỗ trợ), tránh B. Việc "gộp 2 dự án thành 1 CO/CE" (lựa chọn của chủ dự án) hoàn toàn làm được ở cả A/C — chỉ cần nối section của 2 sheet, đặt tên section có tiền tố "BF —" / "Xmas —" để vẫn phân biệt.

---

# BATCH: Nạp file CECO LIQUID thật (LOF/KUN — T016LOF26A3 "KUN ĐƯỜNG TRƯỢT 10 TỈNH" Phase 1 nghiệm thu 5 tỉnh) vào CO/CE Phase 1 trên dev

## Context
Sau khi nạp thành công 2 sheet file AMHL (T005/T006), chủ dự án đưa tiếp file **liquidation** thật: `D:\TCM\OneDrive - TCM\Sales\Customer\LOF\(inter TCM)_T016LOF26A3_CECO_LIQUID PHASE 1_KUN DUONG TRUOT 10 TINH_20Jul (Ha input).xlsx` — bản CO/CE nghiệm thu Stage 1 (5 tỉnh đầu) của dự án KUN ĐƯỜNG TRƯỢT 10 TỈNH (CRM: **T013LO226A3**, status PROCESSING). Câu hỏi: format CO/CE Phase 1 có đủ "capacity" tiếp nhận dạng này không → **CÓ, với các mất mát đã biết** (đánh giá dưới). Được duyệt nạp theo phương án **2 revision (HĐ phase 1 → Nghiệm thu)** + đổi tên dự án thành "KUN ĐƯỜNG TRƯỢT 10 TỈNH - PHASE 1: 5 TỈNH".

## Cấu trúc file (đã đọc kỹ, số đã đối soát)
- 9 sheet; dữ liệu nằm ở **"Tong hop"** (tổng 4 gói) + **4 sheet chi tiết**: `BG mat bang`, `BG van hanh`, `BG POSM`, `BG duong truot`. Bỏ qua: Timeline dự kiến, DS địa điểm (hidden), Int_OPE - Policy, Bang code du an.
- Mỗi sheet chi tiết có **6 khối cột song song**/dòng: Báo giá R1 (14.3.26) → HĐ tổng 10 tỉnh → CO triển khai 10 tỉnh → **HĐ phase 1 - 5 tỉnh** (AI-AR) → **Nghiệm thu phase 1 - 5 tỉnh** (AS-AX, có cột Chênh lệch) → **CO nghiệm thu 5 tỉnh** (AZ-BP, có VAT 8%/TNCN 10%/TNDN 20% theo dòng + PIC/Chứng từ/Supplier/PAYMENT/PID).
- ⚠️ **Cột lệch giữa các sheet** (đã map thủ công): POSM khối CO-NT bắt đầu **AY** (không phải AZ); POSM + duong truot **không có cột TNDN**; duong truot dùng "Số bộ/show" thay "Số tỉnh". Parser phải dùng column-map riêng từng sheet.
- Phân cấp 4 mức: Gói (sheet) → Mục La Mã (SEC) → nhóm con → dòng (một số item có sub-dòng) — **vừa khít MAX_SECTION_DEPTH=4**.
- **Quy ước thuế của file TRÙNG KHỚP Phase 1**: "CO tính KPI" = CO pre-tax + TNCN gross-up (÷0,9) + TNDN gross-up (÷0,8), **KHÔNG cộng VAT đầu vào**. Đã đối soát từng gói: Mặt bằng 1.555,64M ✓, Vận hành 2.013,06M ✓, POSM 574,58M ✓, Đường trượt lệch 7M (980M leaf vs 973M tổng hợp — 1 dòng cần soát khi parse, nghi có dòng không tính/điều chỉnh).
- 2 dòng CO đặc biệt cấp tổng: **Com 3% Vận hành + sản xuất** (153.389.816) + **dự phòng Thuế 1,5% doanh thu** (113.367.274) → nhập thành 2 dòng **FIXED** trong section riêng "Điều chỉnh CO" (không dùng PERCENT_OF_TOTAL vì base của nó là directCo, không phải doanh thu).
- Tổng chốt: **CO NT = 5.383.039.979** · **CE NT (CE tính KPI, gồm agency 10%, chưa VAT) = 7.557.818.277** · margin **28,78%** (<31% → cần override note khi lưu) · Phát sinh CE so HĐ = +286.848.222. Bản HĐ phase 1: CE = 7.270.970.055; CO HĐ không có khối riêng đầy đủ → **revision 1 dùng cột HĐ phase 1 (AN-AQ) cho CE-side và lấy CO = cùng dòng CO-NT** là SAI; đúng hơn: rev 1 chỉ khác CE/SL/đơn giá phía nghiệm thu — thực tế file chỉ có 1 khối CO (CO nghiệm thu). **Chốt cách nạp rev 1**: dòng = khối "HĐ phase 1" (SL AN × tỉnh AO × đơn giá AP), thuế suy từ khối CO-NT cùng dòng (cùng loại), ceTotal = 7.270.970.055; rev 2 = khối "Nghiệm thu" + CO-NT như trên, ceTotal = 7.557.818.277. Diff 2 revision trong CRM sẽ hiện đúng các dòng đổi SL/tiền.

## Đánh giá capacity (kết luận cho chủ dự án)
**CHỨA ĐƯỢC**: hierarchy 4 cấp (vừa khít); thuế 3 loại theo dòng (trùng quy ước); tổng CO khớp công thức Phase 1; Com/dự phòng → dòng FIXED; câu chuyện HĐ→NT phát sinh → cơ chế CostSheetRevision + tab So sánh có sẵn.
**MẤT MÁT (như AMHL, chấp nhận)**: CE theo dòng + cột Chênh lệch/dòng (chỉ giữ ceTotal + diff revision); cột "Số tỉnh"/"Số bộ/show" → quantity = SL×tỉnh, ghi gốc vào specs; 4 khối so sánh lịch sử (R1/HĐ10 tỉnh/CO10 tỉnh) bỏ; PID/PIC/Chứng từ/Supplier/PAYMENT/Hình ảnh → nhét note hoặc bỏ; CostSheet.version vẫn CTRACT (enum LIQUID chưa dùng trong app — bản chất liquidation thể hiện qua revisions + sentToLiquidation flow).

## Cách làm (mirror đúng quy trình đã dùng cho AMHL trong session này)
1. Script scratch (nằm repo root, xóa sau khi xong) dùng `exceljs` parse 4 sheet chi tiết theo column-map riêng từng sheet; nhận diện SEC/nhóm/dòng lá (lá = có đơn giá + thành tiền; subtotal không có đơn giá); build 2 payload (rev HĐ, rev NT): sections 4 cấp (root = 4 gói + "Điều chỉnh CO"), lines với taxType suy từ cột thuế >0 (ưu tiên TNCN rồi TNDN, mặc định VAT).
2. Đối soát: coTotal payload NT phải = 5.383.039.979 (±7M đường trượt — in cảnh báo dòng lệch); rev HĐ tổng CE = 7.270.970.055.
3. Ghi DB bằng Prisma script **nhân bản đúng logic `saveCostSheet`** ([bidding/actions.ts:271]) như đã làm với AMHL: transaction (upsert CostSheet CTRACT của T013 + replace sections/lines 3-pass parentSectionId + AuditLog + CostSheetRevision). Chạy 2 lần: lần 1 payload HĐ (revision N, ghi note "HĐ phase 1 - 5 tỉnh"), lần 2 payload NT (revision N+1, note "Nghiệm thu phase 1 - 5 tỉnh"; bản sống = NT). Margin < 31% → set marginOverrideById + note nguồn file.
4. Đổi tên dự án T013: `prisma.project.update({ name: "KUN ĐƯỜNG TRƯỢT 10 TỈNH - PHASE 1: 5 TỈNH" })`.
5. Verify browser (dev server đang chạy): mở `/bidding/[T013 id]` — cây 4 cấp render, thuế đúng, Tổng CO = 5.383.039.979; tab CO/CE trong `/projects/[id]/co-ce` — Lịch sử phiên bản có 2 revision mới, bấm **So sánh** HĐ↔NT → bảng diff hiện dòng phát sinh (đối chiếu vài dòng với cột Chênh lệch trong file, vd Vận hành +166,19M). Xóa script scratch.

## Không đụng code app
Toàn bộ là nạp dữ liệu dev + rename 1 project — không sửa schema/UI/i18n; không deploy production.

---

## Nếu sau này chọn build (Hướng C) — phác thảo tái dùng (CHƯA làm)
- `src/lib/costsheet-import.ts`: `parseCostSheetExcel(buffer)` — quét theo dòng, nhận diện dòng-section (STT La Mã) / dòng-nhóm-con (có subtotal, không có đơn giá) / dòng-thường; map cột A–X; ép phẳng tầng 3 vào `itemName` ("Nhóm con — Item"); gom nhóm "Chi hộ" thành 1 section `isProxy`; nhét CE/dòng + Item Code + Supplier vào `note`. Trả `{fatalError, sections, lines, warnings}` (2 tầng lỗi như clients).
- Action 2-mode + trang `bidding/[id]/costsheet-import` (hoặc trong tab CO/CE) tái dùng `ImportClientForm` pattern; **commit gọi lại đúng `saveCostSheet`** (không viết đường ghi riêng) → tự có margin gate, revision, audit.
- Verify: import file AMHL → xem-trước đúng số section/dòng, `coTotal` khớp `Q98`/`Q84`, cảnh báo rõ các dòng Optional/1:N/FOC; xác nhận → mở builder soát tay; `tsc/eslint/build` sạch.

### File tham chiếu (khi build)
[src/lib/clients-import.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\clients-import.ts) · [src/app/(app)/clients/import/actions.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\clients\import\actions.ts) · [import-client-form.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\clients\import\import-client-form.tsx) · [src/lib/bidding.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\bidding.ts) · [src/lib/validators/costsheet.ts](D:\TCM\TCM_AI_CRM\TCM_CRM\src\lib\validators\costsheet.ts) · [bidding/actions.ts saveCostSheet](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\actions.ts) · [cost-sheet-builder.tsx](D:\TCM\TCM_AI_CRM\TCM_CRM\src\app\(app)\bidding\cost-sheet-builder.tsx).


---

# BATCH: Kho v2 — K1 (nền lô/mã/cây danh mục) — 27/07/2026

Spec chủ dự án 27/07 (4 phần: I nhóm hàng · II mã item · III chỉ số lượng · IV workflow a–e) thay đổi lớn
module ⑧. Flow chart thiết kế + 7 quyết định đã chốt với chủ dự án TRƯỚC khi code (artifact
"Kho v2 — Flow chart thiết kế"). Thực thi chia 4 đợt K1→K4; đây là K1.

## 7 quyết định chủ dự án đã chốt (27/07/2026)

1. **Khối "Loại" trong mã = 1 KÝ TỰ nhóm gốc** → mã chuẩn `P.R.B.DHG.001` (đúng dòng format mẫu
   `X.X.X.XXX.001`; câu chữ "3 ký tự đầu" trong spec bị loại). Nhóm con KHÔNG nằm trong mã — chỉ là
   thuộc tính lọc theo cây.
2. **Tách lô:** brand new / second-hand không bao giờ chung một mã. Đổi trạng thái/tình trạng = PHIẾU
   CHUYỂN ĐỔI chạy số lượng giữa 2 mã (mã luôn nói đúng sự thật về hàng; dùng lại nguyên guard chống âm).
3. **Duyệt giữ chỗ kho → CO:** MỘT trong hai (Kế toán hoặc HR Manager) là đủ; gắn qua ma trận quyền,
   không hardcode tên người.
4. **Dòng CO giá 0 chèn QUA BUILDER** (panel "Kho đã duyệt" + nút chèn, SL khóa theo mức duyệt) — vì
   saveCostSheet xóa-tạo-lại toàn bộ dòng, hệ thống tự ghi ngoài builder sẽ mất dòng khi lưu tiếp.
5. **Báo giá BM02 gộp cặp dòng** (kho giá 0 + mua bù) thành MỘT dòng khách nhìn: SL tổng, thành tiền =
   phân bổ make-up của cặp, đơn giá = thành tiền ÷ SL tổng. Khách không thấy dòng 0 đồng.
6. **Hàng mua giao thẳng site KHÔNG nhập kho lúc mua.** Hết event mang về mới nhập — thủ kho khai đúng
   trạng thái/tình trạng THỰC TẾ lúc về (mã lô mới). Nguyên tắc áp chung cho mọi lần đồ quay về kho.
7. **Điều chuyển:** có phiếu chuyển holding trực tiếp hiện trường dự án A → B (2 bước gửi/nhận); duyệt =
   PIC/AD-AM khi gắn dự án, OPE Manager khi kho ↔ kho thuần.

Mặc định kèm theo: hàng TCM mang khối `TCM`; seq 001–999 đếm riêng theo từng tổ hợp 5 khối; kỳ chiến
dịch quá 15 ngày chặn mở ngày mới; cảnh báo date vàng ≤90 / cam ≤60 / đỏ ≤30 ngày, hết hạn chặn xuất
dùng chỉ còn xuất hủy; role mới THỦ KHO (K2).

## K1 đã làm (nguyên tắc: tầng mới đặt LÊN sổ cái bất biến, toán tồn kho giữ nguyên 100%)

- **Schema** (migration `20260727230000_kho_v2_k1_category_tree_lot_fields`, additive): bảng
  `inventory_category_node` (cây ≤3 cấp, code 1 ký tự CHỈ ở gốc, isClientOwned ở gốc, không xóa — chỉ
  isActive); InventoryItem +8 cột lô (catNodeId, statusCode, conditionCode, ownerClientId,
  boundProjectId, expiryDate, clientDocNo, seq — đều nullable); StockDocumentLine +convertToItemId;
  StockDocument nhận 2 type mới CONVERT/DESTROY. `categoryId` (OptionItem) deprecated giữ cột.
- **lib/inventory-lot.ts** (thuần, không import — tách khỏi inventory.ts để CSV parser không kéo prisma):
  ITEM_STATUS_CODES R/P/C/W/L/D · ITEM_CONDITION_CODES B/P/S · buildItemCode/itemCodePrefix ·
  expiryLevel (UTC-midnight; EXPIRED khi qua ngày). inventory.ts re-export + nextItemSeq (max seq của
  tổ hợp đọc từ code, retry P2002, >999 = SEQ_FULL) + resolveRootCategory + getCategoryTree.
- **Phiếu CONVERT (CD):** đổi trạng thái/tình trạng; lô đích tự match (tên+node+khách+dự án ràng+hạn
  dùng+partCount, isActive) hoặc tạo mới với seq kế tiếp; bộ tách phần chọn CẤP CHA chuyển cả bộ (mỗi
  phần một dòng ledger, số lượng = số bộ); debit nguồn + credit đích CÙNG kho trong 1 transaction.
- **Phiếu DESTROY (XH):** 1 bước, bắt buộc lý do — đường ra duy nhất cho hàng hết hạn/trạng thái D.
  createIssueDoc CHẶN item có expiryDate đã qua (errorExpired liệt kê mã).
- **UI:** form item = form LÔ (chọn node cây → hiện điều kiện: gốc isClientOwned bắt buộc khách + hiện
  expiry/số phiếu KH; trạng thái C bắt buộc khách; P bắt buộc dự án; preview mã live); edit khóa các
  khối nằm trong mã; trang items + tồn kho lọc theo nhánh cây/trạng thái/tình trạng/khách + badge date;
  /settings/inventory-categories CRUD cây (code gốc bất biến, chặn tắt node còn con active, không xóa).
- **CSV import viết lại theo LÔ:** bỏ cột "Mã"; cột mới Nhóm (code gốc hoặc tên node) / Trạng thái /
  Tình trạng / Mã KH / Hạn dùng / Số phiếu KH; các dòng cùng lô ở nhiều kho GOM về một mã (lotKey),
  mỗi kho một phiếu NK; trạng thái P không cho qua CSV (cần gắn dự án — nhập tay). All-or-nothing giữ nguyên.
- **Seed:** BỎ item + phiếu demo format cũ (thành rác trên scheme mới); thêm cây 7 nhóm đúng spec
  (P: Booth[cụm/sàn/backdrop/standee]/Kệ/Cổng chào · E: LED-TV/Âm thanh/Ánh sáng · G · C · L ·
  M[hàng project/quà tặng, isClientOwned] · O) — idempotent theo (parentId, name), 19 node.

## Verify K1 (browser thật, dọn sạch sau)

Tạo lô UI → `C.R.B.TCM.001` đúng seq; lô khách DHG + date → `M.C.B.DHG.001` (expiry UTC midnight,
PXK-TEST-1); CSV 2 dòng cùng lô 2 kho → MỘT mã `M.C.B.DHG.002` + 2 phiếu NK (HCM 10 / ĐN 5); phiếu NK
UI +50; ISSUE hàng hết hạn bị chặn đúng thông báo; CONVERT B→S sinh `C.R.S.TCM.001`, tồn 49/1, phiếu
CD ghi `nguồn → đích`; DESTROY 10 thùng hết hạn (XH-2607-001) tồn HCM về 0, ĐN giữ 5. Trang Settings
đếm "2 lô" đúng theo node. tsc/eslint sạch; i18n 0/0 (2625 key); build sạch +3 route (convert, destroy,
settings/inventory-categories). Dọn test: items/phiếu/tồn về 0, cây 19 node giữ.

## Còn lại (K2 → K4, task #32–34)

K2 role THỦ KHO + quyền mới + lệnh xuất đề xuất→duyệt→xác nhận + phiếu nhập chờ thủ kho (3 nguồn:
PO C3, khách gửi, đồ thẳng site quay về) + siết CONVERT/DESTROY về thủ kho. K3 giữ chỗ tồn kho → CO
giá 0 (quyết định 3/4/5) + trần OPE + cảnh báo lệch. K4 kỳ chiến dịch ≤15 ngày + điều chuyển có duyệt
+ holding A→B + thang cảnh báo date vào job-runner.
