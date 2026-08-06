import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, PERMISSION_CODES } from "../src/lib/permission-catalog";
import { currentPeriodCode } from "../src/lib/creative-cost";
import { hashPassword } from "../src/lib/password";

/**
 * SEED — bản mini Creative.
 *
 * Khác hẳn seed của TCM (3.000 dòng, dữ liệu thật 36 nhân sự / 68 khách / 25 dự án): bản này chỉ
 * dựng đủ để đăng nhập và chạy được bảng task. Dữ liệu mẫu tối thiểu, đặt tên rõ là MẪU để không
 * ai nhầm với dữ liệu thật.
 *
 * Idempotent: chạy lại nhiều lần không nhân bản (upsert theo khoá tự nhiên).
 */

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "Creative123456";

// ─────────────────────────────────────────────────────────
// Nhóm quyền: ai được gì
//
// ⚠ MỘT NGUỒN SỰ THẬT. `ADMIN` KHÔNG có dòng grant nào — nó là sàn cứng trong `lib/permissions.ts`
// (luôn đủ mọi quyền), để không ai tự khoá mình ra khỏi chính trang sửa ma trận.
// ⚠ Ba mã META (`settings.roles.manage`, `settings.permissions.manage`, `settings.security.manage`)
// CỐ Ý chỉ ADMIN giữ: ai có chúng thì tự cấp lại được mọi quyền khác.
// ─────────────────────────────────────────────────────────
const ROLE_GRANTS: Record<string, string[]> = {
  CREATIVE_DIRECTOR: [
    "dashboard.view",
    "creative.view",
    "creative.task.manage",
    "creative.task.assign",
    "creative.task.submit",
    "creative.task.approve",
    "creative.cost.view",
    "settings.view",
    "settings.creative.manage",
    "settings.staff.manage",
    "settings.departments.manage",
    "settings.options.manage",
  ],
  // Designer: làm và nộp bài. KHÔNG có `creative.task.assign` — trưởng team nhỏ giao việc bằng
  // phép kiểm THEO BẢN GHI (squad.leadStaffId), không cần mã quyền.
  CREATIVE_STAFF: ["dashboard.view", "creative.view", "creative.task.submit"],
  // Người đặt việc (Account/khách nội bộ): xem tiến độ, ký duyệt phần của mình khi được chỉ định.
  REQUESTER: ["dashboard.view", "creative.view", "creative.task.manage"],
};

const ROLES: { code: string; name: string; groupCode: string; sort: number }[] = [
  { code: "ADMIN", name: "Quản trị hệ thống", groupCode: "ADMIN", sort: 0 },
  { code: "CREATIVE_DIRECTOR", name: "Creative Director", groupCode: "CREATIVE", sort: 10 },
  { code: "CREATIVE_STAFF", name: "Nhân sự Creative", groupCode: "CREATIVE", sort: 11 },
  { code: "REQUESTER", name: "Người đặt việc", groupCode: "REQUESTER", sort: 20 },
];

const SQUADS = [
  { code: "CREATIVE", name: "Creative — idea & chiến lược", sort: 1 },
  { code: "GRAPHIC_2D", name: "Graphic 2D — Key Visual", sort: 2 },
  { code: "MULTIMEDIA", name: "Multimedia — 3D/Animation/AI", sort: 3 },
];

const TASK_TYPES = [
  { code: "IDEA", labelVi: "Idea / concept", labelEn: "Idea / concept" },
  { code: "KV_2D", labelVi: "Key visual", labelEn: "Key visual" },
  { code: "DESIGN_2D", labelVi: "Thiết kế 2D", labelEn: "2D design" },
  { code: "DESIGN_3D", labelVi: "Thiết kế 3D", labelEn: "3D design" },
  { code: "SET_DESIGN", labelVi: "Thiết kế bối cảnh", labelEn: "Set design" },
  { code: "VIDEO", labelVi: "Video / animation", labelEn: "Video / animation" },
  { code: "OTHER", labelVi: "Khác", labelEn: "Other" },
];

/** Trạng thái công việc — MÃ CỐ ĐỊNH, `lib/projects.ts` dựa vào để suy giai đoạn và khoá task. */
const PROJECT_STATUSES = [
  { code: "BIDDING", labelVi: "Đang chào / pitching", labelEn: "Pitching" },
  { code: "PROCESSING", labelVi: "Đang triển khai", labelEn: "In progress" },
  { code: "FINISHED", labelVi: "Đã xong", labelEn: "Finished" },
  { code: "CANCELED", labelVi: "Đã huỷ", labelEn: "Canceled" },
];

