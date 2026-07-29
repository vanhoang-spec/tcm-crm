import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { CreateGroupForm, GroupRow } from "./group-forms";

/**
 * Quản trị NHÓM KHÁCH HÀNG — gom các pháp nhân cùng một "family" (vd AEON gom 4 mall).
 * Đặt trong module ① Khách hàng chứ không phải /settings vì đây là dữ liệu nghiệp vụ do Account
 * quản, không phải cấu hình hệ thống. Dùng lại quyền `clients.manage`, không đẻ mã quyền mới.
 */
export default async function ClientGroupsPage() {
  await requirePermission("clients.manage");
  const t = await getTranslations("clients.groups");
  const groups = await prisma.clientGroup.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { clients: true } } },
  });

  return (
    <div className="space-y-4">
      <div>
        <Link href="/clients" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
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
        {groups.map((g) => (
          <li key={g.id} className={"rounded-xl border border-border bg-surface p-3" + (g.isActive ? "" : " opacity-50")}>
            <p className="font-mono text-sm font-semibold text-foreground">{g.code}</p>
            <p className="text-sm text-foreground">{g.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("memberCount", { count: g._count.clients })}</p>
            {g.note && <p className="mt-0.5 text-xs text-muted-foreground">{g.note}</p>}
          </li>
        ))}
      </ul>

      {/* Desktop */}
      <div className="hidden rounded-xl border border-border bg-surface sm:block">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">{t("colCode")}</th>
                <th className="px-4 py-2.5">{t("colName")}</th>
                <th className="px-4 py-2.5">{t("colNote")}</th>
                <th className="px-4 py-2.5 text-right">{t("colMembers")}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {groups.map((g) => (
                <GroupRow key={g.id} group={g} memberCount={g._count.clients} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
