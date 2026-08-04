/**
 * DANH MỤC QUYỀN — nguồn sự thật duy nhất.
 *
 * Vì sao để trong CODE chứ không phải bảng DB như OptionSet: mỗi mã quyền dưới đây phải có một
 * chỗ gọi `requirePermission("<mã>")` tương ứng trong code. Admin thêm một dòng vào DB sẽ tạo ra
 * quyền không ai kiểm tra — tưởng đã cấu hình mà thực tế không có hiệu lực. Nên: DANH MỤC nằm ở
 * code, còn AI ĐƯỢC GÌ (grant) nằm ở DB (bảng role_permission, sửa trong /settings/roles tab 2).
 *
 * Nhãn song ngữ đi qua pickLabel() như OptionItem — không đẻ thêm ~160 key i18n cho danh mục
 * thuần dữ liệu (xem HANDOVER 4.2: luật parity vẫn giữ, chỉ phần chrome của UI mới cần key).
 *
 * THÊM QUYỀN MỚI: thêm một dòng ở đây + gọi requirePermission() ở đúng action/page tương ứng.
 *
 * ⚠ KHÔNG có kiểm tự động nào đối chiếu hai chiều "mã trong danh mục ↔ chỗ requirePermission".
 * (Chú thích cũ ở đây nhắc tới `scripts/verify-permissions.mjs` — file đó CHƯA BAO GIỜ tồn tại
 * trong repo. Tin vào nó là tin vào một lưới an toàn không có thật.) Việc đối chiếu hiện làm TAY,
 * và cũng phải soát cả đường CẤP quyền trong `prisma/seed.ts` — xem HANDOVER mục 10.15 để biết
 * loại lỗi mà chỗ này bỏ lọt: mã có hai đường cấp mâu thuẫn nhau, tsc/eslint/build đều sạch.
 */

export type PermissionDef = {
  /** Mã bất biến — ĐỪNG đổi sau khi đã grant trong DB, grant khớp theo chuỗi này. */
  code: string;
  /** Nhóm hiển thị trong ma trận, trùng module ở nav. */
  module: string;
  labelVi: string;
  labelEn: string;
  /** Quyền đụng tiền / duyệt / dữ liệu nhân sự — tô cảnh báo trong ma trận. */
  sensitive?: boolean;
};

export const PERMISSION_MODULES = [
  "dashboard",
  "clients",
  "bidding",
  "projects",
  "creative",
  "inventory",
  "finance",
  "purchasing",
  "staff",
  "kpi",
  "payroll",
  "chat",
  "ai",
  "kb",
  "iso",
  "overhead",
  "mkt",
  "settings",
  "system",
] as const;

/** Nhãn nhóm hiển thị trong ma trận — cùng quy ước pickLabel như nhãn quyền. */
export const PERMISSION_MODULE_LABELS: Record<string, { labelVi: string; labelEn: string }> = {
  dashboard: { labelVi: "Tổng quan", labelEn: "Dashboard" },
  clients: { labelVi: "① Khách hàng", labelEn: "① Clients" },
  bidding: { labelVi: "② Bidding & Hợp đồng", labelEn: "② Bidding & Contract" },
  projects: { labelVi: "③ Quản lý dự án", labelEn: "③ Project management" },
  creative: { labelVi: "✦ Creative", labelEn: "✦ Creative" },
  inventory: { labelVi: "⑧ Kho", labelEn: "⑧ Inventory" },
  finance: { labelVi: "④ Chi phí & Công nợ", labelEn: "④ Finance & receivables" },
  purchasing: { labelVi: "🛒 Thu mua (PO)", labelEn: "🛒 Purchasing (PO)" },
  staff: { labelVi: "⑤ Nhân sự & chấm công", labelEn: "⑤ Staff & timekeeping" },
  kpi: { labelVi: "⑥ KPI", labelEn: "⑥ KPI" },
  payroll: { labelVi: "⑦ Lương (chưa làm)", labelEn: "⑦ Payroll (not built)" },
  chat: { labelVi: "⑨ Trao đổi", labelEn: "⑨ Chat" },
  ai: { labelVi: "Trợ lý AI", labelEn: "AI assistant" },
  kb: { labelVi: "Cơ sở tri thức", labelEn: "Knowledge base" },
  iso: { labelVi: "Hồ sơ ISO", labelEn: "ISO records" },
  overhead: { labelVi: "Chi phí văn phòng", labelEn: "Overhead costs" },
  mkt: { labelVi: "Bài đăng MKT", labelEn: "Marketing posts" },
  settings: { labelVi: "Cài đặt", labelEn: "Settings" },
  system: { labelVi: "Hệ thống", labelEn: "System" },
};