async function seedOptionSet(code: string, name: string, items: { code: string; labelVi: string; labelEn?: string }[]) {
  const set = await prisma.optionSet.upsert({ where: { code }, update: { name }, create: { code, name } });
  const byCode: Record<string, string> = {};
  for (const [i, it] of items.entries()) {
    const row = await prisma.optionItem.upsert({
      where: { setId_code: { setId: set.id, code: it.code } },
      update: { labelVi: it.labelVi, labelEn: it.labelEn ?? null, sort: i },
      create: { setId: set.id, code: it.code, labelVi: it.labelVi, labelEn: it.labelEn ?? null, sort: i },
    });
    byCode[it.code] = row.id;
  }
  return byCode;
}

async function main() {
  // ── Cấu hình ──
  for (const s of [
    { module: "auth", key: "default_password", value: DEFAULT_PASSWORD },
    { module: "creative", key: "cost_review_cycle", value: "MONTH" },
  ]) {
    await prisma.setting.upsert({
      where: { module_key_scope_scopeRef: { module: s.module, key: s.key, scope: "GLOBAL", scopeRef: "" } },
      update: {},
      create: { ...s, scope: "GLOBAL", scopeRef: "" },
    });
  }

  // ── Nhóm quyền ──
  const roleByCode: Record<string, string> = {};
  for (const r of ROLES) {
    const row = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, groupCode: r.groupCode, sort: r.sort },
      create: { ...r },
    });
    roleByCode[r.code] = row.id;
  }
  // Chỉ cấp cho role CHƯA có dòng grant nào — chỉnh tay trong ma trận không bị đè khi seed lại.
  for (const [code, perms] of Object.entries(ROLE_GRANTS)) {
    const roleId = roleByCode[code];
    if ((await prisma.rolePermission.count({ where: { roleId } })) > 0) continue;
    const valid = perms.filter((p) => PERMISSION_CODES.includes(p));
    if (valid.length !== perms.length) {
      throw new Error(`Seed cấp mã quyền KHÔNG có trong danh mục cho ${code}: ${perms.filter((p) => !PERMISSION_CODES.includes(p)).join(", ")}`);
    }
    await prisma.rolePermission.createMany({ data: valid.map((permissionCode) => ({ roleId, permissionCode })) });
  }

  // ── Phòng ban ──
  const deptByCode: Record<string, string> = {};
  for (const d of [
    { code: "CREATIVE", name: "Creative" },
    { code: "REQUESTER", name: "Người đặt việc" },
  ]) {
    const row = await prisma.department.upsert({ where: { code: d.code }, update: { name: d.name }, create: d });
    deptByCode[d.code] = row.id;
  }

  // ── Ba team nhỏ ──
  const squadByCode: Record<string, string> = {};
  for (const s of SQUADS) {
    const row = await prisma.creativeSquad.upsert({ where: { code: s.code }, update: { name: s.name, sort: s.sort }, create: s });
    squadByCode[s.code] = row.id;
  }

  // ── Danh mục ──
  const taskTypeByCode = await seedOptionSet("creative_task_type", "Loại việc Creative", TASK_TYPES);
  const statusByCode = await seedOptionSet("project_status", "Trạng thái công việc", PROJECT_STATUSES);
  const clientStatusByCode = await seedOptionSet("client_status", "Tình trạng khách hàng", [
    { code: "ACTIVE", labelVi: "Đang hợp tác", labelEn: "Active" },
    { code: "POTENTIAL", labelVi: "Tiềm năng", labelEn: "Potential" },
  ]);
  const complexityByCode = await seedOptionSet("complexity", "Độ phức tạp", [
    { code: "SIMPLE", labelVi: "Đơn giản", labelEn: "Simple" },
    { code: "MEDIUM", labelVi: "Trung bình", labelEn: "Medium" },
    { code: "COMPLEX", labelVi: "Phức tạp", labelEn: "Complex" },
  ]);

  // ── Nhân sự mẫu ──
  const hash = hashPassword(DEFAULT_PASSWORD);
  const STAFF = [
    { code: "CRE-0001", fullName: "QUẢN TRỊ HỆ THỐNG", email: "admin@creative.local", title: "Administrator", dept: "CREATIVE", role: "ADMIN", squad: null },
    { code: "CRE-0002", fullName: "NGUYỄN MINH KHANG", email: "cd@creative.local", title: "Creative Director", dept: "CREATIVE", role: "CREATIVE_DIRECTOR", squad: "CREATIVE" },
    { code: "CRE-0003", fullName: "TRẦN THU HÀ", email: "art@creative.local", title: "Art Manager", dept: "CREATIVE", role: "CREATIVE_STAFF", squad: "GRAPHIC_2D" },
    { code: "CRE-0004", fullName: "LÊ QUỐC BẢO", email: "3d@creative.local", title: "3D Designer", dept: "CREATIVE", role: "CREATIVE_STAFF", squad: "MULTIMEDIA" },
    { code: "CRE-0005", fullName: "PHẠM NGỌC LAN", email: "2d@creative.local", title: "2D Designer", dept: "CREATIVE", role: "CREATIVE_STAFF", squad: "GRAPHIC_2D" },
    { code: "CRE-0006", fullName: "VŨ ĐÌNH NAM", email: "account@creative.local", title: "Account Executive", dept: "REQUESTER", role: "REQUESTER", squad: null },
  ];
  const staffByCode: Record<string, string> = {};
  for (const s of STAFF) {
    const row = await prisma.staff.upsert({
      where: { email: s.email },
      update: { fullName: s.fullName, title: s.title, departmentId: deptByCode[s.dept], roleId: roleByCode[s.role], creativeSquadId: s.squad ? squadByCode[s.squad] : null },
      create: {
        code: s.code, fullName: s.fullName, email: s.email, title: s.title,
        departmentId: deptByCode[s.dept], roleId: roleByCode[s.role],
        creativeSquadId: s.squad ? squadByCode[s.squad] : null,
        passwordHash: hash, mustChangePassword: true,
      },
    });
    staffByCode[s.code] = row.id;
  }

  // Trưởng team nhỏ — chỉ gán khi còn trống, không đè chỉnh tay.
  const LEADS: [string, string][] = [["CREATIVE", "CRE-0002"], ["GRAPHIC_2D", "CRE-0003"], ["MULTIMEDIA", "CRE-0004"]];
  for (const [squadCode, staffCode] of LEADS) {
    await prisma.creativeSquad.updateMany({
      where: { code: squadCode, leadStaffId: null },
      data: { leadStaffId: staffByCode[staffCode] },
    });
  }

  // ── Khách & công việc mẫu ──
  const client = await prisma.client.upsert({
    where: { code: "MAU" },
    update: {},
    create: { code: "MAU", name: "Khách hàng mẫu", statusId: clientStatusByCode.ACTIVE },
  });
  for (const p of [
    { code: "JOB001", name: "Chiến dịch mẫu — đang triển khai", status: "PROCESSING" },
    { code: "JOB002", name: "Hồ sơ chào mẫu — đang pitching", status: "BIDDING" },
  ]) {
    await prisma.project.upsert({
      where: { code: p.code },
      update: {},
      create: {
        code: p.code, name: p.name, clientId: client.id,
        statusId: statusByCode[p.status], complexityId: complexityByCode.MEDIUM,
        ownerId: staffByCode["CRE-0006"], fiscalYear: new Date().getFullYear(),
      },
    });
  }

  // ── Chi phí theo giờ: quỹ lương + ma trận phân bổ (số MẪU) ──
  // ⚠ Đây là SỐ MẪU, không phải lương thật. Đừng đọc bảng chi phí để ra quyết định cho tới khi
  // nhập lương thật ở /settings/creative.
  const period = currentPeriodCode("MONTH", new Date());
  for (const s of STAFF.filter((x) => x.dept === "CREATIVE" && x.title)) {
    await prisma.creativeSalaryBudget.upsert({
      where: { positionTitle_periodCode: { positionTitle: s.title, periodCode: period } },
      update: {},
      create: { positionTitle: s.title, periodCode: period, monthlySalary: BigInt(20_000_000), note: "SỐ MẪU — thay bằng lương thật" },
    });
  }

  console.log("✅ Seed bản mini xong:", {
    roles: ROLES.length,
    permissionsInCatalog: PERMISSIONS.length,
    squads: SQUADS.length,
    staff: STAFF.length,
    taskTypes: Object.keys(taskTypeByCode).length,
    matKhauMacDinh: DEFAULT_PASSWORD,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
