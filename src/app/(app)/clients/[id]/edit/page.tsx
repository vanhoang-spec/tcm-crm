import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { ClientForm } from "../../client-form";
import { updateClient } from "../../actions";
import { OTHER_INTRODUCER } from "@/lib/validators/client";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id }, include: { brand: true } });
  if (!client) notFound();

  const [teams, industrySet, statusSet, classificationSet, staff, brands, t, locale] = await Promise.all([
    prisma.team.findMany({
      where: { OR: [{ isActive: true }, ...(client.ownerTeamId ? [{ id: client.ownerTeamId }] : [])] },
      orderBy: { code: "asc" },
    }),
    prisma.optionSet.findUnique({
      where: { code: "industry" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
    prisma.optionSet.findUnique({
      where: { code: "client_status" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
    prisma.optionSet.findUnique({
      where: { code: "client_classification" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
    prisma.staff.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    getTranslations("clients.edit"),
    getLocale() as Promise<Locale>,
  ]);

  const updateWithId = updateClient.bind(null, client.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href={`/clients/${client.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToDetail")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title", { name: client.name })}</h1>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <ClientForm
          action={updateWithId}
          mode="edit"
          teams={teams.map((tm) => ({ id: tm.id, label: `${tm.code} — ${tm.name}` }))}
          industries={(industrySet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))}
          statuses={(statusSet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))}
          classifications={(classificationSet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))}
          introducers={staff.map((s) => ({ id: s.id, label: s.fullName }))}
          brands={brands.map((b) => b.name)}
          defaultValues={{
            code: client.code,
            name: client.name,
            taxCode: client.taxCode ?? undefined,
            brandName: client.brand.name,
            industryId: client.industryId ?? undefined,
            statusId: client.statusId,
            classificationId: client.classificationId ?? undefined,
            ownerTeamId: client.ownerTeamId ?? undefined,
            introducerId: client.introducerId ?? OTHER_INTRODUCER,
            isNew: client.isNew,
            paymentTermDays: client.paymentTermDays,
            address: client.address ?? undefined,
            phone: client.phone ?? undefined,
            email: client.email ?? undefined,
            bankAccount: client.bankAccount ?? undefined,
            note: client.note ?? undefined,
          }}
          submitLabel={t("submit")}
        />
      </div>
    </div>
  );
}
