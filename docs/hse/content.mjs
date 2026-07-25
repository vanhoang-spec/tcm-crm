// =============================================================================
// TCM — SỔ TAY AN TOÀN, SỨC KHỎE & MÔI TRƯỜNG (HS&E MANUAL)
// Nguồn nội dung DUY NHẤT (single source of truth) — dùng chung cho:
//   • build-docx.mjs  → Word (.docx)
//   • build-html.mjs  → HTML in-sẵn → build-pdf.mjs (Puppeteer) → PDF
//
// Nguyên tắc song ngữ: Tiếng Việt là thân bài; Tiếng Anh dạng tóm tắt
//   (hộp "English summary" cuối mỗi chương) + Phụ lục thuật ngữ VI–EN.
//   Riêng Tuyên bố Chính sách HS&E làm song ngữ đầy đủ.
//
// Mô hình block (mỗi renderer tự map sang docx / html):
//   { t:'part',  vi, en }                  → mở đầu một PHẦN lớn (banner brand)
//   { t:'h1', vi, en, num }                → tiêu đề chương (đánh số)
//   { t:'h2', vi, en }                     → tiêu đề mục
//   { t:'h3', vi, en }                     → tiêu đề mục con
//   { t:'p',  vi, en? }                    → đoạn văn (en tuỳ chọn — thường bỏ)
//   { t:'ul', items:[vi | {vi,en?}] }      → danh sách chấm
//   { t:'ol', items:[...] }                → danh sách số
//   { t:'table', head:[...], rows:[[...]], widths?:[...] }
//   { t:'callout', variant:'note|warning|danger|good', vi, en?, body?:[...] }
//   { t:'summary', items:[en strings] }    → hộp "English summary"
//   { t:'signature', roles:[{vi,en}] }     → khối ký
//   { t:'spacer' }                         → khoảng trống
//   { t:'pagebreak' }                      → ngắt trang
// =============================================================================

export const meta = {
  title: { vi: "SỔ TAY AN TOÀN, SỨC KHỎE & MÔI TRƯỜNG", en: "HEALTH, SAFETY & ENVIRONMENT MANUAL" },
  company: "TCM — Targeted Marketing",
  companyLegal: { vi: "CÔNG TY TCM — TARGETED MARKETING", en: "TCM — TARGETED MARKETING" },
  docCode: "TCM-HSE-MAN-01",
  version: "1.0",
  effectiveDate: "…/…/2026",
  classification: { vi: "LƯU HÀNH NỘI BỘ", en: "INTERNAL USE ONLY" },
  est: "Est. 2000",
};

// Bảng lịch sử phiên bản (trang kiểm soát tài liệu)
export const revisionHistory = [
  { ver: "1.0", date: "…/…/2026", by: "Bộ phận HS&E / HR", note: { vi: "Ban hành lần đầu", en: "Initial issue" } },
];

// Bảng phê duyệt
export const approvals = [
  { role: { vi: "Soạn thảo", en: "Prepared by" }, who: { vi: "Điều phối HS&E", en: "HS&E Coordinator" } },
  { role: { vi: "Rà soát", en: "Reviewed by" }, who: { vi: "Trưởng phòng Nhân sự (HR)", en: "Head of HR" } },
  { role: { vi: "Phê duyệt & Ban hành", en: "Approved & Issued by" }, who: { vi: "Ban Giám đốc (BoD)", en: "Board of Directors" } },
];

