import Link from "next/link";
import { FileDown } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { requirePermission } from "@/lib/permissions";
import { loadBudgetYears, loadOverheadReport } from "@/lib/overhead-data";
import { formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { Badge } from "@/components/ui/badge";
import { YearPicker } from "./year-picker";

export default async function OverheadOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; upTo?: string }>;
}) {
  await requirePermission("overhead.view");
  const sp = await searchParams;

  // Xuất Excel đi kèm quyền XEM, không đẻ mã riêng: ai đọc được bảng trên màn hình thì tải cùng nội
  // dung đó về không tăng rủi ro (mirror lý do dùng lại `bidding.view` cho route xuất báo giá).
  const [t, locale, years] = await Promise.all([
    getTranslations("overhead"),
    getLocale() as Promise<Locale>,
    loadBudgetYears(),
  ]);

  const year = Number(sp.year) || years[0] || new Date().getFullYear();
  const upTo = sp.upTo ? Number(sp.upTo) : undefined;
  const data = await loadOverheadReport(year, upTo);
  const money = (n: number) => `${formatNumber(n, locale)}đ`;

  if (!data) {
    return (
      <div className="space-y-4">
        <YearPicker years={years} current={year} />
        <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
          {t("noBudget", { year })}{" "}
          <Link href={`/overhead/budget?year=${year}`} className="text-brand-600 hover:underline">
            {t("goBudget")}
          </Link>
        </p>
      </div>
    );
  }

  const { header, report, cap } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <YearPicker years={years} current={year} />
        <div className="flex items-center gap-2">
          <Badge tone={header.status === "LOCKED" ? "success" : header.status === "REJECTED" ? "danger" : "warning"}>
            {t(`status${header.status}` as "statusLOCKED")}
          </Badge>
          <a
            href={`/api/overhead/export?year=${year}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            <FileDown className="h-3.5 w-3.5" />
            {t("export")}
          </a>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("totalPlan")} value={money(report.totals.planYear)} />
        <Stat label={t("totalPaid")} value={money(report.totals.paidYtd)} tone="danger" />
        <Stat label={t("totalScheduled")} value={money(report.totals.scheduledYtd)} tone="warning" />
        <Stat
          label={t("totalRemaining")}
          value={money(report.totals.remaining)}
          tone={report.totals.remaining < 0 ? "danger" : "success"}
        />
      </section>

      <p className="text-xs text-muted-foreground">
        {t("laneHint")} · {t("upToMonth")} {cap}
        {report.totals.overBudgetItems > 0 && (
          <span className="ml-2 text-danger">{t("overBudgetItems", { n: report.totals.overBudgetItems })}</span>
        )}
      </p>

      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("colPid")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colName")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colCategory")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("colPlanYear")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("colPlanYtd")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("colPaid")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("colScheduled")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("colRemaining")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.items.map((i) => (
              <tr key={i.itemId} className={i.isActive ? undefined : "opacity-50"}>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{i.pidCode}</td>
                <td className="px-3 py-2">
                  <span className="text-foreground">{i.name}</span>
                  {/* Số của khoản lương KHÔNG nhập tay được. Nhưng bản import 2026 đã mang sẵn số chi
                      lương thật của các tháng đã qua, nên nhãn phải phân biệt hai ca: có số rồi thì
                      ghi NGUỒN, chưa có số mới ghi CHỜ. Để nguyên chữ "chờ Payroll" cạnh một con số
                      6,3 tỷ là nói dối người đọc báo cáo. */}
                  {i.actualSource === "PAYROLL" && (
                    <span className="ml-1.5 rounded bg-surface-2 px-1.5 text-[10px] text-muted-foreground" title={t("payrollHint")}>
                      {i.paidYtd > 0 ? t("payrollSource") : t("payrollPending")}
                    </span>
                  )}
                  {!i.isActive && <span className="ml-1.5 text-[10px] text-muted-foreground">({t("inactive")})</span>}
                </td>
                <td className="px-3 py-2 text-[11px] text-muted-foreground">{i.categoryLabel}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(i.planYear)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(i.planYtd)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(i.paidYtd)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-warning">
                  {i.scheduledYtd > 0 ? money(i.scheduledYtd) : "—"}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${i.overBudget ? "text-danger" : "text-success"}`}>
                  {money(i.remaining)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "danger" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
