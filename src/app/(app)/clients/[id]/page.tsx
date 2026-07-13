import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Mail, Phone, MapPin, Star, ArrowLeftRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { addContact, transferClientAction } from "../actions";

const TEAM_TONE: Record<string, "brand" | "success" | "warning"> = {
  A1: "brand",
  A2: "success",
  A3: "warning",
};

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      ownerTeam: true,
      industry: true,
      introducer: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      transfers: {
        include: { fromTeam: true, toTeam: true, transferredBy: true },
        orderBy: { transferredAt: "desc" },
      },
    },
  });
  if (!client) notFound();

  const [teams, auditEntries] = await Promise.all([
    prisma.team.findMany({ where: { NOT: { id: client.ownerTeamId } }, orderBy: { code: "asc" } }),
    prisma.auditLog.findMany({
      where: { entityType: "client", entityId: client.id },
      orderBy: { changedAt: "desc" },
      take: 10,
    }),
  ]);

  const addContactWithId = addContact.bind(null, client.id);
  const transferWithId = transferClientAction.bind(null, client.id);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/clients" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại danh sách
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{client.name}</h1>
            <span className="font-mono text-xs text-muted-foreground">{client.code}</span>
            {client.isNew && <Badge tone="brand">KH Mới</Badge>}
          </div>
          {client.brand && <p className="mt-1 text-sm text-muted-foreground">Brand: {client.brand}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={TEAM_TONE[client.ownerTeam.code] ?? "neutral"}>Team {client.ownerTeam.code}</Badge>
            {client.industry && <Badge tone="neutral">{client.industry.labelVi}</Badge>}
            <Badge tone="neutral">Payment term {client.paymentTermDays} ngày</Badge>
          </div>
        </div>
        <LinkButton href={`/clients/${client.id}/edit`} variant="secondary" size="sm">
          <Pencil className="h-3.5 w-3.5" />
          Sửa thông tin
        </LinkButton>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Contacts */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">Người liên hệ</h2>
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
                </li>
              ))}
              {client.contacts.length === 0 && (
                <li className="py-3 text-sm text-muted-foreground">Chưa có người liên hệ nào.</li>
              )}
            </ul>

            <details className="mt-4 rounded-lg border border-dashed border-border-strong p-3">
              <summary className="cursor-pointer text-xs font-medium text-brand-600">+ Thêm người liên hệ</summary>
              <form action={addContactWithId} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input name="name" placeholder="Họ tên *" required className={smallInput} />
                <input name="title" placeholder="Chức danh" className={smallInput} />
                <input name="phone" placeholder="Số điện thoại" className={smallInput} />
                <input name="email" type="email" placeholder="Email" className={smallInput} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                  <input type="checkbox" name="isPrimary" className="h-3.5 w-3.5 rounded border-border-strong" />
                  Đặt làm liên hệ chính
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600"
                  >
                    Lưu liên hệ
                  </button>
                </div>
              </form>
            </details>
          </section>

          {/* Placeholders cho module chưa xây */}
          <section className="rounded-xl border border-dashed border-border-strong bg-surface-2 p-5">
            <h2 className="text-sm font-semibold text-muted-foreground">Lịch sử dự án</h2>
            <p className="mt-1 text-xs text-muted-foreground">Sẽ hiển thị khi module ③ Quản lý dự án hoàn thành.</p>
          </section>
          <section className="rounded-xl border border-dashed border-border-strong bg-surface-2 p-5">
            <h2 className="text-sm font-semibold text-muted-foreground">Công nợ &amp; Margin theo khách</h2>
            <p className="mt-1 text-xs text-muted-foreground">Sẽ hiển thị khi module ④ Chi phí &amp; Công nợ hoàn thành.</p>
          </section>
        </div>

        <div className="space-y-6">
          {/* Info */}
          <section className="rounded-xl border border-border bg-surface p-5 text-sm">
            <h2 className="text-sm font-semibold text-foreground">Thông tin chung</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <InfoRow label="Người giới thiệu" value={client.introducer?.fullName ?? "—"} />
              <InfoRow label="Điện thoại" value={client.phone ?? "—"} icon={Phone} />
              <InfoRow label="Email" value={client.email ?? "—"} icon={Mail} />
              <InfoRow label="Địa chỉ" value={client.address ?? "—"} icon={MapPin} />
              {client.note && <InfoRow label="Ghi chú" value={client.note} />}
            </dl>
          </section>

          {/* Transfer */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <ArrowLeftRight className="h-4 w-4" />
              Chuyển khách hàng
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Chuyển khách sang team Account khác. Khác với Handover dự án — thao tác này đổi team phụ trách toàn bộ
              khách hàng.
            </p>
            <form action={transferWithId} className="mt-3 space-y-2">
              <select name="toTeamId" required className={smallInput}>
                <option value="">— Chọn team nhận —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
              <input name="reason" placeholder="Lý do chuyển *" required className={smallInput} />
              <button
                type="submit"
                className="h-8 w-full rounded-lg border border-border-strong text-xs font-medium text-foreground hover:bg-surface-2"
              >
                Xác nhận chuyển
              </button>
            </form>

            {client.transfers.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                {client.transfers.map((t) => (
                  <li key={t.id}>
                    {t.fromTeam.code} → {t.toTeam.code} · {formatDate(t.transferredAt)}
                    <br />
                    <span className="italic">&ldquo;{t.reason}&rdquo;</span> — {t.transferredBy.fullName}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Audit log */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">Nhật ký thay đổi</h2>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              {auditEntries.map((a) => (
                <li key={a.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                  <span className="font-medium text-foreground">{a.action}</span> · {a.field} ·{" "}
                  {formatDate(a.changedAt)}
                </li>
              ))}
              {auditEntries.length === 0 && <li>Chưa có thay đổi nào.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Phone }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 text-right font-medium text-foreground">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        {value}
      </dd>
    </div>
  );
}

const smallInput =
  "h-8 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
