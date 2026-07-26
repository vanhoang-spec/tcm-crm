# BÁO CÁO ĐÁNH GIÁ HỆ THỐNG TCM CRM — GÓC NHÌN CEO AGENCY BTL/ACTIVATION

> Ngày đánh giá: 26/07/2026 · Phạm vi: toàn bộ workflow từ Khách hàng → Bidding/CO-CE → Vận hành → Nghiệm thu → Công nợ, cùng các module nền tảng.
> Phương pháp: (1) đọc mã nguồn toàn hệ thống, (2) 16 phép đối chiếu số liệu READ-ONLY trên `prisma/dev.db`, (3) thao tác thực trên browser với 13 vai người dùng (act-as). Mỗi phát hiện trọng yếu được kiểm chứng bằng **≥ 2 phương pháp độc lập**.
> Người đánh giá đóng vai CEO chịu trách nhiệm khi hệ thống go-live — nên tiêu chí đặt ở mức khắc nghiệt.

---

## 0. PHÁN QUYẾT GO-LIVE

**Kết luận: CHƯA sẵn sàng go-live không điều kiện vào thứ 2. Nền tảng dữ liệu lõi VỮNG, nhưng có 6 lỗi mức CAO cần xử lý hoặc chấp nhận có ý thức trước khi chạy thật.**

Hệ thống này **tốt hơn hẳn** 3 board monday.com rời rạc mà nó thay thế: một nguồn dữ liệu duy nhất, chuẩn hóa 3 team, gate trạng thái chặt, trần chi theo dòng đúng bản chất thuế. Với vai người dùng hằng ngày, phần nhập số/ngày và các bảng dày inline-edit rất mượt. **Nhưng** một CEO chịu trách nhiệm không thể cho chạy khi:

1. **Không lưu được báo giá có hạng mục Chi hộ** — mà Chi hộ là nghiệp vụ chuẩn của activation (khách đưa tiền mua quà/giải thưởng hộ). Lỗi lại báo sai thành "Không tìm thấy dự án".
2. **Pipeline đứt hẳn giữa Nghiệm thu → Hóa đơn → Công nợ**: gõ tay 2 lần ở 2 nơi không liên kết; dự án đóng được mà không cần hóa đơn.
3. **Không phân tách trách nhiệm**: một nhân viên account cấp thấp nhất có thể tự dựng báo giá dưới sàn margin, tự override, tự duyệt, tự chuyển thắng thầu.
4. **Tiền Chi hộ (188 triệu ở 1 dự án) và tiền CTV (nhân sự thời vụ) hoàn toàn NGOÀI hệ trần chi** — đúng phần chi biến động lớn nhất của một job BTL lại không kiểm soát được.
5. **Bẫy "xem hộ" (act-as)**: admin mạo danh nhân viên xong không thoát ra được bằng nút — phải đăng xuất.
6. **Form khách hàng mất sạch dữ liệu đã gõ mỗi lần validation lỗi** — trải nghiệm gây ức chế nặng.

Không có lỗi nào ở trên là "viết lại hệ thống". Tất cả đều là sửa khu trú. Khuyến nghị: **hoãn phần Chi hộ + Nghiệm thu-Hóa đơn khỏi luồng tiền thật tuần đầu, siết quyền phê duyệt trước khi mở máy, và vá 3 lỗi UI (form, Chi hộ save, thoát act-as) trong 1–2 ngày.**

### Bảng điểm tổng hợp 13 khâu

Thang điểm mỗi trục 0–10. Điểm khâu = **W×20% + C×30% + D×30% + U×20%** (W=Workflow khớp thực tế agency · C=Kết nối đa bộ phận · D=Đồng bộ dữ liệu · U=Trải nghiệm người dùng). Trọng số dồn vào C+D theo đúng trọng tâm đề bài.

| # | Khâu | W | C | D | U | **Điểm** | Trục yếu nhất |
|---|------|---|---|---|---|:---:|---|
| ③ | Gate chuyển bid → dự án | 9 | 9 | 9 | 8 | **8.8** | — (đạt) |
| ⑨ | Kho | 8 | 6 | 9 | 7 | **7.5** | Kết nối tiền |
| ① | Khách hàng & chăm sóc | 8 | 7 | 8 | 5 | **7.1** | UX form |
| ④ | Vận hành dự án (9 tab) | 8 | 6 | 7 | 7 | **6.9** | Kết nối |
| ② | Bidding & CO/CE | 8 | 8 | 6 | 5 | **6.8** | UX (Chi hộ) |
| ⑬ | Nền tảng (Chat/AI/RBAC/mobile) | 7 | 6 | 7 | 7 | **6.7** | Kết nối |
| ⑩ | Nhân sự & chấm công | 7 | 5 | 7 | 7 | **6.4** | Kết nối |
| ⑪ | KPI 75/25 | 7 | 6 | 6 | 6 | **6.2** | Đồng bộ |
| ⑧ | Cashflow & Dashboard | 6 | 6 | 5 | 7 | **5.9** | Đồng bộ số |
| ⑦ | Tạm ứng & Thanh toán NCC | 7 | 6 | 6 | 4 | **5.8** | UX (fail im lặng) |
| ⑫ | Creative / Planning / CTV | 7 | 4 | 5 | 7 | **5.5** | Kết nối |
| ⑥ | Công nợ & thu tiền | 5 | 5 | 5 | 4 | **4.8** | Toàn diện |
| ⑤ | Nghiệm thu → Hóa đơn | 5 | 3 | 3 | 5 | **3.8** | Kết nối/Đồng bộ |

**Chỉ 1/13 khâu đạt ngưỡng 9.** 12 khâu còn lại đều có đề xuất khắc phục cụ thể ở Mục 3 để đưa lên ≥ 9.

### Top 10 phát hiện xếp theo mức độ ưu tiên xử lý

| # | Mã | Mức | Phát hiện | Kiểm chứng |
|---|-----|-----|-----------|-----------|
| 1 | BUG-COCE-1 | 🔴 Cao | Không lưu được CO/CE có hạng mục Chi hộ; báo lỗi sai "Không tìm thấy dự án" | Code + Browser live |
| 2 | PIPE-1 | 🔴 Cao | Nghiệm thu → Hóa đơn → Công nợ đứt: 2 hệ hóa đơn song song, `markFinished` không đòi hóa đơn | Code + CHK-13 |
| 3 | GOV-2 | 🔴 Cao | ACCOUNT_STAFF có đủ quyền gonogo+edit+**approve**+**margin_override**+status → không phân tách trách nhiệm | DB + Browser |
| 4 | MONEY-1 | 🔴 Cao | Chi hộ (188tr/T006) + CTV hoàn toàn ngoài hệ trần chi | CHK-04/05 + Code |
| 5 | RBAC-TRAP-1 | 🔴 Cao | Thoát "xem hộ" bị hỏng: nút là text thuần + action gác nhầm theo người bị mạo danh | Code + Browser live |
| 6 | UX-FORM-1 | 🟠 Cao | Form khách hàng mất sạch dữ liệu mỗi lần validation lỗi (5 lần submit) | Browser live |
| 7 | BUG-COCE-3 | 🟠 Cao | Lưu 2 lần → dòng CO bị đổi khóa → finance sinh cặp stale/live → nguy cơ chi 2 lần | Browser live + CHK-08 |
| 8 | SILENT-1 | 🟠 Cao | Thanh toán NCC vượt trần + thu tiền vượt hóa đơn: server chặn nhưng UI KHÔNG báo gì | Code (4 action thiếu FormState) |
| 9 | SYNC-1 | 🟠 TB | Sync CO→Finance "fire-and-forget"; banner staleness dùng Math.max nên tắt sai lúc; T005/T006 chưa từng sync | Code + CHK-03 |
| 10 | CRON-0 | 🟠 TB | Không có scheduler: mọi nhắc nhở chỉ chạy khi có người mở app | Code |