// =============================================================================
// NỘI DUNG CHÍNH
// =============================================================================
export const doc = [

  // ───────────────────────────── CHÍNH SÁCH ─────────────────────────────
  { t: "policyStatement" }, // renderer chèn khối Tuyên bố Chính sách song ngữ (định nghĩa bên dưới)
  { t: "pagebreak" },

  // =========================================================================
  { t: "part", vi: "PHẦN 1 — NỀN TẢNG", en: "PART 1 — FOUNDATION" },

  // ───────── Chương 1
  { t: "h1", num: 1, vi: "Mục đích, phạm vi & đối tượng áp dụng", en: "Purpose, scope & application" },
  { t: "h2", vi: "1.1 Mục đích", en: "" },
  { t: "p", vi: "Sổ tay này thiết lập khung quản lý An toàn – Sức khỏe – Môi trường (HS&E) thống nhất cho toàn bộ hoạt động của TCM, đặc biệt là các hoạt động Below The Line (BTL): sự kiện, activation, roadshow, sampling, trưng bày POSM, dựng – tháo gian hàng và sân khấu. Mục tiêu là bảo vệ tính mạng, sức khỏe của nhân sự, cộng tác viên, nhà thầu và công chúng; bảo vệ tài sản và uy tín thương hiệu; đồng thời giảm thiểu tác động tới môi trường." },
  { t: "p", vi: "Sổ tay cụ thể hóa cam kết của Ban Giám đốc thành nguyên tắc, vai trò, quy trình và biểu mẫu áp dụng được ngay tại hiện trường." },
  { t: "h2", vi: "1.2 Phạm vi", en: "" },
  { t: "ul", items: [
    "Mọi địa điểm làm việc: văn phòng, kho, xưởng, và đặc biệt là hiện trường sự kiện/activation (trong nhà và ngoài trời).",
    "Mọi giai đoạn của một job BTL: khảo sát địa điểm, sản xuất, vận chuyển, dựng (set-up), vận hành sự kiện (show), tháo dỡ (dismantle) và thu hồi.",
    "Mọi đối tượng: nhân viên chính thức, nhân sự thời vụ, cộng tác viên (CTV) hiện trường (PG/PB, promoter, helper, mascot, MC), nhà thầu phụ (production, rigging, âm thanh ánh sáng) và nhà cung cấp.",
  ] },
  { t: "h2", vi: "1.3 Đối tượng áp dụng & nguyên tắc bắt buộc", en: "" },
  { t: "p", vi: "Tất cả những người nêu trên phải tuân thủ Sổ tay khi làm việc dưới danh nghĩa hoặc trong phạm vi dự án của TCM. Nhà thầu và nhà cung cấp phải tuân thủ các yêu cầu HS&E của TCM như một điều kiện hợp đồng." },
  { t: "callout", variant: "note", vi: "Nguyên tắc bao trùm: An toàn là điều kiện tiên quyết của mọi công việc — không có deadline hay yêu cầu khách hàng nào biện minh cho việc chấp nhận rủi ro không kiểm soát. Bất kỳ ai cũng có quyền và trách nhiệm DỪNG công việc khi thấy nguy hiểm (Stop Work Authority)." },
  { t: "summary", items: [
    "This manual establishes TCM's unified HS&E framework, with a focus on Below-The-Line (BTL) activities: events, activations, roadshows, POSM and stage build-up/dismantle.",
    "Scope covers all locations, all job phases (survey → production → transport → set-up → show → dismantle) and all people (staff, temporary field crew/CTV, contractors, suppliers).",
    "Overriding principle: safety is a precondition of all work; everyone holds Stop Work Authority when a hazard is uncontrolled.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 2
  { t: "h1", num: 2, vi: "Văn bản pháp lý & tiêu chuẩn tham chiếu", en: "Legal & normative references" },
  { t: "p", vi: "Sổ tay được xây dựng phù hợp với pháp luật Việt Nam và tham chiếu các thông lệ quốc tế về quản lý an toàn và an toàn sự kiện." },
  { t: "table",
    head: [{ vi: "Nhóm", en: "Category" }, { vi: "Văn bản / Tiêu chuẩn tham chiếu", en: "Reference" }],
    widths: [30, 70],
    rows: [
      [{ vi: "Pháp luật VN" }, { vi: "Luật An toàn, vệ sinh lao động số 84/2015/QH13" }],
      [{ vi: "Pháp luật VN" }, { vi: "Nghị định 39/2016/NĐ-CP (quy định chi tiết một số điều của Luật ATVSLĐ)" }],
      [{ vi: "Pháp luật VN" }, { vi: "Nghị định 44/2016/NĐ-CP (huấn luyện ATVSLĐ, quan trắc môi trường lao động, kiểm định máy móc)" }],
      [{ vi: "Pháp luật VN" }, { vi: "Bộ luật Lao động 45/2019/QH13; quy định về PCCC (Luật PCCC & sửa đổi); pháp luật bảo vệ môi trường 72/2020/QH14" }],
      [{ vi: "Tiêu chuẩn QT" }, { vi: "ISO 45001:2018 — Hệ thống quản lý An toàn & Sức khỏe nghề nghiệp (OH&S)" }],
      [{ vi: "Tiêu chuẩn QT" }, { vi: "ISO 14001:2015 — Hệ thống quản lý Môi trường (EMS)" }],
      [{ vi: "Thông lệ" }, { vi: "Nguyên tắc quản lý an toàn sự kiện (event safety): đánh giá rủi ro, quản lý đám đông, kết cấu tạm, điện tạm" }],
    ] },
  { t: "callout", variant: "note", vi: "Sổ tay đặt ra mức chuẩn tối thiểu của TCM. Khi pháp luật, quy định của địa điểm (venue) hoặc yêu cầu của khách hàng nghiêm ngặt hơn, áp dụng mức nghiêm ngặt hơn." },
  { t: "summary", items: [
    "Built to comply with Vietnamese OSH law (Law 84/2015/QH13; Decrees 39/2016 and 44/2016), the Labour Code, fire-prevention and environmental laws.",
    "References ISO 45001:2018 (OH&S) and ISO 14001:2015 (EMS), plus event-safety good practice.",
    "Where law, venue rules or client requirements are stricter, the stricter standard applies.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 3
  { t: "h1", num: 3, vi: "Định nghĩa & từ viết tắt", en: "Definitions & abbreviations" },
  { t: "table",
    head: [{ vi: "Thuật ngữ", en: "Term" }, { vi: "Ý nghĩa", en: "Meaning" }],
    widths: [24, 76],
    rows: [
      [{ vi: "HS&E" }, { vi: "Health, Safety & Environment — An toàn, Sức khỏe & Môi trường" }],
      [{ vi: "BTL" }, { vi: "Below The Line — hoạt động marketing tương tác trực tiếp: sự kiện, activation, roadshow, sampling, trưng bày" }],
      [{ vi: "Mối nguy (Hazard)" }, { vi: "Nguồn/tình huống có khả năng gây tổn hại (điện, độ cao, vật rơi, nhiệt, đám đông…)" }],
      [{ vi: "Rủi ro (Risk)" }, { vi: "Kết hợp của khả năng xảy ra và mức độ nghiêm trọng của tổn hại" }],
      [{ vi: "JSA" }, { vi: "Job Safety Analysis — phân tích an toàn công việc theo từng bước" }],
      [{ vi: "PTW" }, { vi: "Permit To Work — Giấy phép làm việc (trên cao, công việc nóng, điện)" }],
      [{ vi: "PPE" }, { vi: "Personal Protective Equipment — Phương tiện bảo vệ cá nhân" }],
      [{ vi: "TBT" }, { vi: "Toolbox Talk — họp an toàn ngắn đầu ca / trước sự kiện" }],
      [{ vi: "CTV" }, { vi: "Cộng tác viên — nhân sự thuê ngoài phục vụ hiện trường (PG/PB, promoter, helper, mascot, MC)" }],
      [{ vi: "Set-up / Dismantle" }, { vi: "Dựng / Tháo dỡ gian hàng, sân khấu, kết cấu tạm" }],
      [{ vi: "Rigging" }, { vi: "Công tác treo, lắp kết cấu trên cao (truss, đèn, màn hình, banner)" }],
      [{ vi: "Near-miss" }, { vi: "Cận nguy — sự việc suýt gây tai nạn nhưng chưa gây tổn hại" }],
    ] },
  { t: "pagebreak" },

  // ───────── Chương 4
  { t: "h1", num: 4, vi: "Chính sách & nguyên tắc HS&E", en: "HS&E principles" },
  { t: "p", vi: "Hệ thống HS&E của TCM vận hành theo chu trình cải tiến liên tục PDCA (Hoạch định – Thực hiện – Kiểm tra – Hành động) của ISO 45001, dựa trên các nguyên tắc:" },
  { t: "ol", items: [
    { vi: "Phòng ngừa hơn khắc phục — loại bỏ mối nguy từ khâu thiết kế và lập kế hoạch dự án, không chờ đến hiện trường." },
    { vi: "Thứ tự kiểm soát rủi ro (Hierarchy of Controls): ưu tiên Loại bỏ → Thay thế → Kiểm soát kỹ thuật → Kiểm soát hành chính → PPE (PPE là lớp bảo vệ cuối cùng, không phải đầu tiên)." },
    { vi: "Trách nhiệm theo tuyến — mỗi cấp quản lý chịu trách nhiệm HS&E cho phạm vi mình phụ trách." },
    { vi: "Tham gia của người lao động — mọi người được tham vấn, được báo cáo mối nguy mà không sợ bị trù dập." },
    { vi: "Quyền dừng việc (Stop Work Authority) — bất kỳ ai cũng có thể dừng công việc nguy hiểm." },
    { vi: "Học từ sự cố — mọi tai nạn và cận nguy đều được báo cáo, điều tra và rút kinh nghiệm." },
  ] },
  { t: "callout", variant: "good", vi: "Văn hóa an toàn tích cực: khen thưởng hành vi an toàn và báo cáo cận nguy; không đổ lỗi cá nhân khi điều tra sự cố mà tập trung tìm nguyên nhân gốc rễ của hệ thống." },
  { t: "summary", items: [
    "TCM's HS&E system runs on the ISO 45001 PDCA cycle of continual improvement.",
    "Core principles: prevention over cure, the Hierarchy of Controls (PPE is the last line, not the first), line responsibility, worker participation, Stop Work Authority, and learning from incidents.",
    "A just, no-blame safety culture: reward safe behaviour and near-miss reporting; investigations seek root causes, not scapegoats.",
  ] },
  { t: "pagebreak" },

  // =========================================================================
  { t: "part", vi: "PHẦN 2 — TỔ CHỨC & TRÁCH NHIỆM", en: "PART 2 — ORGANIZATION & RESPONSIBILITIES" },

  // ───────── Chương 5
  { t: "h1", num: 5, vi: "Sơ đồ tổ chức HS&E & phân vai", en: "HS&E organization & roles" },
  { t: "p", vi: "Trách nhiệm HS&E chạy theo tuyến quản lý dự án của TCM, từ Ban Giám đốc xuống tới nhân sự hiện trường và nhà thầu." },
  { t: "table",
    head: [{ vi: "Vai trò", en: "Role" }, { vi: "Trách nhiệm HS&E chính", en: "Key HS&E responsibilities" }],
    widths: [26, 74],
    rows: [
      [{ vi: "Ban Giám đốc (BoD)" }, { vi: "Ban hành chính sách; cấp nguồn lực; chịu trách nhiệm cao nhất; rà soát định kỳ hiệu quả HS&E." }],
      [{ vi: "Điều phối HS&E (HS&E Coordinator)" }, { vi: "Quản trị Sổ tay & biểu mẫu; tư vấn đánh giá rủi ro; tổ chức huấn luyện; điều tra sự cố; theo dõi KPI; đầu mối audit." }],
      [{ vi: "Trưởng dự án / Event Manager" }, { vi: "Lập đánh giá rủi ro cho từng job; bổ nhiệm cán bộ an toàn hiện trường; duyệt nhà thầu; bảo đảm briefing trước show." }],
      [{ vi: "Cán bộ an toàn hiện trường (Site Safety Officer)" }, { vi: "Giám sát an toàn tại site; kiểm tra PPE, PTW, kết cấu, điện; chủ trì Toolbox Talk; thực thi quyền dừng việc." }],
      [{ vi: "Trưởng bộ phận (Ope/Pro/PCC/Creative…)" }, { vi: "Bảo đảm nhân sự của mình được huấn luyện & tuân thủ; cung cấp thiết bị an toàn phù hợp." }],
      [{ vi: "Nhân viên & CTV hiện trường" }, { vi: "Tuân thủ quy tắc & briefing; dùng PPE đúng; báo cáo mối nguy/cận nguy; dừng việc khi nguy hiểm." }],
      [{ vi: "Nhà thầu / Nhà cung cấp" }, { vi: "Tuân thủ yêu cầu HS&E của TCM; cung cấp hồ sơ năng lực, phương án an toàn, bảo hiểm; giám sát nhân sự của mình." }],
    ] },
  { t: "summary", items: [
    "HS&E responsibility follows TCM's project management line, from the Board down to field crew and contractors.",
    "The Board issues policy and resources; the HS&E Coordinator administers the system; Project/Event Managers own each job's risk assessment; the Site Safety Officer enforces controls on site.",
    "All workers, CTV and contractors must comply, use PPE, report hazards, and may stop unsafe work.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 6
  { t: "h1", num: 6, vi: "Đối thoại & tham vấn HS&E", en: "HS&E consultation" },
  { t: "ul", items: [
    "Kênh báo cáo mối nguy: mọi nhân sự có thể báo cáo mối nguy/cận nguy qua trưởng nhóm, cán bộ an toàn, hoặc kênh nội bộ (bao gồm mục Trao đổi trên nền tảng vận hành TCM).",
    "Họp HS&E định kỳ: rà soát sự cố, xu hướng rủi ro, và kế hoạch cải tiến (tối thiểu hàng quý; sau mỗi sự kiện lớn có họp rút kinh nghiệm).",
    "Tham vấn khi thay đổi: khi có công việc/thiết bị/địa điểm mới có rủi ro cao, tham vấn người lao động và cập nhật đánh giá rủi ro trước khi thực hiện.",
  ] },
  { t: "summary", items: [
    "Workers can report hazards and near-misses through team leads, the Site Safety Officer, or internal channels (including the TCM platform's Chat).",
    "Periodic HS&E meetings review incidents and improvement plans (at least quarterly; a debrief follows every major event).",
    "New high-risk work, equipment or venues trigger consultation and a risk-assessment update before proceeding.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 7
  { t: "h1", num: 7, vi: "Ma trận năng lực & huấn luyện bắt buộc", en: "Competency & training matrix" },
  { t: "table",
    head: [{ vi: "Đối tượng", en: "Group" }, { vi: "Huấn luyện tối thiểu", en: "Minimum training" }, { vi: "Tần suất", en: "Frequency" }],
    widths: [26, 54, 20],
    rows: [
      [{ vi: "Tất cả nhân sự" }, { vi: "Nhập môn HS&E (induction): chính sách, mối nguy cơ bản, ứng phó khẩn cấp, báo cáo sự cố" }, { vi: "Khi vào việc + hằng năm" }],
      [{ vi: "Nhân sự hiện trường & CTV" }, { vi: "An toàn sự kiện: dựng/tháo, nâng vác, đám đông, sốc nhiệt, sơ cấp cứu cơ bản, PPE" }, { vi: "Trước mỗi dự án / định kỳ" }],
      [{ vi: "Người làm việc trên cao / rigging" }, { vi: "Làm việc trên cao, sử dụng dây an toàn & thang/giàn giáo, PTW" }, { vi: "Trước khi thực hiện + định kỳ" }],
      [{ vi: "Phụ trách điện tạm" }, { vi: "An toàn điện, máy phát, RCD/ELCB, PTW điện" }, { vi: "Theo quy định + định kỳ" }],
      [{ vi: "Đội sơ cấp cứu / phụ trách PCCC" }, { vi: "Sơ cấp cứu, sử dụng bình chữa cháy, sơ tán" }, { vi: "Theo quy định pháp luật" }],
      [{ vi: "Trưởng dự án / cán bộ an toàn" }, { vi: "Đánh giá rủi ro, PTW, điều tra sự cố, quản lý nhà thầu" }, { vi: "Khi bổ nhiệm + cập nhật" }],
    ] },
  { t: "callout", variant: "warning", vi: "Không bố trí người chưa được huấn luyện phù hợp vào các công việc rủi ro cao (trên cao, điện, rigging, vận hành thiết bị nâng). Lưu hồ sơ huấn luyện theo Phụ lục L." },
  { t: "summary", items: [
    "Everyone completes HS&E induction on joining and annually; field crew/CTV get event-safety training before projects.",
    "High-risk tasks (working at height, rigging, temporary electrics, first aid/fire) require role-specific certified training.",
    "No untrained person is assigned to high-risk work; training records are kept per Annex L.",
  ] },
  { t: "pagebreak" },

  // =========================================================================
  { t: "part", vi: "PHẦN 3 — QUẢN LÝ RỦI RO", en: "PART 3 — RISK MANAGEMENT" },

  // ───────── Chương 8
  { t: "h1", num: 8, vi: "Nhận diện mối nguy & đánh giá rủi ro", en: "Hazard ID & risk assessment" },
  { t: "p", vi: "Mỗi dự án BTL phải có đánh giá rủi ro (Risk Assessment) hoàn thành TRƯỚC khi bắt đầu công việc hiện trường, sử dụng phương pháp JSA (phân tích theo từng bước công việc). Quy trình 5 bước:" },
  { t: "ol", items: [
    { vi: "Nhận diện mối nguy theo từng bước công việc (khảo sát, vận chuyển, dựng, show, tháo dỡ)." },
    { vi: "Xác định ai/cái gì có thể bị tổn hại và bằng cách nào." },
    { vi: "Đánh giá rủi ro (Khả năng × Mức nghiêm trọng) theo ma trận 5×5 và quyết định biện pháp kiểm soát theo Hierarchy of Controls." },
    { vi: "Ghi lại và truyền đạt biện pháp kiểm soát tới mọi người liên quan (qua briefing/Toolbox Talk)." },
    { vi: "Rà soát & cập nhật khi công việc, thời tiết hoặc địa điểm thay đổi." },
  ] },
  { t: "h2", vi: "8.1 Ma trận rủi ro 5×5", en: "" },
  { t: "table",
    head: [{ vi: "Điểm rủi ro (KN×NT)", en: "Score" }, { vi: "Mức", en: "Level" }, { vi: "Hành động yêu cầu", en: "Action" }],
    widths: [24, 22, 54],
    rows: [
      [{ vi: "1–4" }, { vi: "Thấp" }, { vi: "Chấp nhận; duy trì kiểm soát hiện có." }],
      [{ vi: "5–9" }, { vi: "Trung bình" }, { vi: "Bổ sung biện pháp kiểm soát; giám sát." }],
      [{ vi: "10–15" }, { vi: "Cao" }, { vi: "Phải giảm rủi ro trước khi làm; cần cán bộ an toàn duyệt." }],
      [{ vi: "16–25" }, { vi: "Rất cao" }, { vi: "DỪNG. Không thực hiện cho tới khi đưa về mức chấp nhận được; BoD/Trưởng dự án phê duyệt." }],
    ] },
  { t: "callout", variant: "note", vi: "Dùng mẫu Đánh giá rủi ro/JSA ở Phụ lục B. Với công việc trên cao, công việc nóng và điện, đánh giá rủi ro phải kèm Giấy phép làm việc (PTW) — Phụ lục D." },
  { t: "summary", items: [
    "Every BTL project needs a Risk Assessment completed before site work begins, using a step-by-step JSA method.",
    "Five steps: identify hazards per work step, decide who could be harmed, score risk on a 5×5 matrix and apply the Hierarchy of Controls, communicate controls, then review on change.",
    "High/very-high scores require risk reduction and sign-off before work; height, hot-work and electrical tasks also need a Permit To Work (Annex D).",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 9
  { t: "h1", num: 9, vi: "Sổ đăng ký rủi ro đặc thù BTL", en: "BTL risk register" },
  { t: "p", vi: "Bảng dưới liệt kê các mối nguy điển hình của hoạt động BTL và biện pháp kiểm soát nòng cốt. Đây là điểm khởi đầu — mỗi dự án phải bổ sung mối nguy đặc thù của mình." },
  { t: "table",
    head: [{ vi: "Mối nguy điển hình", en: "Typical hazard" }, { vi: "Biện pháp kiểm soát nòng cốt", en: "Core controls" }],
    widths: [34, 66],
    rows: [
      [{ vi: "Vật rơi / kết cấu tạm đổ (backdrop, standee, truss)" }, { vi: "Tính toán tải & neo giằng; đối trọng; rào vùng bên dưới khi lắp trên cao; kiểm tra trước show." }],
      [{ vi: "Ngã cao khi rigging/treo banner" }, { vi: "PTW trên cao; dây an toàn & điểm neo; giàn giáo/thang đạt chuẩn; cấm leo trèo tự phát." }],
      [{ vi: "Điện giật / cháy do điện tạm" }, { vi: "RCD/ELCB; dây đạt tải; chống nước IP phù hợp; chỉ thợ điện đấu nối; kiểm tra trước cấp điện." }],
      [{ vi: "Cháy nổ (venue, hiệu ứng, pyro)" }, { vi: "Lối thoát nạn thông thoáng; bình chữa cháy; giấy phép & khoảng cách an toàn cho pyro; vật liệu chống cháy." }],
      [{ vi: "Chen lấn / quản lý đám đông" }, { vi: "Giới hạn sức chứa; lối vào–ra tách biệt; nhân sự điều phối; kế hoạch sơ tán; phối hợp an ninh venue." }],
      [{ vi: "Nâng/mang vác nặng POSM, thiết bị" }, { vi: "Xe đẩy/thiết bị hỗ trợ; kỹ thuật nâng đúng; chia tải; đủ người; giới hạn trọng lượng." }],
      [{ vi: "Sốc nhiệt / thời tiết ngoài trời" }, { vi: "Bóng mát, nước uống, luân phiên nghỉ; theo dõi dự báo; hoãn khi giông/sét/gió mạnh." }],
      [{ vi: "Tai nạn giao thông khi di chuyển thiết bị/nhân sự" }, { vi: "Tài xế đủ điều kiện; chằng buộc hàng; không lái khi mệt; kế hoạch di chuyển." }],
      [{ vi: "Trượt ngã, dây cáp vướng chân" }, { vi: "Đi dây gọn, phủ nẹp cáp; giữ lối đi thông thoáng; chiếu sáng đủ." }],
      [{ vi: "Rủi ro cho công chúng (trẻ em, khách tham quan)" }, { vi: "Che cạnh sắc; khóa bánh xe; giám sát khu trải nghiệm; biển cảnh báo." }],
    ] },
  { t: "summary", items: [
    "This register lists typical BTL hazards — falling temporary structures, working-at-height falls, temporary-electrical shock/fire, crowd crush, manual handling, heat, transport — with core controls.",
    "It is a starting point; each project adds its own site-specific hazards.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 10
  { t: "h1", num: 10, vi: "Hệ thống Giấy phép làm việc (PTW)", en: "Permit To Work" },
  { t: "p", vi: "Giấy phép làm việc (PTW) là kiểm soát bắt buộc cho công việc rủi ro cao. Không bắt đầu công việc thuộc diện PTW khi chưa có giấy phép được duyệt và ký." },
  { t: "table",
    head: [{ vi: "Loại PTW", en: "Permit" }, { vi: "Áp dụng cho", en: "Applies to" }],
    widths: [30, 70],
    rows: [
      [{ vi: "Làm việc trên cao" }, { vi: "Rigging, treo truss/đèn/màn hình/banner, lắp mái, làm trên giàn giáo/thang cao > 2m." }],
      [{ vi: "Công việc nóng (Hot Work)" }, { vi: "Hàn, cắt, mài phát sinh tia lửa; sử dụng lửa trần." }],
      [{ vi: "Điện" }, { vi: "Đấu nối điện tạm, làm việc gần/với nguồn điện, vận hành máy phát công suất lớn." }],
    ] },
  { t: "p", vi: "Mỗi PTW nêu rõ: phạm vi & thời hạn, mối nguy & biện pháp kiểm soát, người thực hiện đủ điều kiện, người giám sát, và điều kiện đóng giấy phép sau khi hoàn thành." },
  { t: "summary", items: [
    "A Permit To Work is mandatory for high-risk tasks: working at height, hot work and electrical work — no permit, no start.",
    "Each permit defines scope and validity, hazards and controls, competent workers, a supervisor, and close-out conditions (Annex D).",
  ] },
  { t: "pagebreak" },

  // =========================================================================
  { t: "part", vi: "PHẦN 4 — KIỂM SOÁT VẬN HÀNH (QUY TRÌNH ĐẶC THÙ BTL)", en: "PART 4 — OPERATIONAL CONTROL" },

  // ───────── Chương 11
  { t: "h1", num: 11, vi: "An toàn dựng & tháo dỡ", en: "Set-up & dismantle safety" },
  { t: "p", vi: "Dựng và tháo dỡ là giai đoạn rủi ro cao nhất của một job BTL: nhiều người, thiết bị nặng, thời gian gấp, làm việc trên cao và song song nhiều đội." },
  { t: "ul", items: [
    "Có bản vẽ/layout và trình tự lắp dựng; phân vùng công việc rõ ràng, tránh chồng chéo đầu việc trên–dưới cùng vị trí.",
    "Kết cấu tạm (sân khấu, backdrop, gian hàng, truss) phải theo thiết kế chịu tải; neo, giằng, đối trọng đầy đủ; nghiệm thu trước khi cho người/khách tiếp cận.",
    "Rào và kiểm soát vùng bên dưới khi có công việc trên cao; đội mũ bảo hộ trong khu dựng.",
    "Kiểm tra an toàn tổng thể (checklist Phụ lục C) trước giờ mở cửa/show.",
    "Tháo dỡ chỉ bắt đầu khi khách/công chúng đã rời khu vực; đảo ngược trình tự lắp; không tháo ẩu vì áp lực trả mặt bằng.",
  ] },
  { t: "callout", variant: "danger", vi: "Không cho người đứng/đi bên dưới tải đang được nâng hoặc kết cấu chưa được cố định hoàn toàn. Vật rơi và kết cấu đổ là nguyên nhân hàng đầu gây tai nạn nghiêm trọng tại sự kiện." },
  { t: "summary", items: [
    "Build-up and dismantle are the highest-risk phases: many crew, heavy gear, time pressure, work at height, parallel teams.",
    "Use a layout and build sequence; zone the work to avoid people working above others; load-rate, brace and sign off temporary structures before access.",
    "Barricade areas under overhead work; run the site safety checklist (Annex C) before opening; dismantle only after the public has left, reversing the build sequence.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 12
  { t: "h1", num: 12, vi: "Làm việc trên cao", en: "Working at height" },
  { t: "ul", items: [
    "Áp dụng PTW trên cao cho mọi công việc > 2m hoặc nơi có nguy cơ ngã gây thương tích.",
    "Ưu tiên loại bỏ làm việc trên cao (lắp dưới đất rồi nâng lên). Khi bắt buộc: dùng giàn giáo/xe nâng người đạt chuẩn, hoặc dây an toàn toàn thân với điểm neo chắc chắn.",
    "Cấm dùng thang làm sàn thao tác kéo dài; thang chỉ để tiếp cận ngắn, có người giữ chân thang.",
    "Chỉ người đã huấn luyện làm việc trên cao mới được thực hiện; kiểm tra thiết bị chống ngã trước mỗi lần dùng.",
    "Cố định/đưa xuống dụng cụ, không để rơi; rào vùng bên dưới.",
  ] },
  { t: "summary", items: [
    "A height PTW applies to any work above ~2m or where a fall could injure.",
    "Prefer eliminating height work (assemble at ground, then lift); otherwise use rated scaffold/MEWP or full-body harness with a solid anchor.",
    "No ladders as prolonged work platforms; only trained workers; inspect fall-protection before use; secure tools and barricade below.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 13
  { t: "h1", num: 13, vi: "An toàn điện tạm & máy phát", en: "Temporary electrics & generators" },
  { t: "ul", items: [
    "Mọi mạch điện tạm phải có thiết bị chống dòng rò (RCD/ELCB); dây dẫn đủ tiết diện cho tải; đầu nối và ổ cắm đạt chuẩn chống nước (IP) khi dùng ngoài trời.",
    "Chỉ thợ điện có chuyên môn được đấu nối, kiểm tra và cấp điện; áp dụng PTW điện.",
    "Bảo vệ và định tuyến dây cáp tránh vũng nước, lối đi, cạnh sắc; dùng nẹp che cáp qua lối đi.",
    "Máy phát: đặt nơi thông thoáng, tránh khí thải vào khu vực người; tiếp đất đúng; đủ nhiên liệu dự phòng an toàn; bình chữa cháy gần kề.",
    "Kiểm tra tải tổng, tránh quá tải; ngắt điện an toàn khi tháo dỡ.",
  ] },
  { t: "callout", variant: "warning", vi: "Nước và điện là kết hợp chết người tại sự kiện ngoài trời. Che chắn nguồn điện, nâng cao đầu nối khỏi mặt đất, và ngừng vận hành khi mưa lớn nếu hệ thống không đạt chuẩn chống nước." },
  { t: "summary", items: [
    "All temporary circuits use RCD/ELCB protection, correctly rated cable, and weatherproof (IP-rated) connectors outdoors.",
    "Only competent electricians connect and energise, under an electrical PTW; route and protect cables away from water and walkways.",
    "Generators: ventilated placement away from people, proper earthing, safe refuelling, extinguisher nearby; avoid overload and isolate safely at dismantle.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 14
  { t: "h1", num: 14, vi: "Nâng/mang vác thủ công & vận chuyển vật tư", en: "Manual & material handling" },
  { t: "ul", items: [
    "Ưu tiên thiết bị hỗ trợ (xe đẩy, xe nâng tay, dây đai) thay vì sức người; chia nhỏ tải khi có thể.",
    "Kỹ thuật nâng đúng: chân rộng, gập gối, giữ lưng thẳng, ôm tải sát người, không xoay vặn thân.",
    "Bố trí đủ người cho vật cồng kềnh/nặng; thống nhất hiệu lệnh khi khiêng chung.",
    "Kiểm tra lối đi thông thoáng, đủ sáng, không trơn trượt trước khi di chuyển tải.",
    "Chằng buộc hàng chắc chắn trên xe; không chất quá tải phương tiện.",
  ] },
  { t: "summary", items: [
    "Prefer mechanical aids (trolleys, pallet jacks, straps) over muscle; split loads where possible.",
    "Use correct lifting technique, enough people for bulky/heavy items, and clear, well-lit, non-slip paths.",
    "Secure loads on vehicles and never overload.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 15
  { t: "h1", num: 15, vi: "Phòng cháy chữa cháy & hiệu ứng đặc biệt", en: "Fire safety & special effects" },
  { t: "ul", items: [
    "Luôn giữ lối thoát nạn và cửa thoát hiểm thông thoáng, có biển chỉ dẫn và chiếu sáng sự cố.",
    "Trang bị bình chữa cháy phù hợp loại đám cháy, đặt tại vị trí dễ tiếp cận; nhân sự biết cách sử dụng.",
    "Vật liệu trang trí ưu tiên loại chống cháy/khó cháy; tránh nguồn nhiệt gần vật liệu dễ cháy.",
    "Hiệu ứng đặc biệt/pháo kỹ xảo (pyro, lửa, khói): phải có giấy phép, đơn vị chuyên nghiệp, khoảng cách an toàn, và phối hợp với PCCC của venue.",
    "Phối hợp với ban quản lý venue về hệ thống báo cháy, chữa cháy và quy định phòng cháy tại chỗ.",
  ] },
  { t: "callout", variant: "danger", vi: "Không bao giờ chặn, khóa hay để vật cản trước lối thoát hiểm — kể cả tạm thời trong lúc dựng. Trong sự cố cháy, lối thoát bị chặn là nguyên nhân gây thương vong hàng loạt." },
  { t: "summary", items: [
    "Keep escape routes and fire exits clear, signed and emergency-lit at all times.",
    "Provide the right extinguishers within reach; use fire-retardant décor and keep heat sources away from combustibles.",
    "Special effects/pyro require permits, professional operators, safe distances and coordination with venue fire systems.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 16
  { t: "h1", num: 16, vi: "Quản lý đám đông & an toàn công chúng", en: "Crowd management & public safety" },
  { t: "ul", items: [
    "Xác định sức chứa an toàn; kiểm soát số lượng người vào; tách lối vào và lối ra để tránh dòng người ngược chiều.",
    "Bố trí đủ nhân sự điều phối/an ninh; có phương án cho tình huống chen lấn, ngất xỉu, trẻ lạc.",
    "Kế hoạch sơ tán rõ ràng: lối thoát, điểm tập kết, người phụ trách, thông báo hiệu lệnh.",
    "Che chắn khu vực nguy hiểm (điện, kết cấu, sân khấu) khỏi công chúng; đặc biệt lưu ý trẻ em.",
    "Phối hợp với an ninh và quản lý của venue; có kênh liên lạc nội bộ (bộ đàm) giữa các chốt.",
  ] },
  { t: "summary", items: [
    "Set a safe capacity, control entry numbers, and separate entry/exit flows.",
    "Provide enough stewards/security, plans for crush, fainting and lost children, and a clear evacuation plan (routes, assembly point, marshals).",
    "Screen hazardous areas from the public — especially children — and coordinate with venue security via radios.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 17
  { t: "h1", num: 17, vi: "An toàn giao thông & di chuyển hiện trường", en: "Transport & travel safety" },
  { t: "ul", items: [
    "Tài xế đủ điều kiện, giấy phép hợp lệ; không lái xe khi mệt mỏi hoặc sau ca dài liên tục.",
    "Chằng buộc, cố định thiết bị/POSM trên xe; không chở người trên thùng hàng.",
    "Lập kế hoạch di chuyển (giờ, tuyến, điểm dừng nghỉ) cho các chặng đường dài (roadshow đa tỉnh).",
    "Tại site: tách luồng xe tải/xe nâng khỏi luồng người đi bộ trong lúc dựng/tháo; người điều phối lùi xe.",
  ] },
  { t: "summary", items: [
    "Use licensed, fit drivers who don't drive fatigued; secure equipment/POSM and never carry people in cargo areas.",
    "Plan journeys for long multi-province roadshows; on site, separate vehicle and pedestrian flows during build/dismantle with a banksman for reversing.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 18
  { t: "h1", num: 18, vi: "An toàn nhân sự hiện trường / PG–PB–promoter", en: "Field crew (PG/PB) safety" },
  { t: "p", vi: "Nhân sự hiện trường và CTV (PG/PB, promoter, helper, mascot, MC) thường làm việc nhiều giờ, đứng lâu, ngoài trời, đôi khi ở địa điểm lạ — cần biện pháp bảo vệ riêng." },
  { t: "ul", items: [
    "Sốc nhiệt/mất nước: cung cấp nước uống, bóng mát, luân phiên nghỉ; theo dõi dấu hiệu kiệt sức, đặc biệt khi mặc mascot.",
    "Đứng lâu & mệt mỏi: bố trí giờ nghỉ, chỗ ngồi khi có thể; giới hạn thời gian mặc mascot mỗi lượt.",
    "Làm việc đơn độc / địa điểm lạ: luôn có đầu mối liên lạc, số điện thoại khẩn cấp, và cơ chế check-in.",
    "Phòng chống quấy rối & bảo vệ nhân phẩm: quy tắc ứng xử rõ ràng; kênh báo cáo an toàn; hỗ trợ khi bị khách quấy rối; không dung túng hành vi quấy rối.",
    "Trang phục phù hợp thời tiết & an toàn (giày kín khi dựng/tháo; tránh phụ kiện dễ vướng vào máy móc).",
  ] },
  { t: "callout", variant: "good", vi: "Briefing đầu ca cho CTV phải luôn gồm: điểm sơ cấp cứu & thoát hiểm gần nhất, đầu mối liên hệ, quy tắc nghỉ – uống nước, và cách báo cáo sự cố/quấy rối." },
  { t: "summary", items: [
    "Field crew/CTV (PG/PB, promoters, helpers, mascots, MC) often work long hours, standing, outdoors, sometimes at unfamiliar venues — needing specific protection.",
    "Manage heat/dehydration (water, shade, rotation — especially mascots), fatigue from prolonged standing, lone-working check-ins, and anti-harassment protection with a safe reporting channel.",
    "Every shift briefing covers nearest first-aid/exits, contacts, rest/hydration rules and how to report incidents or harassment.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 19
  { t: "h1", num: 19, vi: "Quản lý HS&E nhà thầu & nhà cung cấp", en: "Contractor & supplier HS&E" },
  { t: "ul", items: [
    "Tiền đánh giá (pre-qualification) nhà thầu rủi ro cao (production, rigging, âm thanh ánh sáng, điện): năng lực, kinh nghiệm, hồ sơ an toàn, bảo hiểm — Phụ lục H.",
    "Yêu cầu phương án an toàn & đánh giá rủi ro của nhà thầu cho phần việc của họ trước khi vào site.",
    "Ràng buộc tuân thủ HS&E của TCM trong hợp đồng; nhà thầu tự chịu trách nhiệm giám sát nhân sự của mình.",
    "Briefing nhập site cho nhà thầu; kiểm tra PPE và chứng chỉ cần thiết (làm việc trên cao, điện).",
  ] },
  { t: "summary", items: [
    "Pre-qualify high-risk contractors (production, rigging, AV, electrical) on competence, safety record and insurance (Annex H).",
    "Require their method statement and risk assessment before site access; bind TCM HS&E compliance in the contract.",
    "Give site-induction briefings and check PPE and certificates (height, electrical) on arrival.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 20
  { t: "h1", num: 20, vi: "Chương trình Phương tiện bảo vệ cá nhân (PPE)", en: "PPE program" },
  { t: "table",
    head: [{ vi: "Công việc", en: "Task" }, { vi: "PPE tối thiểu", en: "Minimum PPE" }],
    widths: [40, 60],
    rows: [
      [{ vi: "Dựng/tháo, khu có tải trên cao" }, { vi: "Mũ bảo hộ, giày mũi cứng, găng tay" }],
      [{ vi: "Làm việc trên cao / rigging" }, { vi: "Dây an toàn toàn thân, mũ có quai, giày chống trượt" }],
      [{ vi: "Điện" }, { vi: "Găng cách điện phù hợp, giày cách điện, dụng cụ cách điện" }],
      [{ vi: "Ngoài trời nắng nóng" }, { vi: "Mũ/nón, chống nắng, đủ nước; trang phục thoáng" }],
      [{ vi: "Bốc xếp, kho" }, { vi: "Giày mũi cứng, găng tay, áo phản quang khi có xe di chuyển" }],
    ] },
  { t: "ul", items: [
    "PPE cấp miễn phí, đúng cỡ, còn tốt; hướng dẫn sử dụng và bảo quản.",
    "Kiểm tra PPE trước khi dùng; loại bỏ PPE hư hỏng (đặc biệt dây an toàn sau va đập).",
    "Lưu sổ cấp phát PPE — Phụ lục J.",
  ] },
  { t: "callout", variant: "note", vi: "PPE là lớp bảo vệ CUỐI CÙNG trong Hierarchy of Controls — không thay thế cho việc loại bỏ mối nguy hay kiểm soát kỹ thuật. Luôn ưu tiên xử lý gốc rễ trước." },
  { t: "summary", items: [
    "PPE is issued free, correctly sized and in good condition, with guidance on use and care.",
    "Inspect before use; discard damaged PPE (especially harnesses after a fall); log issuance (Annex J).",
    "PPE is the last line in the Hierarchy of Controls — never a substitute for eliminating hazards or engineering controls.",
  ] },
  { t: "pagebreak" },

  // =========================================================================
  { t: "part", vi: "PHẦN 5 — SỨC KHỎE & PHÚC LỢI", en: "PART 5 — HEALTH & WELFARE" },

  // ───────── Chương 21
  { t: "h1", num: 21, vi: "Sức khỏe nghề nghiệp", en: "Occupational health" },
  { t: "ul", items: [
    "Sốc nhiệt: nhận biết dấu hiệu (chóng mặt, buồn nôn, ngừng đổ mồ hôi); sơ cứu bằng làm mát & bù nước; gọi y tế khi nặng.",
    "Ergonomics & vận động lặp lại: bố trí công việc giảm tư thế xấu; luân phiên nhiệm vụ; nghỉ giải lao.",
    "Mệt mỏi do giờ sự kiện kéo dài: giới hạn giờ làm liên tục hợp lý; bảo đảm nghỉ giữa các ca dựng đêm và show.",
    "Tiếng ồn (sân khấu, loa công suất lớn): hạn chế thời gian tiếp xúc; nút tai khi cần cho nhân sự gần nguồn.",
  ] },
  { t: "summary", items: [
    "Recognise and treat heat stress (cool, hydrate, escalate); manage ergonomics and repetitive tasks with rotation and breaks.",
    "Control fatigue from long event hours with sensible limits and rest between overnight builds and shows.",
    "Limit noise exposure near loudspeakers/stage; provide ear protection where needed.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 22
  { t: "h1", num: 22, vi: "Sơ cấp cứu & y tế hiện trường", en: "First aid & site medical" },
  { t: "ul", items: [
    "Mỗi sự kiện có tối thiểu một người được huấn luyện sơ cấp cứu và một túi/hộp sơ cứu đầy đủ, đặt ở vị trí ai cũng biết.",
    "Sự kiện lớn/đông người: bố trí nhân viên y tế/xe cứu thương theo quy mô và yêu cầu venue.",
    "Niêm yết số điện thoại khẩn cấp (cấp cứu 115, cứu hỏa 114, công an 113) và địa chỉ bệnh viện gần nhất.",
    "Ghi nhận mọi trường hợp sơ cứu vào Sổ/Báo cáo sự cố (Phụ lục E).",
  ] },
  { t: "summary", items: [
    "Every event has at least one trained first-aider and a stocked first-aid kit at a known location.",
    "Large/crowded events provide medics/ambulance scaled to size and venue rules; post emergency numbers (115/114/113) and the nearest hospital.",
    "Record all first-aid cases in the incident report (Annex E).",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 23
  { t: "h1", num: 23, vi: "Vệ sinh & an toàn thực phẩm, bệnh truyền nhiễm", en: "Hygiene, food safety & disease" },
  { t: "ul", items: [
    "Sampling thực phẩm/đồ uống: nguồn gốc rõ ràng, bảo quản đúng nhiệt độ, vệ sinh tay và dụng cụ, tránh nhiễm chéo và quá hạn.",
    "Cung cấp điểm rửa tay/nước sát khuẩn cho nhân sự và (khi phù hợp) cho khách trải nghiệm.",
    "Bệnh truyền nhiễm: nhân sự có triệu chứng nên nghỉ; áp dụng biện pháp phòng dịch theo khuyến cáo y tế hiện hành khi cần.",
    "Nhà vệ sinh và nước sạch sẵn có cho nhân sự tại các sự kiện dài/ngoài trời.",
  ] },
  { t: "summary", items: [
    "For food/drink sampling: reputable sourcing, correct temperature storage, hand and utensil hygiene, no cross-contamination or expiry.",
    "Provide handwashing/sanitiser for crew and guests; symptomatic staff stay home; apply public-health measures when required.",
    "Ensure toilets and clean water for crew at long/outdoor events.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 24
  { t: "h1", num: 24, vi: "Sức khỏe tinh thần & phúc lợi", en: "Mental health & wellbeing" },
  { t: "ul", items: [
    "Nhìn nhận áp lực deadline và giờ giấc bất thường của ngành sự kiện; quản lý khối lượng công việc hợp lý.",
    "Khuyến khích môi trường tôn trọng, không bắt nạt/quấy rối; có kênh hỗ trợ và báo cáo an toàn.",
    "Bảo đảm nghỉ ngơi và phục hồi sau các dự án cao điểm.",
  ] },
  { t: "summary", items: [
    "Acknowledge event-industry deadline pressure and irregular hours; manage workloads.",
    "Foster a respectful, harassment-free environment with confidential support channels and recovery time after peak projects.",
  ] },
  { t: "pagebreak" },

  // =========================================================================
  { t: "part", vi: "PHẦN 6 — ỨNG PHÓ KHẨN CẤP", en: "PART 6 — EMERGENCY PREPAREDNESS" },

  // ───────── Chương 25
  { t: "h1", num: 25, vi: "Kế hoạch ứng phó khẩn cấp", en: "Emergency response plan" },
  { t: "p", vi: "Mỗi sự kiện phải có kế hoạch ứng phó khẩn cấp phù hợp quy mô, được truyền đạt tới toàn đội trước show." },
  { t: "ul", items: [
    "Các tình huống: cháy, sự cố y tế, chen lấn đám đông, thời tiết cực đoan (giông, sét, gió mạnh), mất điện, sự cố kết cấu.",
    "Xác định: lối thoát & điểm tập kết, người chỉ huy sự cố, vai trò từng người, hiệu lệnh sơ tán, cách gọi cứu hộ.",
    "Ngưỡng dừng/hoãn sự kiện ngoài trời khi thời tiết nguy hiểm; ai có quyền quyết định dừng.",
    "Danh bạ khẩn cấp và sơ đồ leo thang liên lạc — Phụ lục I.",
  ] },
  { t: "callout", variant: "warning", vi: "Thời tiết cực đoan (giông sét, gió giật) là mối nguy nghiêm trọng với kết cấu tạm và đám đông ngoài trời. Phải có ngưỡng và người quyết định dừng show rõ ràng TRƯỚC sự kiện — không quyết định vội trong lúc hỗn loạn." },
  { t: "summary", items: [
    "Every event has a scaled emergency plan communicated to the whole crew before the show.",
    "Covers fire, medical, crowd crush, extreme weather, power loss and structural failure; defines exits, assembly point, incident commander, roles, evacuation signal and how to call rescue services.",
    "Pre-agree weather stop/postpone thresholds and who decides; keep an emergency contact list and escalation chart (Annex I).",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 26
  { t: "h1", num: 26, vi: "Báo cáo, điều tra sự cố & hành động khắc phục", en: "Incident reporting & investigation" },
  { t: "ul", items: [
    "Báo cáo MỌI tai nạn, thương tích, và cận nguy (near-miss) — kể cả không gây thương tích — bằng mẫu Phụ lục E, càng sớm càng tốt.",
    "Sơ cứu/xử lý khẩn cấp trước; bảo vệ hiện trường với sự cố nghiêm trọng để phục vụ điều tra.",
    "Điều tra tìm nguyên nhân gốc rễ (không đổ lỗi cá nhân); xác định hành động khắc phục & phòng ngừa, người chịu trách nhiệm và thời hạn.",
    "Chia sẻ bài học qua họp HS&E; cập nhật đánh giá rủi ro và Sổ tay khi cần.",
    "Tai nạn lao động nghiêm trọng: khai báo cho cơ quan chức năng theo quy định pháp luật.",
  ] },
  { t: "summary", items: [
    "Report all accidents, injuries and near-misses (even harmless ones) on the Annex E form as soon as possible.",
    "First aid first; preserve the scene for serious incidents; investigate for root cause without blame and assign corrective/preventive actions with owners and deadlines.",
    "Share lessons at HS&E meetings; serious occupational accidents are notified to authorities as required by law.",
  ] },
  { t: "pagebreak" },

  // =========================================================================
  { t: "part", vi: "PHẦN 7 — MÔI TRƯỜNG", en: "PART 7 — ENVIRONMENT" },

  // ───────── Chương 27
  { t: "h1", num: 27, vi: "Chính sách & khía cạnh môi trường", en: "Environmental policy & aspects" },
  { t: "p", vi: "TCM cam kết giảm thiểu tác động môi trường của hoạt động BTL — vốn phát sinh nhiều vật liệu dùng một lần (POSM, backdrop, in ấn) và tiêu thụ năng lượng tạm." },
  { t: "table",
    head: [{ vi: "Khía cạnh môi trường", en: "Aspect" }, { vi: "Định hướng kiểm soát", en: "Control direction" }],
    widths: [34, 66],
    rows: [
      [{ vi: "Chất thải POSM & vật liệu trang trí" }, { vi: "Thiết kế bền/tái sử dụng; phân loại; tái chế; hạn chế in ấn thừa." }],
      [{ vi: "Nhựa dùng một lần" }, { vi: "Giảm/thay thế bằng vật liệu tái chế được; ưu tiên phương án ít nhựa." }],
      [{ vi: "Năng lượng (điện tạm, máy phát)" }, { vi: "Đúng công suất, tránh lãng phí; ưu tiên thiết bị tiết kiệm điện/LED." }],
      [{ vi: "Tiếng ồn & ảnh hưởng cộng đồng" }, { vi: "Tuân thủ giờ giấc & mức ồn cho phép; tôn trọng khu dân cư." }],
    ] },
  { t: "summary", items: [
    "BTL generates single-use materials (POSM, backdrops, print) and temporary energy use; TCM commits to minimising impact.",
    "Key aspects: POSM/décor waste, single-use plastics, energy, and noise/community impact — each with a control direction toward reuse, recycling and efficiency.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 28
  { t: "h1", num: 28, vi: "Quản lý chất thải & sự kiện xanh", en: "Waste management & green events" },
  { t: "ul", items: [
    "Phân loại rác tại nguồn ở site (tái chế / thông thường / nguy hại) và xử lý qua đơn vị thu gom hợp lệ.",
    "Tái sử dụng POSM và kết cấu giữa các sự kiện (ghi nhận theo dõi tái sử dụng — nhất quán với thực hành đang dùng trên nền tảng vận hành).",
    "Ưu tiên vật liệu tái chế được, in ấn vừa đủ, và số hóa nơi có thể (giảm ấn phẩm giấy).",
    "Thu dọn sạch mặt bằng sau tháo dỡ (trả venue nguyên trạng); ghi nhật ký chất thải — Phụ lục K.",
    "Chất thải nguy hại (pin, bóng đèn, hóa chất) thu gom riêng, không đổ lẫn rác thường.",
  ] },
  { t: "callout", variant: "good", vi: "Sự kiện xanh vừa giảm tác động môi trường vừa nâng giá trị thương hiệu cho khách hàng. Đề xuất phương án bền vững (tái sử dụng, ít nhựa) như một điểm cộng khi làm CO/CE và proposal." },
  { t: "summary", items: [
    "Segregate waste at source on site and use licensed collectors; reuse POSM and structures between events.",
    "Prefer recyclable materials, right-size printing, digitise where possible, and leave venues clean; log waste (Annex K).",
    "Collect hazardous waste (batteries, lamps, chemicals) separately; green events cut impact and add brand value.",
  ] },
  { t: "pagebreak" },

  // =========================================================================
  { t: "part", vi: "PHẦN 8 — HUẤN LUYỆN & TRUYỀN THÔNG", en: "PART 8 — TRAINING & COMMUNICATION" },

  // ───────── Chương 29
  { t: "h1", num: 29, vi: "Chương trình huấn luyện & đào tạo nhập môn", en: "Training & induction program" },
  { t: "ul", items: [
    "Nhập môn HS&E (induction) cho mọi người mới trước khi bắt đầu công việc; phiên bản rút gọn cho CTV hiện trường tập trung vào rủi ro thực tế của job.",
    "Huấn luyện chuyên biệt theo vai trò (trên cao, điện, sơ cấp cứu, PCCC) — xem ma trận Chương 7.",
    "Tài liệu huấn luyện song ngữ/đơn giản, trực quan; kiểm tra hiểu bài và ký xác nhận (Phụ lục G).",
    "Cập nhật huấn luyện khi có quy trình mới, sau sự cố, hoặc theo chu kỳ định kỳ.",
  ] },
  { t: "summary", items: [
    "HS&E induction for all newcomers before work, with a focused short version for field CTV on the job's real risks.",
    "Role-specific training (height, electrical, first aid, fire) per the Chapter 7 matrix, with comprehension checks and signed acknowledgement (Annex G).",
    "Refresh training on new procedures, after incidents, or on a periodic cycle.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 30
  { t: "h1", num: 30, vi: "Toolbox Talk & briefing trước sự kiện", en: "Toolbox Talks & pre-event briefing" },
  { t: "p", vi: "Trước mỗi ca dựng/tháo và trước mỗi show, đội trưởng/cán bộ an toàn tổ chức một buổi họp an toàn ngắn (Toolbox Talk) 5–10 phút." },
  { t: "ul", items: [
    "Nội dung: công việc hôm nay & rủi ro chính, biện pháp kiểm soát, phân vai, PPE bắt buộc.",
    "Thông tin khẩn cấp: lối thoát, điểm sơ cứu, đầu mối liên hệ, ngưỡng dừng việc.",
    "Nhắc quyền dừng việc và cách báo cáo mối nguy/cận nguy.",
    "Ghi nhận người tham dự (Phụ lục F).",
  ] },
  { t: "summary", items: [
    "Before each build/dismantle shift and each show, run a 5–10 minute Toolbox Talk.",
    "Cover the day's tasks and main risks, controls, roles, mandatory PPE, emergency info, Stop Work Authority and how to report hazards; record attendance (Annex F).",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 31
  { t: "h1", num: 31, vi: "Truyền thông, biển báo & chiến dịch an toàn", en: "Communication, signage & campaigns" },
  { t: "ul", items: [
    "Biển báo an toàn rõ ràng tại site: lối thoát, khu vực hạn chế, cảnh báo điện/độ cao/vật rơi.",
    "Truyền thông nội bộ về an toàn qua nền tảng vận hành TCM (mục Trao đổi/Thông báo) và họp đội.",
    "Chiến dịch nhắc nhở theo mùa vụ (ví dụ nắng nóng, mùa mưa bão) và sau các bài học từ sự cố.",
  ] },
  { t: "summary", items: [
    "Provide clear safety signage on site (exits, restricted areas, electrical/height/falling-object warnings).",
    "Communicate safety internally via the TCM platform (Chat/Notifications) and team meetings, with seasonal reminder campaigns and post-incident lessons.",
  ] },
  { t: "pagebreak" },

  // =========================================================================
  { t: "part", vi: "PHẦN 9 — GIÁM SÁT & CẢI TIẾN", en: "PART 9 — MONITORING & IMPROVEMENT" },

  // ───────── Chương 32
  { t: "h1", num: 32, vi: "Kiểm tra & đánh giá (audit)", en: "Inspections & audits" },
  { t: "ul", items: [
    "Kiểm tra an toàn hiện trường trước show bằng checklist (Phụ lục C); ghi nhận & xử lý điểm không đạt trước khi mở cửa.",
    "Đánh giá nội bộ định kỳ mức độ tuân thủ Sổ tay theo từng bộ phận/dự án.",
    "Theo dõi việc đóng các hành động khắc phục từ sự cố và audit.",
  ] },
  { t: "summary", items: [
    "Run a pre-show site inspection using the checklist (Annex C) and fix non-conformities before opening.",
    "Conduct periodic internal audits of manual compliance by team/project and track closure of corrective actions.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 33
  { t: "h1", num: 33, vi: "Đo lường hiệu quả & KPI HS&E", en: "Performance & KPIs" },
  { t: "table",
    head: [{ vi: "Loại chỉ số", en: "Type" }, { vi: "Ví dụ KPI", en: "Example KPIs" }],
    widths: [30, 70],
    rows: [
      [{ vi: "Chỉ số dẫn (leading)" }, { vi: "% dự án có đánh giá rủi ro trước site; số Toolbox Talk; % nhân sự được huấn luyện; số báo cáo cận nguy." }],
      [{ vi: "Chỉ số trễ (lagging)" }, { vi: "Số tai nạn/thương tích; số ngày nghỉ do tai nạn; số sự cố nghiêm trọng; số điểm không đạt khi audit." }],
    ] },
  { t: "callout", variant: "note", vi: "Chỉ số dẫn (phòng ngừa) quan trọng hơn chỉ số trễ. Nhiều báo cáo cận nguy KHÔNG phải tin xấu — đó là dấu hiệu văn hóa an toàn tốt, giúp ngăn tai nạn thật." },
  { t: "summary", items: [
    "Track both leading indicators (risk assessments before site, Toolbox Talks, trained %, near-miss reports) and lagging ones (accidents, lost days, serious incidents, audit findings).",
    "Leading, preventive indicators matter most; a high near-miss count signals a healthy culture, not bad news.",
  ] },
  { t: "pagebreak" },

  // ───────── Chương 34
  { t: "h1", num: 34, vi: "Rà soát của lãnh đạo & cải tiến liên tục", en: "Management review & improvement" },
  { t: "ul", items: [
    "Ban Giám đốc rà soát hiệu quả HS&E định kỳ (tối thiểu hằng năm): KPI, sự cố, kết quả audit, mức độ đạt mục tiêu.",
    "Đặt mục tiêu cải tiến cho kỳ tiếp theo và phân bổ nguồn lực.",
    "Cập nhật Sổ tay khi có thay đổi pháp luật, quy trình, bài học từ sự cố, hoặc loại hình dự án mới.",
  ] },
  { t: "callout", variant: "good", vi: "Sổ tay này là tài liệu sống. Mọi nhân sự được khuyến khích đề xuất cải tiến. Phiên bản cập nhật được ban hành và truyền đạt lại tới toàn công ty." },
  { t: "summary", items: [
    "The Board reviews HS&E performance at least annually (KPIs, incidents, audits, objectives) and sets improvement goals with resources.",
    "The manual is a living document, updated for legal/process changes, incident lessons and new project types; everyone is encouraged to suggest improvements.",
  ] },
  { t: "pagebreak" },

  // =========================================================================
  { t: "part", vi: "PHỤ LỤC — BIỂU MẪU & CHECKLIST", en: "ANNEXES — FORMS & CHECKLISTS" },
  { t: "p", vi: "Các biểu mẫu dưới đây là mẫu chuẩn, sẵn sàng in và sử dụng tại hiện trường. Bộ phận HS&E có thể số hóa các biểu mẫu này trên nền tảng vận hành TCM." },

  { t: "annexList" }, // renderer chèn các biểu mẫu A..M (định nghĩa ở annexes bên dưới)
];

// =============================================================================
// TUYÊN BỐ CHÍNH SÁCH HS&E — song ngữ đầy đủ
// =============================================================================
export const policy = {
  titleVi: "TUYÊN BỐ CHÍNH SÁCH AN TOÀN, SỨC KHỎE & MÔI TRƯỜNG",
  titleEn: "HEALTH, SAFETY & ENVIRONMENT POLICY STATEMENT",
  vi: [
    "TCM — Targeted Marketing cam kết bảo vệ an toàn và sức khỏe của mọi nhân sự, cộng tác viên, nhà thầu và công chúng tham gia các hoạt động của chúng tôi, đồng thời giảm thiểu tác động tới môi trường. An toàn là giá trị cốt lõi và là điều kiện tiên quyết của mọi công việc.",
    "Để thực hiện cam kết này, Ban Giám đốc TCM bảo đảm:",
  ],
  viBullets: [
    "Tuân thủ đầy đủ pháp luật Việt Nam về an toàn, vệ sinh lao động, phòng cháy chữa cháy và bảo vệ môi trường, cùng các tiêu chuẩn tham chiếu ISO 45001 & ISO 14001.",
    "Đánh giá và kiểm soát rủi ro cho mọi dự án BTL trước khi triển khai hiện trường, theo thứ tự ưu tiên kiểm soát rủi ro.",
    "Cung cấp nguồn lực, huấn luyện và phương tiện bảo vệ cá nhân cần thiết.",
    "Trao cho mọi người quyền dừng công việc khi phát hiện nguy hiểm, không bị trù dập.",
    "Báo cáo, điều tra và học hỏi từ mọi sự cố; cải tiến liên tục hệ thống HS&E.",
    "Ưu tiên các phương án sự kiện bền vững, giảm chất thải và tái sử dụng vật liệu.",
  ],
  viClose: "Chính sách này được truyền đạt tới toàn thể nhân sự và các bên liên quan, và được rà soát định kỳ.",
  en: [
    "TCM — Targeted Marketing is committed to protecting the safety and health of all our staff, collaborators, contractors and the public involved in our activities, while minimising our environmental impact. Safety is a core value and a precondition of all work.",
    "To deliver this commitment, TCM's Board of Directors ensures:",
  ],
  enBullets: [
    "Full compliance with Vietnamese law on occupational safety and health, fire prevention and environmental protection, and with the ISO 45001 & ISO 14001 reference standards.",
    "Risk assessment and control for every BTL project before site work, following the Hierarchy of Controls.",
    "Provision of the necessary resources, training and personal protective equipment.",
    "Stop Work Authority for everyone who identifies danger, without fear of reprisal.",
    "Reporting, investigating and learning from all incidents, and continually improving the HS&E system.",
    "Preference for sustainable event options that reduce waste and reuse materials.",
  ],
  enClose: "This policy is communicated to all staff and stakeholders and is reviewed periodically.",
  signRoles: [
    { vi: "Đại diện Ban Giám đốc", en: "For and on behalf of the Board of Directors" },
  ],
};

// =============================================================================
// PHỤ LỤC — biểu mẫu (mỗi phụ lục render 1 khối tiêu đề + mô tả + bảng trường)
// =============================================================================
export const annexes = [
  { code: "A", vi: "Chính sách HS&E (bản ký ban hành)", en: "HS&E Policy (signed)",
    desc: { vi: "Bản in Tuyên bố Chính sách HS&E có chữ ký của đại diện Ban Giám đốc, niêm yết tại văn phòng và cung cấp cho các bên liên quan.", en: "Printed HS&E Policy Statement signed by the Board, posted at the office and given to stakeholders." },
    fields: [] },

  { code: "B", vi: "Mẫu Đánh giá rủi ro / JSA", en: "Risk Assessment / JSA form",
    desc: { vi: "Dùng cho mỗi dự án trước khi làm việc hiện trường.", en: "Used for each project before site work." },
    fields: [
      ["Dự án / Sự kiện", "Project / Event"], ["Địa điểm", "Location"], ["Ngày đánh giá", "Date"], ["Người đánh giá", "Assessor"],
      ["Bước công việc", "Work step"], ["Mối nguy", "Hazard"], ["Ai có thể bị hại", "Who may be harmed"],
      ["Khả năng (1–5)", "Likelihood"], ["Nghiêm trọng (1–5)", "Severity"], ["Điểm rủi ro", "Risk score"],
      ["Biện pháp kiểm soát", "Controls"], ["Rủi ro còn lại", "Residual risk"], ["Người phụ trách", "Owner"],
    ] },

  { code: "C", vi: "Checklist kiểm tra an toàn site sự kiện", en: "Event site safety checklist",
    desc: { vi: "Hoàn thành trước giờ mở cửa/show.", en: "Complete before opening/show." },
    check: [
      ["Kết cấu tạm được neo/giằng, đã nghiệm thu", "Temporary structures braced and signed off"],
      ["Điện tạm có RCD/ELCB, cáp được che/định tuyến an toàn", "Temporary electrics: RCD/ELCB, cables protected"],
      ["Lối thoát nạn thông thoáng, có biển & chiếu sáng", "Escape routes clear, signed and lit"],
      ["Bình chữa cháy & túi sơ cứu đủ, đúng vị trí", "Extinguishers & first-aid kit present"],
      ["PPE sẵn có và được sử dụng", "PPE available and used"],
      ["Khu vực nguy hiểm được rào/che khỏi công chúng", "Hazard areas screened from public"],
      ["Danh bạ khẩn cấp & kế hoạch sơ tán được phổ biến", "Emergency contacts & evac plan briefed"],
      ["Đã tổ chức Toolbox Talk đầu ca", "Toolbox Talk held"],
    ] },

  { code: "D", vi: "Giấy phép làm việc (trên cao / nóng / điện)", en: "Permit To Work (height / hot / electrical)",
    desc: { vi: "Bắt buộc cho công việc rủi ro cao; ký duyệt trước khi làm, đóng phép sau khi xong.", en: "Mandatory for high-risk work; signed before start, closed after completion." },
    fields: [
      ["Loại giấy phép", "Permit type"], ["Phạm vi công việc", "Work scope"], ["Địa điểm", "Location"],
      ["Hiệu lực từ – đến", "Valid from – to"], ["Mối nguy & kiểm soát", "Hazards & controls"],
      ["Người thực hiện (đủ điều kiện)", "Competent worker(s)"], ["Người giám sát", "Supervisor"],
      ["Cấp phép (ký)", "Issued by (sign)"], ["Đóng phép (ký)", "Closed by (sign)"],
    ] },

  { code: "E", vi: "Mẫu Báo cáo sự cố / cận nguy", en: "Incident / near-miss report",
    desc: { vi: "Báo cáo mọi tai nạn, thương tích và cận nguy càng sớm càng tốt.", en: "Report all accidents, injuries and near-misses as soon as possible." },
    fields: [
      ["Ngày giờ & địa điểm", "Date/time & location"], ["Dự án", "Project"], ["Loại (tai nạn/cận nguy)", "Type"],
      ["Người liên quan", "People involved"], ["Mô tả diễn biến", "Description"], ["Thương tích/thiệt hại", "Injury/damage"],
      ["Sơ cứu/xử lý ngay", "Immediate action"], ["Nguyên nhân gốc rễ", "Root cause"],
      ["Hành động khắc phục", "Corrective action"], ["Người phụ trách & hạn", "Owner & deadline"], ["Người báo cáo", "Reported by"],
    ] },

  { code: "F", vi: "Biên bản Toolbox Talk / briefing", en: "Toolbox Talk / briefing record",
    desc: { vi: "Ghi nhận nội dung và người tham dự buổi họp an toàn.", en: "Record topic and attendance of the safety talk." },
    fields: [
      ["Dự án / Ngày / Ca", "Project / Date / Shift"], ["Người chủ trì", "Led by"], ["Chủ đề & rủi ro chính", "Topic & key risks"],
      ["Biện pháp kiểm soát nhắc lại", "Controls reiterated"], ["Danh sách người tham dự (ký)", "Attendees (sign)"],
    ] },

  { code: "G", vi: "Phiếu huấn luyện an toàn & cam kết (nhân sự hiện trường/CTV)", en: "Field-crew safety induction & acknowledgement",
    desc: { vi: "Ký xác nhận đã được huấn luyện và cam kết tuân thủ trước khi vào việc.", en: "Signed acknowledgement of induction and commitment before starting." },
    fields: [
      ["Họ tên & vai trò", "Name & role"], ["Dự án", "Project"], ["Ngày huấn luyện", "Induction date"],
      ["Nội dung đã huấn luyện", "Topics covered"], ["Cam kết tuân thủ quy tắc an toàn", "Commitment to safety rules"],
      ["Chữ ký nhân sự", "Worker signature"], ["Người huấn luyện", "Trainer"],
    ] },

  { code: "H", vi: "Bảng tiền đánh giá HS&E nhà thầu", en: "Contractor HS&E pre-qualification",
    desc: { vi: "Đánh giá trước khi ký hợp đồng với nhà thầu rủi ro cao.", en: "Assess before contracting high-risk vendors." },
    fields: [
      ["Nhà thầu & hạng mục", "Contractor & scope"], ["Kinh nghiệm & năng lực", "Experience & competence"],
      ["Hồ sơ an toàn (sự cố quá khứ)", "Safety record"], ["Chứng chỉ nhân sự (cao/điện)", "Worker certificates"],
      ["Phương án an toàn & đánh giá rủi ro", "Method statement & risk assessment"], ["Bảo hiểm", "Insurance"],
      ["Kết luận (đạt/không)", "Decision (pass/fail)"],
    ] },

  { code: "I", vi: "Danh bạ khẩn cấp & sơ đồ leo thang", en: "Emergency contacts & escalation",
    desc: { vi: "Niêm yết tại site và phổ biến cho toàn đội.", en: "Posted on site and briefed to the crew." },
    fields: [
      ["Cấp cứu 115 / Cứu hỏa 114 / Công an 113", "Ambulance 115 / Fire 114 / Police 113"],
      ["Bệnh viện gần nhất (tên, địa chỉ, SĐT)", "Nearest hospital"], ["Chỉ huy sự cố tại site", "Site incident commander"],
      ["Cán bộ an toàn", "Safety officer"], ["Trưởng dự án", "Project manager"],
      ["Quản lý venue / an ninh", "Venue manager / security"], ["Điều phối HS&E (công ty)", "Company HS&E coordinator"],
    ] },

  { code: "J", vi: "Sổ cấp phát PPE", en: "PPE issue register",
    desc: { vi: "Theo dõi việc cấp phát và tình trạng PPE.", en: "Track PPE issuance and condition." },
    fields: [
      ["Người nhận & vai trò", "Recipient & role"], ["Loại PPE & cỡ", "PPE type & size"], ["Ngày cấp", "Issue date"],
      ["Tình trạng", "Condition"], ["Ký nhận", "Signature"],
    ] },

  { code: "K", vi: "Nhật ký quản lý chất thải", en: "Waste management log",
    desc: { vi: "Ghi nhận phân loại và xử lý chất thải của sự kiện.", en: "Record event waste segregation and disposal." },
    fields: [
      ["Dự án / Ngày", "Project / Date"], ["Loại chất thải", "Waste type"], ["Khối lượng ước tính", "Estimated quantity"],
      ["Tái sử dụng / Tái chế / Xử lý", "Reuse / Recycle / Dispose"], ["Đơn vị thu gom", "Collector"],
    ] },

  { code: "L", vi: "Ma trận huấn luyện", en: "Training matrix",
    desc: { vi: "Theo dõi tình trạng huấn luyện của nhân sự theo yêu cầu vai trò.", en: "Track training status against role requirements." },
    fields: [
      ["Nhân sự / Vai trò", "Person / Role"], ["Nhập môn HS&E", "HS&E induction"], ["An toàn sự kiện", "Event safety"],
      ["Trên cao / Điện (nếu áp dụng)", "Height / Electrical"], ["Sơ cấp cứu / PCCC", "First aid / Fire"],
      ["Ngày hoàn thành / Hạn cập nhật", "Completed / Renewal due"],
    ] },
];

// =============================================================================
// PHỤ LỤC M — Thuật ngữ song ngữ VI–EN (glossary)
// =============================================================================
export const glossary = [
  ["An toàn, Sức khỏe & Môi trường", "Health, Safety & Environment (HS&E)"],
  ["Mối nguy", "Hazard"],
  ["Rủi ro", "Risk"],
  ["Đánh giá rủi ro", "Risk assessment"],
  ["Phân tích an toàn công việc", "Job Safety Analysis (JSA)"],
  ["Thứ tự ưu tiên kiểm soát rủi ro", "Hierarchy of Controls"],
  ["Giấy phép làm việc", "Permit To Work (PTW)"],
  ["Phương tiện bảo vệ cá nhân", "Personal Protective Equipment (PPE)"],
  ["Quyền dừng việc", "Stop Work Authority"],
  ["Họp an toàn đầu ca", "Toolbox Talk"],
  ["Làm việc trên cao", "Working at height"],
  ["Công việc nóng", "Hot work"],
  ["Điện tạm", "Temporary electrics"],
  ["Nâng/mang vác thủ công", "Manual handling"],
  ["Quản lý đám đông", "Crowd management"],
  ["Sốc nhiệt", "Heat stress"],
  ["Cận nguy", "Near-miss"],
  ["Sơ cấp cứu", "First aid"],
  ["Ứng phó khẩn cấp", "Emergency response"],
  ["Sơ tán", "Evacuation"],
  ["Nguyên nhân gốc rễ", "Root cause"],
  ["Hành động khắc phục", "Corrective action"],
  ["Chỉ số dẫn / chỉ số trễ", "Leading / lagging indicator"],
  ["Dựng / Tháo dỡ", "Set-up / Dismantle"],
  ["Công tác treo, lắp trên cao", "Rigging"],
  ["Cộng tác viên hiện trường", "Field collaborator / crew (CTV)"],
  ["Thiết bị chống dòng rò", "Residual Current Device (RCD/ELCB)"],
];
