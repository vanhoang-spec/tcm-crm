import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ClientForm } from "../../client-form";
import { updateClient } from "../../actions";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [client, teams, industrySet, staff] = await Promise.all([
    prisma.client.findUnique({ where: { id } }),
    prisma.team.findMany({ orderBy: { code: "asc" } }),
    prisma.optionSet.findUnique({
      where: { code: "industry" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
    prisma.staff.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" } }),
  ]);

  if (!client) notFound();

  const updateWithId = updateClient.bind(null, client.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href={`/clients/${client.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại chi tiết khách hàng
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Sửa thông tin: {client.name}</h1>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <ClientForm
          action={updateWithId}
          teams={teams.map((t) => ({ id: t.id, label: `${t.code} — ${t.name}` }))}
          industries={(industrySet?.items ?? []).map((i) => ({ id: i.id, label: i.labelVi }))}
          introducers={staff.map((s) => ({ id: s.id, label: s.fullName }))}
          defaultValues={{
            code: client.code,
            name: client.name,
            brand: client.brand ?? undefined,
            industryId: client.industryId ?? undefined,
            ownerTeamId: client.ownerTeamId,
            introducerId: client.introducerId ?? undefined,
            isNew: client.isNew,
            paymentTermDays: client.paymentTermDays,
            address: client.address ?? undefined,
            phone: client.phone ?? undefined,
            email: client.email ?? undefined,
            note: client.note ?? undefined,
          }}
          submitLabel="Lưu thay đổi"
        />
      </div>
    </div>
  );
}