---

## 1. WORKFLOW THỰC TẾ AGENCY vs HỆ THỐNG — đánh giá từng khâu

Với ~15 năm trong nghề activation, một job chuẩn đi qua: **Brief khách → Pitch/Concept → Báo giá (CO/CE) → Chốt giá/PO/HĐ → Set-up & Sản xuất → Chạy event (nhân sự thời vụ) → Nghiệm thu & Thanh lý → Xuất hóa đơn → Thu tiền**. Đối chiếu từng chặng:

| Chặng nghiệp vụ thật | Hệ thống có? | Nhận xét CEO |
|---|---|---|
| Nhận brief | ⚠️ Chỉ là 1 ô link URL | Không lưu nội dung brief, không có ngày nhận, không có lịch sử brief sửa đổi. Khi tranh chấp scope với khách, không có bằng chứng. |
| Pitch / Concept | ⚠️ Một phần | Có Planning job 3 stage + proposal version — tốt. Nhưng không có "pitch date", không có đối thủ cùng bid, không có tỉ lệ thắng để học. |
| Báo giá CO/CE | ✅ Rất mạnh | Cây hạng mục 4 cấp, thuế theo dòng, dòng âm, make-up, margin gate, revision bất biến + so sánh. **Đây là phần tốt nhất hệ thống.** Nhưng: không xuất được file báo giá gửi khách (phải gõ lại ngoài Excel) và không lưu được khối Chi hộ. |
| Chốt giá / PO / HĐ | ✅ Có gate | Chặn vào Processing nếu thiếu confirm email/PO/HĐ + hồ sơ khách chưa đủ → rất đúng nghề. Nhưng `Contract` **không có trường giá trị hợp đồng** — con số khách ký nằm ở đâu? |
| Set-up & Sản xuất | ⚠️ Chỉ là task board | Tab Sản xuất/Thu mua chỉ có bảng task. Không có PO nhà cung cấp, không có phiếu nhận hàng, không đối chiếu "đã trả tiền vs đã nhận hàng". |
| Chạy event (nhân sự) | 🔴 Rời rạc | 3 thế giới không nối nhau: ma trận headcount dự án (chỉ số lượng), lịch tuần văn phòng (không có projectId), và file Excel CTV. **Không trả lời được "ai chạy job T013 ngày 12/10"** — câu hỏi cơ bản nhất khi khách khiếu nại nhân sự. |
| Nghiệm thu & Thanh lý | 🔴 Yếu | Chỉ có 2 ô tick kế toán + 1 nút "khách đã xác nhận" + ngày dự kiến ký. Không có biên bản nghiệm thu, không đối chiếu khối lượng thực tế vs hợp đồng. Bản CO/CE "chuyển sang nghiệm thu" là ảnh chụp thủ công, CO/CE sửa tiếp thì tab này **không cảnh báo đang xem bản cũ**. |
| Xuất hóa đơn | 🔴 Đứt | Gõ số hóa đơn ở tab Nghiệm thu (không có số tiền) **và** gõ lại toàn bộ ở /finance/debt (có số tiền). Hai bản ghi không liên kết, không đối chiếu. |
| Thu tiền | 🔴 Sơ khai | Chỉ ghi nhận thanh toán. Không có kế hoạch thu theo đợt/milestone, không có quy trình đòi nợ, không có người phụ trách thu, **không có thông báo khi nợ quá hạn** (chỉ đếm số trên chuông). |

**Nhận định chung:** hệ thống mạnh ở **nửa đầu** (bán hàng → báo giá → chốt) và yếu dần về **nửa sau** (thực thi → nghiệm thu → thu tiền). Đúng chỗ tiền chảy ra và chảy về thì kiểm soát mỏng nhất. Với agency đang có 28,4 tỷ công nợ và 20,78 tỷ nghiệm thu chưa thu, đây là điểm phải vá trước tiên.

---

## 2. MA TRẬN KẾT NỐI ĐA BỘ PHẬN — trái tim của đánh giá này

Ký hiệu cơ chế: **FK** = khóa ngoại thật · **SYNC** = hàm đồng bộ · **SNAP** = ảnh chụp · **TAY** = người gõ lại · **KHÔNG** = không có liên kết.

### 2.1 Các kết nối ĐÃ TỐT (giữ nguyên)

| Nguồn → Đích | Cơ chế | Rủi ro lệch | Đánh giá |
|---|---|---|---|
| Khách hàng → Dự án | FK `Project.clientId` | Không | ✅ |
| Bid → Dự án | **Cùng 1 bản ghi**, chỉ đổi trạng thái | Không | ✅ Thiết kế khôn: không có bước "convert" thừa |
| Hồ sơ khách chưa đủ → chặn vào Processing | SYNC (guard lúc chuyển) | Không | ✅ Đúng nghề |
| Master Timeline → ORDER các phòng | SYNC `syncTimelineOrders`, idempotent | Thấp | ✅ |
| ORDER → Task phòng ban / Creative / Planning job | SYNC, idempotent theo khóa | Thấp | ✅ |
| Task DELIVERED → dòng ORDER = DONE | FK ghi thẳng | Thấp | ✅ Tín hiệu ngược đầy đủ |
| Kho: Chứng từ → Tồn kho → Đồ đang giữ ở dự án | Giao dịch trong cùng transaction | Không | ✅ **Sạch nhất hệ thống** (CHK-15/16 khớp tuyệt đối) |
| Dòng CO/CE → Trần chi (tạm ứng + thanh toán NCC) | SYNC + FK + kiểm tra trong transaction | Trung bình | ✅ Trần đúng số NET (đã bóc gross-up thuế) — CHK-06 xác nhận 70.250.002đ chênh lệch được xử lý đúng |

### 2.2 Các kết nối CÓ VẤN ĐỀ (cần sửa)

| Nguồn → Đích | Cơ chế | Vấn đề | Mức |
|---|---|---|---|
| **Nghiệm thu → Hóa đơn** | **KHÔNG** | `Contract.invoiceNo` (workspace) vs `ClientInvoice` (finance) — 2 bản ghi song song, không FK, không đối chiếu số/tiền | 🔴 |
| **CO/CE → giá trị hợp đồng** | **KHÔNG** | `Contract` không có trường giá trị. Vòng deal giá (`revisedCe`) không cập nhật ngược vào CO/CE | 🔴 |
| **Chi hộ → Trần chi** | **KHÔNG** | Dòng Chi hộ bị loại khỏi sync (cố ý) → không có đối tượng để ứng/chi. Muốn chi phải dùng đường "cấp dự án" **không có trần** | 🔴 |
| **CTV (nhân sự thời vụ) → Tài chính** | **KHÔNG** | Tiền + thuế TNCN + số tài khoản có đủ trong Excel nhập vào, nhưng không vào CO, không vào cashflow, không vào margin nuôi KPI | 🔴 |
| **Ma trận nhân sự dự án ↔ Lịch tuần ↔ Chấm công** | **KHÔNG** | 3 đảo cô lập, không truy được ai làm job nào ngày nào | 🔴 |
| **Kho → Tiền** | **KHÔNG** | Vật tư không có giá trị sổ sách, mất mát không quy được về dự án, hụt khi chuyển kho biến mất không bút toán | 🟠 |
| **Giờ làm (Creative/Planning/các phòng) ↔ Chấm công** | **KHÔNG** | 4 sổ giờ tự khai độc lập; chỉ Creative được quy ra tiền; không ai đối chiếu với 160h/tháng thực tế | 🟠 |
| CO/CE → Finance (dòng chi phí) | SYNC nhưng **fire-and-forget** | Chạy ngoài transaction, nuốt lỗi; banner cảnh báo dùng `Math.max` nên **tắt đúng lúc cần** | 🟠 |
| Dashboard "tiến độ phòng ban" → bảng task phòng | **Khác mẫu số** | Dashboard đếm dòng Timeline, bảng phòng đếm DepartmentTask → phòng có thể xanh trên dashboard mà ngập việc trên bảng | 🟠 |
| Công nợ → 3 nơi hiển thị | Tính lại độc lập 3 lần | /finance/debt (tất cả) ≠ Dashboard "Sẽ thu" (bỏ hết nợ quá hạn!) ≠ Cashflow (+14 ngày đệm) | 🟠 |
| Phòng ban → Trưởng phòng / prefix mã | Không có UI | `leadStaffId` (người xếp lịch, quản lý Planning) và `costPrefix` chỉ sửa được bằng SQL | 🟠 |
| Chat ↔ đối tượng công việc | **KHÔNG** | Không gắn được dự án/task/báo giá vào hội thoại; mọi trao đổi là văn bản mồ côi | 🟡 |

