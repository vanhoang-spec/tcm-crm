import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

  // ── OptionSet: industry ──
  const industrySet = await prisma.optionSet.upsert({
    where: { code: "industry" },
    update: {},
    create: { code: "industry", name: "Ngành hàng" },
  });
  const industries = [
    { code: "PHARMA", labelVi: "Dược phẩm", labelEn: "Pharma" },
    { code: "FMCG", labelVi: "Hàng tiêu dùng nhanh", labelEn: "FMCG" },
    { code: "RETAIL", labelVi: "Bán lẻ", labelEn: "Retail" },
    { code: "BEVERAGE", labelVi: "Đồ uống", labelEn: "Beverage" },
    { code: "OTHER", labelVi: "Khác", labelEn: "Other" },
  ];
  const industryItems: Record<string, string> = {};
  for (const [i, it] of industries.entries()) {
    const created = await prisma.optionItem.upsert({
      where: { setId_code: { setId: industrySet.id, code: it.code } },
      update: {},
      create: { setId: industrySet.id, code: it.code, labelVi: it.labelVi, labelEn: it.labelEn, sort: i },
    });
    industryItems[it.code] = created.id;
  }

  // ── Clients mẫu (theo KB — bỏ số liệu tài chính cụ thể) ──
  const clientsSeed = [
    {
      code: "DHG",
      name: "Dược Hậu Giang",
      industry: "PHARMA",
      ownerTeamId: a1.id,
      introducerId: thao.id,
      paymentTermDays: 90,
      contact: { name: "Nguyễn Văn A", title: "Brand Manager", phone: "0901111111", email: "a.nguyen@dhg.com.vn" },
    },
    {
      code: "DIAGEO",
      name: "Diageo Việt Nam",
      industry: "BEVERAGE",
      ownerTeamId: a2.id,
      introducerId: yen.id,
      paymentTermDays: 120,
      contact: { name: "Trần Thị B", title: "Marketing Manager", phone: "0902222222", email: "b.tran@diageo.com" },
    },
    {
      code: "LOF",
      name: "LOF Vietnam",
      industry: "FMCG",
      ownerTeamId: a3.id,
      introducerId: ha.id,
      paymentTermDays: 90,
      contact: { name: "Lê Văn C", title: "Trade Marketing Lead", phone: "0903333333", email: "c.le@lof.vn" },
    },
    {
      code: "CTL",
      name: "Castrol Việt Nam",
      industry: "RETAIL",
      ownerTeamId: a1.id,
      introducerId: thao.id,
      paymentTermDays: 90,
      contact: { name: "Phạm Thị D", title: "Trưởng phòng thu mua", phone: "0904444444", email: "d.pham@castrol.com" },
    },
  ];

  for (const c of clientsSeed) {
    const client = await prisma.client.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        name: c.name,
        industryId: industryItems[c.industry],
        ownerTeamId: c.ownerTeamId,
        introducerId: c.introducerId,
        paymentTermDays: c.paymentTermDays,
        isNew: false,
      },
    });
    const existingContact = await prisma.contact.findFirst({ where: { clientId: client.id } });
    if (!existingContact) {
      await prisma.contact.create({
        data: { clientId: client.id, ...c.contact, isPrimary: true },
      });
    }
  }

  console.log("✅ Seed hoàn tất:", {
    teams: [a1.code, a2.code, a3.code],
    staff: [ceo.email, thao.email, yen.email, ha.email],
    clients: clientsSeed.map((c) => c.code),
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
