import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getCategoryTree } from "@/lib/inventory";
import { ITEM_CONDITION_CODES, ITEM_STATUS_CODES, expiryLevel } from "@/lib/inventory-lot";
import { ItemForm, LotEditForm, ProductEditForm, type CategoryOption, type ClientOption, type ProductOption, type ProjectOption } from "./item-form";
import { ImportForm } from "./import-form";
import { requirePermission } from "@/lib/permissions";

const sel = "h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9";

/**
 * Danh mục mặt hàng (mã lô v3): SẢN PHẨM là hàng chính (PO-0042 · Bàn gỗ 1m2), các LÔ của nó (PO-0042.01,
 * .02…) xếp bên dưới. Bộ lọc trạng thái/tình trạng/khách áp lên LÔ — sản phẩm không còn lô nào khớp thì ẩn.
 */
export default async function InventoryItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; node?: string; status?: string; cond?: string; client?: string }>;
}) {
  await requirePermission("inventory.view");
  const { q, node, status, cond, client } = await searchParams;
  const t = await getTranslations("inventory.items");

  const tree = await getCategoryTree();
  // Lọc theo node = cả nhánh con (chọn "POSM" thấy luôn Booth/Kệ/Cổng chào)
  const subtreeIds = (rootId: string): string[] => {
    const ids = [rootId];
    for (let i = 0; i < ids.length; i++) {
      for (const n of tree) if (n.parentId === ids[i]) ids.push(n.id);
    }
    return ids;
  };
  const lotFilter = {
    parentItemId: null,
    ...(status ? { statusCode: status } : {}),
    ...(cond ? { conditionCode: cond } : {}),
    ...(client ? { ownerClientId: client } : {}),
  };
  const lotFiltered = !!(status || cond || client);

  const [products, clients, projects] = await Promise.all([
    prisma.inventoryProduct.findMany({
      where: {
        ...(q ? { OR: [{ code: { contains: q.toUpperCase() } }, { name: { contains: q } }] } : {}),
        ...(node ? { catNodeId: { in: subtreeIds(node) } } : {}),
        ...(lotFiltered ? { lots: { some: lotFilter } } : {}),
      },
      include: {
        catNode: { select: { name: true } },
        lots: {
          where: lotFilter,
          include: {
            ownerClient: { select: { code: true, name: true } },
            boundProject: { select: { code: true } },
            parts: { orderBy: { partNo: "asc" } },
            balances: { select: { quantity: true } },
          },
          orderBy: { seq: "asc" },
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.client.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.project.findMany({ select: { id: true, code: true, name: true }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  // Ô chọn "sản phẩm có sẵn" của form tạo lô cần MỌI sản phẩm đang hoạt động, không theo bộ lọc của trang.
  const activeProducts = await prisma.inventoryProduct.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, unit: true, partCount: true, catNodeId: true, lots: { where: { parentItemId: null }, select: { seq: true }, orderBy: { seq: "desc" }, take: 1 } },
    orderBy: { code: "asc" },
  });

  const categories: CategoryOption[] = tree.map((n) => ({ id: n.id, name: n.name, depth: n.depth, rootCode: n.rootCode, isClientOwned: n.isClientOwned }));
  const nodeById = new Map(tree.map((n) => [n.id, n]));
  const productOptions: ProductOption[] = activeProducts.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    partCount: p.partCount,
    rootCode: nodeById.get(p.catNodeId)?.rootCode ?? null,
    isClientOwned: nodeById.get(p.catNodeId)?.isClientOwned ?? false,
    nextLotSeq: (p.lots[0]?.seq ?? 0) + 1,
  }));
  const clientOptions: ClientOption[] = clients;
  const projectOptions: ProjectOption[] = projects;
  const now = new Date();

  const expiryBadge = (expiry: Date | null) => {
    const level = expiryLevel(expiry, now);
    if (!level || !expiry) return null;
    if (level === "EXPIRED") return <Badge tone="danger">{t("expiryExpired")}</Badge>;
    const days = Math.floor((Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);
    return <Badge tone={level === "RED" ? "danger" : "warning"}>{t("expiryDays", { days })}</Badge>;
  };
  const stockOf = (lot: { balances: { quantity: number }[] }) => lot.balances.reduce((s, b) => s + b.quantity, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <form className="flex flex-wrap gap-2" action="/inventory/items" method="get">
        <input name="q" defaultValue={q ?? ""} placeholder={t("searchPlaceholder")} className={sel + " flex-1 sm:max-w-xs"} />
        <select name="node" defaultValue={node ?? ""} aria-label={t("formCategory")} className={sel}>
          <option value="">{t("allCategories")}</option>
          {tree.map((n) => (
            <option key={n.id} value={n.id}>
              {`${"  ".repeat(n.depth)}${n.depth > 0 ? "· " : `${n.rootCode ?? "?"} — `}${n.name}`}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} aria-label={t("formStatus")} className={sel}>
          <option value="">{t("allStatuses")}</option>
          {ITEM_STATUS_CODES.map((c) => (
            <option key={c} value={c}>
              {t(`status${c}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
        <select name="cond" defaultValue={cond ?? ""} aria-label={t("formCondition")} className={sel}>
          <option value="">{t("allConditions")}</option>
          {ITEM_CONDITION_CODES.map((c) => (
            <option key={c} value={c}>
              {t(`cond${c}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
        <select name="client" defaultValue={client ?? ""} aria-label={t("formClient")} className={sel}>
          <option value="">{t("allClients")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <button type="submit" className="h-11 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white sm:h-9">
          OK
        </button>
      </form>

      <div className="space-y-2">
        {products.length === 0 && <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{t("empty")}</p>}
        {products.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-surface">
            {/* ── Hàng SẢN PHẨM ── */}
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3">
                <span className="font-mono text-sm font-bold text-foreground">{p.code}</span>
                <span className="flex-1 text-sm font-semibold text-foreground">{p.name}</span>
                {p.unit && <span className="text-xs text-muted-foreground">{p.unit}</span>}
                {p.catNode && <Badge tone="neutral">{p.catNode.name}</Badge>}
                {p.partCount > 1 && <Badge tone="neutral">{t("colParts")}: {p.partCount}</Badge>}
                {!p.isReusable && <Badge tone="neutral">{t("singleUse")}</Badge>}
                <Badge tone="brand">{t("lotCount", { n: p.lots.length })}</Badge>
                {!p.isActive && <Badge tone="danger">{t("inactive")}</Badge>}
              </summary>
              <div className="border-t border-border p-3">
                <ProductEditForm
                  product={{ id: p.id, code: p.code, name: p.name, unit: p.unit, isReusable: p.isReusable, partCount: p.partCount, isActive: p.isActive, note: p.note, catNodeName: p.catNode?.name ?? null }}
                />
              </div>
            </details>
            {/* ── Các LÔ của sản phẩm ── */}
            {p.lots.length > 0 && (
              <div className="divide-y divide-border border-t border-border">
                {p.lots.map((it) => (
                  <details key={it.id} className="bg-surface-2/30">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 py-2 pl-7 pr-3">
                      <span className="font-mono text-xs font-semibold text-foreground">{it.code}</span>
                      {it.statusCode && <Badge tone={it.statusCode === "R" ? "success" : it.statusCode === "L" || it.statusCode === "D" ? "danger" : "neutral"}>{t(`status${it.statusCode}` as Parameters<typeof t>[0])}</Badge>}
                      {it.conditionCode && <Badge tone="neutral">{t(`cond${it.conditionCode}` as Parameters<typeof t>[0])}</Badge>}
                      {it.ownerClient && <Badge tone="brand">{it.ownerClient.code}</Badge>}
                      {it.boundProject && <Badge tone="brand">{it.boundProject.code}</Badge>}
                      {expiryBadge(it.expiryDate)}
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {t("stockQty", { n: it.parts.length ? "—" : stockOf(it) })}
                      </span>
                      {!it.isActive && <Badge tone="danger">{t("inactive")}</Badge>}
                    </summary>
                    <div className="border-t border-border p-3 pl-7">
                      {it.clientDocNo && (
                        <p className="mb-2 text-xs text-muted-foreground">
                          {t("formClientDocNo")}: <span className="font-mono">{it.clientDocNo}</span>
                          {it.expiryDate ? ` · ${t("formExpiry")}: ${formatDate(it.expiryDate)}` : ""}
                        </p>
                      )}
                      {it.parts.length > 0 && (
                        <ul className="mb-3 space-y-1">
                          {it.parts.map((part) => (
                            <li key={part.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">{part.code}</span>
                              <span>{part.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <LotEditForm
                        item={{
                          id: it.id,
                          code: it.code,
                          productCode: p.code,
                          name: it.name,
                          isActive: it.isActive,
                          note: it.note,
                          statusCode: it.statusCode,
                          conditionCode: it.conditionCode,
                          clientLabel: it.ownerClient ? `${it.ownerClient.code} — ${it.ownerClient.name}` : null,
                          boundProjectCode: it.boundProject?.code ?? null,
                          expiryDate: it.expiryDate ? it.expiryDate.toISOString().slice(0, 10) : null,
                          clientDocNo: it.clientDocNo,
                          showExpiry: nodeById.get(p.catNodeId)?.isClientOwned ?? false,
                        }}
                      />
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <ItemForm categories={categories} clients={clientOptions} projects={projectOptions} products={productOptions} />
      <ImportForm />
      <p className="text-xs text-muted-foreground">{t("statusLegend")}</p>
    </div>
  );
}
