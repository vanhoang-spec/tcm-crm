import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { TeamFilterTabs } from "./team-filter-tabs";
import { ConcentrationBanner } from "./concentration-banner";

const TEAM_TONE: Record<string, "brand" | "success" | "warning"> = {
  A1: "brand",
  A2: "success",
  A3: "warning",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; q?: string }>;
}) {
  const { team, q } = await searchParams;

  const [teams, clients] = await Promise.all([
    prisma.team.findMany({ orderBy: { code: "asc" } }),
    prisma.client.findMany({
      where: {
        isActive: true,
        ownerTeamId: team ? (await prisma.team.findUnique({ where: { code: team } }))?.id : undefined,
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { code: { contains: q } },
                { brand: { contains: q } },
              ],
            }
          : {}),
      },
      include: {
        ownerTeam: true,
        industry: true,
        _count: { select: { contacts: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Cảnh báo tập trung khách hàng (FR-11) — bật đủ khi có dữ liệu doanh thu từ module ④ Chi phí.
  const concentrationReady = false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Khách hàng</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Danh sách khách hàng theo team phụ trách — mỗi team chỉ thấy khách của mình, trừ vai trò CEO/Admin.
          </p>
        </div>
        <LinkButton href="/clients/new">
          <Plus className="h-4 w-4" />
          Thêm khách hàng
        </LinkButton>
      </div>

      {!concentrationReady && <ConcentrationBanner />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TeamFilterTabs teams={teams} activeCode={team} />
        <form className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, mã, brand..."
            className="h-9 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {team && <input type="hidden" name="team" value={team} />}
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Mã</th>
              <th className="px-4 py-3">Khách hàng</th>
              <th className="px-4 py-3">Ngành hàng</th>
              <th className="px-4 py-3">Team phụ trách</th>
              <th className="px-4 py-3">Payment term</th>
              <th className="px-4 py-3">Liên hệ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2/60">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-muted-foreground">
                  {c.code}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/clients/${c.id}`} className="font-medium text-foreground hover:text-brand-600">
                    {c.name}
                  </Link>
                  {c.brand && <div className="text-xs text-muted-foreground">{c.brand}</div>}
                </td>
                <td className="px-4 py-3">
                  {c.industry ? (
                    <Badge tone="neutral">{c.industry.labelVi}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TEAM_TONE[c.ownerTeam.code] ?? "neutral"}>{c.ownerTeam.code}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.paymentTermDays} ngày</td>
                <td className="px-4 py-3 text-muted-foreground">{c._count.contacts}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/clients/${c.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                    Xem chi tiết →
                  </Link>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Không có khách hàng nào khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
