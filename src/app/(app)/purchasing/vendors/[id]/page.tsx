import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { getMyPermissions } from "@/lib/permissions";
import { getPurchasingScope, canSeeVendor } from "@/lib/purchasing-scope";
import { groupOptions } from "@/lib/rfq-templates";
import { loadRfqTemplates } from "@/lib/rfq-groups";
import { formatDate, formatNumber, toNum } from "@/lib/utils";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import type { Locale } from "@/i18n/locales";
import { VendorEditForm, VendorDocumentsPanel, type VendorDocRow } from "../vendor-forms";
import { loadVendorPriceHistory } from "@/lib/rfq-server";
import { parseOptions, readCustomJson, type VendorFieldDefLite } from "@/lib/vendor-fields";

/** Hồ sơ một NCC: thông tin + nhóm hàng + kho tài liệu + RFQ đã tham gia. */
export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const perms = await getMyPermissions();
  const canManage = perms.has("purchasing.vendor.manage") || perms.has("settings.vendors.manage");
  if (!perms.has("purchasing.view") && !canManage) redirect("/no-access");
  const { id } = await params;

  const [t, locale, vendor, projects, priceHistory, fieldDefsAll, scope, templates] = await Promise.all([
    getTranslations("purchasing.vendors"),
    getLocale() as Promise<Locale>,
    prisma.vendor.findUnique({
      where: { id },
      include: {
        groups: { select: { groupCode: true } },
        contacts: { orderBy: [{ isPrimary: "desc" }, { sort: "asc" }] },
        documents: { orderBy: { createdAt: "desc" }, include: { project: { select: { code: true } }, uploadedBy: { select: { fullName: true } } } },
        rfqVendors: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { rfq: { select: { id: true, code: true, title: true, status: true, groupCode: true, project: { select: { code: true } } } }, quoteLines: { select: { amount: true } } },
        },
      },
    }),
    prisma.project.findMany({
      where: { status: { code: { in: [...EXECUTION_STATUS_CODES, "BIDDING", "PENDING"] } } },
      select: { id: true, code: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    loadVendorPriceHistory(id),
    prisma.vendorFieldDef.findMany({ orderBy: { sort: "asc" } }),
    getPurchasingScope(),
    loadRfqTemplates(),
  ]);
  if (!vendor) notFound();
  // Ngoài phạm vi được chia sẻ ⇒ coi như không tồn tại. Đoán id không mở được hồ sơ NCC khác.
  if (!canSeeVendor(scope, vendor.id)) notFound();
  const defs: VendorFieldDefLite[] = fieldDefsAll.filter((x) => x.isActive).map((x) => ({ key: x.key, labelVi: x.labelVi, labelEn: x.labelEn, type: x.type, options: parseOptions(x.optionsJson), hint: x.hint, required: x.required }));
  const custom = readCustomJson(vendor.customJson);
  // NCC tạo trước PUR-2 chỉ có 3 cột liên hệ cũ (contact/phone/email) — hiện thành người liên hệ chính
  // để form sửa không trắng; lưu lại là chuyển hẳn sang bảng vendor_contact.
  const contacts = vendor.contacts.length
    ? vendor.contacts.map((c) => ({ name: c.name, title: c.title, phone: c.phone, email: c.email, isPrimary: c.isPrimary }))
    : vendor.contact || vendor.phone || vendor.email
      ? [{ name: vendor.contact ?? "", title: null, phone: vendor.phone, email: vendor.email, isPrimary: true }]
      : [];

  const gLabel = (code: string) => {
    const x = templates.find((tp) => tp.code === code);
    return x ? (locale === "en" ? x.labelEn : x.labelVi) : code;
  };
  const docs: VendorDocRow[] = vendor.documents.map((d) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    mime: d.mime,
    size: d.size,
    amount: d.amount == null ? null : toNum(d.amount),
    signedAt: d.signedAt,
    note: d.note,
    projectCode: d.project?.code ?? null,
    uploadedByName: d.uploadedBy?.fullName ?? null,
    createdAt: d.createdAt,
  }));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/purchasing/vendors" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("backToList")}
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">
          {vendor.name} <span className="ml-2 font-mono text-sm text-muted-foreground">{vendor.code}</span>
        </h1>
        {vendor.legalName && <p className="text-sm text-muted-foreground">{vendor.legalName}</p>}
        <div className="mt-1 flex flex-wrap gap-1">
          {vendor.groups.map((g) => (
            <Badge key={g.groupCode} tone="brand">
              {gLabel(g.groupCode)}
            </Badge>
          ))}
          {!vendor.isActive && <Badge tone="neutral">{t("inactive")}</Badge>}
        </div>
      </div>

      {canManage ? (
        <VendorEditForm
          groups={groupOptions(templates.filter((x) => scope.full || scope.groupCodes.includes(x.code)))}
          defs={defs}
          vendor={{
            id: vendor.id,
            code: vendor.code,
            name: vendor.name,
            legalName: vendor.legalName,
            category: vendor.category,
            taxCode: vendor.taxCode,
            address: vendor.address,
            bankName: vendor.bankName,
            bankAccountNo: vendor.bankAccountNo,
            bankAccountHolder: vendor.bankAccountHolder,
            paymentTermsNote: vendor.paymentTermsNote,
            note: vendor.note,
            isActive: vendor.isActive,
            groupCodes: vendor.groups.map((g) => g.groupCode),
            contacts,
            custom,
          }}
        />
      ) : (
        <section className="rounded-xl border border-border bg-surface p-4 text-sm">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {[
              [t("legalName"), vendor.legalName],
              [t("taxCode"), vendor.taxCode],
              [t("address"), vendor.address],
              [t("paymentTermsNote"), vendor.paymentTermsNote],
              ...contacts.map(
                (c, i) => [i === 0 ? t("contactsTitle") : t("contactMore"), [c.name, c.title, c.phone, c.email].filter(Boolean).join(" · ") + (c.isPrimary ? " ★" : "")] as [string, string],
              ),
              ...defs
                .filter((x) => custom[x.key] != null && custom[x.key] !== "" && custom[x.key] !== false)
                .map((x) => [locale === "en" ? x.labelEn || x.labelVi : x.labelVi, x.type === "BOOL" ? "✓" : String(custom[x.key])] as [string, string]),
            ].map(([label, value], idx) => (
              <div key={idx} className="flex gap-2">
                <dt className="w-32 shrink-0 text-xs text-muted-foreground">{label}</dt>
                <dd className="text-foreground">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <VendorDocumentsPanel vendorId={vendor.id} docs={docs} projects={projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }))} canManage={canManage} />

      {/* PUR-1b — lịch sử giá tính lúc đọc từ RFQ đã chốt + dòng CO + PO (không bảng riêng) */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("priceHistoryTitle")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("priceHistoryHint")}</p>
        {priceHistory.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("priceHistoryEmpty")}</p>
        ) : (
          <div className="mt-2 overflow-x-auto overflow-y-auto max-h-[50vh]">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-[11px] text-muted-foreground">
                  <th className="py-1.5 pr-2">{t("phDate")}</th>
                  <th className="py-1.5 pr-2">{t("phSource")}</th>
                  <th className="py-1.5 pr-2">{t("phProject")}</th>
                  <th className="py-1.5 pr-2">{t("phItem")}</th>
                  <th className="py-1.5 pr-2 text-right">{t("phQty")}</th>
                  <th className="py-1.5 pr-2 text-right">{t("phUnitPrice")}</th>
                  <th className="py-1.5 pr-2 text-right">{t("phAmount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {priceHistory.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2 text-muted-foreground">{formatDate(r.date)}</td>
                    <td className="py-1 pr-2">
                      <Badge tone={r.source === "PO" ? "brand" : r.source === "RFQ" ? "success" : "neutral"}>{r.source === "CO" ? "CO" : r.ref}</Badge>
                    </td>
                    <td className="py-1 pr-2 font-mono text-muted-foreground">{r.projectCode}</td>
                    <td className="py-1 pr-2 text-foreground">{r.itemName}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {formatNumber(r.quantity, locale)}
                      {r.unit ? ` ${r.unit}` : ""}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-foreground">{formatNumber(r.unitPrice, locale)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{formatNumber(r.amount, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("rfqHistoryTitle")}</h2>
        {vendor.rfqVendors.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("rfqHistoryEmpty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-xs">
            {vendor.rfqVendors.map((rv) => (
              <li key={rv.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link href={`/purchasing/rfq/${rv.rfq.id}`} className="font-mono text-brand-600 hover:underline">
                  {rv.rfq.code}
                </Link>
                <span className="text-foreground">{rv.rfq.title}</span>
                <span className="text-muted-foreground">{rv.rfq.project.code}</span>
                <Badge tone="neutral">{gLabel(rv.rfq.groupCode)}</Badge>
                <Badge tone={rv.status === "SUBMITTED" ? "success" : rv.status === "DECLINED" ? "danger" : "warning"}>{t(`rvStatus${rv.status}`)}</Badge>
                {rv.quoteLines.length > 0 && (
                  <span className="ml-auto tabular-nums text-foreground">
                    {formatNumber(rv.quoteLines.reduce((s, q) => s + toNum(q.amount), 0), locale)}
                  </span>
                )}
                {rv.submittedAt && <span className="text-muted-foreground">{formatDate(rv.submittedAt)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
