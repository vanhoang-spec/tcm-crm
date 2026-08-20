import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { TCM_FAMILY_GROUP_NAME } from "../src/lib/chat";
import { PERMISSION_CODES } from "../src/lib/permission-catalog";
import { currentPeriodCode } from "../src/lib/creative-cost";
import { DEFAULT_RECRUIT_CRITERIA } from "../src/lib/recruit";
import { systemGroupRows } from "../src/lib/rfq-templates";

const prisma = new PrismaClient();

/** Hash token magic-link (khớp hashGuestToken trong src/lib/guest-session.ts). */
function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function main() {
  // ── Teams ──
  const [a1, a2, a3] = await Promise.all([
    prisma.team.upsert({
      where: { code: "A1" },
      update: {},
      create: { code: "A1", name: "ACC 1 — Dự án/Đấu thầu đa ngành" },
    }),
    prisma.team.upsert({
      where: { code: "A2" },
      update: {},
      create: { code: "A2", name: "ACC 2 — Retainer & Agency Service" },
    }),
    prisma.team.upsert({
      where: { code: "A3" },
      update: {},
      create: { code: "A3", name: "ACC 3 — Sự kiện/Activation quy mô lớn" },
    }),
  ]);

  // ── Departments ──
  // costPrefix = tiền tố sinh mã dòng chi phí CO/CE (ACC-001, OPE-002…). Chỉ đặt cho phòng thực
  // sự nhận chi phí trực tiếp; FIN/HR/IT/CEO để null. Admin sửa được ở /settings/teams.
  const departments = [
    { code: "ACCOUNT", name: "Account", costPrefix: "ACC" },
    { code: "PLANNING", name: "Planning", costPrefix: "PLA" },
    { code: "CREATIVE", name: "Creative / Thiết kế", costPrefix: "CRE" },
    { code: "OPE", name: "Operation", costPrefix: "OPE" },
    { code: "PRO", name: "Production", costPrefix: "PRO" },
    { code: "PCC", name: "Purchasing", costPrefix: "PUR" },
    { code: "FIN", name: "Kế toán / Tài chính" },
    { code: "HR", name: "HR" },
    { code: "IT", name: "IT / Hệ thống" },
    { code: "CEO", name: "Ban điều hành" },
  ];
  for (const d of departments) {
    // update chỉ điền costPrefix khi còn trống — re-seed không đè prefix admin đã sửa tay.
    const existing = await prisma.department.findUnique({ where: { code: d.code }, select: { costPrefix: true } });
    await prisma.department.upsert({
      where: { code: d.code },
      update: existing?.costPrefix == null && d.costPrefix ? { costPrefix: d.costPrefix } : {},
      create: d,
    });
  }
  // ── Nhân sự thật (42 người, Danh sach NS.xlsx — cập nhật 2026-07-22) ──
  // Thay toàn bộ khối "Staff (PIC mẫu)" demo cũ. Giữ nguyên tên biến cũ (ceo/thao/yen/...) làm alias
  // trỏ sang người thật tương ứng, để phần còn lại của file (project/bidding/chat/KPI/timekeeping...)
  // không phải sửa — chỉ nguồn dữ liệu đổi từ demo sang thật.
  type StaffRow = {
    code: string | null; fullName: string; location: "TPHCM" | "HÀ NỘI"; deptExcel: string;
    title: string; managerName: string | null; gender: "Nam" | "Nữ"; phone: string;
    dob: [number, number, number]; email: string; firstWorkDate: [number, number, number]; roleText: string;
  };
  const STAFF_ROWS: StaffRow[] = [
    { code: "TCM-0001", fullName: "NGUYỄN ĐẠO BÌNH", location: "TPHCM", deptExcel: "General", title: "Chairman of the Board", managerName: null, gender: "Nam", phone: "0793282879", dob: [12, 3, 1973], email: "ndbinh@tcmbtl.com", firstWorkDate: [28, 8, 2000], roleText: "Board of Management" },
    { code: null, fullName: "NGUYỄN VĂN HOÀNG", location: "TPHCM", deptExcel: "General", title: "Chief Executive Officer (CEO)", managerName: "NGUYỄN ĐẠO BÌNH", gender: "Nam", phone: "0983114803", dob: [15, 11, 1977], email: "nvhoang@tcmbtl.com", firstWorkDate: [1, 7, 2026], roleText: "CEO cum Super Admin" },
    { code: null, fullName: "TRƯƠNG VĂN TƯƠI", location: "TPHCM", deptExcel: "Account 1", title: "Senior Account Executive", managerName: "HỒ HỒNG PHƯỚC", gender: "Nam", phone: "0939064298", dob: [28, 2, 1994], email: "tvtuoi@tcmbtl.com", firstWorkDate: [4, 9, 2024], roleText: "Account Staff" },
    { code: null, fullName: "HỒ HỒNG PHƯỚC", location: "TPHCM", deptExcel: "Account 1", title: "Account Manager", managerName: "NGUYỄN VĂN HOÀNG", gender: "Nữ", phone: "0966339603", dob: [20, 4, 1996], email: "hhphuoc@tcmbtl.com", firstWorkDate: [19, 2, 2025], roleText: "Account Manager" },
    // Team Account 2 (5 người dưới Hứa Thị Trâm Anh) nghỉ trong tháng 8/2026 — ĐÃ GỠ khỏi danh sách.
    // DB dựng-từ-đầu vì thế không bao giờ tạo lại họ; DB ĐANG CHẠY được dọn bằng khối một-lần
    // "Nghỉ việc team Account 2" ở cuối file (marker 20260801_a2_offboard). Hai đường phải nhất trí.
    { code: null, fullName: "NGUYỄN PHAN HÀ UYÊN", location: "TPHCM", deptExcel: "Account 3", title: "Account Manager", managerName: "TRẦN THU HÀ", gender: "Nữ", phone: "0919708048", dob: [1, 9, 1991], email: "nphuyen@tcmbtl.com", firstWorkDate: [21, 4, 2025], roleText: "Account Staff" },
    { code: null, fullName: "VÕ NGỌC HUYỀN DUYÊN", location: "TPHCM", deptExcel: "Account 3", title: "Senior Account Executive", managerName: "TRẦN THU HÀ", gender: "Nữ", phone: "0768611271", dob: [27, 1, 2000], email: "vnhduyen@tcmbtl.com", firstWorkDate: [10, 6, 2025], roleText: "Account Staff" },
    { code: null, fullName: "TRẦN THU HÀ", location: "TPHCM", deptExcel: "Account 3", title: "Account Director", managerName: "NGUYỄN VĂN HOÀNG", gender: "Nữ", phone: "0909111235", dob: [12, 7, 1995], email: "ttha@tcmbtl.com", firstWorkDate: [10, 6, 2025], roleText: "Account Manager" },
    { code: null, fullName: "TRẦN THỊ BẢO NGỌC", location: "TPHCM", deptExcel: "Account 3", title: "Senior Account Executive", managerName: "TRẦN THU HÀ", gender: "Nữ", phone: "0965812575", dob: [19, 2, 1999], email: "ttbngoc@tcmbtl.com", firstWorkDate: [10, 6, 2025], roleText: "Account Staff" },
    { code: null, fullName: "NGUYỄN KHÁNH LY", location: "TPHCM", deptExcel: "Account 3", title: "Account Executive", managerName: "TRẦN THU HÀ", gender: "Nữ", phone: "0868778976", dob: [25, 12, 2001], email: "nkly@tcmbtl.com", firstWorkDate: [21, 10, 2025], roleText: "Account Staff" },
    { code: null, fullName: "LÊ HUỲNH KIM YẾN", location: "TPHCM", deptExcel: "Account 3", title: "Account Manager", managerName: "TRẦN THU HÀ", gender: "Nữ", phone: "0908587937", dob: [18, 5, 1988], email: "lhkyen@tcmbtl.com", firstWorkDate: [2, 12, 2025], roleText: "Account Staff" },
    { code: "TCM-0054", fullName: "TRẦN NGUYỄN THÙY AN", location: "TPHCM", deptExcel: "Creative", title: "2D Designer", managerName: "NGUYỄN HOÀNG HIỆP", gender: "Nữ", phone: "0932640910", dob: [9, 10, 2001], email: "tntan@tcmbtl.com", firstWorkDate: [1, 6, 2024], roleText: "Creative Staff" },
    { code: null, fullName: "NGUYỄN HOÀNG HIỆP", location: "TPHCM", deptExcel: "Creative", title: "Creative Director", managerName: "NGUYỄN VĂN HOÀNG", gender: "Nam", phone: "0394966100", dob: [17, 8, 1989], email: "nhhiep@tcmbtl.com", firstWorkDate: [9, 7, 2025], roleText: "Creative Director" },
    { code: null, fullName: "TRẦN SONG HUYỀN", location: "TPHCM", deptExcel: "Creative", title: "Art Manager", managerName: "NGUYỄN HOÀNG HIỆP", gender: "Nữ", phone: "0905582681", dob: [3, 1, 1996], email: "tshuyen@tcmbtl.com", firstWorkDate: [18, 8, 2025], roleText: "Creative Staff" },
    { code: null, fullName: "LÊ MINH QUANG", location: "TPHCM", deptExcel: "Creative", title: "Design Manager", managerName: "NGUYỄN HOÀNG HIỆP", gender: "Nam", phone: "0903342341", dob: [5, 1, 1977], email: "lmquang@tcmbtl.com", firstWorkDate: [1, 10, 2025], roleText: "Creative Staff" },
    { code: null, fullName: "HÀ CÔNG THANH TRÚC", location: "TPHCM", deptExcel: "Creative", title: "Designer", managerName: "NGUYỄN HOÀNG HIỆP", gender: "Nữ", phone: "0366880372", dob: [5, 5, 1995], email: "hcttruc@tcmbtl.com", firstWorkDate: [5, 1, 2026], roleText: "Creative Staff" },
    { code: null, fullName: "NGUYỄN THANH CẦM", location: "TPHCM", deptExcel: "Creative", title: "3D Designer", managerName: "NGUYỄN HOÀNG HIỆP", gender: "Nam", phone: "0353283918", dob: [12, 10, 1994], email: "ntcam@tcmbtl.com", firstWorkDate: [13, 4, 2026], roleText: "Creative Staff" },
    { code: null, fullName: "PHẠM THU HUYỀN", location: "TPHCM", deptExcel: "Finance", title: "Chief Financial Officer (CFO)", managerName: "NGUYỄN VĂN HOÀNG", gender: "Nữ", phone: "0918554996", dob: [23, 1, 1977], email: "pthuyen@tcmbtl.com", firstWorkDate: [10, 8, 2026], roleText: "CFO" },
    { code: "TCM-0039", fullName: "LÊ THỊ PHƯƠNG ANH", location: "TPHCM", deptExcel: "Finance", title: "General Accountant", managerName: "PHẠM THU HUYỀN", gender: "Nữ", phone: "0398389191", dob: [21, 4, 1998], email: "ltpanh@tcmbtl.com", firstWorkDate: [12, 10, 2023], roleText: "Accounting Staff" },
    { code: null, fullName: "TRẦN THỊ MỸ ÁI", location: "TPHCM", deptExcel: "Finance", title: "General Accountant", managerName: "PHẠM THU HUYỀN", gender: "Nữ", phone: "0961176795", dob: [12, 2, 1997], email: "ttmai@tcmbtl.com", firstWorkDate: [22, 4, 2026], roleText: "Accounting Staff" },
    { code: "TCM-0010", fullName: "LÊ NGỌC CHÂU", location: "TPHCM", deptExcel: "HR", title: "Assistant HR Manager", managerName: "TRẦN THỊ HẢI YẾN", gender: "Nữ", phone: "0939680519", dob: [9, 10, 1995], email: "lnchau@tcmbtl.com", firstWorkDate: [3, 6, 2019], roleText: "Administration Staff" },
    { code: "TCM-0022", fullName: "TRẦN THỊ HẢI YẾN", location: "TPHCM", deptExcel: "HR", title: "Senior HR Manager", managerName: "NGUYỄN VĂN HOÀNG", gender: "Nữ", phone: "0969664719", dob: [12, 1, 1995], email: "tthyen@tcmbtl.com", firstWorkDate: [14, 2, 2023], roleText: "HR Manager" },
    // Không có email thật trong nguồn — placeholder nội bộ xác định, không dùng cho notification/chat thật.
    { code: "TCM-0040", fullName: "NGUYỄN THANH BÌNH", location: "TPHCM", deptExcel: "HR", title: "Security Guard", managerName: "TRẦN THỊ HẢI YẾN", gender: "Nam", phone: "0932161628", dob: [2, 12, 1961], email: "nguyenthanhbinh.tcm0040@tcm.internal", firstWorkDate: [16, 10, 2023], roleText: "Administration Staff" },
    { code: null, fullName: "TRƯƠNG ĐÌNH VŨ", location: "TPHCM", deptExcel: "HR", title: "IT Executive", managerName: "TRẦN THỊ HẢI YẾN", gender: "Nam", phone: "0329869243", dob: [19, 5, 1996], email: "tdvu@tcmbtl.com", firstWorkDate: [4, 5, 2026], roleText: "IT support" },
    { code: null, fullName: "LƯ NGUYỄN THANH XUYÊN", location: "TPHCM", deptExcel: "Operation", title: "Assistant Field Manager", managerName: "TRẦN HOÀI HẬN", gender: "Nam", phone: "0901877887", dob: [25, 8, 1992], email: "lntxuyen@tcmbtl.com", firstWorkDate: [15, 7, 2024], roleText: "Operations Staff" },
    { code: null, fullName: "CAO NHẬT PHONG", location: "TPHCM", deptExcel: "Operation", title: "Field Supervisor", managerName: "TRẦN HOÀI HẬN", gender: "Nam", phone: "0907676240", dob: [4, 2, 1988], email: "cnphong@tcmbtl.com", firstWorkDate: [12, 5, 2025], roleText: "Operations Staff" },
    { code: null, fullName: "HOÀNG MINH ĐỨC", location: "HÀ NỘI", deptExcel: "Operation", title: "Field Supervisor", managerName: "TRẦN HOÀI HẬN", gender: "Nam", phone: "0978969704", dob: [31, 7, 1996], email: "hmduc@tcmbtl.com", firstWorkDate: [8, 9, 2025], roleText: "Operations Staff" },
    { code: null, fullName: "TRẦN HOÀI HẬN", location: "TPHCM", deptExcel: "Operation", title: "Senior Operation Manager", managerName: "NGUYỄN VĂN HOÀNG", gender: "Nam", phone: "0937030991", dob: [3, 9, 1991], email: "thhan@tcmbtl.com", firstWorkDate: [15, 9, 2025], roleText: "Operations Manager" },
    { code: null, fullName: "NGUYỄN XUÂN CẢNH", location: "TPHCM", deptExcel: "Operation", title: "Field Supervisor", managerName: "TRẦN HOÀI HẬN", gender: "Nam", phone: "0974864107", dob: [22, 5, 2001], email: "nxcanh@tcmbtl.com", firstWorkDate: [22, 9, 2025], roleText: "Operations Staff" },
    { code: null, fullName: "VŨ THỊ HUYỀN TRANG", location: "TPHCM", deptExcel: "Operation", title: "Admin Operation", managerName: "TRẦN HOÀI HẬN", gender: "Nữ", phone: "0929126240", dob: [29, 8, 2002], email: "vthtrang@tcmbtl.com", firstWorkDate: [23, 10, 2025], roleText: "Operations Staff" },
    { code: null, fullName: "NGUYỄN HỮU DANH", location: "TPHCM", deptExcel: "Operation", title: "Field Executive", managerName: "TRẦN HOÀI HẬN", gender: "Nam", phone: "0902849223", dob: [26, 1, 2001], email: "nhdanh@tcmbtl.com", firstWorkDate: [17, 11, 2025], roleText: "Operations Staff" },
    { code: null, fullName: "TRẦN ĐÌNH DUY", location: "HÀ NỘI", deptExcel: "Operation", title: "Field Executive", managerName: "TRẦN HOÀI HẬN", gender: "Nam", phone: "0936954567", dob: [29, 9, 1998], email: "tdduy@tcmbtl.com", firstWorkDate: [1, 6, 2026], roleText: "Operations Staff" },
    // Nhân sự Planning duy nhất (Dương Mỹ Ngọc) nghỉ trong tháng 8/2026 — ĐÃ GỠ khỏi danh sách.
    // Bộ phận Planning từ đây KHÔNG còn headcount riêng: người làm Planning tuyển sau này nằm trong
    // team Account (A1/A3) và được đánh dấu bằng cờ `Staff.isPlanningStaff`. DB đang chạy được dọn
    // bằng khối một-lần "Giải thể headcount Planning" ở cuối file (marker 20260801_planning_dissolved).
    { code: null, fullName: "HỒ SĨ BẢO", location: "TPHCM", deptExcel: "Production", title: "Business Development & Production Director", managerName: "NGUYỄN VĂN HOÀNG", gender: "Nam", phone: "0907785645", dob: [20, 5, 1986], email: "hsbao@tcmbtl.com", firstWorkDate: [10, 6, 2025], roleText: "Production Manager" },
    { code: null, fullName: "PHẠM LONG BÌNH", location: "TPHCM", deptExcel: "Production", title: "Production Supervisor", managerName: "HỒ SĨ BẢO", gender: "Nam", phone: "0834546246", dob: [19, 1, 1988], email: "plbinh@tcmbtl.com", firstWorkDate: [1, 10, 2025], roleText: "Production Staff" },
    { code: null, fullName: "TRẦN NGUYỄN HUỲNH NHƯ", location: "TPHCM", deptExcel: "Production", title: "Production Executive", managerName: "HỒ SĨ BẢO", gender: "Nữ", phone: "0945797240", dob: [3, 8, 1996], email: "tnhnhu@tcmbtl.com", firstWorkDate: [22, 4, 2026], roleText: "Production Staff" },
    { code: null, fullName: "ĐÀM ÁNH TUYẾT", location: "TPHCM", deptExcel: "Purchasing", title: "Purchasing Manager", managerName: "NGUYỄN VĂN HOÀNG", gender: "Nữ", phone: "0914510100", dob: [1, 10, 1979], email: "datuyet@tcmbtl.com", firstWorkDate: [4, 8, 2025], roleText: "Purchasing Manager" },
    { code: null, fullName: "BÙI THỊ THÙY TRANG", location: "TPHCM", deptExcel: "Purchasing", title: "Purchasing Executive", managerName: "ĐÀM ÁNH TUYẾT", gender: "Nữ", phone: "0348689495", dob: [3, 9, 1995], email: "btttrang@tcmbtl.com", firstWorkDate: [3, 9, 2025], roleText: "Purchasing Staff" },
  ];

  const DEPT_MAP: Record<string, string> = {
    General: "CEO", "Account 1": "ACCOUNT", "Account 2": "ACCOUNT", "Account 3": "ACCOUNT",
    Creative: "CREATIVE", Finance: "FIN", HR: "HR", Operation: "OPE", Planning: "PLANNING",
    Production: "PRO", Purchasing: "PCC",
  };
  const TEAM_MAP: Record<string, string | undefined> = { "Account 1": "A1", "Account 2": "A2", "Account 3": "A3" };
  // Role text → code trong bảng phân quyền (roleSeeds ở dưới xa hơn trong file). ACCOUNT_DIRECTOR/
  // PLANNING_MANAGER/HR_STAFF cố ý KHÔNG xuất hiện — chưa có ai giữ 3 vị trí này theo đúng thực tế.
  const ROLE_MAP: Record<string, string> = {
    "Board of Management": "BOARD_OF_MANAGEMENT",
    "CEO cum Super Admin": "ADMIN",
    "Account Staff": "ACCOUNT_STAFF",
    "Account Manager": "ACCOUNT_MANAGER",
    "Creative Staff": "CREATIVE_STAFF",
    "Creative Director": "CREATIVE_DIRECTOR",
    CFO: "CFO",
    "Accounting Staff": "ACCOUNTANT_STAFF",
    "Administration Staff": "ADMIN_STAFF",
    "HR Manager": "HR_MANAGER",
    "IT support": "IT_STAFF",
    "Operations Staff": "OPERATIONS_STAFF",
    "Operations Manager": "OPERATIONS_MANAGER",
    "Planning Staff": "PLANNING_STAFF",
    "Production Manager": "PRODUCTION_MANAGER",
    "Production Staff": "PRODUCTION_STAFF",
    "Purchasing Manager": "PURCHASING_MANAGER",
    "Purchasing Staff": "PURCHASING_STAFF",
  };

  const deptByCode: Record<string, { id: string }> = {};
  for (const d of await prisma.department.findMany()) deptByCode[d.code] = { id: d.id };
  const teamByCode: Record<string, { id: string }> = { A1: a1, A2: a2, A3: a3 };

  // Vòng 1: tạo/upsert toàn bộ 42 nhân sự thật. CHƯA gán roleId ở đây — bảng phân quyền (roleByCode)
  // được seed muộn hơn trong file này; roleId gán ở Vòng 3 (gần cuối file, cạnh roleSeeds).
  const staffByFullName = new Map<string, Awaited<ReturnType<typeof prisma.staff.upsert>>>();
  for (const row of STAFF_ROWS) {
    const teamCode = TEAM_MAP[row.deptExcel];
    // KHÔNG upsert theo email đơn thuần: từ 28/07 admin sửa được tài khoản đăng nhập
    // (updateStaffLogin), email đổi thì seed không nhận ra người cũ, đòi tạo mới và nổ P2002.
    // Nhận diện bằng email HOẶC mã nhân viên (36/42 người chưa có mã nên mã không dùng một mình được).
    const found = await prisma.staff.findFirst({
      where: { OR: [{ email: row.email }, ...(row.code ? [{ code: row.code }] : [])] },
    });
    const created = found ?? (await prisma.staff.create({
      data: {
        fullName: row.fullName,
        email: row.email,
        code: row.code,
        phone: row.phone,
        title: row.title,
        gender: row.gender,
        workLocation: row.location,
        departmentId: deptByCode[DEPT_MAP[row.deptExcel]].id,
        teamId: teamCode ? teamByCode[teamCode].id : null,
        dateOfBirth: new Date(row.dob[2], row.dob[1] - 1, row.dob[0]),
        firstWorkDate: new Date(row.firstWorkDate[2], row.firstWorkDate[1] - 1, row.firstWorkDate[0]),
      },
    }));
    staffByFullName.set(row.fullName, created);
  }
  // Vòng 2: gán managerId (người quản lý trực tiếp thật, dùng dựng org chart) — Chairman không có
  // manager, là root duy nhất của cây tổ chức.
  for (const row of STAFF_ROWS) {
    if (!row.managerName) continue;
    const manager = staffByFullName.get(row.managerName);
    if (!manager) throw new Error(`Seed lỗi: không tìm thấy manager "${row.managerName}" cho "${row.fullName}"`);
    const self = staffByFullName.get(row.fullName);
    if (self) await prisma.staff.update({ where: { id: self.id }, data: { managerId: manager.id } });
  }

  // ── Alias sang tên biến cũ — phần còn lại của file KHÔNG đổi, chỉ nguồn dữ liệu đổi sang người thật ──
  const ceo = staffByFullName.get("NGUYỄN VĂN HOÀNG")!;
  const thao = staffByFullName.get("HỒ HỒNG PHƯỚC")!; // Account Manager, team A1
  // Trước 01/08/2026 alias này trỏ Hứa Thị Trâm Anh (Senior Account Manager, team A2). Cả 5 người
  // team A2 đã nghỉ → trỏ sang Lê Huỳnh Kim Yến (Account Manager, team A3) để dữ liệu MẪU phía dưới
  // (dự án T002, CO/CE revision, chat, tạm ứng) vẫn dựng được trên DB mới. ⚠ KHÔNG trỏ về `thao`
  // (Phước): hai biến này cùng vào một GROUP chat ở khối MODULE ⑨ → trùng staffId, ConversationMember
  // có @@unique([conversationId, staffId]) nên seed sẽ nổ P2002.
  const yen = staffByFullName.get("LÊ HUỲNH KIM YẾN")!; // Account Manager, team A3
  const ha = staffByFullName.get("TRẦN THU HÀ")!; // Account Director, team A3 — cũng là lead phòng ACCOUNT
  const bdDirector = staffByFullName.get("HỒ SĨ BẢO")!; // Business Development & Production Director — 1 người giữ cả 2 vai trò thật
  const hrStaff = staffByFullName.get("TRẦN THỊ HẢI YẾN")!; // Senior HR Manager
  const itStaff = staffByFullName.get("TRƯƠNG ĐÌNH VŨ")!; // IT Executive (dept Excel = HR, KHÔNG phải dept IT)
  const accountant = staffByFullName.get("LÊ THỊ PHƯƠNG ANH")!; // General Accountant, MSNV TCM-0039
  const cfo = staffByFullName.get("PHẠM THU HUYỀN")!;
  const seniorDesigner = staffByFullName.get("LÊ MINH QUANG")!; // Design Manager
  const artist3d = staffByFullName.get("NGUYỄN THANH CẦM")!; // 3D Designer
  const creativeDept = deptByCode["CREATIVE"]; // dùng lại ở khối seed Project Team phía dưới
  const creativeLead = staffByFullName.get("NGUYỄN HOÀNG HIỆP")!; // Creative Director

  // ── Nhân sự trưởng các phòng ban nhận Order (Planning/Creative/Purchasing/Operation/Production) ──
  // KHÔNG tạo mới — trỏ thẳng vào người thật tương ứng đã import ở Vòng 1.
  const orderLeadByCode: Record<string, { id: string }> = {
    CREATIVE: creativeLead,
    // Planning KHÔNG còn nhân sự riêng (01/08/2026) — dữ liệu MẪU phía dưới cần một người đứng tên
    // job Planning, nên trỏ vào Account Manager của team A3. Đúng mô hình mới: việc Planning do người
    // trong team Account làm. Trên DB thật, ai làm Planning được chọn bằng cờ `isPlanningStaff`.
    PLANNING: yen,
    PCC: staffByFullName.get("ĐÀM ÁNH TUYẾT")!,
    OPE: staffByFullName.get("TRẦN HOÀI HẬN")!,
    PRO: bdDirector, // Hồ Sĩ Bảo
  };

  // ── Helper dùng chung: seed 1 OptionSet + các OptionItem ──
  async function seedOptionSet(
    code: string,
    name: string,
    items: { code: string; labelVi: string; labelEn: string }[],
  ) {
    const set = await prisma.optionSet.upsert({ where: { code }, update: {}, create: { code, name } });
    const map: Record<string, string> = {};
    for (const [i, it] of items.entries()) {
      const created = await prisma.optionItem.upsert({
        where: { setId_code: { setId: set.id, code: it.code } },
        update: {},
        create: { setId: set.id, code: it.code, labelVi: it.labelVi, labelEn: it.labelEn, sort: i },
      });
      map[it.code] = created.id;
    }
    return map;
  }

  const industryItems = await seedOptionSet("industry", "Ngành hàng", [
    { code: "PHARMA", labelVi: "Dược phẩm", labelEn: "Pharma" },
    { code: "FMCG", labelVi: "Hàng tiêu dùng nhanh", labelEn: "FMCG" },
    { code: "RETAIL", labelVi: "Bán lẻ", labelEn: "Retail" },
    { code: "BEVERAGE", labelVi: "Đồ uống", labelEn: "Beverage" },
    { code: "OTHER", labelVi: "Khác", labelEn: "Other" },
  ]);

  // ── Tình trạng khách hàng (Active/Inactive tính tự động từ hợp đồng — xem lib/client-status.ts) ──
  const clientStatuses = await seedOptionSet("client_status", "Tình trạng khách hàng", [
    { code: "POTENTIAL", labelVi: "Tiềm năng", labelEn: "Potential" },
    { code: "ACTIVE", labelVi: "Active", labelEn: "Active" },
    { code: "INACTIVE", labelVi: "Inactive", labelEn: "Inactive" },
  ]);

  // ── Phân loại khách hàng theo vendor list ──
  const clientClassifications = await seedOptionSet("client_classification", "Phân loại khách hàng", [
    { code: "VENDOR_LIST_ONLY", labelVi: "Có chốt vendor list (bắt buộc trong list mới được bid)", labelEn: "Fixed vendor list (must be listed to bid)" },
    { code: "VENDOR_LIST_FLEX", labelVi: "Có vendor list nhưng chấp nhận supplier ngoài", labelEn: "Has vendor list but accepts outside suppliers" },
    { code: "NO_VENDOR_LIST", labelVi: "Không duy trì vendor list (brief adhoc theo job)", labelEn: "No vendor list (ad-hoc brief per job)" },
  ]);

  // ── Brands (danh sách "ghi nhớ" — user có thể thêm mới từ form Khách hàng) ──
  const brandNames = ["Hậu Giang Pharma", "Johnnie Walker", "LOF", "Castrol"];
  const brandItems: Record<string, string> = {};
  for (const name of brandNames) {
    const b = await prisma.brand.upsert({ where: { name }, update: {}, create: { name } });
    brandItems[name] = b.id;
  }

  // ── Commission scheme mặc định (tham số cho module ⑥ KPI sau này) ──
  await prisma.commissionScheme.upsert({
    where: { code: "default" },
    update: {},
    create: {
      code: "default",
      baseCommissionAmount: 2_000_000,
      contractCommissionAmount: 5_000_000,
      note: "Base: KH mới gửi brief đầu tiên. Contract: KH mới ký hợp đồng đầu tiên (không tính tái ký).",
    },
  });

  // ── Clients mẫu (theo KB — bỏ số liệu tài chính cụ thể) ──
  const clientsSeed = [
    {
      code: "DHG",
      name: "Dược Hậu Giang",
      taxCode: "1800156801",
      brand: "Hậu Giang Pharma",
      industry: "PHARMA",
      ownerTeamId: a1.id,
      introducerId: thao.id,
      paymentTermDays: 90,
      address: "288 Bis Nguyễn Văn Cừ, Cần Thơ",
      phone: "02923891433",
      email: "info@dhgpharma.com.vn",
      bankAccount: "Vietcombank Cần Thơ - 0011001234567 - CTCP DP DHG",
      contacts: [
        { name: "Nguyễn Văn A", title: "Brand Manager", phone: "0901111111", email: "a.nguyen@dhg.com.vn" },
      ],
    },
    {
      code: "DIA",
      name: "Diageo Việt Nam",
      taxCode: "0301234567",
      brand: "Johnnie Walker",
      industry: "BEVERAGE",
      ownerTeamId: a2.id,
      introducerId: yen.id,
      paymentTermDays: 120,
      address: "Tòa nhà Metropolitan, Q.1, TP.HCM",
      phone: "02838222222",
      email: "contact@diageo.com",
      bankAccount: "HSBC TP.HCM - 002001998877 - DIAGEO VIETNAM LLC",
      contacts: [
        { name: "Trần Thị B", title: "Marketing Manager", phone: "0902222222", email: "b.tran@diageo.com" },
      ],
    },
    {
      code: "LOF",
      name: "LOF Vietnam",
      taxCode: "0302345678",
      brand: "LOF",
      industry: "FMCG",
      ownerTeamId: a3.id,
      introducerId: ha.id,
      paymentTermDays: 90,
      address: "KCN Tân Bình, TP.HCM",
      phone: "02839999999",
      email: "info@lof.vn",
      bankAccount: "ACB TP.HCM - 88881112223 - CTY TNHH LOF VIETNAM",
      contacts: [
        { name: "Lê Văn C", title: "Trade Marketing Lead", phone: "0903333333", email: "c.le@lof.vn" },
      ],
    },
    {
      code: "CTL",
      name: "Castrol Việt Nam",
      taxCode: "0303456789",
      brand: "Castrol",
      industry: "RETAIL",
      ownerTeamId: a1.id,
      introducerId: thao.id,
      paymentTermDays: 90,
      address: "Khu công nghiệp VSIP, Bình Dương",
      phone: "02743899999",
      email: "info@castrol.com.vn",
      bankAccount: "Vietcombank Bình Dương - 0611001112223 - CTY TNHH CASTROL BP",
      contacts: [
        { name: "Phạm Thị D", title: "Trưởng phòng thu mua", phone: "0904444444", email: "d.pham@castrol.com" },
      ],
    },
  ];

  for (const c of clientsSeed) {
    const client = await prisma.client.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        name: c.name,
        taxCode: c.taxCode,
        brandId: brandItems[c.brand],
        industryId: industryItems[c.industry],
        statusId: clientStatuses.ACTIVE, // seed cũ đều coi như đã có hợp đồng — Active
        classificationId: clientClassifications.VENDOR_LIST_FLEX,
        ownerTeamId: c.ownerTeamId,
        introducerId: c.introducerId,
        paymentTermDays: c.paymentTermDays,
        address: c.address,
        phone: c.phone,
        email: c.email,
        bankAccount: c.bankAccount,
        isNew: false,
      },
    });
    const existingContact = await prisma.contact.findFirst({ where: { clientId: client.id } });
    if (!existingContact) {
      for (const [i, contact] of c.contacts.entries()) {
        await prisma.contact.create({
          data: { clientId: client.id, ...contact, isPrimary: i === 0 },
        });
      }
    }
  }

  // ── Nhóm khách hàng (H1) — gom các pháp nhân cùng một "family" ──
  // AEON là ca thật đã có trong dữ liệu: 4 pháp nhân ký riêng, nằm ở 2 team khác nhau. Các khách
  // này đến từ import Excel chứ không từ seed, nên chỉ gán khi TÌM THẤY và khi khách CHƯA có nhóm
  // — chạy lại trên production không đè chỉnh tay của admin, và DB trống cũng không lỗi.
  const clientGroupsSeed = [
    { code: "AEON", name: "AEON MALL Việt Nam", memberCodes: ["AHD", "AHL", "ALB", "AHP"] },
  ];
  for (const g of clientGroupsSeed) {
    const group = await prisma.clientGroup.upsert({
      where: { code: g.code },
      update: {},
      create: { code: g.code, name: g.name },
    });
    const assigned = await prisma.client.updateMany({
      where: { code: { in: g.memberCodes }, groupId: null },
      data: { groupId: group.id },
    });
    if (assigned.count > 0) console.log(`  nhóm ${g.code}: gán ${assigned.count} pháp nhân`);
  }

  // ── Nhóm chiến dịch (LOF-V1) — gom các PHASE của cùng một chiến dịch ──
  // KUN đường trượt 10 tỉnh chạy làm 2 phase, mỗi phase là một dự án riêng trong app; trước đây
  // "phase" chỉ nằm trong TÊN dự án nên không nối được hai bên. KUN Go Kart là chiến dịch KHÁC của
  // cùng khách — CỐ Ý không gán (quyết định chủ dự án 04/08/2026).
  // Chỉ gán khi dự án CHƯA có nhóm: chạy lại trên production không đè chỉnh tay của Account.
  const projectGroupsSeed = [
    // frameworkCe = CE hợp đồng khung 10 tỉnh khách chốt 6.4.2026 (chưa VAT, sau phí agency) — từ
    // file "TCM_Bao gia_Duong truot Kun 10 tinh update 03Apr2026". Chỉ điền khi đang TRỐNG.
    { code: "KUN10T", name: "KUN đường trượt 10 tỉnh", memberCodes: ["T013LO226A3", "T025LO226A3"], frameworkCe: BigInt("13981715611") },
  ];
  for (const g of projectGroupsSeed) {
    const group = await prisma.projectGroup.upsert({
      where: { code: g.code },
      update: {},
      create: { code: g.code, name: g.name, frameworkCe: g.frameworkCe },
    });
    if (group.frameworkCe == null && g.frameworkCe != null) {
      await prisma.projectGroup.update({ where: { id: group.id }, data: { frameworkCe: g.frameworkCe } });
      console.log(`  nhóm chiến dịch ${g.code}: điền CE khung ${g.frameworkCe}`);
    }
    const assigned = await prisma.project.updateMany({
      where: { code: { in: g.memberCodes }, groupId: null },
      data: { groupId: group.id },
    });
    if (assigned.count > 0) console.log(`  nhóm chiến dịch ${g.code}: gán ${assigned.count} dự án`);
  }

  // ── MODULE ② — OptionSet mới ──
  const projectTypes = await seedOptionSet("project_type", "Nhóm dự án", [
    { code: "EVENT", labelVi: "Sự kiện / Hội nghị", labelEn: "Event / Conference" },
    { code: "CAMPAIGN", labelVi: "Campaign / Activation / Roadshow", labelEn: "Campaign / Activation / Roadshow" },
    { code: "RETAINER", labelVi: "Vận hành / Retainer", labelEn: "Operations / Retainer" },
    { code: "BOOTH", labelVi: "Sản xuất Booth / Triển lãm", labelEn: "Booth / Exhibition" },
    { code: "POSM", labelVi: "Sản xuất POSM", labelEn: "POSM production" },
    { code: "DECOR", labelVi: "Trang trí / Decor", labelEn: "Decor" },
    { code: "DESIGN", labelVi: "Design / Production House", labelEn: "Design / Production House" },
  ]);

  const contractTypes = await seedOptionSet("contract_type", "Loại hình hợp đồng", [
    { code: "EVENT_L", labelVi: "Event quy mô lớn", labelEn: "Large event" },
    { code: "EVENT_M", labelVi: "Event quy mô vừa", labelEn: "Medium event" },
    { code: "EVENT_S", labelVi: "Event quy mô nhỏ", labelEn: "Small event" },
    { code: "ACTIVATION", labelVi: "Activation", labelEn: "Activation" },
  ]);

  // Lý do thua thầu — danh sách chuẩn theo nghiệp vụ (KHÁC bắt buộc ghi rõ lý do cụ thể ở app layer).
  await seedOptionSet("fail_reason", "Lý do thua thầu", [
    { code: "PRICE_HIGH", labelVi: "Giá thầu cao", labelEn: "Bid price too high" },
    { code: "CONCEPT_WEAK", labelVi: "Concept/Ý tưởng yếu", labelEn: "Weak concept/idea" },
    { code: "CREATIVE_FAIL", labelVi: "Creative không đạt", labelEn: "Creative execution not selected" },
    { code: "TIMELINE_LATE", labelVi: "Chậm timeline chào thầu", labelEn: "Late bid timeline" },
    { code: "OTHER", labelVi: "Khác", labelEn: "Other" },
  ]);

  await seedOptionSet("channel", "Kênh", [
    { code: "MT", labelVi: "MT", labelEn: "MT" },
    { code: "GT", labelVi: "GT", labelEn: "GT" },
    { code: "MALL", labelVi: "Trung tâm thương mại", labelEn: "Mall" },
    { code: "CONVENTION", labelVi: "Trung tâm hội nghị", labelEn: "Convention hall" },
    { code: "OTHER", labelVi: "Khác", labelEn: "Others" },
  ]);

  // Độ phức tạp dự án — simple = khách có concept, TCM chỉ thực thi; medium/complex = TCM tự lên ý tưởng.
  const complexityItems = await seedOptionSet("complexity", "Độ phức tạp dự án", [
    { code: "SIMPLE", labelVi: "Đơn giản", labelEn: "Simple" },
    { code: "MEDIUM", labelVi: "Trung bình", labelEn: "Medium" },
    { code: "COMPLEX", labelVi: "Phức tạp", labelEn: "Complex" },
  ]);

  // Trạng thái dự án — admin quản lý qua Settings; code CỐ ĐỊNH (state machine dùng .code, không dùng .id).
  const statusItems = await seedOptionSet("project_status", "Trạng thái dự án", [
    { code: "BIDDING", labelVi: "Đang đấu thầu", labelEn: "Bidding" },
    { code: "PENDING", labelVi: "Tạm dừng", labelEn: "Pending" },
    { code: "PROCESSING", labelVi: "Đang triển khai", labelEn: "Processing" },
    { code: "LIQUIDATION", labelVi: "Đang nghiệm thu", labelEn: "Liquidation" },
    { code: "FINISHED", labelVi: "Thanh toán xong - Hoàn tất", labelEn: "Paid - Complete" },
    { code: "FAILED", labelVi: "Thua thầu", labelEn: "Failed" },
    { code: "CANCELED", labelVi: "KH hủy", labelEn: "Client cancelled" },
    { code: "HANDOVER", labelVi: "Bàn giao", labelEn: "Handover" },
  ]);

  // ── MODULE ③ — Trạng thái hạng mục Master Timeline (admin quản lý qua Settings) ──
  const timelineStatusItems = await seedOptionSet("timeline_status", "Trạng thái hạng mục timeline", [
    { code: "NOT_STARTED", labelVi: "Chưa bắt đầu", labelEn: "Not started" },
    { code: "IN_PROGRESS", labelVi: "Đang làm", labelEn: "In progress" },
    { code: "BLOCKED", labelVi: "Tắc nghẽn", labelEn: "Blocked" },
    { code: "DONE", labelVi: "Hoàn thành", labelEn: "Done" },
  ]);

  // ── MODULE Creative — Loại task (admin thêm/bớt/xóa; sẽ dùng cho matrix cost đợt sau) ──
  const creativeTaskTypes = await seedOptionSet("creative_task_type", "Loại task Creative", [
    { code: "KV_2D", labelVi: "2D Key visual", labelEn: "2D Key visual" },
    { code: "POSM_2D", labelVi: "2D adapt POSM", labelEn: "2D adapt POSM" },
    { code: "BOOTH_3D", labelVi: "3D Booth", labelEn: "3D Booth" },
    { code: "STAGE_3D", labelVi: "3D Sân khấu", labelEn: "3D Stage" },
    { code: "TECH_DRAW", labelVi: "Bảng vẽ kỹ thuật", labelEn: "Technical drawing" },
    { code: "FA", labelVi: "Final Artwork (FA)", labelEn: "Final Artwork (FA)" },
    { code: "VIDEO", labelVi: "Video", labelEn: "Video" },
  ]);

  // ── Setting module ② + Khách hàng ──
  for (const s of [
    { module: "bidding", key: "min_margin_pct", value: "31" },
    { module: "bidding", key: "auto_approve_threshold", value: "100000000" }, // 100 triệu VND
    { module: "bidding", key: "processing_reminder_days", value: "7" }, // Đang triển khai: nhắc hoàn tất HĐ
    { module: "bidding", key: "liquidation_reminder_interval_days", value: "7" }, // Đang nghiệm thu: nhắc hàng tuần
    { module: "bidding", key: "order_response_days", value: "4" }, // Gợi ý timeline mặc định cho Order phòng ban (Day 4-5)
    { module: "clients", key: "care_interval_active_days", value: "60" }, // Active: tối đa 2 tháng/lần chăm sóc
    { module: "clients", key: "care_interval_inactive_days", value: "90" }, // Inactive: tối đa 3 tháng/lần
    { module: "finance", key: "max_advance_count_per_staff", value: "3" }, // CFO: tối đa 3 lần tạm ứng đang giữ / NV
    { module: "finance", key: "max_outstanding_advance_amount_per_staff", value: "50000000" }, // 50 triệu VND đang giữ / NV
    { module: "finance", key: "cashflow_weekly_buckets", value: "4" }, // CFO: số chu kỳ tuần trên /finance/cashflow
    { module: "finance", key: "cashflow_monthly_buckets", value: "2" }, // CFO: số chu kỳ tháng tiếp theo
    // ── Kho v2 K4 ── kỳ chiến dịch: đồ ra hiện trường quá số ngày này thì KHÔNG cho xuất thêm
    //    cho dự án đó, buộc chốt kỳ (trả về kho / báo mất) trước. Kỳ tự đóng khi holding về 0.
    { module: "inventory", key: "campaign_max_days", value: "15" },
    // ── Đăng nhập ── mật khẩu chung cấp cho nhân sự mới / khi admin cấp lại. Nhân sự BẮT BUỘC
    //    đổi ngay lần đăng nhập đầu (Staff.mustChangePassword mặc định true) — xem src/lib/auth.ts.
    { module: "auth", key: "default_password", value: "TCM123456" },
    { module: "communication", key: "super_admin_titles", value: "CEO, BD Director" }, // chức danh xem all group chat
    { module: "communication", key: "message_poll_seconds", value: "4" }, // nhịp client tự tải tin nhắn mới
    { module: "timekeeping", key: "standard_week_hours", value: "40" }, // khung chuẩn 40h/tuần
    { module: "timekeeping", key: "annual_leave_days", value: "12" }, // phép năm tiêu chuẩn
    { module: "timekeeping", key: "carryover_deadline", value: "03-31" }, // phép năm cũ dùng được đến 31/3 năm sau
    // ── Module ⑥ KPI — khung 75/25. Phase 1 zero-sum: floor=cap=1.0 ⇒ hệ số margin trung hòa,
    //    quỹ luôn chia đủ; BoD bật co giãn sau bằng cách hạ floor_factor (không cần sửa code).
    { module: "kpi", key: "pool_percent", value: "25" }, // % lương full gom vào quỹ performance
    { module: "kpi", key: "target_margin_pct", value: "31" }, // margin đạt target → hệ số 1.0
    { module: "kpi", key: "floor_margin_pct", value: "15" }, // margin ≤ mức này → hệ số sàn
    { module: "kpi", key: "floor_factor", value: "1" }, // sàn hệ số quỹ (1 = zero-sum)
    { module: "kpi", key: "cap_factor", value: "1" }, // trần hệ số (BoD chốt: chưa thưởng vượt)
    { module: "kpi", key: "empty_window_factor", value: "1" }, // pool không có dự án finished trong cửa sổ — chỉnh theo mùa vụ
    { module: "kpi", key: "margin_window_months", value: "3" }, // cửa sổ trượt tính margin (tháng)
  ]) {
    await prisma.setting.upsert({
      where: { module_key_scope_scopeRef: { module: s.module, key: s.key, scope: "GLOBAL", scopeRef: "" } },
      update: {},
      create: { module: s.module, key: s.key, value: s.value },
    });
  }

  // ── Vendor mẫu ──
  for (const v of [
    { code: "V-PCC-01", name: "Cty Quà tặng ABC", category: "PCC" },
    { code: "V-PRO-01", name: "Xưởng in POSM XYZ", category: "PRO" },
    { code: "V-OPE-01", name: "Cty Nhân sự sự kiện 123", category: "OPE" },
  ]) {
    await prisma.vendor.upsert({ where: { code: v.code }, update: {}, create: v });
  }

  // ── PUR-1 (16/08/2026) — NCC THẬT rút từ 2 bảng tổng hợp báo giá PUR đang dùng (FE Sport Day
  // 2026 + KUN 2025/2026), gán sẵn NHÓM HÀNG = mã mẫu form RFQ (lib/rfq-templates.ts). Chỉ tên +
  // nhóm; liên hệ/MST/tài khoản PUR bổ sung sau ở /purchasing/vendors. One-shot có marker; chỉ tạo
  // khi CHƯA có NCC trùng tên (không đè NCC admin đã sửa tay). Chạy lại là no-op.
  /**
   * PUR-3b (21/08/2026) — DÒNG DB CHO 8 NHÓM HỆ THỐNG. Danh mục nhóm hàng nay nằm ở bảng rfq_group
   * (admin thêm nhóm mới ở /settings/rfq-groups); 8 nhóm gốc vẫn lấy CỘT / ĐIỀU KHOẢN / CÔNG THỨC
   * từ lib/rfq-templates.ts, DB chỉ giữ nhãn / mô tả / từ khoá / thứ tự / bật-tắt.
   *
   * ⚠ CHỈ TẠO KHI CHƯA CÓ, KHÔNG BAO GIỜ ĐÈ: nhãn và thứ tự là thứ admin sửa được trong app, seed đè
   * lại là xoá sửa tay trong im lặng (bài học khối "Tái cơ cấu team Account" mục 10.18). Vì vậy
   * KHÔNG cần marker one-shot — "chỉ tạo khi thiếu" đã idempotent, và còn tự nhận nhóm hệ thống MỚI
   * thêm vào code sau này.
   * ⚠ ĐỪNG import lib/rfq-groups.ts ở đây: file đó khai "server-only" và sẽ làm db:seed nổ ngay lúc
   * nạp module — đúng lỗi đã trả giá ở đợt Web Push (mục 10.55).
   */
  {
    const existing = new Set((await prisma.rfqGroup.findMany({ select: { code: true } })).map((r) => r.code));
    let created = 0;
    for (const row of systemGroupRows()) {
      if (existing.has(row.code)) continue;
      await prisma.rfqGroup.create({ data: row });
      created++;
    }
    if (created) console.log(`   • rfq_group: tạo ${created} nhóm hệ thống`);
  }

  const PUR_VENDORS_KEY = "20260816_pur_vendors";
  const purVendorsMarker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: PUR_VENDORS_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!purVendorsMarker) {
    // PUR-2: mã NCC đúng 3 ký tự (khuôn Client.code). Chỉ tạo khi chưa trùng tên/mã.
    const rows: { code: string; name: string; groups: string[] }[] = [
      { code: "SLM", name: "Sông Lam", groups: ["EVENT_EQUIPMENT", "POSM_RENTAL"] },
      { code: "FSS", name: "FS Sound Light Co., Ltd", groups: ["AV_LED"] },
      { code: "TDA", name: "Thể Thao Đông Á", groups: ["PRODUCTION_PRINT"] },
      { code: "TTH", name: "Tất Thành", groups: ["AV_LED", "POSM_RENTAL"] },
      { code: "PLM", name: "Phương Lam", groups: ["POSM_RENTAL"] },
      { code: "NPH", name: "Như Phương", groups: ["PRODUCTION_PRINT"] },
      { code: "VPR", name: "Vietpro", groups: ["POSM_RENTAL"] },
      { code: "DHG", name: "Đại Hưng", groups: ["PRODUCTION_PRINT"] },
      { code: "MHG", name: "Minh Hoàng", groups: ["PRODUCTION_PRINT"] },
      { code: "SGC", name: "SGC", groups: ["AV_LED"] },
      { code: "NTD", name: "Nam Thái Dương", groups: ["EVENT_EQUIPMENT"] },
      { code: "TSK", name: "Công Ty TNHH TM DV Thiện Sự Kiện", groups: ["EVENT_EQUIPMENT", "AV_LED"] },
      { code: "AVU", name: "Anh Vũ", groups: ["AV_LED"] },
      { code: "TNG", name: "Trường Nguyên", groups: ["AV_LED"] },
      { code: "VAR", name: "Vietart", groups: ["AV_LED"] },
      { code: "HAD", name: "Cty TNHH DV Bảo vệ Chuyên nghiệp Hoàng Anh Đạt", groups: ["OUTSOURCED_STAFF"] },
      { code: "BMB", name: "Bảo vệ Miền Bắc", groups: ["OUTSOURCED_STAFF"] },
    ];
    let created = 0;
    for (const r of rows) {
      const exists = await prisma.vendor.findFirst({ where: { OR: [{ code: r.code }, { name: r.name }] }, select: { id: true } });
      const vendorId =
        exists?.id ?? (await prisma.vendor.create({ data: { code: r.code, name: r.name, category: "PCC" }, select: { id: true } })).id;
      if (!exists) created++;
      for (const g of r.groups) {
        await prisma.vendorGroup.upsert({
          where: { vendorId_groupCode: { vendorId, groupCode: g } },
          update: {},
          create: { vendorId, groupCode: g },
        });
      }
    }
    await prisma.setting.create({
      data: { module: "seed", key: PUR_VENDORS_KEY, scope: "GLOBAL", scopeRef: "", value: JSON.stringify({ created, listed: rows.length }) },
    });
    console.log(`[seed] PUR-1: ${created} NCC mới từ bảng tổng hợp báo giá (marker ${PUR_VENDORS_KEY})`);
  }

  // ── PUR-3a: gắn thêm nhóm hàng cho NCC theo BẰNG CHỨNG, không theo phỏng đoán ────────────────
  // Nguồn: cột "NCC" của 18 bảng báo giá tổng hợp (BBG) thật — đối chiếu từng hạng mục NCC đã báo.
  // ⚠ CHỈ THÊM nhóm, KHÔNG gỡ nhóm cũ: nhóm cũ có thể do PUR/BGĐ tick tay ở /purchasing/vendors.
  const PUR_GROUPS_KEY = "20260820_pur_vendor_groups";
  const purGroupsMarker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: PUR_GROUPS_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!purGroupsMarker) {
    const add: { code: string; groups: string[]; why: string }[] = [
      // thảm đen · găng tay lao động · bóng da · bơm bóng ⇒ MUA hàng hoá, không phải in ấn
      { code: "TDA", groups: ["GOODS_PURCHASE"], why: "bóng da, thảm, găng tay — mua đứt" },
      // laptop · bộ đàm ⇒ mua/thuê thiết bị
      { code: "TTH", groups: ["GOODS_PURCHASE"], why: "laptop, bộ đàm" },
    ];
    let added = 0;
    for (const r of add) {
      const v = await prisma.vendor.findUnique({ where: { code: r.code }, select: { id: true } });
      if (!v) continue;
      for (const g of r.groups) {
        const existed = await prisma.vendorGroup.findUnique({ where: { vendorId_groupCode: { vendorId: v.id, groupCode: g } }, select: { id: true } });
        if (existed) continue;
        await prisma.vendorGroup.create({ data: { vendorId: v.id, groupCode: g } });
        added++;
      }
    }
    await prisma.setting.create({
      data: { module: "seed", key: PUR_GROUPS_KEY, scope: "GLOBAL", scopeRef: "", value: JSON.stringify({ added, listed: add.length }) },
    });
    // ⚠ Nhóm LOGISTICS CỐ Ý chưa gắn cho ai: đọc hết 18 file thì hai NCC vận chuyển thuần là
    // "Nguyễn Quý Logistics" và "EVEND" — CẢ HAI đều chưa có trong app. Dòng "chi phí vận chuyển"
    // của Sông Lam/Nam Thái Dương là vận chuyển kèm hàng của chính họ, gắn LOGISTICS cho họ là
    // mời nhầm người khi cần một cuốc xe thuần.
    console.log(`[seed] PUR-3a: +${added} dòng nhóm hàng cho NCC (marker ${PUR_GROUPS_KEY})`);
  }

  // ── PUR-3a: 10 NCC MỚI cho 2 nhóm mới + tắt 3 NCC mẫu (quyết định chủ dự án 20/08/2026) ───────
  // Tên và nhóm lấy từ cột "NCC" của các bảng báo giá tổng hợp thật — mỗi bên là một báo giá cạnh
  // tranh cho MỘT hạng mục cụ thể, không phải chỗ hỏi giá một lần.
  // ⚠ CỐ Ý không nhập hết 75 tên đọc được: nhiều bên chỉ hỏi giá một lần (Bách Hoá Xanh, "Ms Dung",
  // "Rượu sỉ giá tốt"…) và có tên sai chính tả trùng nhau ("SỰ KIỆN TUẤN VIỆT" / "SỤ KIỆN TUẤN VIỆT"
  // / "SỰ KIỆN TUẦN VIỆT" là MỘT bên) — nhập hết là rác hồ sơ NCC.
  const PUR_VENDORS2_KEY = "20260820_pur_vendors_new";
  const purVendors2Marker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: PUR_VENDORS2_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!purVendors2Marker) {
    const rows: { code: string; name: string; groups: string[] }[] = [
      // vận chuyển thuần — hai bên DUY NHẤT trong toàn bộ file làm dịch vụ này
      { code: "NQL", name: "Nguyễn Quý Logistics", groups: ["LOGISTICS"] },
      { code: "EVD", name: "EVEND", groups: ["LOGISTICS", "EVENT_EQUIPMENT"] }, // chở máy 2 chiều + máy phát sample
      // ghế phòng chờ (mua) — 3 bên báo cùng một hạng mục
      { code: "NGF", name: "Nội Thất Nogifu", groups: ["GOODS_PURCHASE"] },
      { code: "PTP", name: "Nội thất Phúc Thịnh Phát", groups: ["GOODS_PURCHASE"] },
      { code: "THN", name: "Thảo Nguyên", groups: ["GOODS_PURCHASE"] },
      // thẻ nhớ — 3 bên báo cùng một hạng mục
      { code: "MTM", name: "Minh Tuấn Mobile", groups: ["GOODS_PURCHASE"] },
      { code: "HLT", name: "Hoàng Long Telecom", groups: ["GOODS_PURCHASE"] },
      { code: "CPS", name: "Cellphone", groups: ["GOODS_PURCHASE"] },
      // bao da — 2 bên báo cùng một hạng mục
      { code: "BGO", name: "Bengo", groups: ["GOODS_PURCHASE"] },
      { code: "DGK", name: "Dienthoaigiakho.vn", groups: ["GOODS_PURCHASE"] },
    ];
    let created2 = 0;
    for (const r of rows) {
      const exists = await prisma.vendor.findFirst({ where: { OR: [{ code: r.code }, { name: r.name }] }, select: { id: true } });
      const vendorId = exists?.id ?? (await prisma.vendor.create({ data: { code: r.code, name: r.name, category: "PCC" }, select: { id: true } })).id;
      if (!exists) created2++;
      for (const g of r.groups) {
        await prisma.vendorGroup.upsert({
          where: { vendorId_groupCode: { vendorId, groupCode: g } },
          update: {},
          create: { vendorId, groupCode: g },
        });
      }
    }
    // 3 NCC mẫu từ seed demo cũ — TẮT chứ không xoá (mirror ClientGroup: tắt là ẩn khỏi ô chọn khi
    // mời mới, hồ sơ/lịch sử cũ giữ nguyên). Gắn nhóm cho NCC ma là đưa họ vào danh sách mời báo giá.
    const demo = await prisma.vendor.updateMany({
      where: { code: { in: ["V-OPE-01", "V-PCC-01", "V-PRO-01"] }, isActive: true },
      data: { isActive: false },
    });
    await prisma.setting.create({
      data: { module: "seed", key: PUR_VENDORS2_KEY, scope: "GLOBAL", scopeRef: "", value: JSON.stringify({ created: created2, listed: rows.length, demoDisabled: demo.count }) },
    });
    console.log(`[seed] PUR-3a: ${created2} NCC mới (vận chuyển + mua sắm), tắt ${demo.count} NCC mẫu (marker ${PUR_VENDORS2_KEY})`);
  }

  // ── CO/CE template mẫu — section-based, mỗi Nhóm dự án 1 mẫu chuẩn, có hạng mục Chi hộ ──
  async function seedCostsheetTemplate(
    name: string,
    projectTypeCode: string,
    contractTypeCode: string | null,
    sections: {
      code: string;
      icon: string;
      nameVi: string;
      nameEn: string;
      colorSlot: string;
      isProxy?: boolean;
      proxyFeeType?: string;
      proxyFeeVal?: number;
      lines: {
        itemName: string;
        lineType?: string;
        defaultQty?: number;
        defaultUnit?: string;
        defaultUnitPrice?: number;
        fixedAmount?: number;
        percentVal?: number;
        isLocked?: boolean;
        maxMarkupPct?: number;
      }[];
    }[],
  ) {
    const existing = await prisma.costsheetTemplate.findFirst({ where: { name } });
    if (existing) return;
    await prisma.costsheetTemplate.create({
      data: {
        name,
        projectTypeId: projectTypes[projectTypeCode],
        contractTypeId: contractTypeCode ? contractTypes[contractTypeCode] : null,
        sections: {
          create: sections.map((s, si) => ({
            code: s.code,
            icon: s.icon,
            nameVi: s.nameVi,
            nameEn: s.nameEn,
            colorSlot: s.colorSlot,
            sort: si,
            isProxy: s.isProxy ?? false,
            proxyFeeType: s.proxyFeeType,
            proxyFeeVal: s.proxyFeeVal,
            lines: {
              create: s.lines.map((l, li) => ({
                itemName: l.itemName,
                lineType: l.lineType ?? "QTY_PRICE",
                defaultQty: l.defaultQty ?? 1,
                defaultUnit: l.defaultUnit,
                defaultUnitPrice: BigInt(l.defaultUnitPrice ?? 0),
                fixedAmount: l.fixedAmount != null ? BigInt(l.fixedAmount) : null,
                percentVal: l.percentVal,
                isLocked: l.isLocked ?? false,
                maxMarkupPct: l.maxMarkupPct,
                sort: li,
              })),
            },
          })),
        },
      },
    });
  }

  await seedCostsheetTemplate("Event quy mô vừa (mẫu)", "EVENT", "EVENT_M", [
    {
      code: "VENUE",
      icon: "🏛️",
      nameVi: "Địa điểm & Vận hành",
      nameEn: "Venue & Operations",
      colorSlot: "brand",
      lines: [
        { itemName: "Thuê địa điểm", defaultQty: 1, defaultUnit: "gói", defaultUnitPrice: 50000000 },
        { itemName: "PG/PB", defaultQty: 10, defaultUnit: "người", defaultUnitPrice: 1500000 },
      ],
    },
    {
      code: "PRODUCTION",
      icon: "🎨",
      nameVi: "Sản xuất & Trang trí",
      nameEn: "Production & Decoration",
      colorSlot: "success",
      lines: [
        { itemName: "Backdrop + booth", defaultQty: 1, defaultUnit: "bộ", defaultUnitPrice: 20000000, maxMarkupPct: 30 },
        { itemName: "Quà tặng", defaultQty: 200, defaultUnit: "phần", defaultUnitPrice: 150000 },
      ],
    },
    {
      code: "TALENT",
      icon: "🎤",
      nameVi: "Nhân sự & Nghệ thuật",
      nameEn: "Staffing & Talent",
      colorSlot: "warning",
      lines: [
        { itemName: "MC / ca sĩ", lineType: "FIXED", fixedAmount: 30000000, isLocked: true },
        { itemName: "Phí quản lý dự án (nội bộ)", lineType: "PERCENT_OF_TOTAL", percentVal: 3 },
      ],
    },
    {
      code: "PROXY",
      icon: "🤝",
      nameVi: "Chi hộ / Thu hộ Khách hàng",
      nameEn: "Client Proxy Payments",
      colorSlot: "neutral",
      isProxy: true,
      proxyFeeType: "PCT",
      proxyFeeVal: 5,
      lines: [{ itemName: "Vé máy bay đại biểu", defaultQty: 4, defaultUnit: "vé", defaultUnitPrice: 3000000 }],
    },
  ]);

  await seedCostsheetTemplate("Campaign/Activation (mẫu)", "CAMPAIGN", "ACTIVATION", [
    {
      code: "FIELD",
      icon: "🚚",
      nameVi: "Triển khai hiện trường",
      nameEn: "Field Execution",
      colorSlot: "brand",
      lines: [
        { itemName: "Đội PG/PB roadshow", defaultQty: 8, defaultUnit: "người/ngày", defaultUnitPrice: 800000 },
        { itemName: "Xe di chuyển đoàn", defaultQty: 5, defaultUnit: "ngày", defaultUnitPrice: 2500000 },
      ],
    },
    {
      code: "MEDIA",
      icon: "📸",
      nameVi: "Truyền thông & Ghi hình",
      nameEn: "Media & Documentation",
      colorSlot: "success",
      lines: [{ itemName: "Chụp ảnh/quay phim hiện trường", defaultQty: 1, defaultUnit: "gói", defaultUnitPrice: 15000000 }],
    },
    {
      code: "PROXY",
      icon: "🤝",
      nameVi: "Chi hộ / Thu hộ Khách hàng",
      nameEn: "Client Proxy Payments",
      colorSlot: "neutral",
      isProxy: true,
      proxyFeeType: "FIXED",
      proxyFeeVal: 2000000,
      lines: [{ itemName: "Giấy phép tổ chức tại địa phương", defaultQty: 1, defaultUnit: "lần", defaultUnitPrice: 5000000 }],
    },
  ]);

  // ── MODULE ③ — Mẫu Master Timeline (2 archetype từ file thật JBVN/KUN) ──
  async function seedTimelineTemplate(
    name: string,
    projectTypeCode: string,
    viewMode: string,
    columns: string[],
    sections: {
      code: string;
      nameVi: string;
      nameEn: string;
      items: {
        title: string;
        parentLabel?: string;
        dept?: string;
        durationDays?: number;
        unit?: string;
        qty?: number;
      }[];
    }[],
  ) {
    const existing = await prisma.timelineTemplate.findFirst({ where: { name } });
    if (existing) return;
    await prisma.timelineTemplate.create({
      data: {
        name,
        projectTypeId: projectTypes[projectTypeCode],
        viewMode,
        columnsJson: JSON.stringify(columns),
        sections: {
          create: sections.map((s, si) => ({
            code: s.code,
            nameVi: s.nameVi,
            nameEn: s.nameEn,
            sort: si,
            items: {
              create: s.items.map((it, ii) => ({
                title: it.title,
                parentLabel: it.parentLabel ?? null,
                defaultDepartmentCode: it.dept ?? null,
                defaultDurationDays: it.durationDays ?? null,
                defaultUnit: it.unit ?? null,
                defaultQty: it.qty ?? null,
                sort: ii,
              })),
            },
          })),
        },
      },
    });
  }

  // Mẫu GANTT ~ JBVN "Master timeline" (sự kiện lớn, vòng revise thiết kế + lead-time sản xuất).
  await seedTimelineTemplate(
    "Convention / Gala (Gantt)",
    "EVENT",
    "GANTT",
    ["pic2", "accountable", "duration", "deadline", "status"],
    [
      {
        code: "ADMIN",
        nameVi: "Hành chính & Hợp đồng",
        nameEn: "Admin & Contract",
        items: [
          { title: "Chốt báo giá", dept: "ACCOUNT", durationDays: 2 },
          { title: "Ký hợp đồng", dept: "ACCOUNT", durationDays: 3 },
          { title: "Tạm ứng đợt 1", dept: "ACCOUNT", durationDays: 2 },
        ],
      },
      {
        code: "VENUE",
        nameVi: "Địa điểm",
        nameEn: "Venue",
        items: [
          { title: "Chốt venue", dept: "OPE", durationDays: 3 },
          { title: "Chốt menu", dept: "OPE", durationDays: 2 },
          { title: "Chốt hotel & booking phòng", dept: "OPE", durationDays: 4 },
        ],
      },
      {
        code: "DESIGN",
        nameVi: "Thiết kế & Sản xuất",
        nameEn: "Design & Production",
        items: [
          { title: "Photobooth", dept: "CREATIVE" },
          { title: "Design lần 1", parentLabel: "Photobooth", dept: "CREATIVE", durationDays: 3 },
          { title: "Revise & Feedback", parentLabel: "Photobooth", dept: "CREATIVE", durationDays: 2 },
          { title: "Duyệt màu / chất liệu", parentLabel: "Photobooth", dept: "CREATIVE", durationDays: 2 },
          { title: "Sản xuất", parentLabel: "Photobooth", dept: "PRO", durationDays: 7 },
          { title: "POSM & Standee", dept: "CREATIVE" },
          { title: "Design lần 1", parentLabel: "POSM & Standee", dept: "CREATIVE", durationDays: 3 },
          { title: "Revise & final", parentLabel: "POSM & Standee", dept: "CREATIVE", durationDays: 2 },
          { title: "Sản xuất", parentLabel: "POSM & Standee", dept: "PRO", durationDays: 5 },
        ],
      },
    ],
  );

  // Mẫu CHECKLIST ~ KUN "Checklist" (activation/roadshow: BOM số lượng/ĐVT + ma trận nhân sự).
  await seedTimelineTemplate(
    "Activation / Roadshow (Checklist)",
    "CAMPAIGN",
    "CHECKLIST",
    ["pic2", "qty", "unit", "deadline", "status"],
    [
      {
        code: "PREP",
        nameVi: "I. Chuẩn bị",
        nameEn: "I. Preparation",
        items: [
          { title: "Ký hợp đồng & tạm ứng 50%", dept: "ACCOUNT" },
          { title: "Thiết kế & in ấn", dept: "CREATIVE" },
          { title: "Standee nhôm", parentLabel: "Thiết kế & in ấn", dept: "PRO", unit: "bộ", qty: 30 },
          { title: "Leaflet", parentLabel: "Thiết kế & in ấn", dept: "PRO", unit: "tờ", qty: 600 },
          { title: "Booth Tết", parentLabel: "Thiết kế & in ấn", dept: "PRO", unit: "bộ", qty: 1 },
          { title: "Sản xuất POSM", dept: "PRO" },
          { title: "Nhân sự", dept: "HR" },
          { title: "Training nhân sự", parentLabel: "Nhân sự", dept: "HR" },
        ],
      },
      {
        code: "LOGISTICS",
        nameVi: "II. Vận chuyển & Set-up",
        nameEn: "II. Logistics & Set-up",
        items: [
          { title: "Vận chuyển HCM - tỉnh", dept: "OPE", unit: "xe", qty: 4 },
          { title: "Set-up POSM + đường trượt", dept: "OPE" },
          { title: "Test & tổng duyệt", dept: "OPE" },
        ],
      },
      {
        code: "GOODS",
        nameVi: "III. Hàng hóa",
        nameEn: "III. Goods",
        items: [
          { title: "Nhận hàng từ nhà phân phối", dept: "OPE", unit: "thùng", qty: 100 },
        ],
      },
    ],
  );

  // ── Vài project mẫu (các trạng thái khác nhau) ──
  const clientsForProj = await prisma.client.findMany({ where: { code: { in: ["DHG", "DIA", "LOF", "CTL"] } } });
  const byCode: Record<string, (typeof clientsForProj)[number]> = Object.fromEntries(
    clientsForProj.map((c) => [c.code, c]),
  );
  const projSeed = [
    { code: "T001DHG26A1", name: "Roadshow DHG Q3", clientCode: "DHG", teamId: a1.id as string | null, ownerId: thao.id, status: "BIDDING", complexity: "COMPLEX", type: "CAMPAIGN", goNogo: "GO" as string | null },
    // ⚠ T002DIA26A2 "Activation Diageo Tết" ĐÃ GỠ (quyết định chủ dự án 19/08/2026): đó là dự án MẪU, đã xoá
    // khỏi production. Seed tạo dự án theo code với "chưa có thì tạo", nên để lại dòng khai báo là mỗi lần
    // deploy nó SỐNG LẠI cùng ~70 bản ghi con. Các khối demo phía dưới (Project Team + timeline + order +
    // task + tài chính + CTV) đều đã gác bằng `if (projT002)` / `if (pmProject)` nên tự bỏ qua — giữ nguyên
    // để sau này muốn dựng lại bộ dữ liệu demo thì chỉ cần thêm lại đúng MỘT dòng ở mảng này.
    { code: "T003LOF26A3", name: "Hội nghị khách hàng LOF", clientCode: "LOF", teamId: a3.id as string | null, ownerId: ha.id, status: "BIDDING", complexity: "COMPLEX", type: "EVENT", goNogo: "PENDING" },
    { code: "T004CTL26A1", name: "Ra mắt sản phẩm Castrol", clientCode: "CTL", teamId: null as string | null, ownerId: thao.id, status: "BIDDING", complexity: "SIMPLE", type: "EVENT", goNogo: null },
  ];
  const createdProjects: Record<string, { id: string }> = {};
  for (const p of projSeed) {
    const cl = byCode[p.clientCode];
    if (!cl) continue;
    const exists = await prisma.project.findUnique({ where: { code: p.code } });
    if (exists) {
      createdProjects[p.code] = exists;
      continue;
    }
    const created = await prisma.project.create({
      data: {
        code: p.code,
        name: p.name,
        clientId: cl.id,
        ownerTeamId: p.teamId,
        ownerId: p.ownerId,
        statusId: statusItems[p.status],
        briefLinkUrl: "https://drive.google.com/drive/folders/seed-brief-placeholder",
        complexityId: complexityItems[p.complexity],
        projectTypeId: projectTypes[p.type],
        goNogoStatus: p.goNogo,
        processingAt: p.status === "PROCESSING" ? new Date() : null,
        fiscalYear: 2026,
      },
    });
    createdProjects[p.code] = created;
  }

  // ── Dự án "Đợi BGĐ giao team Account" (T004) sinh notification cho CEO + BD Director ──
  const pendingProject = createdProjects["T004CTL26A1"];
  if (pendingProject && (await prisma.notification.count({ where: { projectId: pendingProject.id } })) === 0) {
    await prisma.notification.createMany({
      data: [
        {
          recipientStaffId: ceo.id,
          type: "TEAM_ASSIGNMENT_NEEDED",
          title: "Dự án T004CTL26A1 chờ giao team Account",
          body: "Ra mắt sản phẩm Castrol — cần BGĐ chọn team Account phụ trách.",
          projectId: pendingProject.id,
        },
        {
          recipientStaffId: bdDirector.id,
          type: "TEAM_ASSIGNMENT_NEEDED",
          title: "Dự án T004CTL26A1 chờ giao team Account",
          body: "Ra mắt sản phẩm Castrol — cần BGĐ chọn team Account phụ trách.",
          projectId: pendingProject.id,
        },
      ],
    });
  }

  // ── Thông tin chăm sóc mẫu — 1 gần (DHG, trong hạn) + 1 quá hạn (LOF, >60 ngày) để test reminders ──
  const dhg = byCode["DHG"];
  const lof = byCode["LOF"];
  if (dhg && (await prisma.careNote.count({ where: { clientId: dhg.id } })) === 0) {
    await prisma.careNote.create({
      data: { clientId: dhg.id, staffId: thao.id, note: "Gọi điện trao đổi kế hoạch Q3, khách phản hồi tích cực.", createdAt: new Date() },
    });
  }
  if (lof && (await prisma.careNote.count({ where: { clientId: lof.id } })) === 0) {
    const eightyDaysAgo = new Date();
    eightyDaysAgo.setDate(eightyDaysAgo.getDate() - 80);
    await prisma.careNote.create({
      data: { clientId: lof.id, staffId: ha.id, note: "Gặp trực tiếp bàn hội nghị khách hàng cuối năm.", createdAt: eightyDaysAgo },
    });
  }

  // ── MODULE ③ — Project Team + Master Timeline + Guest Invite mẫu (dự án T002 đang triển khai) ──
  const pmProject = createdProjects["T002DIA26A2"];
  if (pmProject) {
    // Project Leader (nhân sự Account chạy timeline) — owner (yen) là Project Owner duyệt.
    await prisma.project.update({ where: { id: pmProject.id }, data: { leaderId: yen.id } });

    // Project Team đa phòng ban: core Creative + support HR/IT
    if ((await prisma.projectMember.count({ where: { projectId: pmProject.id } })) === 0) {
      await prisma.projectMember.createMany({
        data: [
          { projectId: pmProject.id, staffId: yen.id, roleInProject: "LEADER" },
          { projectId: pmProject.id, staffId: orderLeadByCode["CREATIVE"].id, roleInProject: "CORE" },
          { projectId: pmProject.id, staffId: orderLeadByCode["PRO"].id, roleInProject: "CORE" },
          { projectId: pmProject.id, staffId: hrStaff.id, roleInProject: "SUPPORT" },
          { projectId: pmProject.id, staffId: itStaff.id, roleInProject: "SUPPORT" },
        ],
      });
    }

    // Internal Master Timeline: 2 Phase, mỗi phase vài Task. Một số item share + publish ra External.
    if ((await prisma.timelineItem.count({ where: { projectId: pmProject.id } })) === 0) {
      const day = (n: number) => {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return d;
      };
      const phase1 = await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          title: "Giai đoạn 1 — Chuẩn bị",
          startDate: day(0),
          endDate: day(7),
          departmentCode: "ACCOUNT",
          statusId: timelineStatusItems.IN_PROGRESS,
          sort: 0,
          isShared: true,
          externalPublished: true,
          externalTitle: "Giai đoạn chuẩn bị",
        },
      });
      await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          parentId: phase1.id,
          title: "Chốt concept & moodboard",
          startDate: day(0),
          endDate: day(3),
          ownerStaffId: orderLeadByCode["CREATIVE"].id,
          departmentCode: "CREATIVE",
          statusId: timelineStatusItems.IN_PROGRESS,
          sort: 0,
          isShared: true,
          externalPublished: true,
          clientEditable: true, // khách được xác nhận/ghi chú mục này
          clientStatus: "PENDING",
        },
      });
      await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          parentId: phase1.id,
          title: "Đặt in POSM & vật phẩm",
          startDate: day(2),
          endDate: day(6),
          ownerStaffId: orderLeadByCode["PRO"].id,
          secondaryOwnerStaffId: orderLeadByCode["PCC"].id,
          departmentCode: "PRO",
          accountableParty: "TCM",
          quantity: 200,
          unit: "phần",
          statusId: timelineStatusItems.NOT_STARTED,
          sort: 1,
        },
      });
      const phase2 = await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          title: "Giai đoạn 2 — Thực thi hiện trường",
          startDate: day(8),
          endDate: day(12),
          departmentCode: "OPE",
          statusId: timelineStatusItems.NOT_STARTED,
          sort: 1,
          isShared: true,
          externalPublished: false, // Leader đã share nhưng Owner CHƯA duyệt → guest chưa thấy
        },
      });
      await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          parentId: phase2.id,
          title: "Set-up & tổng duyệt",
          startDate: day(8),
          endDate: day(9),
          ownerStaffId: orderLeadByCode["OPE"].id,
          departmentCode: "OPE",
          statusId: timelineStatusItems.NOT_STARTED,
          sort: 0,
        },
      });

      // Vài hạng mục bổ sung để Dashboard "Tiến độ theo bộ phận" có số liệu thật cho mọi bộ phận
      // (Account/Planning/OPE/PRO/PCC) — kể cả PCC chưa từng làm chủ hạng mục nào trước đây, và
      // mỗi bộ phận có ít nhất 1 dòng quá hạn (endDate trong quá khứ) để card không toàn hiện 0.
      await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          parentId: phase1.id,
          title: "Chốt danh sách khách mời VIP",
          startDate: day(-5),
          endDate: day(-1), // quá hạn
          departmentCode: "ACCOUNT",
          statusId: timelineStatusItems.IN_PROGRESS,
          sort: 2,
        },
      });
      await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          parentId: phase1.id,
          title: "Lên proposal concept chi tiết",
          startDate: day(0),
          endDate: day(5),
          ownerStaffId: orderLeadByCode["PLANNING"].id,
          departmentCode: "PLANNING",
          statusId: timelineStatusItems.IN_PROGRESS,
          sort: 3,
        },
      });
      await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          parentId: phase1.id,
          title: "Duyệt outline kịch bản trình BGĐ",
          startDate: day(-6),
          endDate: day(-2), // quá hạn
          ownerStaffId: orderLeadByCode["PLANNING"].id,
          departmentCode: "PLANNING",
          statusId: timelineStatusItems.NOT_STARTED,
          sort: 4,
        },
      });
      await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          parentId: phase2.id,
          title: "Thuê mặt bằng & xin phép hiện trường",
          startDate: day(-4),
          endDate: day(-1), // quá hạn
          ownerStaffId: orderLeadByCode["OPE"].id,
          departmentCode: "OPE",
          statusId: timelineStatusItems.BLOCKED,
          sort: 1,
        },
      });
      await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          parentId: phase1.id,
          title: "Sản xuất backdrop & standee",
          startDate: day(-3),
          endDate: day(-1), // quá hạn
          ownerStaffId: orderLeadByCode["PRO"].id,
          departmentCode: "PRO",
          statusId: timelineStatusItems.IN_PROGRESS,
          sort: 5,
        },
      });
      await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          parentId: phase1.id,
          title: "Đặt hàng quà tặng vendor",
          startDate: day(1),
          endDate: day(6),
          ownerStaffId: orderLeadByCode["PCC"].id,
          departmentCode: "PCC",
          statusId: timelineStatusItems.NOT_STARTED,
          sort: 6,
        },
      });
      await prisma.timelineItem.create({
        data: {
          projectId: pmProject.id,
          parentId: phase1.id,
          title: "Chốt báo giá NCC in ấn",
          startDate: day(-5),
          endDate: day(-2), // quá hạn
          ownerStaffId: orderLeadByCode["PCC"].id,
          departmentCode: "PCC",
          statusId: timelineStatusItems.NOT_STARTED,
          sort: 7,
        },
      });
    }

    // Guest invite mẫu (magic-link) — token thô cố định để test: SEED-GUEST-TOKEN-DEMO
    const diaContact = await prisma.contact.findFirst({ where: { client: { code: "DIA" } } });
    if ((await prisma.guestInvite.count({ where: { projectId: pmProject.id } })) === 0) {
      await prisma.guestInvite.create({
        data: {
          projectId: pmProject.id,
          contactId: diaContact?.id ?? null,
          email: diaContact?.email ?? "b.tran@diageo.com",
          name: diaContact?.name ?? "Trần Thị B",
          tokenHash: sha256("SEED-GUEST-TOKEN-DEMO"),
          createdById: yen.id,
        },
      });
    }

    // Ma trận nhân sự mẫu (KUN-style) — hiển thị khi timeline viewMode=CHECKLIST.
    if ((await prisma.projectStaffing.count({ where: { projectId: pmProject.id } })) === 0) {
      const staffingRows = [
        { role: "PG/PB", cells: { "Check in": 4, "Bán hàng": 4, Game: 2 } },
        { role: "Mascot", cells: { "Check in": 2 } },
        { role: "Sup", cells: { "Check in": 1, "Bán hàng": 1, Game: 1 } },
        { role: "Helper", cells: { Chung: 4 } },
      ];
      let sSort = 0;
      const staffingData = staffingRows.flatMap((r) =>
        Object.entries(r.cells).map(([zone, hc]) => ({
          projectId: pmProject.id,
          roleLabel: r.role,
          zoneLabel: zone,
          headcount: hc,
          sort: sSort++,
        })),
      );
      await prisma.projectStaffing.createMany({ data: staffingData });
    }

    // CostSheet mẫu (CTRACT) + 2 revision để demo so sánh phiên bản CO/CE.
    if ((await prisma.costSheet.count({ where: { projectId: pmProject.id } })) === 0) {
      const sheet = await prisma.costSheet.create({
        data: {
          projectId: pmProject.id,
          version: "CTRACT",
          scenario: "COST_UP",
          ceTotal: BigInt(120000000),
          coTotal: BigInt(80000000),
          chiHo: BigInt(5000000),
          vatPct: 8,
          minMarginPct: 31,
          approvedById: ceo.id,
          approvedAt: new Date(),
        },
      });
      const fieldSection = await prisma.costSheetSection.create({
        data: { costSheetId: sheet.id, code: "FIELD", nameVi: "Triển khai hiện trường", colorSlot: "brand", sort: 0 },
      });
      await prisma.costLine.createMany({
        data: [
          { costSheetId: sheet.id, sectionId: fieldSection.id, itemName: "Đội PG/PB roadshow", lineType: "QTY_PRICE", quantity: 8, unit: "người/ngày", unitPrice: BigInt(800000), amount: BigInt(6400000), sort: 0 },
          { costSheetId: sheet.id, sectionId: fieldSection.id, itemName: "Xe di chuyển đoàn", lineType: "QTY_PRICE", quantity: 5, unit: "ngày", unitPrice: BigInt(2500000), amount: BigInt(12500000), sort: 1 },
        ],
      });
      const snap = (peopleAmount: number, coTotal: number, ceTotal: number) =>
        JSON.stringify({
          sections: [
            {
              code: "FIELD", nameVi: "Triển khai hiện trường", isProxy: false,
              lines: [
                { itemName: "Đội PG/PB roadshow", lineType: "QTY_PRICE", quantity: peopleAmount / 800000, unit: "người/ngày", unitPrice: 800000, fixedAmount: null, percentVal: null, amount: peopleAmount },
                { itemName: "Xe di chuyển đoàn", lineType: "QTY_PRICE", quantity: 5, unit: "ngày", unitPrice: 2500000, fixedAmount: null, percentVal: null, amount: 12500000 },
              ],
            },
          ],
          totals: { coTotal, ceTotal, chiHo: 5000000, marginPct: ((ceTotal - coTotal) / ceTotal) * 100 },
        });
      await prisma.costSheetRevision.createMany({
        data: [
          {
            costSheetId: sheet.id, revNo: 1, isBaseline: true,
            ceTotal: BigInt(110000000), coTotal: BigInt(72000000), chiHo: BigInt(5000000),
            marginPct: 34.5, note: "Bản hợp đồng gốc", createdById: yen.id,
            snapshotJson: snap(6400000, 72000000, 110000000),
          },
          {
            costSheetId: sheet.id, revNo: 2, isBaseline: false,
            ceTotal: BigInt(120000000), coTotal: BigInt(80000000), chiHo: BigInt(5000000),
            marginPct: 33.3, note: "Khách tăng số lượng PG/PB (phát sinh)", createdById: yen.id,
            snapshotJson: snap(9600000, 80000000, 120000000),
          },
        ],
      });
    }
  }

  // ── MODULE Creative — Order Creative mẫu + task ở nhiều trạng thái (Dashboard realtime) ──
  async function seedCreativeOrder(
    projectCode: string,
    sentBy: { id: string },
    items: string[],
  ): Promise<{ id: string } | null> {
    const proj = createdProjects[projectCode];
    if (!proj) return null;
    const existing = await prisma.projectOrder.findUnique({
      where: { projectId_department: { projectId: proj.id, department: "CREATIVE" } },
    });
    if (existing) return existing;
    return prisma.projectOrder.create({
      data: {
        projectId: proj.id,
        department: "CREATIVE",
        status: "ACCEPTED",
        briefLinkUrl: "https://drive.google.com/drive/folders/seed-brief-placeholder",
        sentById: sentBy.id,
        acceptedAt: new Date(),
        acceptedById: creativeLead.id,
        creativeItems: { create: items.map((label) => ({ label })) },
      },
    });
  }

  const orderT001 = await seedCreativeOrder("T001DHG26A1", thao, ["KEY_VISUAL", "DESIGN_3D"]);
  const orderT002 = await seedCreativeOrder("T002DIA26A2", yen, ["KEY_VISUAL", "VIDEO", "SET_DESIGN"]);
  const projT001 = createdProjects["T001DHG26A1"];
  const projT002 = createdProjects["T002DIA26A2"];

  if (orderT001 && projT001 && (await prisma.creativeTask.count({ where: { orderId: orderT001.id } })) === 0) {
    await prisma.creativeTask.createMany({
      data: [
        // Chờ giao (BIDDING)
        {
          projectId: projT001.id, orderId: orderT001.id, orderedById: thao.id, sourceItemLabel: "KEY_VISUAL",
          title: "Key visual đề xuất pitch", status: "UNASSIGNED",
        },
        // Đã giao (BIDDING) — 3D Booth cho artist
        {
          projectId: projT001.id, orderId: orderT001.id, orderedById: thao.id, sourceItemLabel: "DESIGN_3D",
          title: "Phối cảnh 3D booth pitch", status: "ASSIGNED", taskTypeId: creativeTaskTypes.BOOTH_3D,
          assigneeId: artist3d.id, assignedById: creativeLead.id, assignedAt: new Date(),
        },
      ],
    });
  }

  if (orderT002 && projT002 && (await prisma.creativeTask.count({ where: { orderId: orderT002.id } })) === 0) {
    await prisma.creativeTask.createMany({
      data: [
        // Chờ CD duyệt (WORKING) — Key visual, đã GỬI kèm giờ
        {
          projectId: projT002.id, orderId: orderT002.id, orderedById: yen.id, sourceItemLabel: "KEY_VISUAL",
          title: "Key visual Activation Tết", status: "SUBMITTED", taskTypeId: creativeTaskTypes.KV_2D,
          assigneeId: seniorDesigner.id, assignedById: creativeLead.id, assignedAt: new Date(),
          deliverableLinkUrl: "https://drive.google.com/drive/folders/kv-tet", hoursSpent: 3.5, submittedAt: new Date(),
        },
        // Đã trả (WORKING) — Video, duyệt sau 1 lần sửa
        {
          projectId: projT002.id, orderId: orderT002.id, orderedById: yen.id, sourceItemLabel: "VIDEO",
          title: "TVC 30s Activation Tết", status: "DELIVERED", taskTypeId: creativeTaskTypes.VIDEO,
          assigneeId: seniorDesigner.id, assignedById: creativeLead.id, assignedAt: new Date(),
          deliverableLinkUrl: "https://drive.google.com/drive/folders/tvc-tet", hoursSpent: 8, revisionCount: 1,
          reviewedById: creativeLead.id, reviewedAt: new Date(), deliveredAt: new Date(),
        },
        // Đã giao (WORKING) — 3D sân khấu cho artist
        {
          projectId: projT002.id, orderId: orderT002.id, orderedById: yen.id, sourceItemLabel: "SET_DESIGN",
          title: "3D sân khấu chính", status: "ASSIGNED", taskTypeId: creativeTaskTypes.STAGE_3D,
          assigneeId: artist3d.id, assignedById: creativeLead.id, assignedAt: new Date(),
        },
      ],
    });
  }

  // ── Sub-module PLANNING — job mẫu (T001 BIDDING: research xong, proposal v2 đang review) ──
  // Hiện chỉ có 1 nhân sự Planning thật (Dương Mỹ Ngọc) — cô ấy đóng cả 2 vai trò: người nhận Order
  // (orderLeadByCode["PLANNING"]) lẫn người thực thi job. Kịch bản dưới đây vì vậy có "tự giao/tự
  // duyệt việc" — không phải lỗi, phản ánh đúng thực tế công ty hiện chỉ có 1 người ở vị trí này.
  const planner = orderLeadByCode["PLANNING"];
  const planningLead = orderLeadByCode["PLANNING"];

  if (projT001) {
    let planningOrder = await prisma.projectOrder.findUnique({
      where: { projectId_department: { projectId: projT001.id, department: "PLANNING" } },
    });
    if (!planningOrder) {
      planningOrder = await prisma.projectOrder.create({
        data: {
          projectId: projT001.id,
          department: "PLANNING",
          status: "ACCEPTED",
          briefLinkUrl: "https://drive.google.com/drive/folders/seed-brief-placeholder",
          extraBriefInfo: "Khách cần proposal activation hè — ưu tiên insight Gen Z, ngân sách ~1,2 tỷ.",
          outputRequest: "Research thị trường + design brief + proposal trình khách",
          sentById: thao.id,
          acceptedAt: new Date(),
          acceptedById: planningLead.id,
        },
      });
    }
    if ((await prisma.planningJob.count({ where: { projectId: projT001.id } })) === 0) {
      const dayMs = 24 * 60 * 60 * 1000;
      const job = await prisma.planningJob.create({
        data: {
          projectId: projT001.id,
          orderId: planningOrder.id,
          briefLinkUrl: planningOrder.briefLinkUrl,
          briefNote: planningOrder.extraBriefInfo,
          requestedById: thao.id,
          stages: {
            create: [
              {
                stage: "RESEARCH", sort: 0, assigneeId: planner.id, assignedById: planningLead.id,
                assignedAt: new Date(Date.now() - 6 * dayMs), dueAt: new Date(Date.now() - 4 * dayMs),
                resultLinkUrl: "https://drive.google.com/drive/folders/seed-research", hoursSpent: 6,
                completedAt: new Date(Date.now() - 4 * dayMs),
              },
              {
                stage: "DESIGN_BRIEF", sort: 1, assigneeId: planner.id, assignedById: planningLead.id,
                assignedAt: new Date(Date.now() - 4 * dayMs), dueAt: new Date(Date.now() - 2 * dayMs),
                resultLinkUrl: "https://drive.google.com/drive/folders/seed-design-brief", hoursSpent: 3.5,
                completedAt: new Date(Date.now() - 2 * dayMs),
              },
              {
                stage: "PROPOSAL", sort: 2, assigneeId: planner.id, assignedById: planningLead.id,
                assignedAt: new Date(Date.now() - 2 * dayMs), dueAt: new Date(Date.now() + 2 * dayMs),
              },
            ],
          },
          versions: {
            create: [
              {
                versionNo: 1, resultLinkUrl: "https://drive.google.com/drive/folders/seed-proposal-v1",
                hoursSpent: 8, submittedById: planner.id, submittedAt: new Date(Date.now() - 1 * dayMs),
                status: "NEEDS_REVISION", reviewNote: "Bổ sung phần cơ chế khuyến mãi + timeline roadshow chi tiết hơn.",
                reviewedById: planningLead.id, reviewedAt: new Date(Date.now() - 1 * dayMs),
              },
              {
                versionNo: 2, resultLinkUrl: "https://drive.google.com/drive/folders/seed-proposal-v2",
                hoursSpent: 4.25, submittedById: planner.id, submittedAt: new Date(),
                status: "IN_REVIEW",
              },
            ],
          },
        },
      });
      void job;
    }
  }

  // ── Task nội bộ theo bộ phận (PLANNING/PCC/OPE/PRO) — mirror pattern seedCreativeOrder ở trên,
  // KHÔNG gọi spawnTasksForDepartmentOrder (idempotent-key nội bộ, không cần cho dữ liệu demo tĩnh).
  // Dùng dự án T002 (pmProject, PROCESSING) — đã có sẵn TimelineItem cho cả 4 bộ phận (xem seed ở trên).
  if (projT002) {
    const deptTaskSeeds: {
      department: "PLANNING" | "PCC" | "OPE" | "PRO";
      assignee: { id: string };
      lead: { id: string };
      tasks: Array<{
        sourceKey: string;
        title: string;
        status: "UNASSIGNED" | "ASSIGNED" | "SUBMITTED" | "DELIVERED";
        deliverableLinkUrl?: string;
        hoursSpent?: number;
        revisionCount?: number;
      }>;
    }[] = [
      {
        department: "PLANNING",
        assignee: orderLeadByCode["PLANNING"],
        lead: orderLeadByCode["PLANNING"],
        tasks: [
          { sourceKey: "TL:seed-planning-1", title: "Đề xuất concept roadshow Tết", status: "UNASSIGNED" },
          { sourceKey: "TL:seed-planning-2", title: "Research insight khách hàng mục tiêu", status: "DELIVERED", deliverableLinkUrl: "https://drive.google.com/drive/folders/seed-dept-planning", hoursSpent: 4.5 },
        ],
      },
      {
        department: "PCC",
        assignee: orderLeadByCode["PCC"],
        lead: orderLeadByCode["PCC"],
        tasks: [
          { sourceKey: "TL:seed-pcc-1", title: "Đặt hàng quà tặng vendor", status: "ASSIGNED" },
          { sourceKey: "TL:seed-pcc-2", title: "Chốt báo giá NCC in ấn", status: "SUBMITTED", deliverableLinkUrl: "https://drive.google.com/drive/folders/seed-dept-pcc", hoursSpent: 2 },
        ],
      },
      {
        department: "OPE",
        assignee: orderLeadByCode["OPE"],
        lead: orderLeadByCode["OPE"],
        tasks: [
          { sourceKey: "TL:seed-ope-1", title: "Thuê mặt bằng & xin phép hiện trường", status: "ASSIGNED" },
          { sourceKey: "TL:seed-ope-2", title: "Set-up & tổng duyệt", status: "DELIVERED", deliverableLinkUrl: "https://drive.google.com/drive/folders/seed-dept-ope", hoursSpent: 6.25, revisionCount: 1 },
        ],
      },
      {
        department: "PRO",
        assignee: orderLeadByCode["PRO"],
        lead: orderLeadByCode["PRO"],
        tasks: [
          { sourceKey: "TL:seed-pro-1", title: "Sản xuất backdrop & standee", status: "UNASSIGNED" },
          { sourceKey: "TL:seed-pro-2", title: "Đặt in POSM & vật phẩm", status: "ASSIGNED" },
        ],
      },
    ];

    for (const seedDept of deptTaskSeeds) {
      if (!seedDept.assignee) continue; // phòng ban chưa có nhân sự thật (hiếm, phòng thân trọng)
      let order = await prisma.projectOrder.findUnique({
        where: { projectId_department: { projectId: projT002.id, department: seedDept.department } },
      });
      if (!order) {
        order = await prisma.projectOrder.create({
          data: {
            projectId: projT002.id,
            department: seedDept.department,
            status: "ACCEPTED",
            sentById: yen.id,
            acceptedAt: new Date(),
            acceptedById: seedDept.lead.id,
          },
        });
      }
      if ((await prisma.departmentTask.count({ where: { orderId: order.id } })) === 0) {
        await prisma.departmentTask.createMany({
          data: seedDept.tasks.map((task) => ({
            projectId: projT002!.id,
            department: seedDept.department,
            orderId: order!.id,
            orderedById: yen.id,
            sourceKey: task.sourceKey,
            title: task.title,
            status: task.status,
            ...(task.status !== "UNASSIGNED"
              ? { assigneeId: seedDept.assignee.id, assignedById: seedDept.lead.id, assignedAt: new Date() }
              : {}),
            ...(task.deliverableLinkUrl
              ? {
                  deliverableLinkUrl: task.deliverableLinkUrl,
                  hoursSpent: task.hoursSpent,
                  submittedAt: new Date(),
                  revisionCount: task.revisionCount ?? 0,
                  ...(task.status === "DELIVERED"
                    ? { reviewedById: seedDept.lead.id, reviewedAt: new Date(), deliveredAt: new Date() }
                    : {}),
                }
              : {}),
          })),
        });
      }
    }
  }

  // ── MODULE ④ Chi phí & Công nợ — đồng bộ CO nội bộ + tạm ứng/thanh toán/công nợ mẫu (dự án T002 PROCESSING) ──
  if (projT002) {
    const financeSheet = await prisma.costSheet.findFirst({
      where: { projectId: projT002.id, version: "CTRACT" },
      orderBy: { createdAt: "desc" },
      include: {
        sections: { orderBy: { sort: "asc" }, include: { lines: { orderBy: { sort: "asc" } } } },
        revisions: { orderBy: { revNo: "desc" }, take: 1, select: { revNo: true } },
      },
    });
    if (financeSheet && (await prisma.financeCostLine.count({ where: { projectId: projT002.id } })) === 0) {
      const revNo = financeSheet.revisions[0]?.revNo ?? 0;
      let sort = 0;
      const createdLines: { id: string; amount: bigint; itemName: string }[] = [];
      for (const s of financeSheet.sections) {
        if (s.isProxy) continue;
        for (const l of s.lines) {
          const line = await prisma.financeCostLine.create({
            data: {
              projectId: projT002.id,
              lineKey: `${s.code}‖${l.itemName}`,
              sectionCode: s.code,
              sectionName: s.nameVi,
              itemName: l.itemName,
              specs: l.specs,
              amount: l.amount,
              vendorId: l.vendorId,
              sort: sort++,
              sourceRevNo: revNo,
            },
          });
          createdLines.push({ id: line.id, amount: l.amount, itemName: l.itemName });
        }
      }
      // Tạm ứng mẫu: 1 STAFF (DISBURSED) + 1 VENDOR (REQUESTED) trên dòng đầu tiên nếu có.
      if (createdLines[0]) {
        const half = createdLines[0].amount / BigInt(2);
        await prisma.advance.create({
          data: {
            financeCostLineId: createdLines[0].id, projectId: projT002.id, installmentNo: 1, amount: half,
            advanceType: "STAFF", recipientStaffId: orderLeadByCode["PRO"]?.id ?? yen.id,
            bankName: "Vietcombank", bankAccountNo: "0123456789", bankAccountHolder: "Production Lead",
            status: "DISBURSED", requestedById: yen.id, disbursedById: accountant.id, disbursedAt: new Date(),
          },
        });
      }
      if (createdLines[1]) {
        await prisma.advance.create({
          data: {
            financeCostLineId: createdLines[1].id, projectId: projT002.id, installmentNo: 1, amount: createdLines[1].amount / BigInt(3),
            advanceType: "VENDOR", recipientVendorId: (await prisma.vendor.findFirst())?.id,
            bankName: "ACB", bankAccountNo: "9988776655", bankAccountHolder: "Cty Nhân sự sự kiện 123",
            status: "REQUESTED", requestedById: yen.id,
          },
        });
      }
    }

    // Thanh toán NCC mẫu
    const anyVendor = await prisma.vendor.findFirst();
    if (anyVendor && (await prisma.vendorPayment.count({ where: { projectId: projT002.id } })) === 0) {
      await prisma.vendorPayment.create({
        data: { vendorId: anyVendor.id, projectId: projT002.id, amount: BigInt(15_000_000), dueDate: new Date(Date.now() + 7 * 864e5), status: "SCHEDULED", invoiceNo: "NCC-2026-001", createdById: accountant.id },
      });
    }

    // Công nợ mẫu: 1 hóa đơn quá hạn (để test AR aging + reminder) + 1 thanh toán một phần
    const t002Client = await prisma.project.findUnique({ where: { id: projT002.id }, select: { clientId: true } });
    if (t002Client && (await prisma.clientInvoice.count({ where: { projectId: projT002.id } })) === 0) {
      const inv = await prisma.clientInvoice.create({
        data: {
          projectId: projT002.id, clientId: t002Client.clientId, invoiceNo: "HD-2026-DIA-01",
          invoiceDate: new Date(Date.now() - 60 * 864e5), amount: BigInt(120_000_000),
          dueDate: new Date(Date.now() - 20 * 864e5), createdById: accountant.id,
        },
      });
      await prisma.clientPayment.create({
        data: { invoiceId: inv.id, amount: BigInt(40_000_000), paidDate: new Date(Date.now() - 10 * 864e5), method: "Chuyển khoản", createdById: accountant.id },
      });
    }
  }

  // ── Operations (OPE) — mẫu CtvBatch/CtvContract, dữ liệu khớp 2 dòng mẫu trong file Excel
  // "Bang chi tiet thanh toan thue ngoai.xlsx" (form BM08/QT.TCM.16) ──
  if (projT002 && (await prisma.ctvBatch.count({ where: { projectId: projT002.id } })) === 0) {
    const opeLead = await prisma.staff.findFirst({ where: { title: "Operations Manager" } });
    const batch = await prisma.ctvBatch.create({
      data: {
        projectId: projT002.id,
        name: "BM08 — đợt 1",
        programFrom: "01/06/2024",
        programTo: "07/06/2024",
        teamLeader: "Nguyễn Văn Nam",
        workLocation: "TP.HCM",
        createdById: (opeLead ?? yen).id,
      },
    });
    await prisma.ctvContract.createMany({
      data: [
        {
          batchId: batch.id, sort: 1, fullName: "Trần Văn A", gender: "Nam", dateOfBirth: "01/02/2000",
          nationality: "VN", idNumber: "012345678910", idIssueDate: "10/02/2027", idIssuePlace: "HCM",
          permanentAddress: "6F Phan Kế Bính, Phường Tân Định, HCM", taxCode: "090909090909",
          bankAccountNo: "1234567890", bankName: "ACB", bankBranch: "HCM", phone: "0979022257",
          eventName: "Bipp", executionDate: "01/06/2024", executionLocation: "HCM",
          workItem: "Dịch vụ Điều phối sự kiện", unit: "Gói", quantity: 1, unitPrice: BigInt(500_000),
          amount: BigInt(500_000), grossNet: "N",
        },
        {
          batchId: batch.id, sort: 2, fullName: "Trần Văn B", gender: "Nữ", dateOfBirth: "03/04/1998",
          nationality: "VN", idNumber: "012345678911", idIssueDate: "05/07/2002", idIssuePlace: "HCM",
          permanentAddress: "86 Lê Văn Duyệt, Phường Gia Định, HCM", taxCode: "0808080808",
          bankAccountNo: "1987654321", bankName: "VCB", bankBranch: "HCM", phone: "0978198412",
          eventName: "Bllooon", executionDate: "05/07/2024", executionLocation: "Cần Thơ",
          workItem: "Biểu diễn mở màn", unit: "Gói", quantity: 1, unitPrice: BigInt(10_000_000),
          amount: BigInt(10_000_000), grossNet: "G",
        },
      ],
    });
  }

  // ── MODULE ⑨ Communication — chat mẫu (1 DIRECT + 1 GROUP nhiều admin) ──
  if ((await prisma.conversation.count()) === 0) {
    const t0 = Date.now();
    const at = (minAgo: number) => new Date(t0 - minAgo * 60_000);

    // DIRECT: CEO ↔ Yến
    const direct = await prisma.conversation.create({
      data: {
        type: "DIRECT",
        createdById: ceo.id,
        members: { create: [{ staffId: ceo.id }, { staffId: yen.id }] },
      },
    });
    await prisma.message.create({ data: { conversationId: direct.id, senderId: ceo.id, type: "TEXT", body: "Em ơi dự án Activation Tết tiến độ sao rồi?", createdAt: at(120) } });
    await prisma.message.create({ data: { conversationId: direct.id, senderId: yen.id, type: "TEXT", body: "Dạ em đang chốt CO/CE với bên sản xuất, chiều em gửi anh ạ.", createdAt: at(118) } });

    // GROUP: nhiều admin (Yến tạo + admin, Thảo được bổ nhiệm admin), 2 member
    const group = await prisma.conversation.create({
      data: {
        type: "GROUP",
        name: "BTC — Activation Tết",
        createdById: yen.id,
        members: {
          create: [
            { staffId: yen.id, role: "ADMIN" },
            { staffId: thao.id, role: "ADMIN" },
            { staffId: creativeLead.id, role: "MEMBER" },
            { staffId: seniorDesigner.id, role: "MEMBER" },
          ],
        },
      },
    });
    await prisma.message.createMany({
      data: [
        { conversationId: group.id, senderId: yen.id, type: "SYSTEM", systemEvent: "GROUP_CREATED", body: null, createdAt: at(200) },
        { conversationId: group.id, senderId: yen.id, type: "SYSTEM", systemEvent: "MEMBER_ADDED", body: thao.fullName, createdAt: at(199) },
        { conversationId: group.id, senderId: yen.id, type: "SYSTEM", systemEvent: "MEMBER_ADDED", body: creativeLead.fullName, createdAt: at(198) },
        { conversationId: group.id, senderId: yen.id, type: "SYSTEM", systemEvent: "MEMBER_ADDED", body: seniorDesigner.fullName, createdAt: at(197) },
        { conversationId: group.id, senderId: yen.id, type: "TEXT", body: "Cả nhà ơi, deadline key visual là thứ 5 nhé.", createdAt: at(60) },
        { conversationId: group.id, senderId: creativeLead.id, type: "LINK", body: null, linkText: "Thư mục brief & moodboard", linkUrl: "https://drive.google.com/drive/folders/brief-tet", createdAt: at(55) },
        { conversationId: group.id, senderId: yen.id, type: "SYSTEM", systemEvent: "ROLE_PROMOTED", body: thao.fullName, createdAt: at(50) },
      ],
    });
    // @all mẫu
    const allMsg = await prisma.message.create({
      data: { conversationId: group.id, senderId: thao.id, type: "TEXT", body: "@all nhớ cập nhật tiến độ trước 5h chiều nay giúp mình!", createdAt: at(10) },
    });
    await prisma.messageMention.create({ data: { messageId: allMsg.id, isAll: true } });
  }

  // ── "GIA ĐÌNH TCM" — group mặc định gồm TOÀN BỘ nhân sự hiện có, avatar = logo TCM ──
  // Guard riêng (không dùng chung `conversation.count()===0` ở trên) để chạy lại `db:seed` trên DB
  // đã có sẵn hội thoại (từ các lần seed/test trước) vẫn thêm được nhóm này nếu chưa tồn tại.
  if (!(await prisma.conversation.findFirst({ where: { type: "GROUP", name: TCM_FAMILY_GROUP_NAME } }))) {
    const allStaff = await prisma.staff.findMany({ where: { isActive: true }, select: { id: true, fullName: true } });
    if (allStaff.length > 0) {
      const family = await prisma.conversation.create({
        data: {
          type: "GROUP",
          name: TCM_FAMILY_GROUP_NAME,
          avatarKey: "/brand/icon-square.png",
          createdById: ceo.id,
          members: { create: allStaff.map((s) => ({ staffId: s.id, role: s.id === ceo.id ? "ADMIN" : "MEMBER" })) },
        },
      });
      const others = allStaff.filter((s) => s.id !== ceo.id);
      const famT0 = Date.now();
      const famAt = (minAgo: number) => new Date(famT0 - minAgo * 60_000);
      await prisma.message.create({
        data: { conversationId: family.id, senderId: ceo.id, type: "SYSTEM", systemEvent: "GROUP_CREATED", body: null, createdAt: famAt(others.length + 1) },
      });
      await prisma.message.createMany({
        data: others.map((s, i) => ({
          conversationId: family.id,
          senderId: ceo.id,
          type: "SYSTEM",
          systemEvent: "MEMBER_ADDED",
          body: s.fullName,
          createdAt: famAt(others.length - i),
        })),
      });
    }
  }

  // ── Cơ sở tri thức (KB) — danh mục động + vài tài liệu mẫu (dạng link, không cần file thật) ──
  // MKT-1: loại nội dung bài đăng — đi thẳng vào prompt AI để bám đúng mục đích bài, nên admin
  // thêm/bớt item ở /settings/options/mkt_content_type là AI đổi theo, không cần sửa code.
  await seedOptionSet("mkt_content_type", "Loại nội dung bài MKT", [
    { code: "RECAP", labelVi: "Recap sau sự kiện", labelEn: "Event recap" },
    { code: "TEASER", labelVi: "Teaser trước sự kiện", labelEn: "Pre-event teaser" },
    { code: "BTS", labelVi: "Hậu trường (BTS)", labelEn: "Behind the scenes" },
    { code: "MILESTONE", labelVi: "Thành tựu / kỷ niệm", labelEn: "Milestone / celebration" },
    { code: "RECRUIT", labelVi: "Tuyển dụng", labelEn: "Recruitment" },
    { code: "OTHER", labelVi: "Khác", labelEn: "Other" },
  ]);
  // Tiêu chí chấm điểm phỏng vấn (TD-1) — danh mục MỀM: BGĐ thêm/bớt ở /settings/options/
  // recruit_criteria mà không cần sửa code. Bộ mặc định dưới đây do trợ lý đề xuất và chủ dự án
  // duyệt 06/08/2026; mục "chịu áp lực / làm hiện trường" là đặc thù nghề event của TCM.
  // ⚠ Phiếu đã chấm lưu criterionCode dạng CHUỖI nên tắt một tiêu chí về sau KHÔNG làm hỏng dữ
  // liệu cũ — cùng nguyên tắc với câu hỏi kiểm tra ở KB-H3 (tắt, không xoá).
  await seedOptionSet("recruit_criteria", "Tiêu chí đánh giá phỏng vấn", [...DEFAULT_RECRUIT_CRITERIA]);

  // ── 3 team nhỏ Creative (CR-1, 06/08/2026) — one-shot marker ──
  // Marker để re-seed KHÔNG dựng lại squad admin đã sửa tay (đổi tên, tắt, gán lead).
  // ⚠ CỐ Ý không gán người vào squad và không gán lead: chủ dự án gán ở /settings/creative-squads.
  // Hệ quả khi 0 người có squad: luồng "điều phối về team → trưởng team giao người" chưa chạy,
  // nhưng CD vẫn giao thẳng việc như trước — KHÔNG phải hỏng.
  const SQUADS_KEY = "20260806_creative_squads";
  const squadsMarker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: SQUADS_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!squadsMarker) {
    const squadRows = [
      { code: "CREATIVE", name: "Creative — idea & chiến lược", sort: 1 },
      { code: "GRAPHIC_2D", name: "Graphic 2D — Key Visual", sort: 2 },
      { code: "MULTIMEDIA", name: "Multimedia — 3D/Animation/AI", sort: 3 },
    ];
    for (const s of squadRows) {
      await prisma.creativeSquad.upsert({ where: { code: s.code }, update: {}, create: s });
    }
    await prisma.setting.create({
      data: { module: "seed", key: SQUADS_KEY, scope: "GLOBAL", scopeRef: "", value: JSON.stringify({ created: squadRows.length }) },
    });
    console.log(`[seed] 3 team nhỏ Creative đã dựng (marker ${SQUADS_KEY})`);
  }

  // ── FIN-B (15/08/2026) — baseline duyệt CO: trần chi nay đi theo bản ĐÃ DUYỆT (approvedRevNo).
  // Bảng đang chạy (dự án đã có dòng trần chi ở module ④) coi bản MỚI NHẤT hiện tại là bản đã
  // duyệt — BGĐ đã ngầm chấp nhận trần đang vận hành; không có bước này thì ngày deploy mọi dự án
  // MẤT trần chi cho tới khi BGĐ duyệt lại từng bảng. CỐ Ý không đặt approvedById/approvedAt:
  // ghi tên một người vào lần duyệt không tồn tại là bịa lịch sử (bài học offboard A2, mục 10.18).
  // Bảng CHƯA có dòng trần chi giữ nguyên null → cổng duyệt gác từ đầu, đúng thiết kế.
  const FINB_KEY = "20260815_fin_b_baseline";
  const finbMarker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: FINB_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!finbMarker) {
    const ctractSheets = await prisma.costSheet.findMany({
      where: { version: "CTRACT", approvedRevNo: null },
      select: {
        id: true,
        projectId: true,
        revisions: { orderBy: { revNo: "desc" }, take: 1, select: { revNo: true } },
      },
    });
    let baselined = 0;
    for (const s of ctractSheets) {
      const latest = s.revisions[0]?.revNo;
      if (latest == null) continue;
      const lineCount = await prisma.financeCostLine.count({ where: { projectId: s.projectId } });
      if (lineCount === 0) continue; // chưa từng có trần chi → để cổng duyệt gác
      await prisma.costSheet.update({ where: { id: s.id }, data: { approvedRevNo: latest } });
      baselined++;
    }
    await prisma.setting.create({
      data: { module: "seed", key: FINB_KEY, scope: "GLOBAL", scopeRef: "", value: JSON.stringify({ baselined }) },
    });
    console.log(`[seed] FIN-B baseline: ${baselined} bảng CO coi bản mới nhất là đã duyệt (marker ${FINB_KEY})`);
  }

  const kbCategories = await seedOptionSet("kb_category", "Danh mục cơ sở tri thức", [
    { code: "GENERAL", labelVi: "Chung", labelEn: "General" },
    { code: "CREDENTIALS", labelVi: "Năng lực (Credentials)", labelEn: "Credentials" },
    { code: "ISO", labelVi: "ISO", labelEn: "ISO" },
    { code: "HSE", labelVi: "An toàn – Sức khỏe – Môi trường (HS&E)", labelEn: "Health, Safety & Environment" },
  ]);
  const kbDocsSeed = [
    { categoryCode: "GENERAL", title: "Sổ tay nhân viên TCM", description: "Quy định chung, quy trình làm việc nội bộ.", linkUrl: "https://drive.google.com/tcm-employee-handbook" },
    { categoryCode: "CREDENTIALS", title: "TCM Company Profile 2026", description: "Hồ sơ năng lực công ty, dùng cho pitch/proposal.", linkUrl: "https://drive.google.com/tcm-company-profile" },
    { categoryCode: "HSE", title: "Sổ tay An toàn, Sức khỏe & Môi trường (HS&E)", description: "TCM-HSE-MAN-01 — quy trình an toàn hiện trường BTL, PPE, ứng phó khẩn cấp.", linkUrl: "https://drive.google.com/tcm-hse-manual" },
  ];
  for (const [i, d] of kbDocsSeed.entries()) {
    const categoryId = kbCategories[d.categoryCode];
    if (!categoryId) continue;
    await prisma.kbDocument.upsert({
      where: { id: `seed-kb-${d.categoryCode.toLowerCase()}-${i}` },
      update: {},
      create: {
        id: `seed-kb-${d.categoryCode.toLowerCase()}-${i}`,
        categoryId,
        title: d.title,
        description: d.description,
        linkUrl: d.linkUrl,
        sort: i,
        uploadedById: ceo.id,
      },
    });
  }

  // ── Cost-per-task Creative — ngân sách lương theo vị trí + ma trận % (kỳ hiện tại, cycle mặc định MONTH) ──
  const costPeriodCode = currentPeriodCode("MONTH", new Date());
  const salarySeed: { title: string; monthlySalary: bigint }[] = [
    { title: "Creative Lead", monthlySalary: BigInt(25_000_000) },
    { title: "Senior Designer", monthlySalary: BigInt(18_000_000) },
    { title: "3D Artist", monthlySalary: BigInt(16_000_000) },
  ];
  for (const s of salarySeed) {
    await prisma.creativeSalaryBudget.upsert({
      where: { positionTitle_periodCode: { positionTitle: s.title, periodCode: costPeriodCode } },
      update: {},
      create: { positionTitle: s.title, periodCode: costPeriodCode, monthlySalary: s.monthlySalary },
    });
  }
  const ratioSeed: { title: string; typeCode: string; percent: number }[] = [
    { title: "Creative Lead", typeCode: "FA", percent: 40 },
    { title: "Creative Lead", typeCode: "TECH_DRAW", percent: 20 },
    { title: "Creative Lead", typeCode: "KV_2D", percent: 20 },
    { title: "Creative Lead", typeCode: "VIDEO", percent: 20 },
    { title: "Senior Designer", typeCode: "KV_2D", percent: 40 },
    { title: "Senior Designer", typeCode: "POSM_2D", percent: 30 },
    { title: "Senior Designer", typeCode: "FA", percent: 20 },
    { title: "Senior Designer", typeCode: "VIDEO", percent: 10 },
    { title: "3D Artist", typeCode: "BOOTH_3D", percent: 45 },
    { title: "3D Artist", typeCode: "STAGE_3D", percent: 35 },
    { title: "3D Artist", typeCode: "TECH_DRAW", percent: 20 },
  ];
  for (const r of ratioSeed) {
    const taskTypeId = creativeTaskTypes[r.typeCode];
    if (!taskTypeId) continue;
    await prisma.creativeAllocationRatio.upsert({
      where: { positionTitle_taskTypeId_periodCode: { positionTitle: r.title, taskTypeId, periodCode: costPeriodCode } },
      update: {},
      create: { positionTitle: r.title, taskTypeId, periodCode: costPeriodCode, percent: r.percent },
    });
  }

  // ── MODULE ⑧ Kho — danh mục nhóm hàng + kho HCM/ĐN + item mẫu + phiếu mẫu (idempotent) ──
  await seedOptionSet("inventory_category", "Nhóm hàng kho", [
    { code: "BOOTH", labelVi: "Booth / Quầy kệ", labelEn: "Booth / Counter" },
    { code: "POSM", labelVi: "POSM", labelEn: "POSM" },
    { code: "SOUND_LIGHT", labelVi: "Âm thanh ánh sáng", labelEn: "Sound & Light" },
    { code: "UNIFORM", labelVi: "Đồng phục / PG kit", labelEn: "Uniform / PG kit" },
    { code: "TOOL", labelVi: "Dụng cụ thi công", labelEn: "Tools" },
    { code: "CONSUMABLE", labelVi: "Vật tư tiêu hao", labelEn: "Consumables" },
  ]);
  await prisma.warehouse.upsert({
    where: { code: "HCM" },
    update: {},
    create: { code: "HCM", name: "Kho tổng HCM", location: "TP. Hồ Chí Minh", isMain: true },
  });
  await prisma.warehouse.upsert({
    where: { code: "DN" },
    update: {},
    create: { code: "DN", name: "Kho phụ Đà Nẵng", location: "Đà Nẵng" },
  });

  // ── Kho v2 (spec 27/07/2026): cây danh mục 7 nhóm — idempotent theo (parentId, name).
  // KHÔNG seed item/phiếu mẫu nữa (gỡ 27/07): mã lô sinh theo tổ hợp thật, dữ liệu thật
  // nhập bằng kiểm kê + CSV lúc go-live; item demo format cũ sẽ thành rác trên scheme mới.
  // ── Mã lô v3 (18/08/2026): mã nhóm gốc 1 → 2 ký tự. One-shot có marker: đổi ĐÚNG 7 mã cũ đã seed sang
  // mã mới (khớp theo mã cũ, không theo tên — tên admin sửa được). Chạy lại là no-op; nhóm admin tự thêm
  // sau này không bị đụng. Không migrate mặt hàng: lúc đổi cả dev lẫn production đều 0 mặt hàng.
  const GROUP_CODES_KEY = "20260818_inv_group_codes_2char";
  const groupCodesMarker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: GROUP_CODES_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!groupCodesMarker) {
    const RENAME: Record<string, string> = { P: "PO", E: "DT", G: "TC", C: "DP", L: "IA", M: "KG", O: "VT" };
    let renamed = 0;
    for (const [oldCode, newCode] of Object.entries(RENAME)) {
      const r = await prisma.inventoryCategory.updateMany({ where: { parentId: null, code: oldCode }, data: { code: newCode } });
      renamed += r.count;
    }
    await prisma.setting.create({
      data: { module: "seed", key: GROUP_CODES_KEY, scope: "GLOBAL", scopeRef: "", value: JSON.stringify({ renamed }) },
    });
    console.log(`  ↳ mã nhóm kho 2 ký tự: đổi ${renamed} nhóm gốc`);
  }
  const catRoot = async (code: string, name: string, sort: number, isClientOwned = false) => {
    const found = await prisma.inventoryCategory.findFirst({ where: { parentId: null, code } });
    if (found) return found;
    return prisma.inventoryCategory.create({ data: { code, name, sort, isClientOwned } });
  };
  const catChild = async (parentId: string, name: string, sort: number) => {
    const found = await prisma.inventoryCategory.findFirst({ where: { parentId, name } });
    if (found) return found;
    return prisma.inventoryCategory.create({ data: { parentId, name, sort } });
  };
  const catP = await catRoot("PO", "POSM", 0);
  const catBooth = await catChild(catP.id, "Booth", 0);
  for (const [i, n] of ["Cụm booth", "Sàn", "Backdrop", "Standee"].entries()) await catChild(catBooth.id, n, i);
  await catChild(catP.id, "Kệ trưng bày", 1);
  await catChild(catP.id, "Cổng chào", 2);
  const catE = await catRoot("DT", "Thiết bị điện tử", 1);
  for (const [i, n] of ["LED, TV", "Âm thanh", "Ánh sáng"].entries()) await catChild(catE.id, n, i);
  await catRoot("TC", "Thiết bị games / trò chơi", 2);
  await catRoot("DP", "Đồng phục", 3);
  await catRoot("IA", "In ấn", 4);
  const catM = await catRoot("KG", "Hàng hóa / quà tặng khách gửi", 5, true);
  await catChild(catM.id, "Hàng hóa chạy project", 0);
  await catChild(catM.id, "Quà tặng", 1);
  await catRoot("VT", "Vật tư / vật dụng khác", 6);

  // ── MODULE ⑤ Chấm công & Ca làm việc — lead bộ phận + danh mục ca + loại nghỉ + tuần mẫu ──
  const deptLeads: Record<string, string> = {
    ACCOUNT: ha.id, // Trần Thu Hà — Account Director, cao nhất trong 3 team Account
    // PLANNING: để trống từ 01/08/2026 — bộ phận không còn headcount riêng, việc Planning do người
    // trong team Account làm. Gán một Account Manager làm "trưởng phòng Planning" ở đây sẽ hiện sai
    // trên nhãn "Planning Manager" của tab Planning. Ngọc nghỉ ⇒ FK optional tự SET NULL.
    CREATIVE: creativeLead.id,
    PCC: orderLeadByCode["PCC"].id,
    OPE: orderLeadByCode["OPE"].id,
    PRO: orderLeadByCode["PRO"].id,
    FIN: cfo.id,
    HR: hrStaff.id,
    CEO: ceo.id,
    // IT: để trống — 0 nhân sự phòng IT thật (Trương Đình Vũ nằm phòng HR theo Excel), không gán ép.
  };
  for (const [code, leadStaffId] of Object.entries(deptLeads)) {
    await prisma.department.update({ where: { code }, data: { leadStaffId } });
  }

  const shiftSeed = [
    { code: "SANG", name: "Ca sáng", startTime: "08:00", endTime: "12:00", sort: 0 },
    { code: "CHIEU", name: "Ca chiều", startTime: "13:00", endTime: "17:00", sort: 1 },
    { code: "TOI", name: "Ca tối", startTime: "18:00", endTime: "22:00", sort: 2 },
  ];
  const shiftByCode: Record<string, { id: string }> = {};
  for (const s of shiftSeed) {
    shiftByCode[s.code] = await prisma.workShift.upsert({
      where: { code: s.code },
      update: {},
      create: { ...s, hours: 4 },
    });
  }

  const leaveTypes = await seedOptionSet("leave_type", "Loại nghỉ", [
    { code: "ANNUAL", labelVi: "Nghỉ phép năm", labelEn: "Annual leave" },
    { code: "SICK", labelVi: "Nghỉ ốm", labelEn: "Sick leave" },
    { code: "UNPAID", labelVi: "Nghỉ không lương", labelEn: "Unpaid leave" },
    { code: "ABSENT", labelVi: "Vắng không phép", labelEn: "Absent" },
    { code: "OTHER", labelVi: "Nghỉ khác", labelEn: "Other" },
  ]);

  // Tuần mẫu CONFIRMED cho dept CREATIVE (tuần hiện tại): Minh đủ 40h T2–T6;
  // Long đổi 2 ca T6 sang T7 (vẫn 40h, không tăng ca) + 1 ca T2 sáng nghỉ phép năm.
  if ((await prisma.scheduleWeek.count()) === 0) {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const day = (offset: number) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
    const week = await prisma.scheduleWeek.create({
      data: {
        departmentId: creativeDept.id,
        weekStart: monday,
        status: "CONFIRMED",
        confirmedById: creativeLead.id,
        confirmedAt: new Date(),
      },
    });
    const rows: { staffId: string; date: Date; shiftId: string; leaveTypeId?: string }[] = [];
    for (let d = 0; d < 5; d++) {
      rows.push({ staffId: seniorDesigner.id, date: day(d), shiftId: shiftByCode["SANG"].id });
      rows.push({ staffId: seniorDesigner.id, date: day(d), shiftId: shiftByCode["CHIEU"].id });
    }
    for (let d = 0; d < 4; d++) {
      rows.push({
        staffId: artist3d.id,
        date: day(d),
        shiftId: shiftByCode["SANG"].id,
        ...(d === 0 ? { leaveTypeId: leaveTypes["ANNUAL"] } : {}),
      });
      rows.push({ staffId: artist3d.id, date: day(d), shiftId: shiftByCode["CHIEU"].id });
    }
    rows.push({ staffId: artist3d.id, date: day(5), shiftId: shiftByCode["SANG"].id });
    rows.push({ staffId: artist3d.id, date: day(5), shiftId: shiftByCode["CHIEU"].id });
    await prisma.shiftAssignment.createMany({
      data: rows.map((r) => ({ weekId: week.id, staffId: r.staffId, date: r.date, shiftId: r.shiftId, leaveTypeId: r.leaveTypeId ?? null })),
    });
  }

  // ── Bảng phân quyền (Role) — catalog phân cấp Director/Manager → Staff theo 9 nhóm chức năng.
  // Nominal (chưa gate tính năng thật) — gán roleId cho nhân sự hiện có để phản ánh sơ đồ tổ chức;
  // chủ dự án sẽ review và chỉnh lại qua /settings/roles.
  type RoleSeed = { code: string; name: string; description?: string; groupCode: string; parentCode: string | null; sort: number };
  const roleSeeds: RoleSeed[] = [
    { code: "ADMIN", name: "Quản trị hệ thống (Admin)", groupCode: "ADMIN", parentCode: null, sort: 0 },
    {
      code: "BOARD_OF_MANAGEMENT",
      name: "Hội đồng Quản lý (Board of Management)",
      description: "Xem Dashboard chung, Chat, Cơ cấu tổ chức, Knowledge Base — không vào chi tiết từng module nghiệp vụ.",
      groupCode: "BOD",
      parentCode: null,
      sort: 5,
    },
    { code: "CFO", name: "Giám đốc Tài chính (CFO)", groupCode: "FINANCE", parentCode: null, sort: 10 },
    { code: "ACCOUNTANT_STAFF", name: "Nhân viên Kế toán (Accounting Staff)", groupCode: "FINANCE", parentCode: "CFO", sort: 11 },
    { code: "HR_MANAGER", name: "Trưởng phòng Nhân sự (HR Manager)", groupCode: "HR", parentCode: null, sort: 20 },
    { code: "HR_STAFF", name: "Nhân viên Nhân sự (HR Staff)", groupCode: "HR", parentCode: "HR_MANAGER", sort: 21 },
    { code: "ADMIN_STAFF", name: "Nhân viên Hành chính (Administration Staff)", groupCode: "HR", parentCode: "HR_MANAGER", sort: 22 },
    {
      code: "ACCOUNT_DIRECTOR",
      name: "Giám đốc Khách hàng (Account Director)",
      description: "Overview toàn bộ các nhóm Account (A1/A2/A3 và mọi nhóm thêm sau này) — không giới hạn theo team.",
      groupCode: "ACCOUNT",
      parentCode: null,
      sort: 30,
    },
    {
      code: "ACCOUNT_MANAGER",
      name: "Account Manager",
      description: "Gán theo từng team Account cụ thể (A1/A2/A3) — chỉ xem được nhóm của riêng mình.",
      groupCode: "ACCOUNT",
      parentCode: "ACCOUNT_DIRECTOR",
      sort: 31,
    },
    { code: "ACCOUNT_STAFF", name: "Account Staff", groupCode: "ACCOUNT", parentCode: "ACCOUNT_MANAGER", sort: 32 },
    { code: "CREATIVE_DIRECTOR", name: "Creative Director", groupCode: "CREATIVE", parentCode: null, sort: 40 },
    { code: "CREATIVE_STAFF", name: "Creative Staff", groupCode: "CREATIVE", parentCode: "CREATIVE_DIRECTOR", sort: 41 },
    { code: "PLANNING_MANAGER", name: "Planning Manager", groupCode: "PLANNING", parentCode: null, sort: 50 },
    { code: "PLANNING_STAFF", name: "Planning Staff", groupCode: "PLANNING", parentCode: "PLANNING_MANAGER", sort: 51 },
    { code: "OPERATIONS_MANAGER", name: "Operations Manager", groupCode: "OPERATIONS", parentCode: null, sort: 60 },
    { code: "OPERATIONS_STAFF", name: "Operations Staff", groupCode: "OPERATIONS", parentCode: "OPERATIONS_MANAGER", sort: 61 },
    { code: "PRODUCTION_MANAGER", name: "Production Manager", groupCode: "PRODUCTION", parentCode: null, sort: 70 },
    { code: "PRODUCTION_STAFF", name: "Production Staff", groupCode: "PRODUCTION", parentCode: "PRODUCTION_MANAGER", sort: 71 },
    { code: "PURCHASING_MANAGER", name: "Purchasing Manager", groupCode: "PURCHASING", parentCode: null, sort: 80 },
    { code: "PURCHASING_STAFF", name: "Purchasing Staff", groupCode: "PURCHASING", parentCode: "PURCHASING_MANAGER", sort: 81 },
    // Kho v2 K2 (27/07/2026): vai trò MỚI — người duy nhất xác nhận thực xuất/thực nhập. Chưa gán ai;
    // chủ dự án chọn người ở /settings/staff (audit CEO trước đó ghi nhận "không có role thủ kho").
    {
      code: "WAREHOUSE_KEEPER",
      name: "Thủ kho (Warehouse Keeper)",
      description: "Soạn hàng và xác nhận số thực xuất / thực nhập; lập phiếu chuyển đổi lô và xuất hủy. CHỈ module Kho.",
      groupCode: "WAREHOUSE",
      parentCode: null,
      sort: 85,
    },
    {
      code: "SECURITY_GUARD",
      name: "Bảo vệ (Security Guard)",
      description: "Tài khoản vận hành tại điểm kho — chỉ liên lạc nội bộ và xem tài liệu. Không có nghiệp vụ trong app.",
      groupCode: "WAREHOUSE",
      parentCode: null,
      sort: 86,
    },
    { code: "IT_STAFF", name: "Nhân viên IT", groupCode: "IT", parentCode: null, sort: 90 },
  ];
  const roleByCode: Record<string, { id: string }> = {};
  // Vòng 1: tạo/upsert không có parentRoleId (parent có thể chưa tồn tại) — vòng 2: gắn parentRoleId.
  for (const r of roleSeeds) {
    roleByCode[r.code] = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description ?? null, groupCode: r.groupCode, sort: r.sort },
      create: { code: r.code, name: r.name, description: r.description ?? null, groupCode: r.groupCode, sort: r.sort },
    });
  }
  for (const r of roleSeeds) {
    if (!r.parentCode) continue;
    await prisma.role.update({
      where: { id: roleByCode[r.code].id },
      data: { parentRoleId: roleByCode[r.parentCode].id },
    });
  }

  // Vòng 3: gán roleId cho toàn bộ 42 nhân sự theo đúng cột "Role" trong Excel (ROLE_MAP, khai báo ở
  // Vòng 1) — roleByCode chỉ có sẵn từ đây trở đi nên phải để tới cuối file. CHỈ điền chỗ trống
  // (roleId null) — re-seed KHÔNG ghi đè chỉnh sửa tay của admin ở /settings/roles (bất biến từ AF-5).
  for (const row of STAFF_ROWS) {
    const roleCode = ROLE_MAP[row.roleText];
    // Khoá theo ID người đã nhận diện ở Vòng 1 (email sửa được từ 28/07, code thì 36/42 người còn trống).
    const self = staffByFullName.get(row.fullName);
    if (!self) continue;
    await prisma.staff.updateMany({
      where: { id: self.id, roleId: null },
      data: { roleId: roleByCode[roleCode].id },
    });
  }

  // ── Vòng 4: ma trận phân quyền (RolePermission) ──
  // Grant mặc định = ĐÚNG quyền mọi người đang có TRƯỚC khi bật ma trận, để bật lên không ai mất
  // việc đột ngột; BGĐ siết dần ở /settings/roles tab "Ma trận quyền". Danh mục mã quyền nằm ở
  // src/lib/permission-catalog.ts (code, KHÔNG phải DB — xem doc-comment file đó).
  // CHỈ seed cho role CHƯA có grant nào — re-seed KHÔNG ghi đè chỉnh sửa tay của admin (như Vòng 3).
  //
  // Trước khi có ma trận, ba cơ chế quyết định ai thấy gì. Ba khối dưới đây tái hiện đúng chúng:
  //   (1) requireAdmin()      → /kpi và /settings chỉ ADMIN
  //   (2) getDashboardScope() → cashflow + xem-mọi-team chỉ phòng CEO hoặc title CFO
  //   (3) getAiVisibility()   → từng tính năng AI theo phòng ban, riêng 4 người có all-access
  /**
   * CHÍNH SÁCH QUYỀN CHẠM TIỀN — chốt 30/07/2026 với chủ dự án.
   *
   * ⚠ ĐÂY LÀ MỘT NGUỒN SỰ THẬT DUY NHẤT, dùng cho CẢ BA đường:
   *   1. `isRestricted` — để mã không rơi vào grant mặc định rộng;
   *   2. `moneyCodesFor` trong Vòng 4 — cấp lại đúng role trên DB dựng-từ-đầu;
   *   3. Vòng 4d — XOÁ grant thừa trên DB đang chạy, chạy đúng một lần.
   * Sửa bảng này là cả ba đường đổi theo. ĐỪNG cấp ba mã này ở chỗ nào khác — chính việc có hai
   * đường cấp mâu thuẫn nhau là nguồn của 5 lỗ hổng phải vá ngày 30/07 (xem HANDOVER 10.15).
   *
   * `finance.advance.request` CỐ Ý không có ở đây: ai chạy hiện trường cũng phải ĐỀ NGHỊ được tạm
   * ứng. Tách "đề nghị" khỏi "duyệt" chính là lý do hai mã đó tồn tại riêng.
   */
  const MONEY_POLICY: Record<string, string[]> = {
    // — tiền ra khỏi quỹ —
    "finance.advance.approve": ["BOARD_OF_MANAGEMENT", "CFO", "ACCOUNTANT_STAFF"],
    "finance.vendor_payment.pay": ["BOARD_OF_MANAGEMENT", "CFO", "ACCOUNTANT_STAFF"],
    // — chứng từ & tiền vào —
    "finance.payment.record": ["BOARD_OF_MANAGEMENT", "CFO", "ACCOUNTANT_STAFF"],
    "finance.invoice.manage": ["BOARD_OF_MANAGEMENT", "CFO", "ACCOUNTANT_STAFF"],
    "bidding.contract.manage": ["BOARD_OF_MANAGEMENT", "CFO", "ACCOUNT_DIRECTOR", "ACCOUNT_MANAGER"],
    // Vòng đời dự án + nghiệm thu là việc Account bấm HẰNG NGÀY — giữ tới cấp Staff, siết là kẹt luồng.
    "bidding.status.change": ["BOARD_OF_MANAGEMENT", "ACCOUNT_DIRECTOR", "ACCOUNT_MANAGER", "ACCOUNT_STAFF"],
    "projects.liquidation.send": ["BOARD_OF_MANAGEMENT", "ACCOUNT_DIRECTOR", "ACCOUNT_MANAGER", "ACCOUNT_STAFF"],
    "projects.acceptance.confirm": ["BOARD_OF_MANAGEMENT", "ACCOUNT_DIRECTOR", "ACCOUNT_MANAGER", "ACCOUNT_STAFF"],
    // — nhìn thấy số & đụng dữ liệu người khác —
    // Account Manager giữ finance.view để theo công nợ khách của mình; trước đây mã này mở cho 20
    // nhóm trong khi dashboard.cashflow chỉ 2 — che ở Dashboard mà hở ở /finance là vô nghĩa.
    "finance.view": ["BOARD_OF_MANAGEMENT", "CFO", "ACCOUNTANT_STAFF", "ACCOUNT_DIRECTOR", "ACCOUNT_MANAGER"],
    "creative.cost.view": ["BOARD_OF_MANAGEMENT", "CFO", "HR_MANAGER", "CREATIVE_DIRECTOR"],
    "clients.transfer": ["BOARD_OF_MANAGEMENT", "ACCOUNT_DIRECTOR", "ACCOUNT_MANAGER"],
    "chat.moderate": ["BOARD_OF_MANAGEMENT", "HR_MANAGER"],
    "kb.manage": ["BOARD_OF_MANAGEMENT", "ACCOUNT_DIRECTOR", "HR_MANAGER"],
    // — chi phí văn phòng (OVH-1) —
    // ⚠ CẢ 7 MÃ đều khai ở đây, kể cả `overhead.view`. Mã nào không nằm trong MONEY_POLICY sẽ rơi
    // vào `baseGrantCodes` và được cấp cho 20 vai — mà bảng này chứa NGÂN SÁCH LƯƠNG toàn công ty
    // (~12,2 tỷ/năm), không phải thứ để mọi nhân viên mở ra xem.
    "overhead.view": ["BOARD_OF_MANAGEMENT", "CFO", "ACCOUNTANT_STAFF", "HR_MANAGER"],
    "overhead.spend.record": ["BOARD_OF_MANAGEMENT", "CFO", "ACCOUNTANT_STAFF", "HR_MANAGER"],
    // Người lập ngân sách theo file thật là HR (cột "Người đề nghị" = Lê Ngọc Châu, "Người duyệt" =
    // Trần Thị Hải Yến). Kế toán ghi nhận và xác nhận thanh toán.
    "overhead.budget.manage": ["BOARD_OF_MANAGEMENT", "HR_MANAGER"],
    // ⚠ HAI MÃ DUYỆT TÁCH RIÊNG, KHÔNG GỘP. Gộp một mã thì CFO bấm được luôn bước của CEO và hai
    // cấp duyệt chỉ còn là trang trí. `approve_ceo` = khoá số cuối cùng của năm nên chỉ BGĐ.
    "overhead.budget.approve_cfo": ["CFO"],
    "overhead.budget.approve_ceo": ["BOARD_OF_MANAGEMENT"],
    "overhead.spend.pay": ["BOARD_OF_MANAGEMENT", "CFO", "ACCOUNTANT_STAFF"],
    "overhead.spend.over_budget": ["BOARD_OF_MANAGEMENT", "CFO"],
  };

  /**
   * MỞ LẠI KPI + CÀI ĐẶT — chốt 30/07/2026 với chủ dự án.
   *
   * Trước đó `kpi.*` và `settings.*` bị `isRestricted` mà KHÔNG có đường cấp lại nào ⇒ 0 vai, chỉ
   * ADMIN dùng được. Đó là tái hiện trung thành hành vi `requireAdmin()` thời trước ma trận, nhưng
   * hệ quả thật: module ⑥ ghi "Xong" mà chỉ một tài khoản chấm được KPI, và chỉ một người duy nhất
   * tạo được tài khoản / cấp lại mật khẩu cho 42 nhân sự.
   *
   * ⚠ BA MÃ CỐ Ý KHÔNG CÓ Ở ĐÂY — giữ nguyên chỉ ADMIN:
   *   · `settings.permissions.manage` — sửa được ma trận quyền, tức TỰ CẤP LẠI 13 mã tiền vừa siết
   *     ở MONEY_POLICY. Cấp mã này cho ai là vô hiệu hoá toàn bộ chính sách tiền, âm thầm.
   *   · `settings.roles.manage`        — đổi được nhóm quyền của bất kỳ ai, gồm chính mình.
   *   · `settings.security.manage`     — đổi mật khẩu chung của công ty.
   *
   * ⚠ NÓI THẲNG GIỚI HẠN: `settings.staff.manage` (cấp cho HR Manager để hết cảnh một người duy
   * nhất tạo tài khoản) vốn đã cho phép TẠO tài khoản mới KÈM chọn nhóm quyền và đặt mật khẩu — nên
   * người giữ nó về lý thuyết vẫn dựng được một tài khoản quyền cao. Đây là bản chất của việc "HR
   * tạo tài khoản", không phải lỗ hổng của bảng này; chốt chặn thật là audit log + đúng một người
   * có tên giữ mã đó.
   */
  const ADMIN_POLICY: Record<string, string[]> = {
    // — KPI: HR chủ trì chấm, CFO giữ quỹ performance 25% lương —
    "kpi.view": ["BOARD_OF_MANAGEMENT", "CFO", "HR_MANAGER"],
    "kpi.score": ["BOARD_OF_MANAGEMENT", "HR_MANAGER"],
    "kpi.close_period": ["BOARD_OF_MANAGEMENT", "HR_MANAGER"],

    // — cửa vào /settings: ai có ít nhất một mục con thì phải vào được trang —
    "settings.view": [
      "BOARD_OF_MANAGEMENT", "CFO", "HR_MANAGER",
      "ACCOUNT_DIRECTOR", "ACCOUNT_MANAGER",
      "CREATIVE_DIRECTOR", "OPERATIONS_MANAGER", "PURCHASING_MANAGER",
    ],

    // — nhân sự & tổ chức: HR —
    "settings.staff.manage": ["BOARD_OF_MANAGEMENT", "HR_MANAGER"],
    "settings.departments.manage": ["BOARD_OF_MANAGEMENT", "HR_MANAGER"],
    "settings.teams.manage": ["BOARD_OF_MANAGEMENT", "HR_MANAGER"],
    "settings.timekeeping.manage": ["BOARD_OF_MANAGEMENT", "HR_MANAGER"],
    "settings.kpi.manage": ["BOARD_OF_MANAGEMENT", "CFO", "HR_MANAGER"],

    // — cấu hình đụng tiền: CFO. `settings.bidding.manage` chứa NGƯỠNG MARGIN 31% (bất biến số 1) —
    "settings.finance.manage": ["BOARD_OF_MANAGEMENT", "CFO"],
    "settings.bidding.manage": ["BOARD_OF_MANAGEMENT", "CFO"],
    "settings.commission.manage": ["BOARD_OF_MANAGEMENT", "CFO"],
    "settings.ai.manage": ["BOARD_OF_MANAGEMENT", "CFO"],

    // — cấu hình theo module, giao cho người chủ module —
    "settings.creative.manage": ["BOARD_OF_MANAGEMENT", "CFO", "CREATIVE_DIRECTOR"],
    "settings.clients.manage": ["BOARD_OF_MANAGEMENT", "ACCOUNT_DIRECTOR", "ACCOUNT_MANAGER"],
    "settings.templates.manage": ["BOARD_OF_MANAGEMENT", "ACCOUNT_DIRECTOR"],
    "settings.vendors.manage": ["BOARD_OF_MANAGEMENT", "PURCHASING_MANAGER"],
    "settings.warehouses.manage": ["BOARD_OF_MANAGEMENT", "OPERATIONS_MANAGER"],
    // Danh mục dùng chung đụng MỌI module (trạng thái dự án, loại task, nhóm hàng…) — giữ hẹp.
    "settings.options.manage": ["BOARD_OF_MANAGEMENT"],
    "settings.communication.manage": ["BOARD_OF_MANAGEMENT"],
  };

  /**
   * TUYỂN DỤNG (TD-1, 06/08/2026) — MỘT NGUỒN SỰ THẬT cho cả ba đường, đúng khuôn MONEY_POLICY:
   * `isRestricted` (chặn rơi vào grant rộng) · `recruitCodesFor` (DB dựng-từ-đầu) · backfill
   * `20260806_recruit_*` (DB đang chạy). Sửa bảng này là cả ba đổi theo — ĐỪNG cấp mấy mã này ở
   * chỗ khác, chính việc có hai đường cấp mâu thuẫn là nguồn của 5 lỗ hổng ở HANDOVER 10.15.
   *
   * ⚠ CẢ 7 MÃ đều khai ở đây, kể cả `recruit.view`. Khác `iso.view` / `mkt.view` (cố ý để ở base
   * cho cả công ty xem), hồ sơ ứng viên là DỮ LIỆU CÁ NHÂN CỦA NGƯỜI NGOÀI công ty — CV có họ tên,
   * ngày sinh, điện thoại, email, nơi từng làm việc. Mã nào quên khai ở đây sẽ rơi vào
   * `baseGrantCodes` và 20 vai đọc được toàn bộ kho CV.
   *
   * ⚠ Người phỏng vấn KHÔNG cần `recruit.view`: họ mở được hồ sơ của đúng lượt phỏng vấn gắn tên
   * mình bằng phép kiểm THEO BẢN GHI (lib/recruit.ts → canOpenCandidate). Trưởng bộ phận và người
   * quản lý trực tiếp của vị trí cũng vậy. Đừng cấp `recruit.view` cho cả loạt role quản lý chỉ để
   * giải bài toán đó — nó mở luôn kho CV của MỌI vị trí.
   *
   * ⚠ Đi theo MÃ ROLE, KHÔNG theo nhóm `HR`: nhóm đó còn chứa `ADMIN_STAFF` (hành chính), cấp theo
   * nhóm là lặp lại đúng bẫy SECURITY_GUARD-trong-nhóm-WAREHOUSE đã phải vá (mục 10.15).
   */
  const RECRUIT_POLICY: Record<string, string[]> = {
    "recruit.view": ["HR_MANAGER", "HR_STAFF", "BOARD_OF_MANAGEMENT"],
    "recruit.manage": ["HR_MANAGER", "HR_STAFF"],
    // JD gắn với cơ cấu tổ chức → sửa ở Settings, giữ ở cấp trưởng phòng.
    "recruit.jd.manage": ["HR_MANAGER", "BOARD_OF_MANAGEMENT"],
    // AI đọc CV tốn tiền theo LƯỢT — cùng lý do tách mã với clients.kb.generate / mkt.generate.
    "recruit.ai_parse": ["HR_MANAGER", "HR_STAFF"],
    "recruit.salary.view": ["HR_MANAGER", "HR_STAFF", "BOARD_OF_MANAGEMENT"],
    "recruit.interview.manage": ["HR_MANAGER", "HR_STAFF"],
    // Chốt nhận/loại là quyết định nhân sự — giữ ở trưởng phòng NS + BGĐ.
    "recruit.decide": ["HR_MANAGER", "BOARD_OF_MANAGEMENT"],
  };

  /**
   * PUR-1 (16/08/2026) — 4 mã sub-module Thu mua. Cùng khuôn RECRUIT_POLICY: MỘT nguồn sự thật nuôi
   * cả `isRestricted` + `purCodesFor` (DB dựng-từ-đầu) + backfill `20260816_pur_*` (DB đang chạy).
   * - `purchasing.view` mở cho cả ACCOUNT (Account xem RFQ để cùng chốt với PUR) + kế toán/CFO/BGĐ.
   * - Ba mã còn lại chỉ PUR + BGĐ. AI tách riêng vì tính tiền theo lượt.
   * ⚠ Lọc theo MÃ ROLE, không theo nhóm — bài học SECURITY_GUARD-trong-nhóm-WAREHOUSE (10.15).
   */
  const PUR_ROLES = ["PURCHASING_MANAGER", "PURCHASING_STAFF", "BOARD_OF_MANAGEMENT"];
  /**
   * PRO-SHARE (20/08/2026) — phòng SẢN XUẤT dùng chung cấu trúc NCC + nhóm/form của Thu mua, nhưng
   * CHỈ trong phạm vi admin tick ở /settings/production-sharing (lib/purchasing-scope.ts).
   *
   * ⚠ Danh sách này phải KHỚP hằng SHARED_ROLE_CODES trong lib/purchasing-scope.ts. Thêm role ở một
   *   bên mà quên bên kia: hoặc role đó có quyền mà không thấy gì, hoặc THẤY TOÀN BỘ hồ sơ NCC.
   * ⚠ CỐ Ý KHÔNG cấp purchasing.vendor.manage — chính mã đó là thứ getPurchasingScope() dùng để kết
   *   luận "toàn quyền", cấp cho PRO là vô hiệu hoá toàn bộ phạm vi vừa dựng.
   * ⚠ CỐ Ý KHÔNG cấp purchasing.rfq.ai — AI tính tiền theo LƯỢT (mirror mkt.generate). BGĐ muốn mở
   *   thì tick ở /settings/roles, không cần deploy.
   */
  const PRO_SHARED_ROLES = ["PRODUCTION_MANAGER", "PRODUCTION_STAFF"];
  const PUR_POLICY: Record<string, string[]> = {
    "purchasing.view": [...PUR_ROLES, "ACCOUNT_DIRECTOR", "ACCOUNT_MANAGER", "ACCOUNT_STAFF", "CFO", "ACCOUNTANT_STAFF", ...PRO_SHARED_ROLES],
    "purchasing.rfq.manage": [...PUR_ROLES, ...PRO_SHARED_ROLES],
    "purchasing.rfq.ai": PUR_ROLES,
    "purchasing.vendor.manage": PUR_ROLES,
  };

  /**
   * MEET-1 (17/08/2026) — 3 mã module Họp Account team. Cùng khuôn PUR_POLICY.
   * - view/manage CHỈ BGĐ (nhìn/ghi MỌI team). Trưởng team KHÔNG có mã: kiểm theo bản ghi Team.leadStaffId
   *   trong app/(app)/meetings/access.ts (quyết định chủ dự án 17/08: chỉ BGĐ + trưởng team; thành viên
   *   chỉ nhận Notification việc được giao).
   * - ai_import: BGĐ + Account Manager/Director (trưởng team hiện là Account Manager; giữ mã AI mà không
   *   phải lead thì action vẫn chặn ở bước access → vô hại). AI tách riêng vì tính tiền theo lượt.
   */
  const MEETING_POLICY: Record<string, string[]> = {
    "meetings.view": ["BOARD_OF_MANAGEMENT"],
    "meetings.manage": ["BOARD_OF_MANAGEMENT"],
    "meetings.ai_import": ["BOARD_OF_MANAGEMENT", "ACCOUNT_DIRECTOR", "ACCOUNT_MANAGER"],
  };

  const isRestricted = (code: string) =>
    code in MONEY_POLICY || // chính sách quyền chạm tiền — xem MONEY_POLICY ngay trên
    code in RECRUIT_POLICY || // hồ sơ ứng viên = dữ liệu cá nhân người ngoài — xem RECRUIT_POLICY
    code in PUR_POLICY || // sub-module Thu mua — xem PUR_POLICY
    code in MEETING_POLICY || // họp Account team — xem MEETING_POLICY
    code.startsWith("kpi.") || // (1)
    code.startsWith("settings.") || // (1)
    code.startsWith("payroll.") || // module chưa làm — chưa ai có
    code === "system.impersonate" || // chỉ ADMIN
    code === "dashboard.cashflow" || // (2)
    code === "dashboard.all_teams" || // (2)
    code === "finance.vendor_payment.over_cap" || // vượt trần chi dự án — chỉ cấp exec, xem EXEC_EXTRA
    code === "finance.invoice.over_cap" || // hóa đơn vượt trần CO/CE — chỉ cấp exec, xem EXEC_EXTRA
    code === "projects.pnl.view" || // P&L dự án — chỉ cấp exec, xem EXEC_EXTRA
    code.startsWith("purchasing.") || // PO — chỉ nhóm Thu mua + BGĐ, xem extraByGroup
    // Kho v2 K2: tách vai theo spec (đề xuất ≠ duyệt ≠ xác nhận thực tế) — xem WAREHOUSE_EXTRA
    code === "inventory.request.approve" ||
    code === "inventory.request.approve_any" ||
    code === "inventory.request.approve_overhead" || // K6-4: HR Manager duyệt hàng overhead — xem extraByRole.HR_MANAGER
    code === "inventory.issue.confirm" ||
    code === "inventory.intake.confirm" ||
    code === "inventory.lot.convert" ||
    code === "inventory.destroy" ||
    // Kho v2 K3/K4 — hai mã DUYỆT. Thiếu hai dòng này thì trên seed MỚI chúng rơi vào
    // `baseGrantCodes` và 20 role nhận quyền duyệt giữ chỗ / duyệt điều chuyển kho, thay vì 4 và 2.
    // Backfill KHÔNG cứu được vì nó chỉ THÊM cho role đã có grant, không siết lại ai.
    // Role đích cấp qua extraByGroup/extraByRole ngay dưới, khớp đúng roleFilter của hai backfill
    // `20260728_kho_k3_reserve_approve` và `20260729_kho_k4_transfer_approve`.
    code === "inventory.reservation.approve" ||
    code === "inventory.transfer.approve" ||
    // DUYỆT CO/CE + PHÁ NGƯỠNG MARGIN 31% — hai chốt chặn TIỀN nặng nhất của app (bất biến số 1,
    // mục 6). Theo thiết kế cũ chúng nằm trong grant mặc định rộng rồi để BGĐ siết tay trong ma
    // trận; BGĐ ĐÃ siết còn BGĐ + CFO, nhưng dựng lại DB là mất phần siết đó và 20 role duyệt được
    // CO/CE trở lại. Nay chốt cứng trong seed đúng bằng những gì production đang có.
    code === "bidding.costsheet.approve" ||
    code === "bidding.margin_override" ||
    // CO/CE v3 (CE-1): hai mã GATE CỘT tiền trên màn hình CO/CE — Total CO/margin nhạy ngang giá
    // vốn, trần chi mở rộng thêm cho PCC/OPE/PRO. Tách khỏi base để dựng-lại-DB không tự cấp cho
    // 20 vai; role đích cấp ở extraByGroup/extraByRole + backfill 20260805_coce_view_* khớp nhau.
    code === "bidding.costsheet.view_cost" ||
    code === "bidding.costsheet.view_paycap" ||
    // MKT post (04/08/2026): 4 mã dưới TÁCH KHỎI base. `mkt.view` CỐ Ý ở lại base (mọi người xem
    // được bài công ty sắp đăng), 4 mã còn lại là viết / duyệt-đăng / sửa link frame / gọi AI —
    // thiếu 4 dòng này thì DB dựng-từ-đầu cấp cả cho 20 vai. Role đích cấp lại ngay ở
    // extraByGroup/extraByRole dưới, khớp đúng roleFilter của 4 backfill `20260804_mkt_*`.
    code === "mkt.post.manage" ||
    code === "mkt.review" ||
    code === "mkt.frames.manage" ||
    code === "mkt.generate" ||
    // KB theo khách (H2): SOẠN nội dung chỉ Account + BGĐ — xem extraByGroup. Thiếu dòng này thì
    // seed MỚI (migrate reset, hoặc dựng lại production) cấp quyền soạn cho cả 20 role có base
    // grant, ngược hẳn chính sách mà backfill 20260801_client_kb_h2_manage đang thực thi.
    // `clients.kb.view` thì CỐ Ý nằm trong base — thủ kho/bảo vệ đã bị chặn bằng EXPLICIT_GRANTS.
    code === "clients.kb.manage" ||
    // H3: sinh bằng AI tốn tiền theo LƯỢT → tách mã riêng, chỉ Account + BGĐ. Bảng tuân thủ là
    // việc quản lý người → AD/AM + HR + BGĐ. Riêng `clients.kb.quiz` CỐ Ý nằm trong base: ai đọc
    // được bài thì phải làm được bài, tách ra chỉ đẻ thêm một chỗ để quên tick.
    code === "clients.kb.generate" ||
    code === "clients.kb.compliance" ||
    // Hồ sơ ISO (ISO-1): ĐÍNH hồ sơ và XUẤT báo cáo là việc của Account + HR + BGĐ. `iso.view` CỐ Ý
    // nằm trong base — ai cũng nên thấy dự án mình đang thiếu hồ sơ gì; thủ kho/bảo vệ đã bị chặn
    // bằng EXPLICIT_GRANTS. Thiếu hai dòng dưới thì seed MỚI cấp quyền đính hồ sơ cho cả 20 role.
    code === "iso.manage" ||
    code === "iso.export" ||
    code.startsWith("ai."); // (3)

  /**
   * ⚠ HẰNG ĐÔNG CỨNG — 6 công cụ AI có từ thời `getAiVisibility` cũ, cấp trọn gói cho đúng một role
   * (xem `extraByRole.PRODUCTION_MANAGER`). **ĐỪNG thêm mã AI mới vào đây.** Thêm là âm thầm cấp
   * quyền cho role đó, VÀ làm lệch hai đường: DB dựng-từ-đầu có, DB đang chạy (đi đường backfill lọc
   * theo role) thì không. Đã vấp đúng lỗi này khi thêm `ai.document` (đo được 7 vai vs 6 vai) —
   * cùng họ với bẫy cấp-theo-nhóm ở mục 10.15 của HANDOVER. Mã AI mới thì khai policy riêng.
   */
  const AI_LEGACY_ALL = ["ai.brainstorm", "ai.content", "ai.canva", "ai.costsheet", "ai.board_report", "ai.trend"];
  /**
   * AI soạn thảo văn bản (đợt 2, 20/08/2026) — đúng ba bộ phận sinh ra văn bản hành chính nội bộ,
   * cộng BGĐ. Liệt kê theo MÃ ROLE chứ không theo nhóm: bài học SECURITY_GUARD nằm trong nhóm
   * WAREHOUSE (mục 10.15). Nhóm HR ở đây gồm cả ADMIN_STAFF và đó là CHỦ Ý — hành chính chính là
   * người soạn thông báo/quyết định nhiều nhất.
   */
  const AI_DOCUMENT_ROLES = ["HR_MANAGER", "HR_STAFF", "ADMIN_STAFF", "CFO", "ACCOUNTANT_STAFF", "BOARD_OF_MANAGEMENT"];
  /**
   * Đối chiếu chi ngân hàng — CHỈ phòng kế toán (quyết định chủ dự án 20/08/2026). Dữ liệu vào là
   * sao kê ngân hàng của công ty; BGĐ muốn xem thì tick thêm ở /settings/roles, không sửa code.
   * ⚠ KHÔNG thêm mã này vào AI_LEGACY_ALL — xem cảnh báo ở hằng đó.
   */
  const AI_BANK_RECON_ROLES = ["CFO", "ACCOUNTANT_STAFF"];
  /** Kho v2 K2 — quyền của THỦ KHO: người duy nhất chốt số thực xuất/thực nhập, chuyển lô, xuất hủy. */
  const WAREHOUSE_EXTRA = ["inventory.issue.confirm", "inventory.intake.confirm", "inventory.lot.convert", "inventory.destroy"];
  /**
   * Duyệt CO/CE + phá ngưỡng margin 31%. Tách hằng riêng (không nhét vào EXEC_EXTRA) vì đây là
   * chốt chặn TIỀN, ai đọc seed phải thấy ngay danh sách người giữ nó — đúng BGĐ + CFO như
   * production. Nới thêm role nào là nới quyền phá bất biến margin, phải có quyết định của BGĐ.
   */
  const BIDDING_APPROVE_EXTRA = ["bidding.costsheet.approve", "bidding.margin_override"];

  const EXEC_EXTRA = [
    "dashboard.cashflow",
    "dashboard.all_teams",
    "ai.board_report",
    "ai.trend",
    "ai.document",
    "finance.vendor_payment.over_cap",
    "finance.invoice.over_cap",
    "projects.pnl.view",
    "purchasing.po.manage",
    "purchasing.po.receive",
    "inventory.request.approve",
    "inventory.request.approve_any",
  ];

  /** Cấp lại theo NHÓM role — khớp đúng phòng ban trong getAiVisibility cũ. */
  const extraByGroup: Record<string, string[]> = {
    BOD: [
      ...EXEC_EXTRA,
      ...BIDDING_APPROVE_EXTRA,
      "clients.kb.manage",
      "clients.kb.generate",
      "clients.kb.compliance",
      // Hai mã duyệt kho: BGĐ duyệt được cả giữ chỗ (K3) và điều chuyển kho (K4).
      "inventory.reservation.approve",
      "inventory.transfer.approve",
      "iso.manage",
      "iso.export",
      // MKT post: BGĐ có cả 4 mã hẹp — vừa duyệt đăng vừa cắt được chi phí AI khi cần.
      "mkt.post.manage",
      "mkt.review",
      "mkt.frames.manage",
      "mkt.generate",
      // CO/CE v3: BGĐ thấy đủ cả hai cột tiền.
      "bidding.costsheet.view_cost",
      "bidding.costsheet.view_paycap",
    ],
    // Account duyệt đề xuất xuất kho của dự án MÌNH phụ trách (PIC/Leader) — quyết định flow K2
    // Account là PIC của dự án nên là người đính hồ sơ ISO cho chính dự án mình.
    // MKT post: Account NỘP bài (ý chính + ảnh) nhưng KHÔNG có `mkt.generate` — quyết định chủ dự
    // án 04/08/2026: nút AI tốn tiền theo lượt, chỉ HR + BGĐ được bấm.
    ACCOUNT: ["ai.brainstorm", "ai.content", "ai.canva", "ai.costsheet", "ai.trend", "inventory.request.approve", "clients.kb.manage", "clients.kb.generate", "iso.manage", "iso.export", "mkt.post.manage", "bidding.costsheet.view_cost", "bidding.costsheet.view_paycap"],
    // Creative dựng frame ảnh cho 2 kênh nên giữ 2 link thư mục frame.
    CREATIVE: ["ai.brainstorm", "mkt.frames.manage"],
    PLANNING: ["ai.brainstorm", "ai.content", "ai.canva"],
    // CO/CE v3: OPE/PRO cần thấy TRẦN CHI để làm việc với NCC — nhưng không thấy CE/margin/Total CO.
    OPERATIONS: ["bidding.costsheet.view_paycap"],
    PRODUCTION: ["bidding.costsheet.view_paycap"],
    HR: ["ai.brainstorm", "ai.content", "ai.document"],
    FINANCE: ["ai.costsheet", "ai.document", "ai.bank_recon", "inventory.reservation.approve", "bidding.costsheet.view_cost", "bidding.costsheet.view_paycap"],
    PURCHASING: ["purchasing.po.manage", "purchasing.po.receive", "bidding.costsheet.view_paycap"],
    // ⚠ CỐ Ý KHÔNG có `WAREHOUSE: WAREHOUSE_EXTRA` ở đây. Nhóm WAREHOUSE chứa CẢ `SECURITY_GUARD`
    // (bảo vệ điểm kho) — cấp 4 mã xác nhận thực xuất/thực nhập + chuyển lô + XUẤT HỦY theo NHÓM
    // chính là lỗ hổng vừa vá ở backfill `20260728_kho_k2_keeper`, chỉ tái sinh ở đường khác.
    // Dòng đó trước đây vô hại nhờ MAY: cả hai role trong nhóm đều có trong EXPLICIT_GRANTS nên
    // `grantCodesFor` short-circuit và không bao giờ đọc tới. Thêm một role kho thứ ba mà quên khai
    // EXPLICIT_GRANTS là mìn nổ. Thủ kho lấy 4 mã này qua EXPLICIT_GRANTS, OPE Manager qua
    // extraByRole — không ai mất gì khi bỏ dòng này (đã đo: grant không đổi một dòng nào).
  };
  /** Cấp lại theo MÃ role cụ thể — các ngoại lệ cũ vốn gắn theo EMAIL từng người. */
  const extraByRole: Record<string, string[]> = {
    // HR theo dõi học + là vế 2 của duyệt giữ chỗ. Kỳ kiểm ISO do HR chủ trì (file gốc là file của
    // HR) nên HR Manager đính hồ sơ và xuất báo cáo được.
    // ⚠ MKT post đi theo MÃ ROLE, KHÔNG theo nhóm HR: nhóm HR còn có `ADMIN_STAFF` (hành chính),
    // cấp theo nhóm là lặp lại đúng bẫy SECURITY_GUARD-trong-nhóm-WAREHOUSE đã phải vá (mục 10.15).
    // K6-4 (18/08/2026): Senior HR Manager DUYỆT đề xuất dùng hàng OVERHEAD công ty (mua từ ngân sách chung). Cần CẢ
    // gate `inventory.request.approve` (câu đầu action) lẫn mã phạm vi `approve_overhead`; với phiếu của dự án thì
    // canApproveIssue vẫn đòi PIC/Leader/trưởng team nên HR không duyệt lấn được.
    HR_MANAGER: ["clients.kb.compliance", "inventory.reservation.approve", "iso.manage", "iso.export", "mkt.review", "mkt.generate", "inventory.request.approve", "inventory.request.approve_overhead"],
    HR_STAFF: ["mkt.review", "mkt.generate"],
    CFO: [...EXEC_EXTRA, ...BIDDING_APPROVE_EXTRA], // Phạm Thu Huyền — exec trong cả (2) và (3)
    PRODUCTION_MANAGER: AI_LEGACY_ALL, // Hồ Sĩ Bảo — all-access AI ở getAiVisibility cũ (hiện đúng 1 người giữ role này)
    // AD/AM duyệt được đề xuất của MỌI dự án (kể cả dự án chưa gán PIC — 21 dự án cũ)
    ACCOUNT_DIRECTOR: ["inventory.request.approve_any", "clients.kb.compliance"],
    ACCOUNT_MANAGER: ["inventory.request.approve_any", "clients.kb.compliance"],
    // Chưa ai giữ role Thủ kho → OPE Manager giữ tạm vai xác nhận kho như TRƯỚC khi có ma trận
    // (đúng nguyên tắc "grant mặc định = quyền mọi người đang có"). Giao người thật xong thì BGĐ bỏ tick.
    // Duyệt điều chuyển kho là việc của chủ vận hành kho; Thủ kho KHÔNG tự duyệt đề xuất của mình.
    OPERATIONS_MANAGER: [...WAREHOUSE_EXTRA, "inventory.transfer.approve"],
  };

  /**
   * Role VẬN HÀNH HẸP: KHÔNG nhận baseGrantCodes, chỉ đúng danh sách liệt kê ở đây.
   *
   * Nguyên tắc "grant mặc định = quyền mọi người ĐANG có" (khối trên) đúng với các phòng ban cũ —
   * họ vốn dùng cả app trước khi bật ma trận. Nhưng áp cho tài khoản mới chỉ làm một việc thì thành
   * ra cấp thừa: thủ kho nhận nguyên 66 mã, gồm duyệt tạm ứng, phát hành hoá đơn khách, ghi đè
   * margin. Hai role này sinh ra SAU khi có ma trận nên không có "quyền cũ" nào để bảo toàn.
   */
  const EXPLICIT_GRANTS: Record<string, string[]> = {
    WAREHOUSE_KEEPER: [
      "inventory.view",
      "inventory.doc.create",
      "inventory.item.manage", // tạo lô mới khi hàng từ site về (khai lại trạng thái/tình trạng)
      "inventory.import_csv",
      "inventory.transfer.create",
      "inventory.transfer.confirm",
      "inventory.transfer.cancel",
      "inventory.request.create",
      "inventory.issue.confirm",
      "inventory.intake.confirm",
      "inventory.lot.convert",
      "inventory.destroy",
      "chat.use", // liên lạc với OPE/Account khi soạn hàng
      // CỐ Ý KHÔNG có inventory.request.approve*: Account duyệt đề xuất — tách vai của Kho v2 K2.
    ],
    SECURITY_GUARD: ["chat.use", "kb.view"],
  };

  const baseGrantCodes = PERMISSION_CODES.filter((c) => !isRestricted(c));
  /** Mã chạm tiền mà role này được giữ theo MONEY_POLICY (xem hằng ở trên). */
  const moneyCodesFor = (roleCode: string) =>
    Object.entries(MONEY_POLICY)
      .filter(([, allowed]) => allowed.includes(roleCode))
      .map(([code]) => code);

  /** Mã KPI / Cài đặt mà role này được giữ theo ADMIN_POLICY (xem hằng ở trên). */
  const adminCodesFor = (roleCode: string) =>
    Object.entries(ADMIN_POLICY)
      .filter(([, allowed]) => allowed.includes(roleCode))
      .map(([code]) => code);

  /** Mã tuyển dụng mà role này được giữ theo RECRUIT_POLICY (xem hằng ở trên). */
  const recruitCodesFor = (roleCode: string) =>
    Object.entries(RECRUIT_POLICY)
      .filter(([, allowed]) => allowed.includes(roleCode))
      .map(([code]) => code);

  /** Mã Thu mua (PUR-1) mà role này được giữ theo PUR_POLICY. */
  const purCodesFor = (roleCode: string) =>
    Object.entries(PUR_POLICY)
      .filter(([, allowed]) => allowed.includes(roleCode))
      .map(([code]) => code);

  /** Mã Họp Account team (MEET-1) mà role này được giữ theo MEETING_POLICY. */
  const meetingCodesFor = (roleCode: string) =>
    Object.entries(MEETING_POLICY)
      .filter(([, allowed]) => allowed.includes(roleCode))
      .map(([code]) => code);

  const grantCodesFor = (r: (typeof roleSeeds)[number]) =>
    EXPLICIT_GRANTS[r.code]
      ? new Set(EXPLICIT_GRANTS[r.code])
      : new Set([
          ...baseGrantCodes,
          ...(extraByGroup[r.groupCode] ?? []),
          ...(extraByRole[r.code] ?? []),
          ...moneyCodesFor(r.code),
          ...adminCodesFor(r.code),
          ...recruitCodesFor(r.code),
          ...purCodesFor(r.code),
          ...meetingCodesFor(r.code),
        ]);

  for (const r of roleSeeds) {
    if (r.code === "ADMIN") continue; // ADMIN là sàn cứng trong code — không cần (và không nên) có dòng grant
    const roleId = roleByCode[r.code].id;
    if ((await prisma.rolePermission.count({ where: { roleId } })) > 0) continue; // đã cấu hình tay → không đụng
    await prisma.rolePermission.createMany({
      data: [...grantCodesFor(r)].map((permissionCode) => ({ roleId, permissionCode })),
    });
  }

  // ── Vòng 4c: SIẾT LẠI role vận hành hẹp — chạy đúng MỘT lần ──
  // Vòng 4 bỏ qua role đã có grant, nên WAREHOUSE_KEEPER (tạo ở K2, nhận nguyên 66 mã base) sẽ
  // không bao giờ tự gọn lại. Đây là lần reset duy nhất; sau đó BGĐ toàn quyền chỉnh trong ma trận
  // (marker trong bảng setting bảo đảm re-seed không đè chỉnh sửa tay).
  const NARROW_RESET_KEY = "20260728_narrow_roles_reset";
  const narrowMarker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: NARROW_RESET_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!narrowMarker) {
    for (const code of Object.keys(EXPLICIT_GRANTS)) {
      const role = roleByCode[code];
      if (!role) continue;
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: EXPLICIT_GRANTS[code].map((permissionCode) => ({ roleId: role.id, permissionCode })),
      });
    }
    await prisma.setting.create({
      data: { module: "seed", key: NARROW_RESET_KEY, scope: "GLOBAL", scopeRef: "", value: JSON.stringify(new Date().toISOString()) },
    });
  }

  // ── Vòng 4b: backfill mã quyền MỚI cho role ĐÃ có grant (mỗi đợt chạy đúng MỘT lần) ──
  // Vòng 4 chỉ điền cho role chưa có dòng grant nào, nên mã thêm vào catalog SAU khi ma trận đã
  // dựng sẽ không bao giờ tự tới tay các role đang dùng — làm xong tính năng mà chỉ ADMIN thấy
  // (đúng chuyện đã xảy ra với finance.vendor_payment.over_cap: 0 grant suốt một đợt).
  // Đánh dấu từng đợt vào bảng setting (module "seed"): re-seed KHÔNG chạy lại đợt đã xong, để
  // không đè lên việc admin đã cố tình BỎ tick sau đó.
  const backfills: { key: string; codes: string[]; roleFilter?: (r: (typeof roleSeeds)[number]) => boolean }[] = [
    // 27/07/2026 — gác 10 action ORDER + task bộ phận (trước đó KHÔNG gác, ai đăng nhập cũng làm
    // được): grant cho MỌI role đúng nguyên tắc "grant mặc định = quyền mọi người có trước khi bật
    // ma trận"; BGĐ siết dần ở /settings/roles.
    //
    // ⚠ roleFilter LOẠI hai role vận hành hẹp. Backfill chạy SAU Vòng 4c (siết ở dòng ~2047), nên
    // không lọc là cấp lại 4 mã dự án cho đúng hai role vừa bị siết — thủ kho và bảo vệ không chạy
    // ORDER hay task bộ phận. Nguyên tắc "grant mặc định = quyền mọi người ĐANG có" chỉ đúng với
    // role CŨ; hai role này sinh ra sau khi có ma trận nên không có quyền cũ nào để bảo toàn.
    {
      key: "20260727_order_task_codes",
      codes: ["projects.order.respond", "projects.task.manage", "projects.task.submit", "projects.task.approve"],
      roleFilter: (r) => r.code !== "WAREHOUSE_KEEPER" && r.code !== "SECURITY_GUARD",
    },
    // 27/07/2026 — hai mã vượt trần (phiếu chi + hóa đơn) cấp cho BGĐ + CFO, theo quyết định chủ
    // dự án (cùng nhóm được duyệt CO/CE & override margin). Các role khác muốn có thì BGĐ tick.
    {
      key: "20260727_over_cap_exec",
      codes: ["finance.vendor_payment.over_cap", "finance.invoice.over_cap"],
      roleFilter: (r) => r.groupCode === "BOD" || r.code === "CFO",
    },
    // 27/07/2026 đợt 3+4 — PO cho nhóm Thu mua + BGĐ; P&L cho BGĐ + CFO. Role khác BGĐ tick thêm.
    {
      key: "20260727_wave34_codes",
      codes: ["purchasing.po.manage", "purchasing.po.receive"],
      roleFilter: (r) => r.groupCode === "PURCHASING" || r.groupCode === "BOD",
    },
    {
      key: "20260727_wave34_pnl",
      codes: ["projects.pnl.view"],
      roleFilter: (r) => r.groupCode === "BOD" || r.code === "CFO",
    },
    // 28/07/2026 Kho v2 K2 — tách vai kho. Đề xuất: mọi role (trước đây ai cũng lập được phiếu xuất).
    //
    // ⚠ Chỉ loại BẢO VỆ, KHÔNG loại thủ kho: `inventory.request.create` nằm trong 13 mã
    // EXPLICIT_GRANTS của WAREHOUSE_KEEPER nên họ vốn phải có, lọc cả hai là siết oan. Bảo vệ thì
    // đúng 2 mã (chat + đọc KB chung), không lập đề xuất kho.
    {
      key: "20260728_kho_k2_request_create",
      codes: ["inventory.request.create"],
      roleFilter: (r) => r.code !== "SECURITY_GUARD",
    },
    // Duyệt: Account (dự án mình) + BGĐ; duyệt-mọi-dự-án: AD/AM + BGĐ.
    {
      key: "20260728_kho_k2_approve",
      codes: ["inventory.request.approve"],
      roleFilter: (r) => r.groupCode === "ACCOUNT" || r.groupCode === "BOD",
    },
    {
      key: "20260728_kho_k2_approve_any",
      codes: ["inventory.request.approve_any"],
      roleFilter: (r) => r.code === "ACCOUNT_DIRECTOR" || r.code === "ACCOUNT_MANAGER" || r.groupCode === "BOD",
    },
    // Xác nhận thực xuất/nhập + chuyển lô + xuất hủy: THỦ KHO; OPE Manager giữ tạm tới khi giao người.
    //
    // ⚠ Lọc theo MÃ ROLE, KHÔNG theo nhóm. `SECURITY_GUARD` cũng có `groupCode: "WAREHOUSE"`
    // (bảo vệ tại điểm kho), nên lọc theo nhóm là cấp cho bảo vệ cả 4 mã này — tức quyền xác nhận
    // thực xuất/thực nhập và XUẤT HỦY hàng. Đã đo trên DB dựng từ đầu: bảo vệ nhận 11 mã thay vì 2.
    {
      key: "20260728_kho_k2_keeper",
      codes: ["inventory.issue.confirm", "inventory.intake.confirm", "inventory.lot.convert", "inventory.destroy"],
      roleFilter: (r) => r.code === "WAREHOUSE_KEEPER" || r.code === "OPERATIONS_MANAGER",
    },
    // 28/07/2026 Kho v2 K3 — duyệt giữ chỗ tồn kho để đưa vào CO với đơn giá 0.
    // Chủ dự án chốt: "Kế toán và/hoặc HR Manager" — MỘT trong hai duyệt là đủ, nên cùng một mã
    // quyền cấp cho cả hai nhóm (ai bấm trước thắng nhờ claim idempotent trong action).
    {
      key: "20260728_kho_k3_reserve_approve",
      codes: ["inventory.reservation.approve"],
      roleFilter: (r) => r.groupCode === "FINANCE" || r.code === "HR_MANAGER" || r.groupCode === "BOD",
    },
 
    // 01/08/2026 Kho kiến thức theo khách (H2). Xem: mọi role TRỪ thủ kho + bảo vệ (họ không
    // làm project cho khách). Soạn nội dung: nhóm Account + BGĐ.
    {
      key: "20260801_client_kb_h2_view",
      codes: ["clients.kb.view"],
      roleFilter: (r) => r.code !== "WAREHOUSE_KEEPER" && r.code !== "SECURITY_GUARD",
    },
    {
      key: "20260801_client_kb_h2_manage",
      codes: ["clients.kb.manage"],
      roleFilter: (r) => r.groupCode === "ACCOUNT" || r.groupCode === "BOD",
    },
    // 02/08/2026 Kho kiến thức theo khách (H3) — AI sinh bài + quiz + bảng tuân thủ.
    // Làm bài: đi CÙNG người được xem (ai đọc được thì phải làm được bài) — tách ra chỉ đẻ thêm
    // một chỗ để quên tick. Sinh bằng AI: tốn tiền theo lượt nên tách mã riêng, chỉ Account + BGĐ,
    // để BGĐ cắt được chi phí mà không cắt luôn khả năng nhập tay. Bảng tuân thủ: việc quản lý người.
    {
      key: "20260802_client_kb_h3_quiz",
      codes: ["clients.kb.quiz"],
      roleFilter: (r) => r.code !== "WAREHOUSE_KEEPER" && r.code !== "SECURITY_GUARD",
    },
    {
      key: "20260802_client_kb_h3_generate",
      codes: ["clients.kb.generate"],
      roleFilter: (r) => r.groupCode === "ACCOUNT" || r.groupCode === "BOD",
    },
    {
      key: "20260802_client_kb_h3_compliance",
      codes: ["clients.kb.compliance"],
      roleFilter: (r) =>
        r.code === "ACCOUNT_DIRECTOR" || r.code === "ACCOUNT_MANAGER" || r.code === "HR_MANAGER" || r.groupCode === "BOD",
    },
    // 02/08/2026 ISO-1 — sổ đăng ký hồ sơ ISO. XEM mở rộng (ai cũng nên thấy dự án mình thiếu hồ sơ
    // gì); ĐÍNH hồ sơ + XUẤT báo cáo giới hạn ở Account (PIC của dự án) + HR Manager (chủ trì kỳ
    // kiểm ISO) + BGĐ.
    // ⚠ Lọc theo MÃ ROLE, không theo `groupCode === "WAREHOUSE"`: nhóm đó chứa cả SECURITY_GUARD —
    // đúng cái bẫy đã phải vá ở `20260728_kho_k2_keeper` (HANDOVER 10.15).
    {
      key: "20260802_iso_view",
      codes: ["iso.view"],
      roleFilter: (r) => r.code !== "WAREHOUSE_KEEPER" && r.code !== "SECURITY_GUARD",
    },
    {
      key: "20260802_iso_manage",
      codes: ["iso.manage", "iso.export"],
      roleFilter: (r) => r.groupCode === "ACCOUNT" || r.groupCode === "BOD" || r.code === "HR_MANAGER",
    },
    // 02/08/2026 OVH-1 — chi phí văn phòng. Bảy mã đều nằm trong MONEY_POLICY nên KHÔNG được cấp
    // qua baseGrantCodes; mà Vòng 4d (siết theo MONEY_POLICY) đã chạy xong từ 30/07 nên trên DB
    // đang chạy nó cũng không cấp lại. Không có backfill này thì production KHÔNG AI mở được module.
    // Danh sách vai dưới đây phải khớp ĐÚNG MONEY_POLICY ở trên — lệch là hai đường mâu thuẫn.
    {
      key: "20260802_overhead_view",
      codes: ["overhead.view", "overhead.spend.record"],
      roleFilter: (r) =>
        r.groupCode === "BOD" || r.code === "CFO" || r.code === "ACCOUNTANT_STAFF" || r.code === "HR_MANAGER",
    },
    {
      key: "20260802_overhead_budget",
      codes: ["overhead.budget.manage"],
      roleFilter: (r) => r.groupCode === "BOD" || r.code === "HR_MANAGER",
    },
    {
      key: "20260802_overhead_approve_cfo",
      codes: ["overhead.budget.approve_cfo"],
      roleFilter: (r) => r.code === "CFO",
    },
    {
      key: "20260802_overhead_approve_ceo",
      codes: ["overhead.budget.approve_ceo"],
      roleFilter: (r) => r.groupCode === "BOD",
    },
    {
      key: "20260802_overhead_pay",
      codes: ["overhead.spend.pay"],
      roleFilter: (r) => r.groupCode === "BOD" || r.code === "CFO" || r.code === "ACCOUNTANT_STAFF",
    },
    {
      key: "20260802_overhead_over_budget",
      codes: ["overhead.spend.over_budget"],
      roleFilter: (r) => r.groupCode === "BOD" || r.code === "CFO",
    },
    // 04/08/2026 MKT-1 — bài đăng LinkedIn/Fanpage. `mkt.view` mở rộng như `iso.view` (loại đúng
    // hai role vận hành hẹp); 4 mã còn lại nằm trong isRestricted nên trên DB ĐANG CHẠY chỉ có
    // đường này cấp được. roleFilter dưới đây phải khớp ĐÚNG extraByGroup/extraByRole ở trên —
    // lệch một vai là hai đường mâu thuẫn, đúng loại lỗ hổng đã phải vá 30/07.
    {
      key: "20260804_mkt_view",
      codes: ["mkt.view"],
      roleFilter: (r) => r.code !== "WAREHOUSE_KEEPER" && r.code !== "SECURITY_GUARD",
    },
    {
      key: "20260804_mkt_post_manage",
      codes: ["mkt.post.manage"],
      roleFilter: (r) => r.groupCode === "ACCOUNT" || r.groupCode === "BOD",
    },
    {
      key: "20260804_mkt_review",
      codes: ["mkt.review"],
      roleFilter: (r) => r.code === "HR_MANAGER" || r.code === "HR_STAFF" || r.groupCode === "BOD",
    },
    {
      // CO/CE v3 (CE-1) — hai mã gate cột tiền: roleFilter khớp ĐÚNG đường cấp ở
      // isRestricted + extraByGroup/extraByRole để DB dựng-từ-đầu và DB đang chạy ra cùng kết quả.
      key: "20260805_coce_view_cost",
      codes: ["bidding.costsheet.view_cost"],
      roleFilter: (r) => r.groupCode === "ACCOUNT" || r.groupCode === "FINANCE" || r.groupCode === "BOD",
    },
    {
      key: "20260805_coce_view_paycap",
      codes: ["bidding.costsheet.view_paycap"],
      roleFilter: (r) =>
        r.groupCode === "ACCOUNT" || r.groupCode === "FINANCE" || r.groupCode === "BOD" ||
        r.groupCode === "PURCHASING" || r.groupCode === "OPERATIONS" || r.groupCode === "PRODUCTION",
    },
    {
      key: "20260804_mkt_frames",
      codes: ["mkt.frames.manage"],
      roleFilter: (r) => r.groupCode === "CREATIVE" || r.groupCode === "BOD",
    },
    // AI tốn tiền theo LƯỢT — cố ý KHÔNG cấp cho Account (họ chỉ nộp ý chính).
    {
      key: "20260804_mkt_generate",
      codes: ["mkt.generate"],
      roleFilter: (r) => r.code === "HR_MANAGER" || r.code === "HR_STAFF" || r.groupCode === "BOD",
    },
    // 29/07/2026 Kho v2 K4 — điều chuyển kho nay phải qua duyệt (trước K4 ai lập được là chạy
    // thẳng vào sổ cái). Người duyệt = OPE Manager (chủ vận hành kho) + BGĐ; Thủ kho KHÔNG tự duyệt
    // đề xuất của chính mình, họ chỉ chốt số thực xuất.
    {
      key: "20260729_kho_k4_transfer_approve",
      codes: ["inventory.transfer.approve"],
      roleFilter: (r) => r.code === "OPERATIONS_MANAGER" || r.groupCode === "BOD",
    },

    // 06/08/2026 TUYỂN DỤNG (TD-1) — 7 mã mới. Nguồn sự thật là RECRUIT_POLICY ở trên; mấy dòng
    // dưới CHỈ dịch bảng đó sang đường backfill cho DB ĐANG CHẠY (Vòng 4 bỏ qua role đã có grant).
    //
    // ⚠ Lọc theo MÃ ROLE, không theo nhóm `HR` — nhóm đó còn có `ADMIN_STAFF` (hành chính), người
    // không tham gia tuyển dụng. Sửa RECRUIT_POLICY thì phải sửa cả mấy dòng này cho khớp.
    {
      key: "20260806_recruit_view",
      codes: ["recruit.view", "recruit.salary.view"],
      roleFilter: (r) => r.code === "HR_MANAGER" || r.code === "HR_STAFF" || r.groupCode === "BOD",
    },
    {
      key: "20260806_recruit_manage",
      codes: ["recruit.manage", "recruit.ai_parse", "recruit.interview.manage"],
      roleFilter: (r) => r.code === "HR_MANAGER" || r.code === "HR_STAFF",
    },
    {
      key: "20260806_recruit_decide",
      codes: ["recruit.jd.manage", "recruit.decide"],
      roleFilter: (r) => r.code === "HR_MANAGER" || r.groupCode === "BOD",
    },

    // 16/08/2026 THU MUA (PUR-1) — 4 mã mới, dịch từ PUR_POLICY sang đường backfill (DB đang chạy).
    // Sửa PUR_POLICY thì sửa cả đây cho khớp. Lọc theo MÃ ROLE.
    {
      key: "20260816_pur_view",
      codes: ["purchasing.view"],
      roleFilter: (r) => PUR_POLICY["purchasing.view"].includes(r.code),
    },
    {
      key: "20260816_pur_manage",
      codes: ["purchasing.rfq.manage", "purchasing.rfq.ai", "purchasing.vendor.manage"],
      roleFilter: (r) => PUR_ROLES.includes(r.code),
    },

    // 20/08/2026 PRO-SHARE — phòng Sản xuất được lập RFQ trong phạm vi nhóm/NCC admin tick.
    // Dịch phần PRO của PUR_POLICY sang đường backfill; sửa PUR_POLICY thì sửa cả đây.
    {
      key: "20260820_pur_share_production",
      codes: ["purchasing.view", "purchasing.rfq.manage"],
      roleFilter: (r) => PRO_SHARED_ROLES.includes(r.code),
    },

    // 20/08/2026 AI SOẠN THẢO VĂN BẢN (đợt 2) — 1 mã mới. Lọc theo MÃ ROLE, khớp AI_DOCUMENT_ROLES.
    {
      key: "20260820_ai_document",
      codes: ["ai.document"],
      roleFilter: (r) => AI_DOCUMENT_ROLES.includes(r.code),
    },
    {
      key: "20260820_ai_bank_recon",
      codes: ["ai.bank_recon"],
      roleFilter: (r) => AI_BANK_RECON_ROLES.includes(r.code),
    },

    // 17/08/2026 HỌP ACCOUNT TEAM (MEET-1) — 3 mã mới, dịch từ MEETING_POLICY sang đường backfill.
    // Sửa MEETING_POLICY thì sửa cả đây cho khớp. Lọc theo MÃ ROLE.
    {
      key: "20260817_meetings_view_manage",
      codes: ["meetings.view", "meetings.manage"],
      roleFilter: (r) => MEETING_POLICY["meetings.view"].includes(r.code),
    },
    {
      key: "20260817_meetings_ai",
      codes: ["meetings.ai_import"],
      roleFilter: (r) => MEETING_POLICY["meetings.ai_import"].includes(r.code),
    },
    // K6-4: HR Manager duyệt hàng overhead — theo MÃ ROLE (nhóm HR còn ADMIN_STAFF, bẫy 10.15)
    {
      key: "20260818_kho_k6_approve_overhead",
      codes: ["inventory.request.approve", "inventory.request.approve_overhead"],
      roleFilter: (r) => r.code === "HR_MANAGER",
    },
  ];
  for (const bf of backfills) {
    const marker = await prisma.setting.findUnique({
      where: { module_key_scope_scopeRef: { module: "seed", key: bf.key, scope: "GLOBAL", scopeRef: "" } },
    });
    if (marker) continue;
    for (const r of roleSeeds) {
      if (r.code === "ADMIN") continue;
      if (bf.roleFilter && !bf.roleFilter(r)) continue;
      const roleId = roleByCode[r.code].id;
      if ((await prisma.rolePermission.count({ where: { roleId } })) === 0) continue; // role trống — Vòng 4 đã/sẽ lo trọn bộ
      const have = new Set(
        (await prisma.rolePermission.findMany({ where: { roleId, permissionCode: { in: bf.codes } }, select: { permissionCode: true } })).map(
          (g) => g.permissionCode,
        ),
      );
      const missing = bf.codes.filter((c) => !have.has(c));
      if (missing.length > 0) {
        await prisma.rolePermission.createMany({ data: missing.map((permissionCode) => ({ roleId, permissionCode })) });
      }
    }
    await prisma.setting.create({
      data: { module: "seed", key: bf.key, scope: "GLOBAL", scopeRef: "", value: JSON.stringify(new Date().toISOString()) },
    });
  }

  /*
    ── Vòng 4d: SIẾT quyền chạm tiền theo MONEY_POLICY — chạy đúng MỘT lần ──

    ⚠ Đây là vòng DUY NHẤT trong seed XOÁ grant của role đang hoạt động. Mọi vòng khác chỉ THÊM.
    Lý do phải có: 13 mã này đã nằm trong grant mặc định rộng của 20 role từ ngày bật ma trận;
    `isRestricted` chỉ chặn DB dựng-từ-đầu chứ không siết lại DB đang chạy (Vòng 4 bỏ qua role đã
    có grant). Không có vòng này thì bảng chính sách chỉ có hiệu lực sau một lần khôi phục.

    Chạy SAU backfill để có tiếng nói cuối cùng. Marker bảo đảm chỉ một lần: sau đó BGĐ toàn quyền
    tick lại trong /settings/roles mà re-seed không đè.

    ADMIN không có dòng grant nào (sàn cứng trong code) nên không bị đụng.
  */
  const MONEY_NARROW_KEY = "20260730_money_narrow";
  const moneyMarker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: MONEY_NARROW_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!moneyMarker) {
    let removed = 0;
    let added = 0;
    for (const [code, allowed] of Object.entries(MONEY_POLICY)) {
      const del = await prisma.rolePermission.deleteMany({
        where: { permissionCode: code, role: { code: { notIn: [...allowed, "ADMIN"] } } },
      });
      removed += del.count;
      // Cấp cho role trong chính sách mà chưa có — để vòng này tự nó là bức tranh đầy đủ, không
      // phụ thuộc việc Vòng 4 đã chạy hay chưa.
      for (const roleCode of allowed) {
        const role = roleByCode[roleCode];
        if (!role) continue;
        const has = await prisma.rolePermission.count({ where: { roleId: role.id, permissionCode: code } });
        if (has === 0) {
          await prisma.rolePermission.create({ data: { roleId: role.id, permissionCode: code } });
          added++;
        }
      }
    }
    await prisma.setting.create({
      data: {
        module: "seed",
        key: MONEY_NARROW_KEY,
        scope: "GLOBAL",
        scopeRef: "",
        value: JSON.stringify({ at: new Date().toISOString(), removed, added }),
      },
    });
    console.log(`🔒 Siết quyền chạm tiền: xoá ${removed} dòng, cấp thêm ${added} dòng`);
  }

  /*
    ── Vòng 4e: MỞ LẠI KPI + Cài đặt theo ADMIN_POLICY — chạy đúng MỘT lần ──

    Thuần CỘNG THÊM, không xoá của ai: 23 mã này đang 0 vai (chỉ ADMIN dùng được nhờ sàn cứng
    trong code), nên không có gì để siết. Ngược chiều hoàn toàn với Vòng 4d.

    Vì sao không dùng cơ chế backfill có sẵn: backfill nhóm theo TẬP MÃ + một roleFilter, mà ở đây
    mỗi mã có một danh sách vai riêng — sẽ phải đẻ ra ~12 entry rời rạc. Đọc một bảng vẫn dễ hơn
    đọc 12 entry, và bảng đó cũng chính là thứ nuôi `adminCodesFor` cho DB dựng-từ-đầu.
  */
  const ADMIN_OPEN_KEY = "20260730_admin_open";
  const adminMarker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: ADMIN_OPEN_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!adminMarker) {
    let granted = 0;
    for (const [code, allowed] of Object.entries(ADMIN_POLICY)) {
      for (const roleCode of allowed) {
        const role = roleByCode[roleCode];
        if (!role) continue;
        const has = await prisma.rolePermission.count({ where: { roleId: role.id, permissionCode: code } });
        if (has === 0) {
          await prisma.rolePermission.create({ data: { roleId: role.id, permissionCode: code } });
          granted++;
        }
      }
    }
    await prisma.setting.create({
      data: {
        module: "seed",
        key: ADMIN_OPEN_KEY,
        scope: "GLOBAL",
        scopeRef: "",
        value: JSON.stringify({ at: new Date().toISOString(), granted }),
      },
    });
    console.log(`🔓 Mở lại KPI + Cài đặt: cấp ${granted} dòng`);
  }

  // ── Module ⑥ KPI — tiêu chí đánh giá + lương vị trí + điểm mẫu ──
  const kpiCriteriaSeed: { code: string; nameVi: string; nameEn: string; appliesTo: string; weight: number; sort: number; sourceType?: string; autoKey?: string }[] = [
    { code: "WORK_QUALITY", nameVi: "Chất lượng công việc", nameEn: "Work quality", appliesTo: "ALL", weight: 3, sort: 1 },
    { code: "DEADLINE", nameVi: "Deadline & cam kết", nameEn: "Deadline & commitment", appliesTo: "ALL", weight: 2, sort: 2 },
    { code: "TEAMWORK", nameVi: "Tinh thần hợp tác", nameEn: "Teamwork", appliesTo: "ALL", weight: 1.5, sort: 3 },
    { code: "INITIATIVE", nameVi: "Chủ động & sáng kiến", nameEn: "Initiative", appliesTo: "ALL", weight: 1.5, sort: 4 },
    { code: "PROCESS", nameVi: "Tuân thủ quy trình", nameEn: "Process compliance", appliesTo: "ALL", weight: 1, sort: 5 },
    { code: "ATTENDANCE", nameVi: "Chuyên cần", nameEn: "Attendance", appliesTo: "ALL", weight: 1, sort: 6, sourceType: "AUTO", autoKey: "ATTENDANCE" },
    { code: "CREATIVE_ONTIME", nameVi: "Giao task đúng hạn", nameEn: "On-time delivery", appliesTo: "CREATIVE", weight: 2, sort: 7, sourceType: "AUTO", autoKey: "CREATIVE_ONTIME" },
    { code: "TEAM_MGMT", nameVi: "Quản lý & phát triển team", nameEn: "Team management", appliesTo: "LEAD", weight: 2, sort: 8 },
  ];
  const kpiCritByCode: Record<string, { id: string }> = {};
  for (const c of kpiCriteriaSeed) {
    kpiCritByCode[c.code] = await prisma.kpiCriterion.upsert({
      where: { code: c.code },
      update: {},
      create: { code: c.code, nameVi: c.nameVi, nameEn: c.nameEn, appliesTo: c.appliesTo, weight: c.weight, sort: c.sort, sourceType: c.sourceType ?? "MANUAL", autoKey: c.autoKey ?? null },
    });
  }

  // Lương vị trí: sinh từ các cặp (title, dept) distinct đang có trong khung (ACCOUNT/PLANNING/CREATIVE/OPE/PRO) — số placeholder, BoD sửa ở /settings/kpi.
  const kpiPeriod = `${new Date().getFullYear()}-M${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const kpiDepts = ["ACCOUNT", "PLANNING", "CREATIVE", "OPE", "PRO"];
  const kpiStaff = await prisma.staff.findMany({
    where: { isActive: true, department: { code: { in: kpiDepts } } },
    select: { id: true, title: true, department: { select: { code: true } } },
  });
  const seenPos = new Set<string>();
  for (const s of kpiStaff) {
    if (!s.title || !s.department) continue;
    const key = `${s.title}__${s.department.code}`;
    if (seenPos.has(key)) continue;
    seenPos.add(key);
    await prisma.positionSalary.upsert({
      where: { positionTitle_departmentCode_periodCode: { positionTitle: s.title, departmentCode: s.department.code, periodCode: kpiPeriod } },
      update: {},
      create: { positionTitle: s.title, departmentCode: s.department.code, periodCode: kpiPeriod, monthlySalary: BigInt(20000000), note: "Placeholder — BoD cập nhật số thật" },
    });
  }

  // Điểm mẫu tháng hiện tại cho pool CREATIVE để dashboard có số demo.
  const creativeDemoStaff = kpiStaff.filter((s) => s.department?.code === "CREATIVE");
  for (const s of creativeDemoStaff) {
    for (const code of ["WORK_QUALITY", "DEADLINE", "TEAMWORK"]) {
      await prisma.kpiScore.upsert({
        where: { criterionId_staffId_periodCode: { criterionId: kpiCritByCode[code].id, staffId: s.id, periodCode: kpiPeriod } },
        update: {},
        create: { criterionId: kpiCritByCode[code].id, staffId: s.id, periodCode: kpiPeriod, score: 3 + Math.floor(Math.random() * 3) * 0.5, scoredById: ceo.id },
      });
    }
  }

  /*
    ── Nghỉ việc team Account 2 + bật lại team A1 — chạy đúng MỘT lần (2026-08) ──

    Quyết định chủ dự án 01/08/2026: 5 người team Account 2 (dưới Hứa Thị Trâm Anh) nghỉ trong
    tháng 8 → XOÁ VĨNH VIỄN; A2 thành trống. Phước quay lại làm lead team A1 của chính mình, và
    NHẬN toàn bộ khách + dự án của A2.

    ⚠ Khối này THAY THẾ khối "Tái cơ cấu team Account (2026-07)" cũ — khối đó dồn A1→A2 và tắt A1
    VÔ ĐIỀU KIỆN mỗi lần seed, không có marker. Để nguyên thì mọi thay đổi team ở đây sẽ bị nó dồn
    lại lặng lẽ ngay lần `db:seed` kế tiếp (mà seed là BẮT BUỘC sau `migrate deploy` — HANDOVER 8.2).

    ⚠ THỨ TỰ LÀ BẤT BIẾN: chuyển chủ TRƯỚC, xoá SAU. Xoá trước thì `project.ownerId`/`leaderId` bị
    SET NULL ở tầng DB, và dự án trống PIC/Leader chỉ người có `inventory.request.approve_any` mới
    duyệt được đề xuất xuất kho (HANDOVER 10.11) → kẹt luồng kho.

    ⚠ Ảnh chụp trước khi xoá: ~33 FK là SET NULL, xảy ra ở tầng DB, KHÔNG sinh audit. Trong đó có
    tạm ứng và revision CO/CE — mất người đứng tên là mất dấu vết tiền. `requestedById` CỐ Ý không
    trỏ sang người khác: ghi Phước đứng tên một khoản tạm ứng anh ấy không đề nghị là bịa lịch sử.
    Ghi ảnh chụp vào AuditLog rồi để DB set null.

    DB dựng-từ-đầu: 5 người đã gỡ khỏi STAFF_ROWS nên khối này không tìm thấy ai, A1 vốn đã active
    và đã có Phước+Tươi, A2 vốn đã trống ⇒ báo "0 người" và chỉ ghi marker. Hai đường nhất trí.
  */
  const A2_OFFBOARD_KEY = "20260801_a2_offboard";
  const A2_OFFBOARD_EMAILS = [
    "httanh@tcmbtl.com",   // HỨA THỊ TRÂM ANH   — Senior Account Manager (lead A2)
    "ntyminh@tcmbtl.com",  // NGUYỄN THỊ YẾN MINH — Assistant Account Manager
    "dtynhu@tcmbtl.com",   // ĐẶNG THỊ Ý NHƯ      — Senior Account Executive
    "ttbtran@tcmbtl.com",  // TRẦN THỊ BẢO TRÂN   — Account Executive
    "ttknhi@tcmbtl.com",   // TRẦN THỊ KIM NHI    — Account Executive
  ];
  const offboardMarker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: A2_OFFBOARD_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!offboardMarker) {
    const phuoc = await prisma.staff.findUnique({ where: { email: "hhphuoc@tcmbtl.com" } });
    const leavers = await prisma.staff.findMany({
      where: { email: { in: A2_OFFBOARD_EMAILS } },
      select: { id: true, fullName: true, email: true },
    });
    const leaverIds = leavers.map((s) => s.id);

    // ① Team: A1 sống lại, A2 giữ lại nhưng trống (không xoá — 25 dự án/68 khách từng trỏ vào mã này).
    await prisma.team.update({ where: { id: a1.id }, data: { isActive: true, name: "ACC 1 — Dự án/Đấu thầu đa ngành" } });
    await prisma.team.update({ where: { id: a2.id }, data: { name: "ACC 2 — (chưa có nhân sự)" } });

    // ② Phước + Tươi quay về A1 (đảo lại phần dồn của khối cũ). Chỉ đụng đúng 2 người, không quét cả team.
    await prisma.staff.updateMany({
      where: { email: { in: ["hhphuoc@tcmbtl.com", "tvtuoi@tcmbtl.com"] } },
      data: { teamId: a1.id },
    });

    // ③ Toàn bộ khách + dự án của A2 sang A1 (quyết định chủ dự án: chuyển hết sang team Phước).
    const movedClients = await prisma.client.updateMany({ where: { ownerTeamId: a2.id }, data: { ownerTeamId: a1.id } });
    const movedProjects = await prisma.project.updateMany({ where: { ownerTeamId: a2.id }, data: { ownerTeamId: a1.id } });

    let snapshots = 0;
    let deleted = 0;
    if (phuoc && leaverIds.length > 0) {
      // ④ Chuyển chủ TRƯỚC khi xoá — nếu không, DB set null và luồng kho của các dự án đó bị kẹt.
      await prisma.project.updateMany({ where: { ownerId: { in: leaverIds } }, data: { ownerId: phuoc.id } });
      await prisma.project.updateMany({ where: { leaderId: { in: leaverIds } }, data: { leaderId: phuoc.id } });
      await prisma.client.updateMany({ where: { introducerId: { in: leaverIds } }, data: { introducerId: phuoc.id } });
      await prisma.staff.updateMany({ where: { managerId: { in: leaverIds } }, data: { managerId: phuoc.id } });

      for (const leaver of leavers) {
        // ⑤ Ảnh chụp dấu vết tiền TRƯỚC khi DB set null (SET NULL không sinh audit).
        // ⚠ `kpiScore` là CASCADE và `shiftAssignment` bị deleteMany ngay dưới — cả hai BIẾN MẤT
        // KHÔNG DẤU VẾT. Production có ~205 ca làm (dev.db chỉ 20) nên phải ghi lại trước.
        const [advances, revisions, orders, shifts, kpiScores] = await Promise.all([
          prisma.advance.findMany({ where: { requestedById: leaver.id }, select: { id: true, amount: true, status: true } }),
          prisma.costSheetRevision.findMany({ where: { createdById: leaver.id }, select: { id: true, costSheetId: true } }),
          prisma.projectOrder.findMany({ where: { sentById: leaver.id }, select: { id: true, department: true } }),
          prisma.shiftAssignment.count({ where: { staffId: leaver.id } }),
          prisma.kpiScore.findMany({ where: { staffId: leaver.id }, select: { id: true, periodCode: true, criterionId: true } }),
        ]);
        await prisma.auditLog.create({
          data: {
            entityType: "Staff",
            entityId: leaver.id,
            field: "offboard_snapshot",
            action: "DELETE",
            reason: "Nghỉ việc team Account 2 (08/2026) — ảnh chụp trước khi xoá vĩnh viễn",
            oldValue: JSON.stringify({
              fullName: leaver.fullName,
              email: leaver.email,
              advances: advances.map((a) => ({ id: a.id, amount: String(a.amount), status: a.status })),
              costSheetRevisions: revisions,
              projectOrders: orders,
              shiftAssignmentsDeleted: shifts,
              kpiScoresCascaded: kpiScores,
            }),
          },
        });
        snapshots++;

        // ⑥ Xoá — dọn đúng 6 bảng FK RESTRICT theo thứ tự của `deleteStaff` (settings/staff/actions.ts).
        await prisma.$transaction([
          prisma.notification.deleteMany({ where: { recipientStaffId: leaver.id } }),
          prisma.clientTransfer.deleteMany({ where: { transferredById: leaver.id } }),
          prisma.projectOrderAttendee.deleteMany({ where: { staffId: leaver.id } }),
          prisma.projectMember.deleteMany({ where: { staffId: leaver.id } }),
          prisma.conversationMember.deleteMany({ where: { staffId: leaver.id } }),
          prisma.shiftAssignment.deleteMany({ where: { staffId: leaver.id } }),
          prisma.staff.delete({ where: { id: leaver.id } }),
        ]);
        deleted++;
      }
    }

    await prisma.setting.create({
      data: {
        module: "seed",
        key: A2_OFFBOARD_KEY,
        scope: "GLOBAL",
        scopeRef: "",
        value: JSON.stringify({
          at: new Date().toISOString(),
          deleted,
          snapshots,
          movedClients: movedClients.count,
          movedProjects: movedProjects.count,
        }),
      },
    });
    console.log(
      `👥 Nghỉ việc team A2: xoá ${deleted} nhân sự (ảnh chụp ${snapshots}), chuyển ${movedClients.count} khách + ${movedProjects.count} dự án sang A1`,
    );
  }

  /*
    ── Giải thể HEADCOUNT bộ phận Planning — chạy đúng MỘT lần (2026-08) ──

    Quyết định chủ dự án 01/08/2026: Dương Mỹ Ngọc — nhân sự Planning DUY NHẤT — cũng nghỉ trong
    tháng 8. Từ đây bộ phận Planning không còn người nào; người làm Planning tuyển sau này nằm trong
    team Account (A1 của Phước, A3 của Hà) và được đánh dấu bằng cờ `Staff.isPlanningStaff`.

    ⚠ CỐ Ý KHÔNG tắt `Department.isActive` của PLANNING. Phòng này không chỉ là chỗ chứa headcount,
    nó còn là HẠNG MỤC CÔNG VIỆC: `costPrefix = "PLA"` sinh mã dòng chi phí CO/CE, và cả hai trang
    bidding/[id] lẫn projects/[id]/co-ce lọc phòng theo `costPrefix != null AND isActive = true`.
    Tắt đi là mất tiền tố PLA khỏi trình dựng dòng chi phí, và Planning cũng biến khỏi Master
    Timeline (projects/[id]/timeline + settings/timeline-templates cũng lọc theo isActive).
    Cột Planning trên org chart tự biến mất khi không còn ai — không cần tắt phòng để đạt điều đó.

    ⚠ HỆ QUẢ PHẢI BIẾT: sau khối này KHÔNG còn ai có `isPlanningStaff`. Order Planning gửi đi sẽ
    không báo cho ai và không tự gán được người làm (`resolveAutoPlanner` trả null) cho tới khi
    tuyển người mới và tick cờ đó ở /settings/staff. Đây là phản ánh đúng thực tế, không phải lỗi.
  */
  const PLANNING_DISSOLVED_KEY = "20260801_planning_dissolved";
  const planningMarker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: PLANNING_DISSOLVED_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!planningMarker) {
    const ngoc = await prisma.staff.findUnique({
      where: { email: "dmngoc@tcmbtl.com" },
      select: { id: true, fullName: true, email: true },
    });
    let removed = 0;
    if (ngoc) {
      // Ảnh chụp trước khi xoá — cùng khuôn với khối team A2 ở trên. Ngọc không đứng tên dự án/khách/
      // tiền nào, nhưng vẫn ghi lại phần việc Planning đã làm để tra ngược được.
      const [stages, versions, tasks, shifts, kpiScores] = await Promise.all([
        prisma.planningStage.findMany({ where: { assigneeId: ngoc.id }, select: { id: true, stage: true, jobId: true } }),
        prisma.planningProposalVersion.findMany({ where: { submittedById: ngoc.id }, select: { id: true, versionNo: true, jobId: true } }),
        prisma.departmentTask.findMany({ where: { assigneeId: ngoc.id }, select: { id: true, title: true } }),
        prisma.shiftAssignment.count({ where: { staffId: ngoc.id } }),
        prisma.kpiScore.findMany({ where: { staffId: ngoc.id }, select: { id: true, periodCode: true, criterionId: true } }),
      ]);
      await prisma.auditLog.create({
        data: {
          entityType: "Staff",
          entityId: ngoc.id,
          field: "offboard_snapshot",
          action: "DELETE",
          reason: "Giải thể headcount bộ phận Planning (08/2026) — ảnh chụp trước khi xoá vĩnh viễn",
          oldValue: JSON.stringify({
            fullName: ngoc.fullName,
            email: ngoc.email,
            planningStages: stages,
            proposalVersions: versions,
            departmentTasks: tasks,
            shiftAssignmentsDeleted: shifts,
            kpiScoresCascaded: kpiScores,
          }),
        },
      });
      await prisma.$transaction([
        prisma.notification.deleteMany({ where: { recipientStaffId: ngoc.id } }),
        prisma.clientTransfer.deleteMany({ where: { transferredById: ngoc.id } }),
        prisma.projectOrderAttendee.deleteMany({ where: { staffId: ngoc.id } }),
        prisma.projectMember.deleteMany({ where: { staffId: ngoc.id } }),
        prisma.conversationMember.deleteMany({ where: { staffId: ngoc.id } }),
        prisma.shiftAssignment.deleteMany({ where: { staffId: ngoc.id } }),
        prisma.staff.delete({ where: { id: ngoc.id } }),
      ]);
      removed = 1;
    }
    await prisma.setting.create({
      data: {
        module: "seed",
        key: PLANNING_DISSOLVED_KEY,
        scope: "GLOBAL",
        scopeRef: "",
        value: JSON.stringify({ at: new Date().toISOString(), removed }),
      },
    });
    console.log(`🗂  Giải thể headcount Planning: xoá ${removed} nhân sự — phòng Planning giữ nguyên làm hạng mục công việc`);
  }

  /*
    Một-lần: gán TRƯỞNG TEAM cho A1/A3 (chủ dự án chốt 05/08/2026).
      • A1 → HỒ HỒNG PHƯỚC      • A3 → TRẦN THU HÀ      • A2 để trống (hiện 0 người)

    Trưởng team là người GÁN người làm Planning trong team và DUYỆT khi team khác xin mượn người.
    CỐ Ý không suy từ vai `ACCOUNT_MANAGER`: hiện mỗi team đúng một người mang vai đó, nhưng đó là
    TRÙNG HỢP chứ không phải ràng buộc — và đang có người mang chức danh "Account Manager" trong
    `title` mà vai quyền lại là ACCOUNT_STAFF (Hà Uyên, Kim Yến), suy theo vai sẽ ra kết quả trái
    với chức danh họ đang mang.

    Chỉ gán khi ô đang TRỐNG, và có marker, nên admin đổi trưởng team ở /settings/teams về sau thì
    chạy lại `db:seed` không đè lên.
  */
  const TEAM_LEAD_KEY = "20260805_team_leads";
  const teamLeadMarker = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module: "seed", key: TEAM_LEAD_KEY, scope: "GLOBAL", scopeRef: "" } },
  });
  if (!teamLeadMarker) {
    const assigned: string[] = [];
    for (const [teamCode, email] of [
      ["A1", "hhphuoc@tcmbtl.com"],
      ["A3", "ttha@tcmbtl.com"],
    ] as const) {
      const [team, lead] = await Promise.all([
        prisma.team.findUnique({ where: { code: teamCode }, select: { id: true, leadStaffId: true } }),
        prisma.staff.findUnique({ where: { email }, select: { id: true, fullName: true } }),
      ]);
      if (team && lead && !team.leadStaffId) {
        await prisma.team.update({ where: { id: team.id }, data: { leadStaffId: lead.id } });
        assigned.push(`${teamCode}=${lead.fullName}`);
      }
    }
    await prisma.setting.create({
      data: {
        module: "seed",
        key: TEAM_LEAD_KEY,
        scope: "GLOBAL",
        scopeRef: "",
        value: JSON.stringify({ at: new Date().toISOString(), assigned }),
      },
    });
    console.log(`👤 Trưởng team: ${assigned.length > 0 ? assigned.join(" · ") : "không gán thêm (đã có sẵn)"}`);
  }

  console.log("✅ Seed hoàn tất:", {
    teams: [a1.code, a2.code, a3.code],
    staffTotal: STAFF_ROWS.length,
    staff: [ceo.email, thao.email, yen.email, ha.email],
    brands: brandNames,
    clients: clientsSeed.map((c) => c.code),
    optionSets: ["project_type", "contract_type", "fail_reason", "channel", "client_status", "client_classification", "complexity", "project_status", "kb_category", "inventory_category", "mkt_content_type"],
    projects: projSeed.map((p) => p.code),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
