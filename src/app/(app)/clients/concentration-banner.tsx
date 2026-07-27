import { TriangleAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { formatNumber, formatPercent, toNum } from "@/lib/utils";
import { getNumberSetting } from "@/lib/settings";
import { findConcentrationRisks, type ClientRevenue } from "@/lib/client-concentration";
import type { Locale } from "@/i18n/locales";

/**
 * Cảnh báo tập trung khách hàng (FR-11).
 *
 * Trước đây là băng "sẽ bật khi có dữ liệu doanh thu" bật cứng bằng `concentrationReady = false`.
 * Nay module ④ đã có ClientInvoice nên tính thật: doanh thu = tổng đã xuất hóa đơn trong năm tài
 * chính hiện tại, so tỉ trọng trong TEAM của khách. Không có khách nào vượt ngưỡng → không hiện gì.
 */
export async function ConcentrationBanner() {
  const [t, locale, thresholdPct] = await Promise.all([
    getTranslations("clients.concentration"),
    getLocale() as Promise<Locale>,
    getNumberSetting("clients", "concentration_threshold_pct", 40),
  ]);

  const fiscalYear = new Date().getFullYear();
  const invoices = await prisma.clientInvoice.findMany({
    where: { voidedAt: null, project: { fiscalYear } },
    select: {
      amount: true,
      client: { select: { id: true, name: true, ownerTeam: { select: { code: true } } } },
    },
  });
  if (invoices.length === 0) return null;

  const byClient = new Map<string, ClientRevenue>();
  for (const inv of invoices) {
    const cur = byClient.get(inv.client.id) ?? {
      clientId: inv.client.id,
      clientName: inv.client.name,
      teamCode: inv.client.ownerTeam?.code ?? null,
      revenue: 0,
    };
    cur.revenue += toNum(inv.amount);
    byClient.set(inv.client.id, cur);
  }

  const risks = findConcentrationRisks([...byClient.values()], thresholdPct);
  if (risks.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div>
        <span className="font-medium text-foreground">{t("title")}</span>{" "}
        <span className="text-muted-foreground">{t("desc", { pct: formatNumber(thresholdPct, locale), year: fiscalYear })}</span>
        <ul className="mt-1.5 space-y-0.5">
          {risks.map((r) => (
            <li key={r.clientName} className="text-xs text-warning">
              {t("row", {
                client: r.clientName,
                team: r.teamCode ?? "—",
                pct: formatPercent(r.sharePct, locale),
                amount: formatNumber(r.revenue, locale),
              })}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
