import { getTranslations, getLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { KbPanel } from "./kb-panel";

export default async function KbPage() {
  const [t, locale] = await Promise.all([getTranslations("kb"), getLocale() as Promise<Locale>]);

  const categorySet = await prisma.optionSet.findUnique({
    where: { code: "kb_category" },
    include: {
      items: {
        where: { isActive: true },
        orderBy: { sort: "asc" },
        include: {
          kbDocumentsAsCategory: {
            orderBy: { createdAt: "desc" },
            include: { uploadedBy: { select: { fullName: true } } },
          },
        },
      },
    },
  });

  const categories = (categorySet?.items ?? []).map((c) => ({
    id: c.id,
    label: pickLabel(c, locale),
    documents: c.kbDocumentsAsCategory.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      isFile: !!d.fileKey,
      fileName: d.fileName,
      fileSize: d.fileSize,
      linkUrl: d.linkUrl,
      uploadedByName: d.uploadedBy?.fullName ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <KbPanel categories={categories} />
    </div>
  );
}
