import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { REQUEST_STATUSES, REQUEST_TYPES } from "@/lib/inventory-request";
import { getMyPermissions, requirePermission } from "@/lib/permissions";

const STATUS_TONE = { PROPOSED: "warning", APPROVED: "brand", DONE: "success", REJECTED: "danger", CANCELED: "neutral" } as const;

/** Danh sách đề xuất kho — việc CHỜ MÌNH ghim đầu (duyệt / soạn hàng), theo đúng vai người đang xem. */
export default async function StockRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  await requirePermission("inventory.view");
  const { type, status } = await searchParams;
  const t = await getTranslations("inventory.requests");
  const perms = await getMyPermissions();

  const requests = await prisma.stockRequest.findMany({
    where: { ...(type ? { type } : {}), ...(status ? { status } : {}) },
    include: {
      warehouse: { select: { name: true } },
      project: { select: { code: true, name: true } },
      createdBy: { select: { fullName: true } },
      lines: { select: { id: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  const canApprove = perms.has("inventory.request.approve");
  const canIssue = perms.has("inventory.issue.confirm");
  const canIntake = perms.has("inventory.intake.confirm");
  const canApproveTransfer = perms.has("inventory.transfer.approve");
  // "Chờ mình": người duyệt thấy đề xuất PROPOSED; thủ kho thấy lệnh đã duyệt + báo hàng về
  const isMine = (r: (typeof requests)[number]) =>
    (canApprove && r.type === "ISSUE" && r.status === "PROPOSED") ||
    (canIssue && r.type === "ISSUE" && r.status === "APPROVED") ||
    (canIntake && r.type === "INTAKE" && r.status === "PROPOSED") ||
    (canApproveTransfer && r.type === "TRANSFER" && r.status === "PROPOSED") ||
    (canIssue && r.type === "TRANSFER" && r.status === "APPROVED");
  const ordered = [...requests.filter(isMine), ...requests.filter((r) => !isMine(r))];
  const pendingMine = requests.filter(isMine).length;

  const newButtons = [
    ...(perms.has("inventory.request.create")
      ? [
          { href: "/inventory/requests/new/issue", label: t("newIssueRequest") },
          { href: "/inventory/requests/new/intake", label: t("newIntakeRequest") },
          { href: "/inventory/requests/new/reserve", label: t("newReserveRequest") },
        ]
      : []),
    ...(perms.has("inventory.transfer.create") ? [{ href: "/inventory/requests/new/transfer", label: t("newTransferRequest") }] : []),
    // K6: thủ kho đề xuất hủy hàng khách gửi (team Account chủ duyệt)
    ...(perms.has("inventory.destroy") ? [{ href: "/inventory/requests/new/destroy", label: t("newDestroyRequest") }] : []),
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {newButtons.length > 0 && (
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
      )}

      {pendingMine > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">{t("pendingMine", { count: pendingMine })}</div>
      )}

      <form className="flex flex-wrap gap-2" action="/inventory/requests" method="get">
        <select name="type" defaultValue={type ?? ""} aria-label={t("filterType")} className="h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9">
          <option value="">{t("allTypes")}</option>
          {REQUEST_TYPES.map((tp) => (
            <option key={tp} value={tp}>
              {t(`type${tp}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} aria-label={t("filterStatus")} className="h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9">
          <option value="">{t("allStatuses")}</option>
          {REQUEST_STATUSES.map((st) => (
            <option key={st} value={st}>
              {t(`status${st}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
        <button type="submit" className="h-11 rounded-lg border border-border-strong px-4 text-sm font-medium sm:h-9">
          OK
        </button>
      </form>

      {/* Mobile cards */}
      <ul className="space-y-2 sm:hidden">
        {ordered.length === 0 && <li className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{t("empty")}</li>}
        {ordered.map((r) => (
          <li key={r.id}>
            <Link href={`/inventory/requests/${r.id}`} className="block rounded-xl border border-border bg-surface p-3 active:bg-surface-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-foreground">{r.code}</span>
                <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{t(`status${r.status}` as Parameters<typeof t>[0])}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`type${r.type}` as Parameters<typeof t>[0])} · {r.warehouse.name}
                {r.project ? ` · ${r.project.code}` : ""} · {t("lineCount", { count: r.lines.length })}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDate(r.createdAt)}
                {r.createdBy ? ` · ${r.createdBy.fullName}` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden rounded-xl border border-border bg-surface sm:block">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">{t("colCode")}</th>
                <th className="px-4 py-2.5">{t("colType")}</th>
                <th className="px-4 py-2.5">{t("colWarehouse")}</th>
                <th className="px-4 py-2.5">{t("colProject")}</th>
                <th className="px-4 py-2.5">{t("colCreatedBy")}</th>
                <th className="px-4 py-2.5">{t("colDate")}</th>
                <th className="px-4 py-2.5">{t("colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {ordered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {ordered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    <Link href={`/inventory/requests/${r.id}`} className="font-mono font-medium text-brand-600 hover:underline">
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{t(`type${r.type}` as Parameters<typeof t>[0])}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.warehouse.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.project?.code ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.createdBy?.fullName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{t(`status${r.status}` as Parameters<typeof t>[0])}</Badge>
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
