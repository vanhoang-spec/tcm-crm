import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ClientForm } from "../client-form";
import { createClient } from "../actions";

export default async function NewClientPage() {
  const [teams, industrySet, staff] = await Promise.all([
    prisma.team.findMany({ orderBy: { code: "asc" } }),
    prisma.optionSet.findUnique({
      where: { code: "industry" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
    prisma.staff.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" } }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/clients" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại danh sách
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Thêm khách hàng mới</h1>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <ClientForm
          action={createClient}
          teams={teams.map((t) => ({ id: t.id, label: `${t.code} — ${t.name}` }))}
          industries={(industrySet?.items ?? []).map((i) => ({ id: i.id, label: i.labelVi }))}
          introducers={staff.map((s) => ({ id: s.id, label: s.fullName }))}
          submitLabel="Tạo khách hàng"
        />
      </div>
    </div>
  );
}
