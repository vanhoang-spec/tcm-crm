import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { getMyPermissions } from "@/lib/permissions";
import { RFQ_TEMPLATES, isRfqTemplateCode } from "@/lib/rfq-templates";
import { pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { redirect } from "next/navigation";
import { VendorCreateForm } from "./vendor-forms";
import { parseOptions, type VendorFieldDefLite } from "@/lib/vendor-fields";

/**
 * Danh sách NCC theo NHÓM HÀNG (PUR-1). Xem: `purchasing.view`. Sửa/thêm: `purchasing.vendor.manage`
 * hoặc `settings.vendors.manage` (mã cũ). Người thiếu cả 3 bị đá về SAFE_LANDING.
 */
export default async function PurchasingVendorsPage({ searchParams }: { searchParams: Promise<{ group?: string; q?: string }> }) {
  const perms = await getMyPermissions();
  const canManage = perms.has("purchasing.vendor.manage") || perms.has("settings.vendors.manage");
  if (!perms.has("purchasing.view") && !canManage) redirect("/no-access");

  const { group: groupParam, q } = await searchParams;
  const group = groupParam && isRfqTemplateCode(groupParam) ? groupParam : null;
  const [t, locale, vendors, fieldDefs] = await Promise.all([
    getTranslations("purchasing.vendors"),
    getLocale() as Promise<Locale>,
    prisma.vendor.findMany({
      where: {
        ...(group ? { groups: { some: { groupCode: group } } } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q.toUpperCase() } }] } : {}),
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { groups: { select: { groupCode: true } }, contacts: { where: { isPrimary: true }, take: 1 }, _count: { select: { documents: true, rfqVendors: true } } },
    }),
    prisma.vendorFieldDef.findMany({ where: { isActive: true }, orderBy: { sort: "asc" } }),
  ]);
  const defs: VendorFieldDefLite[] = fieldDefs.map((d) => ({ key: d.key, labelVi: d.labelVi, labelEn: d.labelEn, type: d.type, options: parseOptions(d.optionsJson), hint: d.hint, required: d.required }));
  const tpl = (code: string) => RFQ_TEMPLATES.find((x) => x.code === code);
  const gLabel = (code: string) => {
    const x = tpl(code);
    return x ? pickLabel({ labelVi: x.labelVi, labelEn: x.labelEn }, locale) : code;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <select name="group" defaultValue={group ?? ""} className="h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm">
            <option value="">{t("allGroups")}</option>
            {RFQ_TEMPLATES.map((x) => (
              <option key={x.code} value={x.code}>
                {gLabel(x.code)}
              </option>
            ))}
          </select>
          <input name="q" defaultValue={q ?? ""} placeholder={t("searchPlaceholder")} className="h-9 w-48 rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
          <button type="submit" className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
            OK
          </button>
        </form>
      </div>

      {/* Bộ đếm theo nhóm — mỗi nhóm kèm form của nhóm đó */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {RFQ_TEMPLATES.map((x) => {
          const n = vendors.filter((v) => v.groups.some((g) => g.groupCode === x.code)).length;
          return (
            <Link
              key={x.code}
              href={`/purchasing/vendors?group=${x.code}`}
              className={
                "rounded-lg border p-2.5 text-xs hover:bg-surface-2 " + (group === x.code ? "border-brand-400 bg-brand-50" : "border-border bg-surface")
              }
            >
              <p className="font-medium text-foreground">{gLabel(x.code)}</p>
              <p className="mt-0.5 text-muted-foreground">{t("vendorCount", { n })}</p>
            </Link>
          );
        })}
      </div>

      {canManage && <VendorCreateForm defs={defs} />}

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">{t("colVendor")}</th>
                <th className="py-2 pr-3">{t("colGroups")}</th>
                <th className="py-2 pr-3">{t("colContact")}</th>
                <th className="py-2 pr-3 text-right">{t("colDocs")}</th>
                <th className="py-2 pr-3 text-right">{t("colRfqs")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vendors.map((v) => (
                <tr key={v.id} className={v.isActive ? "" : "opacity-60"}>
                  <td className="py-2 pr-3">
                    <Link href={`/purchasing/vendors/${v.id}`} className="font-medium text-brand-600 hover:underline">
                      {v.name}
                    </Link>
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">{v.code}</span>
                    {v.legalName && <span className="block text-[11px] text-muted-foreground">{v.legalName}</span>}
                    {!v.isActive && (
                      <span className="ml-2">
                        <Badge tone="neutral">{t("inactive")}</Badge>
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {v.groups.length === 0 && <span className="text-xs text-warning">{t("noGroup")}</span>}
                      {v.groups.map((g) => (
                        <Badge key={g.groupCode} tone="brand">
                          {gLabel(g.groupCode)}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {(() => {
                      const c = v.contacts[0];
                      return c ? [c.name, c.phone, c.email].filter(Boolean).join(" · ") : [v.contact, v.phone, v.email].filter(Boolean).join(" · ") || "—";
                    })()}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{v._count.documents}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{v._count.rfqVendors}</td>
                </tr>
              ))}
              {vendors.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