export const PERMISSIONS: PermissionDef[] = [
  // ── Dashboard ──
  { code: "dashboard.view", module: "dashboard", labelVi: "Xem Dashboard", labelEn: "View dashboard" },
  { code: "dashboard.all_teams", module: "dashboard", labelVi: "Xem số liệu toàn bộ team (không chỉ team mình)", labelEn: "See all teams' figures" },
  { code: "dashboard.cashflow", module: "dashboard", labelVi: "Xem khối dòng tiền", labelEn: "See cashflow block", sensitive: true },

  // ── ① Khách hàng ──
  { code: "clients.view", module: "clients", labelVi: "Xem danh sách khách hàng", labelEn: "View clients" },
  { code: "clients.manage", module: "clients", labelVi: "Thêm / sửa khách hàng, liên hệ", labelEn: "Create / edit clients & contacts" },
  { code: "clients.transfer", module: "clients", labelVi: "Chuyển khách hàng sang người khác", labelEn: "Transfer client ownership", sensitive: true },
  { code: "clients.care", module: "clients", labelVi: "Ghi nhật ký chăm sóc", labelEn: "Add care notes" },
  { code: "clients.import", module: "clients", labelVi: "Nhập khách hàng từ Excel", labelEn: "Import clients from Excel" },
  { code: "clients.kb.view", module: "clients", labelVi: "Xem kho kiến thức khách hàng", labelEn: "View client knowledge base" },
  { code: "clients.kb.manage", module: "clients", labelVi: "Soạn nội dung kho kiến thức khách hàng", labelEn: "Author client knowledge base content" },
  { code: "clients.kb.quiz", module: "clients", labelVi: "Làm bài kiểm tra kho kiến thức", labelEn: "Take knowledge base quizzes" },
  { code: "clients.kb.generate", module: "clients", labelVi: "Dùng AI sinh bài học & câu hỏi", labelEn: "Use AI to draft lessons & questions", sensitive: true },
  { code: "clients.kb.compliance", module: "clients", labelVi: "Xem bảng tuân thủ học kho kiến thức", labelEn: "View knowledge base compliance" },

  // ── ② Bidding & Hợp đồng ──
  { code: "bidding.view", module: "bidding", labelVi: "Xem hồ sơ thầu & CO/CE", labelEn: "View bids & cost sheets" },
  { code: "bidding.project.manage", module: "bidding", labelVi: "Tạo / sửa dự án, phân team", labelEn: "Create / edit project, assign team" },
  { code: "bidding.gonogo", module: "bidding", labelVi: "Quyết định Go / No-go", labelEn: "Decide Go / No-go", sensitive: true },
  { code: "bidding.costsheet.edit", module: "bidding", labelVi: "Sửa & lưu bảng CO/CE", labelEn: "Edit & save cost sheet" },
  { code: "bidding.costsheet.approve", module: "bidding", labelVi: "Duyệt / từ chối CO/CE", labelEn: "Approve / reject cost sheet", sensitive: true },
  { code: "bidding.margin_override", module: "bidding", labelVi: "Ghi đè margin dưới ngưỡng 31%", labelEn: "Override margin below 31% floor", sensitive: true },
  { code: "bidding.contract.manage", module: "bidding", labelVi: "Nhập & xác nhận hợp đồng", labelEn: "Enter & confirm contract", sensitive: true },
  { code: "bidding.status.change", module: "bidding", labelVi: "Đổi trạng thái dự án (Processing / Huỷ / Nghiệm thu / Finished)", labelEn: "Change project status", sensitive: true },

  // ── ③ Quản lý dự án ──
  { code: "projects.view", module: "projects", labelVi: "Xem workspace dự án", labelEn: "View project workspace" },
  { code: "projects.team.manage", module: "projects", labelVi: "Phân vai & thành viên dự án", labelEn: "Assign project roles & members" },
  { code: "projects.timeline.edit", module: "projects", labelVi: "Sửa Master Timeline", labelEn: "Edit master timeline" },
  { code: "projects.timeline.publish", module: "projects", labelVi: "Công bố / gỡ công bố dòng timeline", labelEn: "Publish / unpublish timeline items" },
  { code: "projects.staffing.edit", module: "projects", labelVi: "Sửa bảng nhân sự vận hành", labelEn: "Edit staffing grid" },
  { code: "projects.order.manage", module: "projects", labelVi: "Sửa ORDER (hạng mục đặt hàng)", labelEn: "Edit orders" },
  { code: "projects.order.dispatch", module: "projects", labelVi: "Phát lệnh ORDER cho bộ phận", labelEn: "Dispatch orders to departments" },
  { code: "projects.order.respond", module: "projects", labelVi: "Nhận / trả kết quả ORDER (phía bộ phận)", labelEn: "Accept orders / submit order results" },
  { code: "projects.task.manage", module: "projects", labelVi: "Tạo / xoá / giao task bộ phận (Planning, Thu mua, Vận hành, Sản xuất)", labelEn: "Create / delete / assign department tasks" },
  { code: "projects.task.submit", module: "projects", labelVi: "Nộp kết quả task bộ phận", labelEn: "Submit department task work" },
  { code: "projects.task.approve", module: "projects", labelVi: "Duyệt / trả lại task bộ phận", labelEn: "Approve / reject department tasks" },
  { code: "projects.planning.manage", module: "projects", labelVi: "Giao & hoàn thành chặng Planning", labelEn: "Assign & complete planning stages" },
  { code: "projects.proposal.submit", module: "projects", labelVi: "Nộp phiên bản proposal", labelEn: "Submit proposal version" },
  { code: "projects.proposal.approve", module: "projects", labelVi: "Yêu cầu sửa / chốt proposal", labelEn: "Request revision / confirm proposal", sensitive: true },
  { code: "projects.ctv.manage", module: "projects", labelVi: "Quản lý bảng CTV (đợt, dòng, nhập Excel)", labelEn: "Manage CTV batches & rows" },
  { code: "projects.ctv.contract", module: "projects", labelVi: "Sinh hợp đồng CTV", labelEn: "Generate CTV contracts", sensitive: true },
  { code: "projects.liquidation.send", module: "projects", labelVi: "Chuyển CO/CE sang Nghiệm thu", labelEn: "Send cost sheet to liquidation", sensitive: true },
  { code: "projects.acceptance.confirm", module: "projects", labelVi: "Xác nhận khách nghiệm thu", labelEn: "Confirm client acceptance", sensitive: true },
  { code: "projects.guest.manage", module: "projects", labelVi: "Tạo / thu hồi link mời khách xem", labelEn: "Create / revoke guest invites" },
  { code: "projects.pnl.view", module: "projects", labelVi: "Xem P&L dự án (kế hoạch vs thực chi vs thực thu)", labelEn: "View project P&L", sensitive: true },

  // ── ✦ Creative ──
  { code: "creative.view", module: "creative", labelVi: "Xem task board Creative", labelEn: "View creative task board" },
  { code: "creative.task.manage", module: "creative", labelVi: "Tạo / xoá task", labelEn: "Create / delete tasks" },
  { code: "creative.task.assign", module: "creative", labelVi: "Giao task cho designer", labelEn: "Assign tasks" },
  { code: "creative.task.submit", module: "creative", labelVi: "Nộp bài", labelEn: "Submit work" },
  { code: "creative.task.approve", module: "creative", labelVi: "Duyệt / trả bài", labelEn: "Approve / reject work" },
  { code: "creative.cost.view", module: "creative", labelVi: "Xem chi phí theo task (có lương theo vị trí)", labelEn: "View cost per task (incl. position salary)", sensitive: true },

  // ── ⑧ Kho ──
  { code: "inventory.view", module: "inventory", labelVi: "Xem kho & sổ kho", labelEn: "View inventory & ledger" },
  { code: "inventory.doc.create", module: "inventory", labelVi: "Lập phiếu nhập / điều chỉnh / xuất / trả", labelEn: "Create import / adjust / issue / return docs" },
  { code: "inventory.transfer.create", module: "inventory", labelVi: "Lập phiếu chuyển kho", labelEn: "Create transfer doc" },
  { code: "inventory.transfer.approve", module: "inventory", labelVi: "Duyệt đề xuất điều chuyển kho", labelEn: "Approve warehouse transfer requests" },
  { code: "inventory.transfer.confirm", module: "inventory", labelVi: "Xác nhận nhận hàng chuyển kho", labelEn: "Confirm transfer receipt" },
  { code: "inventory.transfer.cancel", module: "inventory", labelVi: "Huỷ phiếu chuyển kho", labelEn: "Cancel transfer", sensitive: true },
  { code: "inventory.item.manage", module: "inventory", labelVi: "Tạo / sửa mặt hàng", labelEn: "Create / edit items" },
  { code: "inventory.import_csv", module: "inventory", labelVi: "Nhập mặt hàng từ CSV", labelEn: "Import items from CSV" },
  { code: "inventory.request.create", module: "inventory", labelVi: "Đề xuất xuất kho / báo hàng về", labelEn: "Propose issue / report incoming goods" },
  { code: "inventory.request.approve", module: "inventory", labelVi: "Duyệt đề xuất xuất kho (dự án mình phụ trách)", labelEn: "Approve issue requests (own projects)" },
  { code: "inventory.request.approve_any", module: "inventory", labelVi: "Duyệt đề xuất xuất kho của MỌI dự án", labelEn: "Approve issue requests of any project", sensitive: true },
  { code: "inventory.reservation.approve", module: "inventory", labelVi: "Duyệt giữ chỗ tồn kho cho dự án (vào CO giá 0)", labelEn: "Approve stock reservations into cost sheets", sensitive: true },
  { code: "inventory.issue.confirm", module: "inventory", labelVi: "Thủ kho xác nhận thực xuất", labelEn: "Keeper confirms goods issued" },
  { code: "inventory.intake.confirm", module: "inventory", labelVi: "Thủ kho xác nhận thực nhập", labelEn: "Keeper confirms goods received" },
  { code: "inventory.lot.convert", module: "inventory", labelVi: "Lập phiếu chuyển đổi lô", labelEn: "Create lot conversion docs" },
  { code: "inventory.destroy", module: "inventory", labelVi: "Lập phiếu xuất hủy", labelEn: "Create destruction docs", sensitive: true },

  // ── 🛒 Thu mua (PO) ──
  { code: "purchasing.po.manage", module: "purchasing", labelVi: "Tạo / huỷ đơn đặt hàng NCC (PO)", labelEn: "Create / cancel purchase orders" },
  { code: "purchasing.po.receive", module: "purchasing", labelVi: "Xác nhận nhận hàng trên PO", labelEn: "Confirm goods received on POs" },

  // ── ④ Chi phí & Công nợ ──
  { code: "finance.view", module: "finance", labelVi: "Xem tài chính & công nợ", labelEn: "View finance & receivables", sensitive: true },
  { code: "finance.advance.request", module: "finance", labelVi: "Đề nghị tạm ứng", labelEn: "Request advance" },
  { code: "finance.advance.approve", module: "finance", labelVi: "Xác nhận giải ngân / quyết toán / huỷ tạm ứng", labelEn: "Disburse / settle / cancel advance", sensitive: true },
  { code: "finance.vendor_payment.manage", module: "finance", labelVi: "Tạo đề nghị thanh toán NCC", labelEn: "Create vendor payment request" },
  { code: "finance.vendor_payment.pay", module: "finance", labelVi: "Đánh dấu đã chi cho NCC", labelEn: "Mark vendor payment paid", sensitive: true },
  { code: "finance.vendor_payment.over_cap", module: "finance", labelVi: "Lập phiếu chi vượt trần chi của dự án (kèm lý do)", labelEn: "Create vendor payment above project cap (with reason)", sensitive: true },
  { code: "finance.invoice.manage", module: "finance", labelVi: "Phát hành hoá đơn khách", labelEn: "Issue client invoice", sensitive: true },
  { code: "finance.invoice.over_cap", module: "finance", labelVi: "Phát hành hoá đơn vượt trần CO/CE hoặc cho dự án chưa có CO/CE (kèm lý do)", labelEn: "Issue invoice above cost sheet cap or without a cost sheet (with reason)", sensitive: true },
  { code: "finance.payment.record", module: "finance", labelVi: "Ghi nhận khách thanh toán", labelEn: "Record client payment", sensitive: true },
  { code: "finance.costlines.refresh", module: "finance", labelVi: "Đồng bộ lại dòng chi phí từ CO/CE", labelEn: "Refresh cost lines from cost sheet" },

  // ── ⑤ Nhân sự & chấm công ──
  { code: "staff.view", module: "staff", labelVi: "Xem lịch & chấm công", labelEn: "View schedule & timesheet" },
  { code: "staff.timesheet.edit", module: "staff", labelVi: "Chấm công, đặt nghỉ phép", labelEn: "Edit timesheet & leave" },
  { code: "staff.week.confirm", module: "staff", labelVi: "Chốt tuần chấm công", labelEn: "Confirm timesheet week", sensitive: true },

  // ── ⑥ KPI ──
  { code: "kpi.view", module: "kpi", labelVi: "Xem KPI & quỹ performance", labelEn: "View KPI & performance pool", sensitive: true },
  { code: "kpi.score", module: "kpi", labelVi: "Chấm điểm KPI", labelEn: "Enter KPI scores", sensitive: true },
  { code: "kpi.close_period", module: "kpi", labelVi: "Chốt / mở lại kỳ KPI", labelEn: "Close / reopen KPI period", sensitive: true },

  // ── ⑦ Lương (module chưa làm — mã đặt sẵn để không phải sửa ma trận sau) ──
  { code: "payroll.view", module: "payroll", labelVi: "Xem bảng lương", labelEn: "View payroll", sensitive: true },
  { code: "payroll.manage", module: "payroll", labelVi: "Lập & chốt bảng lương", labelEn: "Prepare & close payroll", sensitive: true },

  // ── ⑨ Chat nội bộ ──
  { code: "chat.use", module: "chat", labelVi: "Dùng chat (nhắn, tạo nhóm, thả cảm xúc)", labelEn: "Use chat" },
  { code: "chat.moderate", module: "chat", labelVi: "Giải tán nhóm, gỡ tin của người khác", labelEn: "Disband groups, delete others' messages", sensitive: true },

  // ── Trợ lý AI ──
  { code: "ai.costsheet", module: "ai", labelVi: "AI rà soát CO/CE", labelEn: "AI cost sheet review" },
  { code: "ai.brainstorm", module: "ai", labelVi: "AI ý tưởng & concept", labelEn: "AI brainstorm" },
  { code: "ai.content", module: "ai", labelVi: "AI viết bài", labelEn: "AI content writing" },
  { code: "ai.canva", module: "ai", labelVi: "AI brief thiết kế", labelEn: "AI design brief" },
  { code: "ai.board_report", module: "ai", labelVi: "AI báo cáo BGĐ", labelEn: "AI board report", sensitive: true },
  { code: "ai.trend", module: "ai", labelVi: "AI xu hướng ngành", labelEn: "AI industry trends" },

  // ── Cơ sở tri thức ──
  { code: "kb.view", module: "kb", labelVi: "Xem tài liệu", labelEn: "View knowledge base" },
  { code: "kb.manage", module: "kb", labelVi: "Đăng / xoá tài liệu", labelEn: "Create / delete documents" },

  // ── Hồ sơ ISO ──
  { code: "iso.view", module: "iso", labelVi: "Xem sổ đăng ký hồ sơ ISO", labelEn: "View ISO document register" },
  { code: "iso.manage", module: "iso", labelVi: "Đính hồ sơ / đánh không áp dụng", labelEn: "Attach documents / mark not applicable" },
  { code: "iso.export", module: "iso", labelVi: "Xuất báo cáo ISO", labelEn: "Export ISO report" },

  // ── Chi phí văn phòng ──
  // ⚠ 5 mã `sensitive` dưới đây PHẢI khai trong MONEY_POLICY (prisma/seed.ts) — đó là một nguồn sự
  // thật cho cả isRestricted, moneyCodesFor và Vòng 4d. Cấp ở chỗ khác là tái tạo đúng lớp lỗ hổng
  // đã phải vá 30/07 (HANDOVER 10.16).
  { code: "overhead.view", module: "overhead", labelVi: "Xem chi phí văn phòng", labelEn: "View overhead costs" },
  { code: "overhead.budget.manage", module: "overhead", labelVi: "Lập / sửa / trình duyệt ngân sách năm", labelEn: "Create / edit / submit the annual budget", sensitive: true },
  { code: "overhead.budget.approve_cfo", module: "overhead", labelVi: "CFO duyệt ngân sách năm", labelEn: "CFO approves the annual budget", sensitive: true },
  { code: "overhead.budget.approve_ceo", module: "overhead", labelVi: "CEO duyệt & khoá ngân sách năm", labelEn: "CEO approves & locks the annual budget", sensitive: true },
  { code: "overhead.spend.record", module: "overhead", labelVi: "Ghi nhận khoản chi", labelEn: "Record a spend" },
  { code: "overhead.spend.pay", module: "overhead", labelVi: "Xác nhận đã thanh toán", labelEn: "Confirm payment", sensitive: true },
  { code: "overhead.spend.over_budget", module: "overhead", labelVi: "Chi vượt ngân sách (kèm giải trình)", labelEn: "Spend over budget (with justification)", sensitive: true },

  // ── Bài đăng MKT ──
  // KHÔNG phải mã tiền → KHÔNG khai vào MONEY_POLICY. Nhưng 4 mã dưới `mkt.view` vẫn phải nằm
  // trong `isRestricted` của seed, nếu không thì DB dựng-từ-đầu cấp quyền viết/duyệt/AI cho cả 20
  // vai — đúng lớp lỗ hổng đã phải vá 30/07 (HANDOVER 10.15).
  { code: "mkt.view", module: "mkt", labelVi: "Xem bài đăng MKT & phân tích quý", labelEn: "View marketing posts & quarterly insights" },
  { code: "mkt.post.manage", module: "mkt", labelVi: "Tạo / sửa / xoá bài đăng (ý chính + ảnh)", labelEn: "Create / edit / delete marketing posts" },
  { code: "mkt.review", module: "mkt", labelVi: "Sửa bản cuối, đánh dấu đã đăng, quản lý phân tích quý", labelEn: "Edit final content, mark as posted, manage insights" },
  { code: "mkt.frames.manage", module: "mkt", labelVi: "Sửa link thư mục frame (LinkedIn / Fanpage)", labelEn: "Edit frame folder links" },
  { code: "mkt.generate", module: "mkt", labelVi: "Dùng AI viết bài & phân tích insights", labelEn: "Use AI to draft posts & analyse insights", sensitive: true },

  // ── Cài đặt ──
  { code: "settings.view", module: "settings", labelVi: "Vào trang Cài đặt", labelEn: "Open settings", sensitive: true },
  { code: "settings.options.manage", module: "settings", labelVi: "Sửa danh mục dùng chung", labelEn: "Manage shared option sets" },
  { code: "settings.staff.manage", module: "settings", labelVi: "Thêm / sửa hồ sơ nhân sự", labelEn: "Manage staff records", sensitive: true },
  { code: "settings.teams.manage", module: "settings", labelVi: "Sửa team Account (A1/A2/A3)", labelEn: "Manage account teams (A1/A2/A3)" },
  { code: "settings.departments.manage", module: "settings", labelVi: "Sửa phòng ban: trưởng phòng & prefix mã chi phí", labelEn: "Manage departments: lead & cost prefix", sensitive: true },
  { code: "settings.security.manage", module: "settings", labelVi: "Đổi mật khẩu chung của công ty", labelEn: "Change company default password", sensitive: true },
  { code: "settings.roles.manage", module: "settings", labelVi: "Gán nhóm phân quyền cho nhân sự", labelEn: "Assign roles to staff", sensitive: true },
  { code: "settings.permissions.manage", module: "settings", labelVi: "Sửa ma trận phân quyền", labelEn: "Edit permission matrix", sensitive: true },
  { code: "settings.bidding.manage", module: "settings", labelVi: "Sửa cấu hình Bidding (ngưỡng margin…)", labelEn: "Bidding settings (margin floor…)", sensitive: true },
  { code: "settings.finance.manage", module: "settings", labelVi: "Sửa cấu hình Tài chính", labelEn: "Finance settings", sensitive: true },
  { code: "settings.kpi.manage", module: "settings", labelVi: "Sửa cấu hình KPI & lương theo vị trí", labelEn: "KPI & position salary settings", sensitive: true },
  { code: "settings.creative.manage", module: "settings", labelVi: "Sửa cấu hình Creative (quỹ lương, tỉ lệ phân bổ)", labelEn: "Creative settings", sensitive: true },
  { code: "settings.timekeeping.manage", module: "settings", labelVi: "Sửa cấu hình chấm công & ca", labelEn: "Timekeeping & shift settings" },
  { code: "settings.warehouses.manage", module: "settings", labelVi: "Sửa danh sách kho", labelEn: "Manage warehouses" },
  { code: "settings.vendors.manage", module: "settings", labelVi: "Thêm / sửa nhà cung cấp", labelEn: "Manage vendors", sensitive: true },
  { code: "settings.templates.manage", module: "settings", labelVi: "Sửa mẫu CO/CE & mẫu timeline", labelEn: "Manage cost sheet & timeline templates" },
  { code: "settings.communication.manage", module: "settings", labelVi: "Sửa cấu hình chat", labelEn: "Chat settings" },
  { code: "settings.clients.manage", module: "settings", labelVi: "Sửa cấu hình Khách hàng", labelEn: "Client settings" },
  { code: "settings.commission.manage", module: "settings", labelVi: "Sửa cơ chế hoa hồng", labelEn: "Commission scheme", sensitive: true },
  { code: "settings.ai.manage", module: "settings", labelVi: "Sửa cấu hình AI", labelEn: "AI settings" },

  // ── Hệ thống ──
  { code: "system.impersonate", module: "system", labelVi: "Xem với tư cách người khác (act as)", labelEn: "Impersonate another user", sensitive: true },
];

export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code);

/** Tra nhanh theo mã — dùng khi render ma trận và khi verify 2 chiều code ↔ danh mục. */
export const PERMISSION_BY_CODE = new Map(PERMISSIONS.map((p) => [p.code, p]));
