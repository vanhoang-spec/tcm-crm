import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Pencil, Mail, Phone, MapPin, Star, ArrowLeftRight, Landmark } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { formatDate, formatDateTime, formatNumber, pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { addCareNote, addContact, assignClientGroup, setClientQuoteTemplate, transferClientAction } from "../actions";
import { QUOTE_TEMPLATES } from "@/lib/quote-templates";
import { MAX_CONTACTS } from "@/lib/validators/client";
import { RemoveContactButton } from "./remove-contact-button";
import { getMissingClientProfileFields } from "@/lib/client-profile";
import { hasPermission, requirePermission } from "@/lib/permissions";

const TEAM_TONE: Record<string, "brand" | "success" | "warning"> = {
  A1: "brand",
  A2: "success",
  A3: "warning",
};

const STATUS_TONE: Record<string, "brand" | "success" | "neutral"> = {
  POTENTIAL: "brand",
  ACTIVE: "success",
  INACTIVE: "neutral",
};

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("clients.view");
  const { id } = await params;
  // Nút KB phải ẩn theo quyền: requirePermission của trang KB KHÔNG trả 403 mà điều hướng sang
  // SAFE_LANDING, nên để nút cho người không có quyền bấm là đá họ khỏi trang khách đang xem.
  const canViewKb = await hasPermission("clients.kb.view");

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      ownerTeam: true,
      industry: true,
      status: true,
      classification: true,
      introducer: true,
      brand: true,
      group: { select: { id: true, code: true, name: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      transfers: {
        include: { fromTeam: true, toTeam: true, transferredBy: true },
        orderBy: { transferredAt: "desc" },
      },
      careNotes: {
        include: { staff: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!client) notFound();

  // Các pháp nhân KHÁC cùng nhóm — chỉ query khi khách thuộc một nhóm.
  const siblings = client.groupId
    ? await prisma.client.findMany({
        where: { groupId: client.groupId, id: { not: client.id }, isActive: true },
        select: { id: true, code: true, name: true, ownerTeam: { select: { code: true } } },
        orderBy: { name: "asc" },
      })
    : [];

  const missingFields = getMissingClientProfileFields(client);

  const [teams, groupOptions, auditEntries, t, tForm, locale] = await Promise.all([
    prisma.team.findMany({ where: client.ownerTeamId ? { NOT: { id: client.ownerTeamId } } : undefined, orderBy: { code: "asc" } }),
    // Nhóm đang bật + nhóm hiện tại của khách (kể cả đã tắt) để select không mất giá trị đang chọn.
    prisma.clientGroup.findMany({
      where: { OR: [{ isActive: true }, ...(client.groupId ? [{ id: client.groupId }] : [])] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.auditLog.findMany({
      where: { entityType: "client", entityId: client.id },
      orderBy: { changedAt: "desc" },
      take: 10,
    }),
    getTranslations("clients.detail"),
    getTranslations("clients.form"),
    getLocale() as Promise<Locale>,
  ]);

  const addContactWithId = addContact.bind(null, client.id);
  const transferWithId = transferClientAction.bind(null, client.id);
  const assignGroupWithId = assignClientGroup.bind(null, client.id);
  const addCareNoteWithId = addCareNote.bind(null, client.id);
  const setTemplateWithId = setClientQuoteTemplate.bind(null, client.id);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/clients" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
      </div>

      {missingFields.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning">
          <p className="font-medium">{t("profileIncompleteBanner")}</p>
          <p className="mt-0.5 text-xs">
            {missingFields.map((f) => t(`profileField.${f}`)).join(", ")} — {t("profileIncompleteHintDetail")}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{client.name}</h1>
            <span className="font-mono text-xs text-muted-foreground">{client.code}</span>
            {client.isNew && <Badge tone="brand">{t("isNewBadge")}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("brandAndTax", { brand: client.brand.name, taxCode: client.taxCode ?? "—" })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {client.ownerTeam ? (
              <Badge tone={TEAM_TONE[client.ownerTeam.code] ?? "neutral"}>
                {t("teamBadge", { code: client.ownerTeam.code })}
              </Badge>
            ) : (
              <Badge tone="neutral">{t("teamUnassignedBadge")}</Badge>
            )}
            {client.group && <Badge tone="brand">{t("groupBadge", { name: client.group.name })}</Badge>}
            {client.industry && <Badge tone="neutral">{pickLabel(client.industry, locale)}</Badge>}
            <Badge tone={STATUS_TONE[client.status.code] ?? "neutral"}>{pickLabel(client.status, locale)}</Badge>
            {client.classification && <Badge tone="neutral">{pickLabel(client.classification, locale)}</Badge>}
            <Badge tone="neutral">
              {t("paymentTermBadge", { days: formatNumber(client.paymentTermDays, locale) })}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canViewKb && (
            <LinkButton href={`/clients/${client.id}/kb`} variant="secondary" size="sm">
              <BookOpen className="h-3.5 w-3.5" />
              {t("openKb")}
            </LinkButton>
          )}
          <LinkButton href={`/clients/${client.id}/edit`} variant="secondary" size="sm">
            <Pencil className="h-3.5 w-3.5" />
            {t("editInfo")}
          </LinkButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Các pháp nhân cùng nhóm — chỉ hiện khi khách thuộc một nhóm */}
          {client.group && (
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold text-foreground">
                {t("groupSiblingsTitle", { name: client.group.name, count: siblings.length })}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("groupSiblingsHint")}</p>
              {siblings.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("groupSiblingsEmpty")}</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {siblings.map((sib) => (
                    <li key={sib.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <Link href={`/clients/${sib.id}`} className="text-sm font-medium text-foreground hover:text-brand-600">
                        {sib.name}
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{sib.code}</span>
                        {sib.ownerTeam && <Badge tone={TEAM_TONE[sib.ownerTeam.code] ?? "neutral"}>{sib.ownerTeam.code}</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Contacts */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("contactsTitle")}</h2>
            <ul className="mt-3 divide-y divide-border">
              {client.contacts.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {c.isPrimary && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}
                      {c.name}
                      {c.title && <span className="font-normal text-muted-foreground"> · {c.title}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {c.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </span>
                      )}
                      {c.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {c.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <RemoveContactButton clientId={client.id} contactId={c.id} name={c.name} />
                </li>
              ))}
              {client.contacts.length === 0 && (
                <li className="py-3 text-sm text-muted-foreground">{t("noContacts")}</li>
              )}
            </ul>

            {client.contacts.length < MAX_CONTACTS ? (
              <details className="mt-4 rounded-lg border border-dashed border-border-strong p-3">
                <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("addContact")}</summary>
                <form action={addContactWithId} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input name="name" placeholder={tForm("contactName")} required className={smallInput} />
                  <input name="title" placeholder={tForm("contactTitle")} required className={smallInput} />
                  <input name="phone" placeholder={tForm("contactPhone")} required className={smallInput} />
                  <input name="email" type="email" placeholder={tForm("contactEmail")} required className={smallInput} />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                    <input type="checkbox" name="isPrimary" className="h-3.5 w-3.5 rounded border-border-strong" />
                    {t("primaryContact")}
                  </label>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600"
                    >
                      {t("saveContact")}
                    </button>
                  </div>
                </form>
              </details>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">{t("maxContactsReached", { max: MAX_CONTACTS })}</p>
            )}
          </section>

          {/* Thông tin chăm sóc */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("careTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("careHint")}</p>

            <ul className="mt-3 space-y-3">
              {client.careNotes.map((n) => (
                <li key={n.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <p className="text-xs text-muted-foreground">
                    {t("careEntry", { date: formatDateTime(n.createdAt, locale), staff: n.staff?.fullName ?? "—" })}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground">{n.note}</p>
                </li>
              ))}
              {client.careNotes.length === 0 && <li className="text-sm text-muted-foreground">{t("noCare")}</li>}
            </ul>

            <details className="mt-4 rounded-lg border border-dashed border-border-strong p-3">
              <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("addCare")}</summary>
              <form action={addCareNoteWithId} className="mt-3 space-y-2">
                <textarea
                  name="note"
                  required
                  rows={3}
                  placeholder={t("careNotePlaceholder")}
                  className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="submit"
                  className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600"
                >
                  {t("saveCare")}
                </button>
              </form>
            </details>
          </section>

          {/* Placeholders cho module chưa xây */}
          <section className="rounded-xl border border-dashed border-border-strong bg-surface-2 p-5">
            <h2 className="text-sm font-semibold text-muted-foreground">{t("projectHistoryTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("projectHistoryPending")}</p>
          </section>
          <section className="rounded-xl border border-dashed border-border-strong bg-surface-2 p-5">
            <h2 className="text-sm font-semibold text-muted-foreground">{t("financeTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("financePending")}</p>
          </section>
        </div>

        <div className="space-y-6">
          {/* Info */}
          <section className="rounded-xl border border-border bg-surface p-5 text-sm">
            <h2 className="text-sm font-semibold text-foreground">{t("generalInfoTitle")}</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <InfoRow
                label={t("introducerLabel")}
                value={client.introducer?.fullName ?? t("introducerOther")}
              />
              <InfoRow label={t("phoneLabel")} value={client.phone} icon={Phone} />
              <InfoRow label={t("emailLabel")} value={client.email} icon={Mail} />
              <InfoRow label={t("addressLabel")} value={client.address} icon={MapPin} />
              <InfoRow label={t("bankAccountLabel")} value={client.bankAccount} icon={Landmark} />
              {client.note && <InfoRow label={t("noteLabel")} value={client.note} />}
            </dl>
          </section>

          {/* Gán nhóm — action RIÊNG, không đi qua form sửa khách (form đó đòi hồ sơ đầy đủ mà
              64/68 khách nhập từ Excel chưa có, sẽ chặn oan đúng những khách cần gán nhóm nhất). */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("groupAssignTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("groupAssignDesc")}</p>
            <form action={assignGroupWithId} className="mt-3 flex flex-wrap items-center gap-2">
              <select name="groupId" defaultValue={client.groupId ?? ""} className={smallInput + " min-w-0 flex-1"}>
                <option value="">{tForm("groupNone")}</option>
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
                {t("groupAssignBtn")}
              </button>
            </form>
          </section>

          {/* CE-3 — mẫu báo giá mặc định của khách này (route xuất đọc từ đây). */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("quoteTemplateTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("quoteTemplateDesc")}</p>
            <form action={setTemplateWithId} className="mt-3 flex flex-wrap items-center gap-2">
              <select name="quoteTemplateCode" defaultValue={client.quoteTemplateCode ?? ""} className={smallInput + " min-w-0 flex-1"}>
                <option value="">{t("quoteTemplateDefault")}</option>
                {QUOTE_TEMPLATES.map((tp) => (
                  <option key={tp.code} value={tp.code}>
                    {locale === "vi" ? tp.labelVi : tp.labelEn}
                  </option>
                ))}
              </select>
              <button type="submit" className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
                {t("quoteTemplateBtn")}
              </button>
            </form>
          </section>

          {/* Transfer */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <ArrowLeftRight className="h-4 w-4" />
              {t("transferTitle")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("transferDesc")}</p>
            <form action={transferWithId} className="mt-3 space-y-2">
              <select name="toTeamId" required className={smallInput}>
                <option value="">{t("selectReceivingTeam")}</option>
                {teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.code} — {tm.name}
                  </option>
                ))}
              </select>
              <input name="reason" placeholder={t("transferReasonPlaceholder")} required className={smallInput} />
              <button
                type="submit"
                className="h-8 w-full rounded-lg border border-border-strong text-xs font-medium text-foreground hover:bg-surface-2"
              >
                {t("confirmTransfer")}
              </button>
            </form>

            {client.transfers.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                {client.transfers.map((tr) => (
                  <li key={tr.id}>
                    {t("transferHistoryLine", {
                      from: tr.fromTeam.code,
                      to: tr.toTeam.code,
                      date: formatDate(tr.transferredAt),
                    })}
                    <br />
                    <span className="italic">&ldquo;{tr.reason}&rdquo;</span> — {tr.transferredBy.fullName}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Audit log */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("auditTitle")}</h2>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              {auditEntries.map((a) => (
                <li key={a.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                  <span className="font-medium text-foreground">{a.action}</span> · {a.field} ·{" "}
                  {formatDate(a.changedAt)}
                </li>
              ))}
              {auditEntries.length === 0 && <li>{t("noAuditEntries")}</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | null; icon?: typeof Phone }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 text-right font-medium text-foreground">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        {value ?? "—"}
      </dd>
    </div>
  );
}

const smallInput =
  "h-8 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