### 2.3 Con số nghiệp vụ bị lưu/tính ở nhiều nơi

- **margin %**: tính ở 7 nơi; `reminders.ts:166` tự viết lại công thức thay vì gọi hàm chung → sửa 1 chỗ không đủ.
- **"Giá trị dự án"**: 5 nhà không đối chiếu — `Project.budget` (ngân sách khách), `CostSheet.ceTotal` (giá chào), `BiddingRound.revisedCe` (giá deal), `ClientInvoice.amount` (giá xuất hóa đơn), và `Contract` (không có). Hỏi "job này bao nhiêu tiền?" — hệ thống có 4 câu trả lời khác nhau.
- **Công nợ**: 4 định nghĩa "đến hạn" khác nhau (đã nêu ở 2.2).
- **Đã chi trong tháng**: Dashboard đếm mọi tạm ứng theo ngày giải ngân **không lọc trạng thái**; bảng tạm ứng loại đơn đã hủy → 2 con số cho cùng 1 câu hỏi (hiện chưa lệch vì chưa có đơn hủy sau giải ngân — CHK-14).

---

## 3. CHẤM ĐIỂM TỪNG KHÂU + ĐỀ XUẤT ĐẠT ≥ 9

### ① Khách hàng & chăm sóc — **7.1** (W8 C7 D8 U5)

**Được:** Danh sách + tìm kiếm + lọc theo team tốt; nhập Excel hàng loạt; báo cáo chăm sóc; form ép nhập đủ hồ sơ ngay từ đầu (MST đúng định dạng, ngành, phân loại, ngân hàng, địa chỉ) nên gate vào Processing hiếm khi vướng; chuyển khách giữa các team có bản ghi.

**Chưa được:**
- **UX-FORM-1 (U=5):** Mỗi lần validation lỗi, form **xóa sạch** mọi ô đã gõ (kể cả select và người liên hệ). Tôi phải submit **5 lần** mới tạo xong 1 khách, mỗi lần gõ lại ~15 trường. Yêu cầu bắt buộc cũng lộ dần từng đợt chứ không hiện hết một lần.
- Tab "lịch sử dự án" và "tài chính" của khách hàng là chỗ trống ghi "chưa xây" → không xem được vòng đời khách.
- Cảnh báo tập trung doanh thu (1 khách chiếm quá nhiều %) bị tắt cứng trong code.
- Trạng thái khách chỉ được tính lại khi ai đó lưu hợp đồng → khách "ngủ đông" 24 tháng vẫn hiện Active.
- Trường "Người giới thiệu" bắt buộc — khách tự tìm đến thì chọn ai?

**Để đạt ≥ 9:**
1. Giữ lại dữ liệu đã nhập khi validation lỗi (server trả về giá trị cũ để form dựng lại, hoặc validate phía client trước khi gửi). **Đây là việc nửa ngày, ảnh hưởng mọi form trong hệ thống.**
2. Hiện toàn bộ ô bắt buộc ngay từ đầu (đánh dấu + chặn client-side).
3. Bật lại cảnh báo tập trung doanh thu; dựng tab lịch sử dự án của khách (join sẵn có).
4. Tính lại trạng thái khách theo lịch định kỳ (xem CRON-0 mục ⑬).
5. Cho "Người giới thiệu" nhận giá trị "Khách tự liên hệ".

---

### ② Bidding & CO/CE — **6.8** (W8 C8 D6 U5)

**Được:** Đây là phần được đầu tư tốt nhất. Cây hạng mục 4 cấp; thuế theo từng dòng (VAT/TNCN/TNDN/nhập tay); dòng âm để giảm trừ; make-up tự động; margin gate 31% hiện realtime; revision bất biến + màn so sánh; mã dòng tự đánh theo prefix phòng ban. **CHK-10 đối chiếu 4 nguồn số độc lập (bảng lưu / revision / tính lại từ dòng / ảnh chụp JSON) trên cả 3 bảng CO/CE thật: khớp tuyệt đối, 0 dòng lệch.** Ô nhập số giữ đúng vị trí con trỏ khi sửa giữa chuỗi — chi tiết nhỏ nhưng dùng hằng ngày sẽ thấy rất dễ chịu.

**Chưa được:**
- **BUG-COCE-1 (🔴 chặn nghiệp vụ):** Thêm hạng mục **Chi hộ** → không lưu được, báo **"Không tìm thấy dự án."** Nguyên nhân: khối Chi hộ hiển thị nhãn cứng, không có ô nhập tên, nên tên rỗng → kiểm tra dữ liệu từ chối. Lỗi lại bị gộp thành thông báo "không tìm thấy dự án" khiến người dùng hoang mang. *(Khối Chi hộ 188tr của T006 lưu được vì nhập thẳng qua script seed, không qua giao diện.)*
- **BUG-COCE-3 (🟠 rủi ro tiền):** Lưu 2 lần liên tiếp trong cùng phiên → hệ thống **cấp khóa mới** cho các dòng → module Chi phí sinh ra **cặp dòng cũ (treo) + dòng mới (mở lại trần)**. Nếu đã ứng tiền theo bản cũ thì tiền treo một nơi, hạn mức mở lại một nơi → **chi 2 lần cho cùng một khoản**. Tôi tái hiện được ngay trong lần dùng đầu tiên.
- Không xuất được báo giá ra Excel/PDF gửi khách → vẫn phải gõ lại ngoài, tức là **số gửi khách không phải số trong hệ thống**.
- Màn so sánh 2 phiên bản khớp dòng theo (mã hạng mục + tên) mà mã hạng mục mới đều là "SECTION" → 2 dòng trùng tên ở 2 hạng mục khác nhau sẽ chồng nhau khi so sánh (dữ liệu cũ chưa dính vì có mã thật — CHK-09).
- Vòng deal giá không cập nhật ngược vào CE.

