import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { NewPostForm } from "./new-post-form";

export default async function NewMktPostPage() {
  await requirePermission("mkt.post.manage");
  const [t, locale, types, projects] = await Promise.all([
    getTranslations("mkt"),
    getLocale() as Promise<Locale>,
    prisma.optionItem.findMany({
      where: { isActive: true, set: { code: "mkt_content_type" } },
      orderBy: { sort: "asc" },
      select: { id: true, labelVi: true, labelEn: true },
    }),
    prisma.project.findMany({
      orderBy: { code: "desc" },
      select: { id: true, code: true, name: true, client: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-3">
      <Link href="/mkt" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("navPosts")}
      </Link>
      <h2 className="text-lg font-semibold text-foreground">{t("formTitle")}</h2>
      <NewPostForm
        contentTypes={types.map((x) => ({ value: x.id, label: pickLabel(x, locale) }))}
        projects={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}`, sublabel: p.client?.name }))}
      />
    </div>
  );
}
