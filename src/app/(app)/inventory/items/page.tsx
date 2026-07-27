import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getCategoryTree } from "@/lib/inventory";
import { ITEM_CONDITION_CODES, ITEM_STATUS_CODES, TCM_OWNER_SEG, expiryLevel } from "@/lib/inventory-lot";
import { ItemForm, type CategoryOption, type ClientOption, type ProjectOption } from "./item-form";
import { ImportForm } from "./import-form";
import { requirePermission } from "@/lib/permissions";

const sel = "h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9";

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

  const [items, clients, projects] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: {
        parentItemId: null,
        ...(q ? { OR: [{ code: { contains: q.toUpperCase() } }, { name: { contains: q } }] } : {}),
        ...(node ? { catNodeId: { in: subtreeIds(node) } } : {}),
        ...(status ? { statusCode: status } : {}),
        ...(cond ? { conditionCode: cond } : {}),
        ...(client ? { ownerClientId: client } : {}),
      },
      include: {
        catNode: { select: { name: true } },
        ownerClient: { select: { code: true, name: true } },
        boundProject: { select: { code: true } },
        parts: { orderBy: { partNo: "asc" } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.client.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.project.findMany({ select: { id: true, code: true, name: true }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  const categories: CategoryOption[] = tree.map((n) => ({
    id: n.id,
    name: n.name,
    depth: n.depth,
    rootCode: n.rootCode,
    isClientOwned: n.isClientOwned,
  }));
  const clientOptions: ClientOption[] = clients;
  const projectOptions: ProjectOption[] = projects;
  const clientOwnedNodeIds = new Set(tree.filter((n) => n.isClientOwned).map((n) => n.id));
  const now = new Date();

  const expiryBadge = (expiry: Date | null) => {
    const level = expiryLevel(expiry, now);
    if (!level || !expiry) return null;
    if (level === "EXPIRED") return <Badge tone="danger">{t("expiryExpired")}</Badge>;
    const days = Math.floor((Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);
    return <Badge tone={level === "RED" ? "danger" : "warning"}>{t("expiryDays", { days })}</Badge>;
  };

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
              {c} — {t(`status${c}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
        <select name="cond" defaultValue={cond ?? ""} aria-label={t("formCondition")} className={sel}>
          <option value="">{t("allConditions")}</option>
          {ITEM_CONDITION_CODES.map((c) => (
            <option key={c} value={c}>
              {c} — {t(`cond${c}` as Parameters<typeof t>[0])}
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
        {items.length === 0 && <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{t("empty")}</p>}
        {items.map((it) => (
          <details key={it.id} className="rounded-xl border border-border bg-surface">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3">
              <span className="font-mono text-xs font-semibold text-foreground">{it.code}</span>
              <span className="flex-1 text-sm font-medium text-foreground">{it.name}</span>
              {it.statusCode && <Badge tone={it.statusCode === "R" ? "success" : it.statusCode === "L" || it.statusCode === "D" ? "danger" : "neutral"}>{t(`status${it.statusCode}` as Parameters<typeof t>[0])}</Badge>}
              {it.conditionCode && <Badge tone="neutral">{t(`cond${it.conditionCode}` as Parameters<typeof t>[0])}</Badge>}
              {it.ownerClient && <Badge tone="brand">{it.ownerClient.code}</Badge>}
              {it.boundProject && <Badge tone="brand">{it.boundProject.code}</Badge>}
              {expiryBadge(it.expiryDate)}
              {it.partCount > 1 && <Badge tone="neutral">{t("colParts")}: {it.partCount}</Badge>}
              {it.catNode && <Badge tone="neutral">{it.catNode.name}</Badge>}
              {!it.isActive && <Badge tone="danger">{t("inactive")}</Badge>}
            </summary>
            <div className="border-t border-border p-3">
              {it.clientDocNo && (
                <p className="mb-2 text-xs text-muted-foreground">
                  {t("formClientDocNo")}: <span className="font-mono">{it.clientDocNo}</span>
                  {it.expiryDate ? ` · ${t("formExpiry")}: ${formatDate(it.expiryDate)}` : ""}
                </p>
              )}
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
                clients={clientOptions}
                projects={projectOptions}
                item={{
                  id: it.id,
                  code: it.code,
                  name: it.name,
                  unit: it.unit,
                  isReusable: it.isReusable,
                  partCount: it.partCount,
                  isActive: it.isActive,
                  note: it.note,
                  statusCode: it.statusCode,
                  conditionCode: it.conditionCode,
                  catNodeName: it.catNode?.name ?? null,
                  clientLabel: it.ownerClient ? `${it.ownerClient.code} — ${it.ownerClient.name}` : null,
                  expiryDate: it.expiryDate ? it.expiryDate.toISOString().slice(0, 10) : null,
                  clientDocNo: it.clientDocNo,
                  showExpiry: it.catNodeId ? clientOwnedNodeIds.has(it.catNodeId) : false,
                }}
              />
            </div>
          </details>
        ))}
      </div>

      <ItemForm categories={categories} clients={clientOptions} projects={projectOptions} />
      <ImportForm />
      <p className="text-xs text-muted-foreground">{t("statusLegend", { tcm: TCM_OWNER_SEG })}</p>
    </div>
  );
}