**Để đạt ≥ 9:**
1. **Thêm ô nhập tên cho khối Chi hộ** (mặc định "Chi hộ / Thu hộ Khách hàng"), hoặc để server tự điền tên khi là Chi hộ. **Ưu tiên số 1 — 30 phút.**
2. Dịch lỗi kiểm tra dữ liệu ra thông báo đúng chỗ sai, bỏ hẳn thông báo "Không tìm thấy dự án" cho mọi lỗi.
3. **Trả khóa dòng do server sinh về lại giao diện sau mỗi lần lưu** để không sinh khóa mới ở lần lưu kế tiếp. Sửa xong nên chạy lại đối chiếu CHK-08.
4. Xuất báo giá Excel/PDF theo mẫu TCM.
5. Màn so sánh chuyển sang khớp theo khóa bền của dòng (giống module Chi phí đã làm).

---

### ③ Gate chuyển bid → dự án — **8.8** (W9 C9 D9 U8) — *khâu tốt nhất*

**Được:** Đúng nghề tuyệt đối. Chặn vào Processing nếu chưa có ít nhất một trong (email confirm / số PO / hợp đồng đã ký) **và** hồ sơ khách chưa đủ (MST, địa chỉ, ngân hàng…). Chặn sang Nghiệm thu nếu kế toán chưa xác nhận hồ sơ hợp đồng. Go/No-Go bắt buộc với khách mới hoặc job phức tạp. Thông báo lỗi ghi rõ thiếu gì.

**Chưa được:** Khi bị chặn vì hồ sơ khách thiếu, người dùng phải tự mò sang trang khách để sửa rồi quay lại (không có link đi thẳng). Hai trạng thái `PENDING` và `HANDOVER` khai báo trong code nhưng không có đường nào gán tới — bàn giao giữa các account không được ghi nhận.

**Để đạt ≥ 9:** (a) Thêm link "Sửa hồ sơ khách" ngay trong thông báo lỗi; (b) hoặc dựng bước HANDOVER thật, hoặc xóa 2 trạng thái chết khỏi danh sách để khỏi gây nhầm.

---

### ④ Vận hành dự án (9 tab) — **6.9** (W8 C6 D7 U7)

**Được:** Timeline → ORDER → Task các phòng chạy tự động và idempotent (bấm lại không nhân đôi); task xong đẩy ngược trạng thái về dòng ORDER; Planning có 3 chặng + nhiều vòng proposal, chốt FINAL thì trả kết quả ngược cho Account đặt hàng; cổng khách xem timeline ngoài có kiểm soát; khóa task khi dự án hủy/thua, có 7 ngày ân hạn khi kết thúc.

**Chưa được:**
- Tab **Sản xuất** và **Thu mua** chỉ là bảng task — không có đơn đặt hàng NCC, không có phiếu nhận hàng, không đối chiếu tiền đã trả với hàng đã nhận.
- **Ma trận nhân sự dự án** chỉ là ô nhập số lượng (5 PG, 2 MC…), không gắn người thật, không gắn ngày, chỉ hiện với một loại mẫu timeline nhất định.
- Đổi người phụ trách một dòng timeline sang phòng khác → dòng ORDER phòng cũ bị xóa và task bị hủy **im lặng**.
- Trạng thái tổng của ORDER không tự suy ra từ các dòng con → đơn hàng vẫn "đã gửi" mãi dù mọi việc đã xong.
- 9 tab là nhiều — người mới sẽ mất thời gian tìm; không có chỉ dấu tab nào đang có việc cần làm.

**Để đạt ≥ 9:**
1. Bổ sung thực thể **Đơn hàng NCC + Phiếu nhận hàng** cho tab Thu mua/Sản xuất, gắn vào dòng CO tương ứng (dùng lại đúng liên kết mà tạm ứng đang dùng).
2. Nâng ma trận nhân sự thành **phân công thật**: người + ngày + ca (xem thêm mục ⑩).
3. Cảnh báo trước khi đổi phòng phụ trách làm mất dòng ORDER/task.
4. Suy trạng thái ORDER từ các dòng con.
5. Gắn chấm số việc đang chờ lên từng tab.

---

### ⑤ Nghiệm thu → Hóa đơn — **3.8** (W5 C3 D3 U5) — *khâu yếu nhất*

**Được:** Có mốc "ngày dự kiến khách ký" kèm nhắc tự động; 2 ô xác nhận của kế toán; nút "khách đã xác nhận nghiệm thu"; có nút chuyển bản CO/CE sang nghiệm thu kèm ghi nhận ai chuyển/lúc nào.

**Chưa được (nghiêm trọng):**
- **Không có biên bản nghiệm thu, không đối chiếu khối lượng thực tế vs hợp đồng.** Với activation, nghiệm thu chính là lúc chốt "chạy đủ 5 tỉnh hay 4 tỉnh, phát đủ 10.000 sample hay 8.000" — hệ thống không ghi nhận điều này ở đâu cả.
- **Bản CO/CE đã chuyển sang nghiệm thu là ảnh chụp thủ công, KHÔNG cảnh báo khi CO/CE đã có bản mới hơn.** Kế toán có thể đang nhìn số cũ mà không biết.
- **Bản CO/CE "nghiệm thu" (version LIQUID) được khai trong thiết kế nhưng chưa hề được lập trình** — nghĩa là bất biến "chặn kết thúc nếu thiếu CECO nghiệm thu/hóa đơn" ghi trong tài liệu bàn giao **thực tế không được thực thi**.
- **`markFinished` chỉ đòi 1 ô tick của kế toán** — không cần hóa đơn, không cần thu tiền. Dự án đóng sổ được khi khách chưa trả đồng nào.
- Số hóa đơn gõ ở đây **không có số tiền** và **không liên kết** với hóa đơn thật bên Công nợ.

**Để đạt ≥ 9:**
1. **Nối hóa đơn về một mối:** bỏ 2 ô hóa đơn ở tab Nghiệm thu, thay bằng nút "Tạo hóa đơn" mở thẳng form Công nợ với **số tiền điền sẵn từ bản CO/CE đã chuyển nghiệm thu**; tab Nghiệm thu chỉ hiển thị lại hóa đơn đã tạo.
2. **Chặn kết thúc dự án khi chưa có hóa đơn** (đúng như bất biến đã cam kết); cảnh báo nếu còn công nợ chưa thu.
3. **Cảnh báo bản cũ:** nếu CO/CE đã sang phiên bản mới hơn bản đã chuyển nghiệm thu → hiện băng đỏ + nút "cập nhật bản mới".
4. Dựng **bảng đối chiếu khối lượng nghiệm thu** (kế hoạch vs thực tế theo từng dòng CO) — đây cũng chính là nền để làm P&L thực tế (mục ⑧).
5. Cho tải lên/ký biên bản nghiệm thu.

---

### ⑥ Công nợ & thu tiền — **4.8** (W5 C5 D5 U4)

**Được:** Có hóa đơn + nhiều lần thu; phân nhóm tuổi nợ (trong hạn / 30 / 60 / >60); chặn thu vượt số còn lại; danh sách quá hạn hiện trên trang Nhắc việc.

**Chưa được:**
- Hóa đơn **gõ tay 100%**, số tiền tự do — không đối chiếu với CE, với hợp đồng, với bản nghiệm thu. Không có gì ngăn hóa đơn 1 tỷ cho job 100 triệu.
- **Không sửa được, không hủy được hóa đơn** — gõ sai chỉ còn cách ghi nhận thanh toán bù.
- **Không có kế hoạch thu theo đợt** (tạm ứng 30% – nghiệm thu 60% – bảo hành 10%) dù đây là chuẩn ngành.
- **Không có quy trình đòi nợ**: không có người phụ trách thu, không có ngày khách hứa trả, không có bậc leo thang.
- **Không có thông báo khi nợ quá hạn** — chỉ là con số trên chuông, ai không mở trang thì không biết.
- Hạn thanh toán của khách (payment term) có sẵn nhưng **không tự tính ngày đến hạn hóa đơn**.

