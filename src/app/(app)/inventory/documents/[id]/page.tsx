import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { ReceiveForm } from "../receive-form";
import { ExpectedReturnForm } from "../expected-return-form";
import { requirePermission } from "@/lib/permissions";

const STATUS_TONE = { PENDING: "warning", COMPLETED: "success", CANCELED: "danger" } as const;

export default async function StockDocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("inventory.view");
  const { id } = await params;
  const [t, locale] = await Promise.all([getTranslations("inventory.documents"), getLocale() as Promise<Locale>]);

  const doc = await prisma.stockDocument.findUnique({
    where: { id },
    include: {
      fromWarehouse: true,
      toWarehouse: true,
      project: { select: { id: true, code: true, name: true } },
      createdBy: { select: { fullName: true } },
      confirmedBy: { select: { fullName: true } },
      canceledBy: { select: { fullName: true } },
      lines: { include: { item: true }, orderBy: { sort: "asc" } },
    },
  });
  if (!doc) notFound();

  const typeLabel = t(`type${doc.type}` as Parameters<typeof t>[0]);
  const statusLabel = t(`status${doc.status}` as Parameters<typeof t>[0]);
  const isPendingTransfer = doc.type === "TRANSFER" && doc.status === "PENDING";
  const showReceivedCol = doc.type === "TRANSFER" && doc.status === "COMPLETED";

  const meta: { label: string; value: string }[] = [
    ...(doc.fromWarehouse ? [{ label: t("from"), value: doc.fromWarehouse.name }] : []),
    ...(doc.toWarehouse ? [{ label: t("to"), value: doc.toWarehouse.name }] : []),
    ...(doc.createdBy ? [{ label: t("createdBy"), value: doc.createdBy.fullName }] : []),
    ...(doc.confirmedBy ? [{ label: t("confirmedBy"), value: doc.confirmedBy.fullName }] : []),
    ...(doc.canceledBy ? [{ label: t("canceledBy"), value: doc.canceledBy.fullName }] : []),
    ...(doc.expectedReturnAt ? [{ label: t("expectedReturn"), value: formatDate(doc.expectedReturnAt) }] : []),
    ...(doc.note ? [{ label: t("note"), value: doc.note }] : []),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-lg font-semibold text-foreground">{doc.code}</h1>
        <Badge tone="brand">{typeLabel}</Badge>
        <Badge tone={STATUS_TONE[doc.status as keyof typeof STATUS_TONE] ?? "neutral"}>{statusLabel}</Badge>
        <span className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
        {doc.project && (
          <p className="text-sm sm:col-span-2">
            <span className="text-xs text-muted-foreground">{t("project")}: </span>
            <Link href={`/projects/${doc.project.id}`} className="font-medium text-brand-600 hover:underline">
              {doc.project.code} — {doc.project.name}
            </Link>
          </p>
        )}
        {meta.map((m) => (
          <p key={m.label} className="text-sm">
            <span className="text-xs text-muted-foreground">{m.label}: </span>
            <span className="text-foreground">{m.value}</span>
          </p>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">{t("linesTitle")}</h2>
        <ul>
          {doc.lines.map((l) => {
            const short = showReceivedCol && l.receivedQuantity !== null && l.receivedQuantity < l.quantity;
            return (
              <li key={l.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{l.item.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {l.item.code}
                    {l.note ? ` · ${l.note}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {showReceivedCol
                      ? `${formatNumber(l.receivedQuantity ?? l.quantity, locale)} / ${formatNumber(l.quantity, locale)}`
                      : formatNumber(l.quantity, locale)}
                    {l.item.unit ? ` ${l.item.unit}` : ""}
                  </p>
                  {short && <Badge tone="danger">{t("discrepancy", { count: l.quantity - (l.receivedQuantity ?? 0) })}</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {isPendingTransfer && (
        <ReceiveForm
          docId={doc.id}
          lines={doc.lines.map((l) => ({ id: l.id, code: l.item.code, name: l.item.name, unit: l.item.unit, quantity: l.quantity }))}
        />
      )}

      {doc.type === "ISSUE" && doc.status === "COMPLETED" && doc.expectedReturnAt && (
        <ExpectedReturnForm docId={doc.id} current={doc.expectedReturnAt.toISOString().slice(0, 10)} />
      )}
    </div>
  );
}
