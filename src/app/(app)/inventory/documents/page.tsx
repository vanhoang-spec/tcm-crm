import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { DOC_TYPES } from "@/lib/inventory";
import { requirePermission } from "@/lib/permissions";

const STATUS_TONE = { PENDING: "warning", COMPLETED: "success", CANCELED: "danger" } as const;

export default async function InventoryDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; project?: string }>;
}) {
  await requirePermission("inventory.view");
  const { type, status, project } = await searchParams;
  const t = await getTranslations("inventory.documents");

  const docs = await prisma.stockDocument.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(project ? { projectId: project } : {}),
    },
    include: { fromWarehouse: true, toWarehouse: true, project: { select: { code: true, name: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  // Phiếu chuyển đang chờ nhận ghim đầu danh sách
  const pending = docs.filter((d) => d.status === "PENDING");
  const rest = docs.filter((d) => d.status !== "PENDING");
  const ordered = [...pending, ...rest];

  const typeLabel = (tp: string) => t(`type${tp}` as Parameters<typeof t>[0]);
  const statusLabel = (st: string) => t(`status${st}` as Parameters<typeof t>[0]);

  const newButtons = [
    { href: "/inventory/documents/new/transfer", label: t("newTransfer") },
    { href: "/inventory/documents/new/issue", label: t("newIssue") },
    { href: "/inventory/documents/new/return", label: t("newReturn") },
    { href: "/inventory/documents/new/import", label: t("newImport") },
    { href: "/inventory/documents/new/adjust", label: t("newAdjust") },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {newButtons.map((b) => (
          <Link
            key={b.href}
            href={b.href}
            className="inline-flex h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 sm:h-9"
          >
            {b.label}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-2" action="/inventory/documents" method="get">
        <select name="type" defaultValue={type ?? ""} aria-label={t("filterType")} className="h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9">
          <option value="">{t("allTypes")}</option>
          {DOC_TYPES.map((tp) => (
            <option key={tp} value={tp}>
              {typeLabel(tp)}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} aria-label={t("filterStatus")} className="h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9">
          <option value="">{t("allStatuses")}</option>
          {(["PENDING", "COMPLETED", "CANCELED"] as const).map((st) => (
            <option key={st} value={st}>
              {statusLabel(st)}
            </option>
          ))}
        </select>
        {project && <input type="hidden" name="project" value={project} />}
        <button type="submit" className="h-11 rounded-lg border border-border-strong px-4 text-sm font-medium sm:h-9">
          OK
        </button>
      </form>

      {/* Mobile cards */}
      <ul className="space-y-2 sm:hidden">
        {ordered.length === 0 && <li className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{t("empty")}</li>}
        {ordered.map((d) => (
          <li key={d.id}>
            <Link href={`/inventory/documents/${d.id}`} className="block rounded-xl border border-border bg-surface p-3 active:bg-surface-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-foreground">{d.code}</span>
                <Badge tone={STATUS_TONE[d.status as keyof typeof STATUS_TONE] ?? "neutral"}>{statusLabel(d.status)}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {typeLabel(d.type)}
                {d.fromWarehouse ? ` · ${d.fromWarehouse.name}` : ""}
                {d.toWarehouse ? ` → ${d.toWarehouse.name}` : ""}
                {d.project ? ` · ${d.project.code}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(d.createdAt)}</p>
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden rounded-xl border border-border bg-surface sm:block">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">{t("colCode")}</th>
                <th className="px-4 py-2.5">{t("colType")}</th>
                <th className="px-4 py-2.5">{t("colWarehouse")}</th>
                <th className="px-4 py-2.5">{t("colProject")}</th>
                <th className="px-4 py-2.5">{t("colDate")}</th>
                <th className="px-4 py-2.5">{t("colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {ordered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {ordered.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    <Link href={`/inventory/documents/${d.id}`} className="font-mono font-medium text-brand-600 hover:underline">
                      {d.code}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{typeLabel(d.type)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {d.fromWarehouse?.name ?? ""}
                    {d.fromWarehouse && d.toWarehouse ? " → " : ""}
                    {d.toWarehouse?.name ?? ""}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{d.project ? d.project.code : "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(d.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONE[d.status as keyof typeof STATUS_TONE] ?? "neutral"}>{statusLabel(d.status)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