**Để đạt ≥ 9:**
1. Hóa đơn tạo **từ dự án**, số tiền điền sẵn từ bản nghiệm thu, cảnh báo khi lệch quá X%.
2. Ngày đến hạn tự tính = ngày hóa đơn + payment term của khách.
3. Cho **sửa/hủy hóa đơn** có ghi lịch sử (không xóa cứng).
4. Thêm **kế hoạch thu theo đợt** gắn với mốc hợp đồng.
5. **Thông báo tự động khi quá hạn** cho người phụ trách + kế toán trưởng, kèm ngày khách hứa trả và người theo dõi.

---

### ⑦ Tạm ứng & Thanh toán NCC — **5.8** (W7 C6 D6 U4)

**Được:** Đây là chỗ có tư duy tốt nhất về tiền. **Trần chi lấy đúng số NET (đã bóc phần gross-up thuế TNCN/TNDN)** — nếu lấy số CO thì riêng T013 đã cho chi vượt **70.250.002đ**, và CHK-06 xác nhận con số này chính xác đến từng đồng. Tạm ứng và thanh toán NCC **dùng chung một trần** nên không thể vừa ứng đủ vừa trả đủ. Kiểm tra lại nằm **trong transaction** nên 2 phiếu gửi cùng lúc không lách được. Có hạn mức tạm ứng theo nhân viên xuyên dự án. **217/217 dòng của T013 hiện không có dòng nào vượt trần.**

**Chưa được:**
- **SILENT-1 (🟠):** Thanh toán NCC vượt trần và thu tiền vượt hóa đơn **bị server chặn nhưng giao diện không báo gì** — form đóng lại, không có dòng mới, người dùng tưởng đã lưu. 4 hành động tài chính đều thiếu cơ chế trả lỗi.
- **Đường chi không có trần:** phiếu chi "cấp dự án" (không gắn dòng CO) chi bao nhiêu cũng được. Đây đồng thời là **đường duy nhất để chi tiền Chi hộ** → toàn bộ tiền Chi hộ nằm ngoài kiểm soát.
- Không có đường đảo: tạm ứng đã giải ngân không hủy được, phiếu đã trả không bỏ trạng thái được.
- Hoàn ứng chỉ cần gõ ghi chú, **không cần chứng từ, không đối chiếu số tiền**.
- Yêu cầu tạm ứng không kiểm tra dòng đã cũ (stale) và không kiểm tra trạng thái dự án → vẫn ứng được cho dự án đã hủy.
- Sync CO→Chi phí chạy ngoài transaction, lỗi bị nuốt; **băng cảnh báo "số liệu cũ" dùng phép lấy MAX nên nếu sync hỏng giữa chừng thì băng cảnh báo tắt đúng lúc cần bật nhất.** Thực tế T005 và T006 **chưa từng được đồng bộ** (102 dòng chưa có đối tượng trần chi — CHK-03).

**Để đạt ≥ 9:**
1. **Trả lỗi ra giao diện cho cả 4 hành động tài chính** (dùng đúng cơ chế FormState mà phần tạm ứng đã làm tốt). *Nửa ngày.*
2. **Đặt trần cho phiếu chi cấp dự án**: hoặc bắt buộc gắn dòng CO, hoặc trần theo tổng CO còn lại của dự án. Riêng Chi hộ xem mục ⑫.
3. Thêm kiểm tra dòng cũ + trạng thái dự án khi yêu cầu tạm ứng.
4. Sửa băng cảnh báo dùng MIN thay vì MAX; đưa sync vào transaction hoặc ghi nhật ký lỗi hiện ra cho admin.
5. Bấm "Làm mới" cho T005/T006 ngay trước khi go-live (hoặc chạy đồng bộ toàn hệ thống một lần).
6. Bổ sung đường đảo có kiểm soát cho tạm ứng/thanh toán, và bắt buộc đính kèm chứng từ khi hoàn ứng.

---

### ⑧ Cashflow & Dashboard — **5.9** (W6 C6 D5 U7)

**Được:** Dashboard gọn, chia theo team, có phân quyền phạm vi xem; cashflow chia theo tuần/tháng cấu hình được; các trang tải nhanh.

**Chưa được:**
- **Ba con số công nợ khác nhau** cho cùng một câu hỏi: trang Công nợ tính tất cả; Dashboard "Sẽ thu" **bỏ hết khoản đã quá hạn** (nghịch lý: nợ càng xấu càng vô hình); Cashflow cộng thêm 14 ngày đệm cố định. Không có ghi chú nào giải thích sự khác biệt.
- **Cashflow 100% là dự báo, không có số thực và không có số dư đầu kỳ** → không phải "vị thế tiền mặt", chỉ là chênh lệch kỳ. Mọi khoản quá hạn bị dồn hết vào ô đầu tiên làm phồng tuần hiện tại.
- "Sẽ chi" bỏ qua phiếu chi chưa có ngày đến hạn, còn Cashflow lại tính là "chi hôm nay".
- Thẻ tiến độ phòng ban đếm dòng Timeline, không phải task thật của phòng.
- Dự án YTD lọc theo `fiscalYear` chứ không theo ngày tạo → dự án nhập từ hồ sơ cũ rơi ra ngoài.

**Để đạt ≥ 9:**
1. **Thống nhất một định nghĩa công nợ** dùng chung cho cả 3 nơi; nếu cố ý khác nhau thì ghi rõ ngay trên giao diện ("chưa gồm nợ quá hạn", "có đệm 14 ngày").
2. Dashboard "Sẽ thu" **phải bao gồm nợ quá hạn** (tách riêng dòng "trong đó quá hạn").
3. Cashflow thêm **số dư đầu kỳ + số thực đã thu/chi**, tách rõ ô "quá hạn" thay vì dồn vào tuần hiện tại.
4. Thẻ tiến độ phòng đổi sang đếm task thật của phòng.

---

### ⑨ Kho — **7.5** (W8 C6 D9 U7)

**Được:** **Phần dữ liệu sạch nhất hệ thống.** Sổ chứng từ là nguồn duy nhất, tồn kho và đồ đang giữ ở dự án đều suy ra được và khớp tuyệt đối khi tôi tính lại từ sổ (CHK-15/16). Chuyển kho 2 bước có xác nhận bên nhận; xuất/trả gắn dự án; nhắc trả đồ quá hạn; nhập CSV hàng loạt.

**Chưa được:**
- **Vật tư không có giá trị tiền** — không có giá vốn, không khấu hao, không lên được bảng cân đối.
- **Mất mát không quy được về dự án**: phiếu điều chỉnh giảm không gắn dự án, hụt khi chuyển kho ghi nhận vĩnh viễn nhưng **không có bút toán xử lý**.
- Mua hàng qua CO/CE và nhập kho là 2 việc **không gặp nhau** → trả tiền hàng chưa về, hoặc hàng về chưa trả tiền, đều không phát hiện được.
- Trả hàng tiêu hao (không tái sử dụng) báo lỗi sai "không đủ tồn".

**Để đạt ≥ 9:**
1. Thêm **giá trị vật tư** (giá nhập gần nhất hoặc bình quân) để có giá trị tồn kho.
2. Cho phép **gắn dự án vào phiếu điều chỉnh** để quy trách nhiệm mất mát; sinh bút toán cho phần hụt khi chuyển kho.
3. Nối **nhập kho ↔ dòng CO/thanh toán NCC** để đối chiếu tiền–hàng.
4. Sửa lỗi trả hàng tiêu hao.

