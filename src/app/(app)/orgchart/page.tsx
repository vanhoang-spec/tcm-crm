import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { buildOrgChartSvg, type OrgStaffNode } from "@/lib/org-chart-svg";
import { OrgChartClient } from "./orgchart-client";

export default async function OrgChartPage() {
  const [t, staff] = await Promise.all([
    getTranslations("orgchart"),
    prisma.staff.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        title: true,
        managerId: true,
        department: { select: { code: true, name: true } },
        team: { select: { code: true } },
      },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const nodes: OrgStaffNode[] = staff.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    title: s.title,
    deptCode: s.department?.code ?? null,
    deptName: s.department?.name ?? null,
    teamCode: s.team?.code ?? null,
    managerId: s.managerId,
  }));

  const svg = buildOrgChartSvg(nodes);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>
      <OrgChartClient svg={svg} staffCount={nodes.length} />
    </div>
  );
}
