import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

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
  const departments = [
    { code: "ACCOUNT", name: "Account" },
    { code: "PLANNING", name: "Planning" },
    { code: "CREATIVE", name: "Creative / Thiết kế" },
    { code: "OPE", name: "Operation" },
    { code: "PRO", name: "Production" },
    { code: "PCC", name: "Purchasing" },
    { code: "FIN", name: "Kế toán / Tài chính" },
    { code: "HR", name: "HR" },
    { code: "IT", name: "IT / Hệ thống" },
    { code: "CEO", name: "Ban điều hành" },
  ];
  for (const d of departments) {
    await prisma.department.upsert({ where: { code: d.code }, update: {}, create: d });
  }
  const accountDept = await prisma.department.findUniqueOrThrow({ where: { code: "ACCOUNT" } });
  const ceoDept = await prisma.department.findUniqueOrThrow({ where: { code: "CEO" } });

  // ── Staff (PIC mẫu) ──
  const ceo = await prisma.staff.upsert({
    where: { email: "ceo@tcm.vn" },
    update: {},
    create: { fullName: "CEO TCM", email: "ceo@tcm.vn", departmentId: ceoDept.id, title: "CEO" },
  });
  const thao = await prisma.staff.upsert({
    where: { email: "thao@tcm.vn" },
    update: {},
    create: {
      fullName: "Thảo (Account)",
      email: "thao@tcm.vn",
      departmentId: accountDept.id,
      teamId: a1.id,
      title: "Account Manager",
    },
  });
  const yen = await prisma.staff.upsert({
    where: { email: "yen@tcm.vn" },
    update: {},
    create: {
      fullName: "Yến (Account)",
      email: "yen@tcm.vn",
      departmentId: accountDept.id,
      teamId: a2.id,
      title: "Account Manager",
    },
  });
  const ha = await prisma.staff.upsert({
    where: { email: "ha@tcm.vn" },
    update: {},
    create: {
      fullName: "Hà (Account)",
      email: "ha@tcm.vn",
      departmentId: accountDept.id,
      teamId: a3.id,
      title: "Account Manager",
    },
  });
  const bdDirector = await prisma.staff.upsert({
    where: { email: "bd@tcm.vn" },
    update: {},
    create: { fullName: "BD Director TCM", email: "bd@tcm.vn", departmentId: ceoDept.id, title: "BD Director" },
  });

  // ── Nhân sự các phòng ban nhận Order (Planning/Creative/Purchasing/Operation/Production) ──
  const orderDepartments: { code: string; title: string }[] = [
    { code: "PLANNING", title: "Planning Lead" },
    { code: "CREATIVE", title: "Creative Lead" },
    { code: "PCC", title: "Purchasing Lead" },
    { code: "OPE", title: "Operation Lead" },
    { code: "PRO", title: "Production Lead" },
  ];
  const orderLeadByCode: Record<string, { id: string }> = {};
  for (const d of orderDepartments) {
    const dept = await prisma.department.findUniqueOrThrow({ where: { code: d.code } });
    orderLeadByCode[d.code] = await prisma.staff.upsert({
      where: { email: `${d.code.toLowerCase()}@tcm.vn` },
      update: {},
      create: { fullName: d.title, email: `${d.code.toLowerCase()}@tcm.vn`, departmentId: dept.id, title: d.title },
    });
  }

  // ── Nhân sự HR + IT (để test Project Team đa phòng ban ở module ③) ──
  const hrDept = await prisma.department.findUniqueOrThrow({ where: { code: "HR" } });
  const itDept = await prisma.department.findUniqueOrThrow({ where: { code: "IT" } });
  const hrStaff = await prisma.staff.upsert({
    where: { email: "hr@tcm.vn" },
    update: {},
    create: { fullName: "HR Lead", email: "hr@tcm.vn", departmentId: hrDept.id, title: "HR Lead" },
  });
  const itStaff = await prisma.staff.upsert({
    where: { email: "it@tcm.vn" },
    update: {},
    create: { fullName: "IT Support", email: "it@tcm.vn", departmentId: itDept.id, title: "IT Support" },
  });

  // ── Nhân sự team Creative (Creative Lead = CD; + designers để Dashboard per-member có dữ liệu) ──
  const creativeDept = await prisma.department.findUniqueOrThrow({ where: { code: "CREATIVE" } });
  const creativeLead = await prisma.staff.findUniqueOrThrow({ where: { email: "creative@tcm.vn" } });
  const seniorDesigner = await prisma.staff.upsert({
    where: { email: "designer1@tcm.vn" },
    update: {},
    create: { fullName: "Minh (Senior Designer)", email: "designer1@tcm.vn", departmentId: creativeDept.id, title: "Senior Designer" },
  });
  const artist3d = await prisma.staff.upsert({
    where: { email: "designer2@tcm.vn" },
    update: {},
    create: { fullName: "Long (3D Artist)", email: "designer2@tcm.vn", departmentId: creativeDept.id, title: "3D Artist" },
  });

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

  // ── Vài project mẫu (các trạng thái khác nhau) ──
  const clientsForProj = await prisma.client.findMany({ where: { code: { in: ["DHG", "DIA", "LOF", "CTL"] } } });
  const byCode: Record<string, (typeof clientsForProj)[number]> = Object.fromEntries(
    clientsForProj.map((c) => [c.code, c]),
  );
  const projSeed = [
    { code: "T001DHG26A1", name: "Roadshow DHG Q3", clientCode: "DHG", teamId: a1.id as string | null, ownerId: thao.id, status: "BIDDING", complexity: "COMPLEX", type: "CAMPAIGN", goNogo: "GO" as string | null },
    { code: "T002DIA26A2", name: "Activation Diageo Tết", clientCode: "DIA", teamId: a2.id as string | null, ownerId: yen.id, status: "PROCESSING", complexity: "SIMPLE", type: "CAMPAIGN", goNogo: null },
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
          departmentCode: "PRO",
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

  console.log("✅ Seed hoàn tất:", {
    teams: [a1.code, a2.code, a3.code],
    staff: [ceo.email, thao.email, yen.email, ha.email],
    brands: brandNames,
    clients: clientsSeed.map((c) => c.code),
    optionSets: ["project_type", "contract_type", "fail_reason", "channel", "client_status", "client_classification", "complexity", "project_status"],
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