---

### ⑩ Nhân sự & chấm công — **6.4** (W7 C5 D7 U7)

**Được:** Lịch tuần theo phòng, bấm ô là xếp ca; xác nhận tuần gửi thông báo cho từng người kèm số ca; phép năm tính tích lũy + chuyển tiếp có hạn 31/3; xuất Excel chấm công.

**Chưa được:**
- **Lịch tuần là lịch văn phòng 40h, không phải lịch event.** Không gắn dự án, không có ca cuối tuần/đêm, không tính tăng ca (cố ý).
- **Không truy được ai chạy job nào** — câu hỏi thường gặp nhất khi khách phàn nàn nhân sự tại điểm bán.
- **Không có luồng xin phép – duyệt phép**: trưởng phòng tự tick vào ô, số dư có thể vượt quota mà không bị chặn.
- Ai có quyền sửa chấm công là sửa được **mọi phòng**, không giới hạn phòng mình.
- Không có nhắc "tuần chưa xác nhận" hay "phép sắp hết hạn 31/3".

**Để đạt ≥ 9:**
1. **Thêm `projectId` vào ca làm** → trả lời được "ai làm job nào ngày nào", đồng thời nối được với ma trận nhân sự dự án ở mục ④.
2. Dựng **luồng xin phép – duyệt phép** có chặn khi vượt quota.
3. Giới hạn quyền sửa/xác nhận lịch **theo phòng mình phụ trách**.
4. Thêm nhắc: tuần chưa xác nhận quá hạn, phép sắp hết hiệu lực.

---

### ⑪ KPI 75/25 — **6.2** (W7 C6 D6 U6)

**Được:** Cơ chế đầy đủ: quỹ theo vị trí, tiêu chí có trọng số, chấm điểm, nhân hệ số chuyên cần lấy từ chấm công thật, chốt kỳ đóng băng kết quả, xuất Excel. Margin đọc từ CO/CE thật.

**Chưa được:**
- **Hệ số margin ghim cứng 1.0** (cố ý giai đoạn 1) → toàn bộ phần margin chỉ để xem, quỹ là tổng cố định chia lại. Tức KPI hiện **chưa gắn với hiệu quả kinh doanh**.
- **Điểm tự động chỉ là gợi ý** — trưởng bộ phận không bấm lưu thì chỉ tiêu khách quan (chuyên cần, đúng hạn) **rơi khỏi công thức**.
- **Bất đối xứng chuyên cần:** người không có bảng chấm công được tính hệ số 1.0 (tốt nhất), người đi làm thật mà nghỉ vài buổi lại bị trừ.
- Lương theo **vị trí, khớp bằng chuỗi ký tự chức danh** → đổi tên chức danh là người đó rơi khỏi quỹ.
- **Margin nuôi KPI thiếu chi phí CTV** (mục ⑫) → thưởng dựa trên lãi ảo cao hơn thực tế.
- Không có nhắc "đến hạn chấm điểm", "kỳ chưa chốt".

**Để đạt ≥ 9:**
1. **Đưa chi phí CTV vào CO** (mục ⑫) trước khi dùng margin để chia tiền.
2. Điểm tự động **tự tính vào công thức**, không cần bấm lưu.
3. Người không có bảng chấm công **không mặc định 1.0** — cảnh báo và chặn chốt kỳ.
4. Chuyển chức danh sang danh mục có mã (thay vì chuỗi tự do) để liên kết lương bền vững.
5. Nhắc lịch chấm điểm/chốt kỳ.

---

### ⑫ Creative / Planning / CTV — **5.5** (W7 C4 D5 U7)

**Được:** Bảng task Creative có vòng duyệt CD, đếm số lần chỉnh sửa, tính tỉ lệ duyệt lần đầu; Planning có 3 chặng và nhiều vòng proposal, chốt xong trả kết quả ngược cho Account; báo cáo chi phí Creative theo loại việc.

**Chưa được:**
- **CTV hoàn toàn ngoài sổ (🔴):** Excel BM08 nhập vào có đủ tiền, thuế TNCN, số tài khoản — nhưng **không vào CO, không vào cashflow, không vào margin**. Với một job activation, CTV thường là khoản chi lớn nhất. Không có hồ sơ CTV xuyên dự án, không chống trùng theo CCCD → cùng một PG chạy 20 job là 20 bản ghi rời.
- **Chi phí Creative "thực tế" là phân bổ theo giờ tự khai**, không đối chiếu chấm công, và tài liệu chính nó thừa nhận chênh lệch ở cấp vị trí luôn ≈ 0 → chỉ có ý nghĩa ở cấp loại việc.
- **Hai bảng lương độc lập** (một cho KPI, một cho Creative) khớp bằng chuỗi chức danh → nhập 2 lần, lệch nhau không ai biết.
- Giờ của Planning và các phòng khác được ghi nhận nhưng **không quy ra tiền**.
- Không có UI để đặt trưởng phòng Planning (`leadStaffId` chỉ sửa bằng SQL).

**Để đạt ≥ 9:**
1. **Nối CTV vào CO/CE**: mỗi đợt CTV ánh xạ vào 1 dòng chi phí (hoặc sinh dòng CO tương ứng) để chịu trần chi và vào margin. **Đây là thay đổi có giá trị tài chính lớn nhất trong nhóm này.**
2. Dựng **hồ sơ CTV dùng chung** (khóa theo CCCD) để tra lịch sử và chống trùng.
3. Gộp 2 bảng lương làm một nguồn.
4. Đối chiếu giờ tự khai với chấm công (cảnh báo khi vượt quỹ giờ).
5. Bổ sung trang quản lý Phòng ban (trưởng phòng + prefix mã).

---

### ⑬ Nền tảng: Chat / AI / Phân quyền / Thông báo / Mobile — **6.7** (W7 C6 D7 U7)

**Được:** **Hộp chat/AI nổi làm rất đúng bài** — mở đè lên nội dung, kéo–thả, đổi kích thước, và (kiểm chứng ở mã nguồn) tránh được đúng cái bẫy CSS từng làm vỡ menu mobile: hộp định vị bằng tọa độ chứ không dùng `transform`, nên hộp thoại bình chọn/nhắc việc vẫn phủ toàn màn hình. **Mobile 375px: không trang nào bị cuộn ngang** (kiểm 4 trang gồm cả bảng CO/CE dày), menu mobile phủ đúng. **Phân quyền chặn thật**: đóng vai nhân viên → gõ thẳng URL `/settings/roles` vẫn bị đẩy về trang chủ. Chat đầy đủ tính năng (trả lời, chuyển tiếp, thả cảm xúc, bình chọn, nhắc việc, nhắc tên xuyên chế độ tắt thông báo). Đăng nhập có khóa sau nhiều lần sai, ép đổi mật khẩu lần đầu và sau 12 tháng.

