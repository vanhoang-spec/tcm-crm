import Link from "next/link";
import { Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { getMyPermissions, requirePermission } from "@/lib/permissions";
import { getPurchasingScope } from "@/lib/purchasing-scope";
import { loadRfqTemplates } from "@/lib/rfq-groups";
import { RFQ_STATUSES } from "@/lib/rfq";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import { formatDate } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";

const STATUS_TONE: Record<string, "neutral" | "warning" | "brand" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "warning",
  COMPARING: "brand",
  SUBMITTED: "brand",
  CONFIRMED: "success",
  CANCELED: "danger",
};

/**
 * Trang chủ sub-module Thu mua (PUR-1): (a) việc PCC đang chờ trên MỌI dự án đang chạy — lối vào tổng
 * mà trước đây không có (chỉ xem trong từng dự án); (b) danh sách RFQ. Gác `purchasing.view`.
 */
export default async function PurchasingHomePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("purchasing.view");
  const scope = await getPurchasingScope();
  const templates = await loadRfqTemplates();
  const perms = await getMyPermissions();
  const canManage = perms.has("purchasing.rfq.manage");
  const { status: statusParam } = await searchParams;
  const status = statusParam && (RFQ_STATUSES as readonly string[]).includes(statusParam) ? statusParam : null;

  const [t, locale, pendingTasks, rfqs] = await Promise.all([
    getTranslations("purchasing.rfq"),
    getLocale() as Promise<Locale>,
    scope.limited ? [] : prisma.departmentTask.findMany({
      where: {
        department: "PCC",
        status: { in: ["UNASSIGNED", "ASSIGNED", "REVISION"] },
        project: { status: { code: { in: [...EXECUTION_STATUS_CODES, "BIDDING", "PENDING"] } } },
      },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
      take: 50,
      include: { project: { select: { id: true, code: true, name: true } }, assignee: { select: { fullName: true } }, rfqs: { select: { id: true, code: true } } },
    }),
    prisma.rfq.findMany({
      // ⚠ Gộp vào MỘT khoá `where`: hai khoá `where` trong cùng object thì khoá sau ĐÈ khoá trước,
      // tức bộ lọc phạm vi biến mất trong im lặng khi có tham số trạng thái.
      where: {
        ...(status ? { status } : {}),
        // Chỉ RFQ thuộc nhóm hàng được chia sẻ — phòng Sản xuất không đọc RFQ của nhóm khác.
        ...(scope.full ? {} : { groupCode: { in: scope.groupCodes } }),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        project: { select: { code: true } },
        vendors: { select: { status: true } },
      },
    }),
  ]);
  const gLabel = (code: string) => {
    const x = templates.find((tp) => tp.code === code);
    return x ? (locale === "en" ? x.labelEn : x.labelVi) : code;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        </div>
        {canManage && (
          <Link href="/purchasing/rfq/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600">
            <Plus className="h-3.5 w-3.5" /> {t("newBtn")}
          </Link>
        )}
      </div>

      {/* Order PCC đang chờ — hàng việc của phòng THU MUA. Vai được chia sẻ một phần (phòng Sản
          xuất) không thấy khối này: họ lập RFQ cho việc của chính mình, không nhận order PCC. */}
      {!scope.limited && (
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("pendingOrdersTitle")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("pendingOrdersHint")}</p>
        {pendingTasks.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("pendingOrdersEmpty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {pendingTasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                <span className="font-mono text-muted-foreground">{task.project.code}</span>
                <span className="font-medium text-foreground">{task.title}</span>
                <Badge tone={task.status === "UNASSIGNED" ? "warning" : "brand"}>{task.status}</Badge>
                {task.assignee && <span className="text-muted-foreground">→ {task.assignee.fullName}</span>}
                {task.deadline && <span className="text-muted-foreground">· {formatDate(task.deadline)}</span>}
                {task.rfqs.map((r) => (
                  <Link key={r.id} href={`/purchasing/rfq/${r.id}`} className="font-mono text-brand-600 hover:underline">
                    {r.code}
                  </Link>
                ))}
                <span className="ml-auto flex gap-2">
                  <Link href={`/projects/${task.project.id}/purchasing`} className="text-brand-600 hover:underline">
                    {t("openTask")}
                  </Link>
                  {canManage && task.rfqs.length === 0 && (
                    <Link href={`/purchasing/rfq/new?project=${task.project.id}&task=${task.id}`} className="font-semibold text-brand-600 hover:underline">
                      + {t("createFromTask")}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {/* Danh sách RFQ */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("listTitle")}</h2>
          <form method="get" className="flex items-center gap-2">
            <select name="status" defaultValue={status ?? ""} className="h-8 rounded-lg border border-border-strong bg-surface px-2 text-xs">
              <option value="">{t("filterAll")}</option>
              {RFQ_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status${s}`)}
                </option>
              ))}
            </select>
            <button type="submit" className="h-8 rounded-lg border border-border-strong px-2.5 text-xs hover:bg-surface-2">
              OK
            </button>
          </form>
        </div>
        <div className="mt-2 overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">{t("colCode")}</th>
                <th className="py-2 pr-3">{t("colTitle")}</th>
                <th className="py-2 pr-3">{t("colProject")}</th>
                <th className="py-2 pr-3">{t("colGroup")}</th>
                <th className="py-2 pr-3">{t("colVendors")}</th>
                <th className="py-2 pr-3">{t("colDeadline")}</th>
                <th className="py-2 pr-3">{t("colStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rfqs.map((r) => {
                const quoted = r.vendors.filter((v) => v.status === "SUBMITTED").length;
                return (
                  <tr key={r.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/purchasing/rfq/${r.id}`} className="font-mono text-xs text-brand-600 hover:underline">
                        {r.code}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-foreground">{r.title}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{r.project.code}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{gLabel(r.groupCode)}</td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-muted-foreground">{t("quotedOf", { quoted, total: r.vendors.length })}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{r.deadline ? formatDate(r.deadline) : "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{t(`status${r.status}`)}</Badge>
                    </td>
                  </tr>
                );
              })}
              {rfqs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    {t("listEmpty")}
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
