import { Fragment } from "react";
import Link from "next/link";
import { ArrowLeftRight, PackageOpen, Undo2, Inbox } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { pickLabel, formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { getStockOverview, getProjectHoldings, getInTransitQuantities } from "@/lib/inventory";
import { requirePermission } from "@/lib/permissions";

export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams: Promise<{ wh?: string; cat?: string; q?: string }>;
}) {
  await requirePermission("inventory.view");
  const { wh, cat, q } = await searchParams;
  const [t, locale] = await Promise.all([getTranslations("inventory.stock"), getLocale() as Promise<Locale>]);

  const [warehouses, categorySet, pendingCount] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: [{ isMain: "desc" }, { code: "asc" }] }),
    prisma.optionSet.findUnique({
      where: { code: "inventory_category" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
    prisma.stockDocument.count({ where: { type: "TRANSFER", status: "PENDING" } }),
  ]);
  const [rows, holdings, inTransit] = await Promise.all([
    getStockOverview({ warehouseId: wh || undefined, categoryId: cat || undefined, q }),
    getProjectHoldings(),
    getInTransitQuantities(),
  ]);
  const inTransitTotal = Array.from(inTransit.values()).reduce((s, v) => s + v, 0);

  const quickActions = [
    { href: "/inventory/documents/new/transfer", icon: ArrowLeftRight, label: t("quickTransfer"), badge: 0 },
    { href: "/inventory/documents/new/issue", icon: PackageOpen, label: t("quickIssue"), badge: 0 },
    { href: "/inventory/documents/new/return", icon: Undo2, label: t("quickReturn"), badge: 0 },
    { href: "/inventory/documents", icon: Inbox, label: t("quickReceive"), badge: pendingCount },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Quick actions — thao tác chính cho nhân viên hiện trường dùng điện thoại */}
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        {quickActions.map((a) => (
          <Link
            key={a.href + a.label}
            href={a.href}
            className="relative flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-semibold text-foreground active:bg-surface-2"
          >
            <a.icon className="h-4 w-4 text-brand-600" />
            {a.label}
            {a.badge > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                {a.badge}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Filters */}
      <form className="flex flex-col gap-2 sm:flex-row sm:items-center" action="/inventory" method="get">
        <select
          name="wh"
          defaultValue={wh ?? ""}
          aria-label={t("filterWarehouse")}
          className="h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9"
        >
          <option value="">{t("allWarehouses")}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          name="cat"
          defaultValue={cat ?? ""}
          aria-label={t("filterCategory")}
          className="h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9"
        >
          <option value="">{t("allCategories")}</option>
          {(categorySet?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {pickLabel(c, locale)}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("searchPlaceholder")}
          className="h-11 flex-1 rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9"
        />
        <button type="submit" className="h-11 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white sm:h-9">
          OK
        </button>
      </form>

      {inTransitTotal > 0 && (
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("inTransitTitle")}: {formatNumber(inTransitTotal, locale)}</span>{" "}
          — {t("inTransitHint")}
        </div>
      )}

      {/* Mobile card list */}
      <ul className="space-y-2 sm:hidden">
        {rows.length === 0 && <li className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{t("empty")}</li>}
        {rows.map((r) => (
          <li key={r.itemId} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{r.code}</p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-foreground">
                  {r.isSet ? t("completeSets", { count: r.quantity }) : formatNumber(r.quantity, locale)}
                </p>
                {r.unit && !r.isSet && <p className="text-xs text-muted-foreground">{r.unit}</p>}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {r.isSet && <Badge tone="brand">{t("setBadge", { count: r.parts.length })}</Badge>}
              <Badge tone={r.isReusable ? "success" : "neutral"}>{r.isReusable ? t("reusableYes") : t("reusableNo")}</Badge>
              {r.categoryLabelVi && (
                <Badge tone="neutral">{locale === "en" && r.categoryLabelEn ? r.categoryLabelEn : r.categoryLabelVi}</Badge>
              )}
            </div>
            {r.isSet && (
              <ul className="mt-2 space-y-1 border-t border-border pt-2">
                {r.parts.map((p) => (
                  <li key={p.itemId} className="flex justify-between text-xs text-muted-foreground">
                    <span className="font-mono">{p.code}</span>
                    <span className="font-semibold text-foreground">{formatNumber(p.quantity, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden rounded-xl border border-border bg-surface sm:block">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">{t("colItem")}</th>
                <th className="px-4 py-2.5">{t("colCategory")}</th>
                <th className="px-4 py-2.5">{t("colUnit")}</th>
                <th className="px-4 py-2.5">{t("colReusable")}</th>
                <th className="px-4 py-2.5 text-right">{t("colQty")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <Fragment key={r.itemId}>
                  <tr className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">
                        {r.name} {r.isSet && <Badge tone="brand">{t("setBadge", { count: r.parts.length })}</Badge>}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{r.code}</p>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.categoryLabelVi ? (locale === "en" && r.categoryLabelEn ? r.categoryLabelEn : r.categoryLabelVi) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.unit ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={r.isReusable ? "success" : "neutral"}>{r.isReusable ? t("reusableYes") : t("reusableNo")}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                      {r.isSet ? t("completeSets", { count: r.quantity }) : formatNumber(r.quantity, locale)}
                    </td>
                  </tr>
                  {r.isSet &&
                    r.parts.map((p) => (
                      <tr key={p.itemId} className="border-b border-border bg-surface-2/50 last:border-0">
                        <td className="px-4 py-1.5 pl-8">
                          <span className="font-mono text-xs text-muted-foreground">{p.code}</span>{" "}
                          <span className="text-xs text-muted-foreground">{p.name}</span>
                        </td>
                        <td colSpan={3} />
                        <td className="px-4 py-1.5 text-right text-xs font-medium text-foreground">{formatNumber(p.quantity, locale)}</td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Đồ đang ở hiện trường */}
      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("holdingsTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("holdingsHint")}</p>
        </div>
        {holdings.length === 0 ? (
          <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{t("holdingsEmpty")}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {holdings.map((h) => (
              <Link
                key={h.projectId}
                href={`/inventory/documents?project=${h.projectId}`}
                className="rounded-xl border border-border bg-surface p-3 hover:bg-surface-2"
              >
                <p className="text-sm font-semibold text-foreground">{h.projectName}</p>
                <p className="font-mono text-xs text-muted-foreground">{h.projectCode}</p>
                <ul className="mt-2 space-y-1">
                  {h.items.map((it) => (
                    <li key={it.itemId} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {it.name} <span className="font-mono">({it.code})</span>
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatNumber(it.quantity, locale)}
                        {it.unit ? ` ${it.unit}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