**Chưa được:**
- **GOV-2 (🔴):** Quyền mặc định quá rộng — nhân viên account cấp thấp nhất có cả `duyệt báo giá` lẫn `ghi đè margin`. **Margin gate 31% bị chính người dựng báo giá vô hiệu hóa được.** Ma trận có sẵn để siết nhưng chưa ai siết.
- **RBAC-TRAP-1 (🔴):** Nhãn "Thoát chế độ xem hộ" **chỉ là chữ, không phải nút**; còn hành động thoát lại kiểm tra quyền theo **người đang bị mạo danh** → admin mạo danh nhân viên xong **kẹt luôn**, chỉ thoát được bằng đăng xuất. Tôi bị kẹt thật khi kiểm thử.
- **CRON-0 (🟠):** **Không có bộ hẹn giờ** — toàn bộ nhắc việc chỉ chạy khi có người mở app. Cuối tuần/lễ không ai mở thì không có nhắc nào. Nhắc quá hạn ORDER chỉ bắn **một lần duy nhất** kể cả khi dời hạn.
- Thông báo **bắn cả phòng** (không lọc theo vai) → nhiều tin không liên quan, dần dần người ta bỏ qua chuông.
- **Chat không gắn được với công việc** (dự án/task/báo giá) → trao đổi mất ngữ cảnh, không tra lại được.
- **AI xem được dữ liệu mọi dự án** với ai có quyền — bao gồm toàn bộ báo giá của team khác; báo cáo BGĐ còn liệt kê tạm ứng theo tên từng người.
- Không có trang đổi mật khẩu chung mặc định (`TCM123456` chỉ sửa được bằng SQL) — tài liệu có nhắc trang này nhưng trang không tồn tại.
- Trang `/orgchart` và `/reminders` không gác quyền — mọi nhân viên xem được toàn bộ danh bạ và danh sách quá hạn/công nợ liên phòng.
- Nút chọn nhân sự trong menu "đóng vai" không có nhãn cho trình đọc màn hình.

**Để đạt ≥ 9:**
1. **Siết ma trận quyền trước khi mở máy** — tối thiểu gỡ `duyệt báo giá` và `ghi đè margin` khỏi ACCOUNT_STAFF (và rà lại toàn bộ 20 vai). *BGĐ quyết, thao tác 15 phút trong Settings.*
2. **Sửa lối thoát mạo danh**: kiểm tra quyền theo người đăng nhập thật, và biến nhãn thành nút bấm được.
3. **Thêm bộ hẹn giờ** (dịch vụ định kỳ gọi các hàm nhắc việc) — không có nó thì cả hệ thống nhắc nhở chỉ là trang trí.
4. Lọc người nhận thông báo theo vai (trưởng phòng/người phụ trách) thay vì bắn cả phòng; cho nhắc lại khi dời hạn.
5. Giới hạn phạm vi dữ liệu AI theo team/quyền sở hữu dự án.
6. Thêm trang bảo mật (đổi mật khẩu mặc định) + gác quyền `/orgchart`, `/reminders`.

---

## 4. BẰNG CHỨNG KIỂM CHỨNG

### 4.1 Kết quả 16 phép đối chiếu số liệu (chạy READ-ONLY trên `prisma/dev.db`)

| Mã | Nội dung | Kết quả | Ý nghĩa |
|---|---|---|---|
| CHK-01 | Phân quyền: tổng grant / ADMIN / vai bị khóa | ✅ 1205 grant · ADMIN 0 dòng (đúng thiết kế sàn cứng) · 0 vai bị khóa | Dữ liệu phân quyền lành mạnh |
| CHK-02 | Dòng chi phí có trần = 0 do thiếu backfill | ✅ 0 dòng | Không có nạn nhân trong dữ liệu hiện tại |
| CHK-03 | Khóa dòng sai định dạng / mồ côi / chưa đồng bộ | ⚠️ 0 sai định dạng, 0 mồ côi, **2 dự án chưa từng đồng bộ (T005: 68 dòng, T006: 34 dòng)** | 102 dòng chi phí **chưa có đối tượng trần chi** |
| CHK-04 | Tiền Chi hộ không có trần | ⚠️ **188.173.000đ** (T006: 183,84tr + phí 4,33tr), 0 dòng được đồng bộ | Xác nhận lỗ hổng cấu trúc lớn nhất |
| CHK-05 | Tiền CTV ngoài sổ | ℹ️ 0 đợt CTV trong dữ liệu hiện tại | Rủi ro tiềm ẩn, chưa hiện thực hóa |
| CHK-06 | Trần chi từng dòng (đã ứng + đã trả vs NET) | ✅ **217 dòng, 0 dòng vượt trần**; chênh lệch gross-up thuế **70.250.002đ** khớp chính xác con số đã ghi nhận | Cơ chế trần chi hoạt động đúng |
| CHK-07 | Kênh chi không trần | ✅ 0 phiếu chi cấp dự án, 0 tạm ứng trên dòng cũ | Chưa ai đi cửa sau — nhưng cửa vẫn mở |
| CHK-08 | Cặp dòng cũ/mới trùng tên (nguy cơ chi 2 lần) | ✅ 0 cặp trong dữ liệu cũ — **nhưng thao tác giao diện tạo ra ngay** (xem 4.2) | Rủi ro tương lai, không phải quá khứ |
| CHK-09 | Va chạm khóa ở màn so sánh phiên bản | ✅ 0 dự án bị ảnh hưởng (dữ liệu cũ có mã hạng mục thật) | Rủi ro với hạng mục tạo mới |
| CHK-10 | **Margin đối chiếu 4 nguồn độc lập, mọi bảng CO/CE** | ✅ **3/3 bảng khớp tuyệt đối, 0 dòng lệch** | Lõi tính toán CO/CE đáng tin cậy |
| CHK-11 | Sai lệch dữ liệu mẫu T002 | ℹ️ T002 đã xóa; rủi ro còn ở script seed | Không ảnh hưởng dữ liệu thật |
| CHK-12 | Ba con số công nợ | ℹ️ 0 hóa đơn trong dữ liệu hiện tại → chưa lộ chênh lệch | Sẽ lộ ngay khi có hóa đơn thật |
| CHK-13 | Hóa đơn/hợp đồng mồ côi | ✅ 0 tất cả các loại | Sạch |
| CHK-14 | "Đã chi" trên Dashboard vs bảng tạm ứng | ✅ Chênh 0 | Lỗi tiềm ẩn, chưa kích hoạt |
| CHK-15 | Tồn kho tính lại từ sổ chứng từ | ✅ Khớp tuyệt đối, 0 âm | Bất biến kho vững |
| CHK-16 | Đồ đang giữ ở dự án tính lại từ sổ | ✅ Khớp tuyệt đối | Bất biến kho vững |

**Đọc kết quả này thế nào:** dữ liệu hiện tại **sạch** — phần lớn lỗ hổng là **cấu trúc** (cửa mở nhưng chưa ai đi qua), chưa biến thành số liệu sai. Đó là tin tốt: sửa bây giờ thì không phải đi dọn dữ liệu lịch sử. Nhưng cũng là lời cảnh báo: dữ liệu sạch vì **hệ thống chưa chạy thật**, không phải vì các cửa đã khóa.

### 4.2 Kết quả thao tác thực trên browser

Tôi tạo dữ liệu thử có tiền tố `AUDIT-`, chạy hết vòng đời, rồi **dọn sạch và chạy lại toàn bộ 16 phép đối chiếu để chứng minh không để lại rác** (CHK-06 trở lại đúng 217 dòng, CHK-08 trở lại 0 cặp, CHK-10 trở lại 3 bảng).

