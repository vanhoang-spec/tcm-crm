import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { getCategoryTree } from "@/lib/inventory";
import { CategoryCreateForm, CategoryEditForm, type ParentOption } from "./category-forms";
import { requirePermission } from "@/lib/permissions";

/** Cây danh mục kho v2 (≤3 cấp) — node gốc mang ký tự đầu của mã lô, admin thêm/bớt được (spec mục I+II). */
export default async function InventoryCategoriesPage() {
  await requirePermission("inventory.item.manage");
  const t = await getTranslations("settings.inventoryCategories");

  const [tree, counts] = await Promise.all([
    getCategoryTree(true),
    prisma.inventoryItem.groupBy({ by: ["catNodeId"], where: { parentItemId: null }, _count: { _all: true } }),
  ]);
  const countByNode = new Map(counts.map((c) => [c.catNodeId, c._count._all]));
  // Node cha được chọn khi tạo con: gốc + cấp 2 còn active
  const parents: ParentOption[] = tree
    .filter((n) => n.isActive && n.depth < 2)
    .map((n) => ({ id: n.id, label: `${"— ".repeat(n.depth)}${n.depth === 0 ? `${n.code ?? "?"} · ` : ""}${n.name}` }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="space-y-1.5">
        {tree.length === 0 && <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{t("empty")}</p>}
        {tree.map((n) => (
          <details key={n.id} className="rounded-xl border border-border bg-surface" style={{ marginLeft: n.depth * 20 }}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5">
              {n.depth === 0 && <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-sm font-bold text-foreground">{n.code ?? "?"}</span>}
              <span className="text-sm font-medium text-foreground">{n.name}</span>
              {n.depth === 0 && n.isClientOwned && <Badge tone="brand">{t("clientOwnedBadge")}</Badge>}
              {(countByNode.get(n.id) ?? 0) > 0 && <Badge tone="neutral">{t("itemCount", { count: countByNode.get(n.id) ?? 0 })}</Badge>}
              {!n.isActive && <Badge tone="danger">{t("inactive")}</Badge>}
            </summary>
            <div className="border-t border-border p-2.5">
              <CategoryEditForm node={{ id: n.id, name: n.name, sort: n.sort, isActive: n.isActive }} />
            </div>
          </details>
        ))}
      </div>

      <CategoryCreateForm parents={parents} />
      <p className="text-xs text-muted-foreground">{t("immutableHint")}</p>
    </div>
  );
}
