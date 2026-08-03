import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { formatNumber, toNum } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { CreateGroupForm, GroupRow } from "./group-forms";

/**
 * Quản trị NHÓM CHIẾN DỊCH — gom nhiều dự án của cùng một chiến dịch nhiều giai đoạn
 * (vd KUN đường trượt 10 tỉnh = phase 1 + phase 2). Trước đây "phase" chỉ nằm trong tên dự án.
 *
 * Đặt trong module ③ Dự án chứ không phải /settings vì đây là dữ liệu nghiệp vụ do Account quản.
 * Dùng lại quyền `bidding.project.manage` — KHÔNG đẻ mã quyền mới.
 *
 * ⚠ Số ở đây chỉ ĐỌC VÀ CỘNG từ bảng CO/CE sống + hoá đơn đã phát hành; không lưu tổng nào của
 * nhóm (bất biến "không tạo hệ thống tổng tiền song song", HANDOVER mục 6).
 */
export default async function ProjectGroupsPage() {
  await requirePermission("bidding.project.manage");
  const [t, locale, groups] = await Promise.all([
    getTranslations("projects.groups"),
    getLocale() as Promise<Locale>,
    prisma.projectGroup.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        projects: {
          select: {
            id: true,
            code: true,
            name: true,
            costSheets: { where: { version: "CTRACT" }, orderBy: { createdAt: "desc" }, take: 1, select: { coTotal: true, ceTotal: true, chiHo: true } },
            clientInvoices: { where: { voidedAt: null }, select: { amount: true } },
          },
        },
      },
    }),
  ]);

  const money = (n: number) => formatNumber(n, locale);
  const rollup = (g: (typeof groups)[number]) => {
    let co = 0;
    let ce = 0;
    let invoiced = 0;
    for (const p of g.projects) {
      const sheet = p.costSheets[0];
      if (sheet) {
        co += toNum(sheet.coTotal);
        // Cộng Chi hộ vào cột "khách phải trả" đúng định nghĩa clientBillableTotal.
        ce += toNum(sheet.ceTotal) + toNum(sheet.chiHo);
      }
      invoiced += p.clientInvoices.reduce((s, i) => s + toNum(i.amount), 0);
    }
    return { co: money(co), ce: money(ce), invoiced: money(invoiced) };
  };

  return (
    <div className="space-y-4">
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <CreateGroupForm />

      {/* Mobile */}
      <ul className="space-y-2 sm:hidden">
        {groups.length === 0 && <li className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{t("empty")}</li>}
        {groups.map((g) => {
          const m = rollup(g);
          return (
            <li key={g.id} className={"rounded-xl border border-border bg-surface p-3" + (g.isActive ? "" : " opacity-50")}>
              <p className="font-mono text-sm font-semibold text-foreground">{g.code}</p>
              <p className="text-sm text-foreground">{g.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("memberCount", { count: g.projects.length })}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("colCe")}: <span className="tabular-nums text-foreground">{m.ce}</span> · {t("colInvoiced")}:{" "}
                <span className="tabular-nums">{m.invoiced}</span>
              </p>
              <ul className="mt-1 space-y-0.5">
                {g.projects.map((p) => (
                  <li key={p.id} className="text-[11px] text-muted-foreground">
                    <Link href={`/projects/${p.id}`} className="hover:underline">
                      {p.code} — {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      {/* Desktop */}
      <div className="hidden rounded-xl border border-border bg-surface sm:block">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">{t("colCode")}</th>
                <th className="px-4 py-2.5">{t("colName")}</th>
                <th className="px-4 py-2.5 text-right">{t("colProjects")}</th>
                <th className="px-4 py-2.5 text-right">{t("colCo")}</th>
                <th className="px-4 py-2.5 text-right">{t("colCe")}</th>
                <th className="px-4 py-2.5 text-right">{t("colInvoiced")}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {groups.map((g) => (
                <GroupRow key={g.id} group={g} projectCount={g.projects.length} money={rollup(g)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("rollupHint")}</p>
    </div>
  );
}