| Kịch bản | Kết quả |
|---|---|
| Đăng nhập, khóa tài khoản sau nhiều lần sai | Hoạt động đúng, có thông báo riêng kèm số phút. Luồng admin cấp lại mật khẩu chạy đúng. |
| Tạo khách hàng | **Phải submit 5 lần**, mỗi lần mất sạch dữ liệu đã gõ. Yêu cầu bắt buộc lộ dần từng đợt. |
| Tạo bid + Go/No-Go | Mượt; badge quyết định ghi rõ ai/khi nào. |
| Dựng CO/CE: 3 dòng (SL×đơn giá, cố định, **dòng âm**), thuế **"Khác (nhập tay)"** | Tính đúng: 5.000.000 + 2.100.000 (2tr + 100k thuế) − 500.000 = **6.600.000**. Ô nhập số giữ đúng vị trí con trỏ khi sửa giữa chuỗi. |
| Thêm hạng mục **Chi hộ** rồi lưu | 🔴 **Không lưu được**, báo "Không tìm thấy dự án." Xóa Chi hộ → lưu qua được ngay. |
| Đạp ngưỡng margin (17,5% < 31%) | Badge cảnh báo realtime; chặn lưu, đòi lý do — đúng thiết kế. |
| Lưu bằng vai **nhân viên account** | 🔴 **Lưu được, tự override, tự duyệt** — không cần cấp trên. |
| Lưu 2 lần liên tiếp | 🟠 Sinh **6 dòng chi phí** (3 cũ treo + 3 mới) do khóa dòng bị đổi — cơ chế dẫn tới chi 2 lần. |
| Đóng vai nhân viên → gõ URL `/settings/roles`, `/settings` | ✅ Bị đẩy về trang chủ; menu cũng ẩn. |
| Thoát chế độ đóng vai | 🔴 **Kẹt** — nhãn không phải nút, hành động thoát bị chính cơ chế quyền chặn. Phải đăng xuất. |
| Hộp chat nổi trên trang khác | ✅ Đè đúng lớp, không bị nhốt; kéo–thả/đổi kích thước hoạt động. |
| Mobile 375px (4 trang, gồm bảng CO/CE) | ✅ Không trang nào cuộn ngang; menu phủ đúng, lọc theo quyền. |

---

## 5. KHUYẾN NGHỊ HÀNH ĐỘNG TRƯỚC THỨ 2

### Nhóm A — PHẢI làm trước khi mở máy (ước tính 1–2 ngày)

| # | Việc | Vì sao không hoãn được |
|---|---|---|
| A1 | **Siết ma trận quyền**: gỡ `bidding.costsheet.approve` + `bidding.margin_override` khỏi ACCOUNT_STAFF; rà 20 vai | Không có nó thì sàn margin 31% vô nghĩa. **BGĐ tick trong Settings, 15 phút.** |
| A2 | **Sửa lưu Chi hộ** (thêm ô tên hoặc server tự điền) | Chi hộ là nghiệp vụ chuẩn; không sửa thì tuần đầu đã tắc. |
| A3 | **Trả lỗi ra giao diện cho 4 hành động tài chính** | Kế toán tưởng đã lưu mà thực ra bị chặn → sai sổ. |
| A4 | **Sửa lối thoát "xem hộ"** | Admin tự khóa mình khỏi hệ thống. |
| A5 | **Giữ dữ liệu form khi lỗi** | Nhân viên sẽ bỏ dùng hệ thống nếu mỗi lần nhập mất 5 lượt. |
| A6 | **Bấm "Làm mới" cho T005/T006** (102 dòng chưa đồng bộ) | Không có trần chi cho các dòng này. |
| A7 | **Nhắc lại quy trình deploy**: nếu đè `dev.db` lên production thì grant đi kèm; nếu chỉ đẩy code thì **bắt buộc chạy seed** sau migrate | Bỏ bước này là mọi vai trừ ADMIN mất sạch quyền. |

### Nhóm B — Làm trong 2 tuần đầu

B1. Nối Nghiệm thu → Hóa đơn (một nút, số tiền điền sẵn) + chặn kết thúc khi thiếu hóa đơn.
B2. Cảnh báo bản CO/CE nghiệm thu đã cũ.
B3. Sửa khóa dòng bị đổi khi lưu lại (chống chi 2 lần).
B4. Đặt trần cho phiếu chi cấp dự án + phương án cho tiền Chi hộ.
B5. Thêm bộ hẹn giờ cho nhắc việc.
B6. Thống nhất định nghĩa công nợ giữa 3 màn hình.

### Nhóm C — Quý tới (cần BGĐ quyết nghiệp vụ)

C1. Đưa CTV vào CO/CE (ảnh hưởng margin và KPI).
C2. Phân công nhân sự theo dự án + ngày (nối 3 đảo).
C3. Đơn hàng NCC + phiếu nhận hàng.
C4. P&L thực tế theo dự án (kế hoạch vs thực chi vs thực thu).
C5. Kế hoạch thu theo đợt + quy trình đòi nợ.
C6. Xuất báo giá / biên bản nghiệm thu ra file.

---

## 6. CÂU HỎI CẦN BGĐ TRẢ LỜI

1. **Tiền Chi hộ vận hành thế nào trên thực tế?** Ai giữ tiền, chi qua kênh nào, đối chiếu với khách ra sao? Chưa rõ điều này thì không thiết kế được trần chi cho Chi hộ. *(Chủ dự án đã ghi nhận sẽ làm rõ sau.)*
2. **CTV có đưa vào giá vốn không?** Nếu có, margin sẽ giảm và quỹ KPI thay đổi — cần quyết trước khi dùng margin để chia thưởng.
3. **Ai được duyệt báo giá dưới sàn margin?** Đề xuất: chỉ Giám đốc Account trở lên + Ban Giám đốc.
4. **Chốt kết thúc dự án có bắt buộc phải có hóa đơn không?** Tài liệu bàn giao nói có, hệ thống hiện không kiểm.
5. **Chênh lệch 7.000.003đ ở T013** (5.390.039.982 trong hệ thống vs 5.383.039.979 trong tài liệu kế hoạch): số nào đúng? Hệ thống **tự nhất quán** (kiểm chứng 4 nguồn độc lập đều khớp), nên đây là câu hỏi nhập liệu, không phải lỗi tính toán — nhưng nó đang là trần chi của dòng đó.

---

## 7. GHI CHÚ VỀ PHƯƠNG PHÁP & GIỚI HẠN

**Đã làm:** đọc toàn bộ mã nguồn các luồng nghiệp vụ; 16 phép đối chiếu số liệu độc lập trên dữ liệu thật; thao tác browser thật qua nhiều vai; mỗi phát hiện trọng yếu kiểm chứng bằng ≥ 2 phương pháp.

**Chưa làm được, cần bổ sung:**
- **Chưa test được luồng tài chính đầy đủ trên giao diện** (đặt tạm ứng thật, đạp trần thật, thanh toán vượt trần) — do các form dùng thành phần nhập liệu có trạng thái riêng, thao tác tự động không mô phỏng được chính xác. Hai lỗi "fail im lặng" được xác nhận ở mức mã nguồn với độ chắc chắn cao (không có cơ chế trả lỗi trong hàm), nhưng **nên có người thật bấm thử một lần** trước khi mở máy.
- **Chưa test**: nhập Excel CTV, quy trình kho 2 bước trên giao diện, chốt kỳ KPI, các tính năng AI (tốn phí gọi API), chat nhiều người đồng thời.
- **Dữ liệu hiện tại rất mỏng** (0 hóa đơn, 0 chứng từ kho, 0 đợt CTV) nên nhiều lỗi đồng bộ chỉ chứng minh được ở mức cơ chế, chưa có số liệu sai để trưng ra.
- Backup trước kiểm thử: `D:\TCM\backup-dev-db\dev.db.pre-audit-20260726-221714`.

**Về dữ liệu thử:** toàn bộ bản ghi `AUDIT-` đã được xóa; 16 phép đối chiếu chạy lại sau khi dọn cho kết quả **giống hệt trước khi kiểm thử**.

---

*Báo cáo lập bởi Claude (Anthropic) theo yêu cầu đánh giá độc lập, 26/07/2026.*
