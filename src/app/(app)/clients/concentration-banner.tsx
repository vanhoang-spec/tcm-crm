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
 * chính hiện tại. Không đối tượng nào vượt ngưỡng → không hiện gì.
 *
 * H1: gom theo NHÓM khách hàng. Rủi ro thật nằm ở nhóm — AEON 4 pháp nhân ký riêng, mỗi bên
 * ~15% nên trước đây không bao giờ vượt ngưỡng, trong khi mất cả nhóm là mất 60%.
 * ⚠ Nhóm vắt nhiều team thì mẫu số là TOÀN CÔNG TY (xem findConcentrationRisks) — nhãn dòng phải
 * nói rõ để BGĐ không đọc nhầm hai loại % là cùng một thước.
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
      client: {
        select: {
          id: true,
          name: true,
          groupId: true,
          ownerTeam: { select: { code: true } },
          group: { select: { name: true } },
        },
      },
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
      groupId: inv.client.groupId,
      groupName: inv.client.group?.name ?? null,
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
            <li key={r.subjectName} className="text-xs text-warning">
              {r.teamCode
                ? t("rowTeam", {
                    subject: r.subjectName,
                    team: r.teamCode,
                    pct: formatPercent(r.sharePct, locale),
                    amount: formatNumber(r.revenue, locale),
                  })
                : t("rowCompany", {
                    subject: r.subjectName,
                    members: r.memberCount,
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
