import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { ClientForm } from "../client-form";
import { createClient } from "../actions";
import { requirePermission } from "@/lib/permissions";

export default async function NewClientPage() {
  await requirePermission("clients.view");
  const [teams, industrySet, statusSet, classificationSet, staff, brands, t, locale] = await Promise.all([
    prisma.team.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
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
    getTranslations("clients.new"),
    getLocale() as Promise<Locale>,
  ]);
  const potentialStatus = statusSet?.items.find((i) => i.code === "POTENTIAL");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/clients" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <ClientForm
          action={createClient}
          mode="create"
          teams={teams.map((tm) => ({ id: tm.id, label: `${tm.code} — ${tm.name}` }))}
          industries={(industrySet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))}
          statuses={(statusSet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))}
          classifications={(classificationSet?.items ?? []).map((i) => ({ id: i.id, label: pickLabel(i, locale) }))}
          potentialStatusId={potentialStatus?.id}
          introducers={staff.map((s) => ({ id: s.id, label: s.fullName }))}
          brands={brands.map((b) => b.name)}
          submitLabel={t("submit")}
        />
      </div>
    </div>
  );
}
