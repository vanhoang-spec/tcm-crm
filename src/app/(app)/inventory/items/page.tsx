import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { ItemForm, type CategoryOption } from "./item-form";
import { ImportForm } from "./import-form";

export default async function InventoryItemsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [t, locale] = await Promise.all([getTranslations("inventory.items"), getLocale() as Promise<Locale>]);

  const [items, categorySet] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: {
        parentItemId: null,
        ...(q ? { OR: [{ code: { contains: q.toUpperCase() } }, { name: { contains: q } }] } : {}),
      },
      include: { category: true, parts: { orderBy: { partNo: "asc" } } },
      orderBy: { code: "asc" },
    }),
    prisma.optionSet.findUnique({
      where: { code: "inventory_category" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
  ]);
  const categories: CategoryOption[] = (categorySet?.items ?? []).map((c) => ({ id: c.id, label: pickLabel(c, locale) }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <form className="flex gap-2" action="/inventory/items" method="get">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("searchPlaceholder")}
          className="h-11 flex-1 rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9 sm:max-w-xs"
        />
        <button type="submit" className="h-11 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white sm:h-9">
          OK
        </button>
      </form>

      <div className="space-y-2">
        {items.length === 0 && <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{t("empty")}</p>}
        {items.map((it) => (
          <details key={it.id} className="rounded-xl border border-border bg-surface">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3">
              <span className="font-mono text-xs text-muted-foreground">{it.code}</span>
              <span className="flex-1 text-sm font-medium text-foreground">{it.name}</span>
              {it.partCount > 1 && <Badge tone="brand">{t("colParts")}: {it.partCount}</Badge>}
              <Badge tone={it.isReusable ? "success" : "neutral"}>
                {it.isReusable ? t("colReusable") + ": ✓" : t("colReusable") + ": 1×"}
              </Badge>
              {it.category && <Badge tone="neutral">{pickLabel(it.category, locale)}</Badge>}
              {!it.isActive && <Badge tone="danger">{t("inactive")}</Badge>}
            </summary>
            <div className="border-t border-border p-3">
              {it.parts.length > 0 && (
                <ul className="mb-3 space-y-1">
                  {it.parts.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{p.code}</span>
                      <span>{p.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              <ItemForm
                categories={categories}
                item={{
                  id: it.id,
                  code: it.code,
                  name: it.name,
                  categoryId: it.categoryId,
                  unit: it.unit,
                  isReusable: it.isReusable,
                  partCount: it.partCount,
                  isActive: it.isActive,
                  note: it.note,
                }}
              />
            </div>
          </details>
        ))}
      </div>

      <ItemForm categories={categories} />
      <ImportForm />
    </div>
  );
}
