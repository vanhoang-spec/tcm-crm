import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import { getProjectConsumption } from "@/lib/inventory";
import { requirePermission } from "@/lib/permissions";

/** K4: bảng tiêu hao của một dự án, tính lại TỪ SỔ CÁI (không đọc ProjectHolding). */
export default async function ProjectConsumptionPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requirePermission("inventory.view");
  const { projectId } = await params;
  const [t, locale] = await Promise.all([getTranslations("inventory.consumption"), getLocale() as Promise<Locale>]);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, code: true, name: true, stockCampaignOpenedAt: true },
  });
  if (!project) notFound();
  const rows = await getProjectConsumption(projectId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          <Link href={`/projects/${project.id}`} className="font-medium text-brand-600 hover:underline">
            {project.code} — {project.name}
          </Link>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("hint")}</p>
      </div>

      {project.stockCampaignOpenedAt && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          {t("campaignOpen", { date: project.stockCampaignOpenedAt.toISOString().slice(0, 10) })}
        </p>
      )}

      {/* Mobile */}
      <ul className="space-y-2 sm:hidden">
        {rows.length === 0 && <li className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{t("empty")}</li>}
        {rows.map((r) => (
          <li key={r.itemId} className="rounded-xl border border-border bg-surface p-3">
            <p className="text-sm font-medium text-foreground">{r.name}</p>
            <p className="font-mono text-xs text-muted-foreground">{r.code}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {(
                [
                  ["colDelivered", r.delivered],
                  ["colReturned", r.returned],
                  ["colMovedOut", r.movedOut],
                  ["colLost", r.lost],
                  ["colOnSite", r.onSite],
                  ["colConsumed", r.consumed],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t(k)}</dt>
                  <dd className="font-semibold text-foreground">{formatNumber(v, locale)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {/* Desktop */}
      <div className="hidden rounded-xl border border-border bg-surface sm:block">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">{t("colItem")}</th>
                <th className="px-4 py-2.5 text-right">{t("colDelivered")}</th>
                <th className="px-4 py-2.5 text-right">{t("colReturned")}</th>
                <th className="px-4 py-2.5 text-right">{t("colMovedOut")}</th>
                <th className="px-4 py-2.5 text-right">{t("colLost")}</th>
                <th className="px-4 py-2.5 text-right">{t("colOnSite")}</th>
                <th className="px-4 py-2.5 text-right">{t("colConsumed")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.itemId} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-foreground">{r.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{r.code}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{formatNumber(r.delivered, locale)}</td>
                  <td className="px-4 py-2.5 text-right">{formatNumber(r.returned, locale)}</td>
                  <td className="px-4 py-2.5 text-right">{formatNumber(r.movedOut, locale)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.lost > 0 ? <Badge tone="danger">{formatNumber(r.lost, locale)}</Badge> : formatNumber(0, locale)}
                  </td>
                  <td className="px-4 py-2.5 text-right">{formatNumber(r.onSite, locale)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-foreground">{formatNumber(r.consumed, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
