import { notFound } from "next/navigation";
import Link from "next/link";
import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { isSuperAdmin } from "@/lib/chat";

export default async function AllGroupsPage() {
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!(await isSuperAdmin(meId))) notFound();

  const groups = await prisma.conversation.findMany({
    where: { type: "GROUP" },
    include: {
      _count: { select: { members: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <h1 className="text-sm font-semibold text-foreground">{t("superAdminView")}</h1>
        <p className="text-xs text-muted-foreground">{t("superAdminViewHint")}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/chat/${g.id}`} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-surface-2">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Users className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{g.name ?? "—"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t("membersCount", { count: g._count.members })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
