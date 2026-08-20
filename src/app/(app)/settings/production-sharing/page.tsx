import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { readProductionSharing } from "@/lib/purchasing-scope";
import { SharingForm, type SharingVendor } from "./sharing-form";

/**
 * Cấu hình: phòng SẢN XUẤT được dùng chung nhóm hàng / NCC nào của Thu mua.
 *
 * ⚠ Gác `settings.vendors.manage` (BGĐ + Trưởng phòng Thu mua) — KHÔNG mã quyền mới. Chia sẻ hồ sơ
 * NCC cho phòng khác là quyết định của người quản lý hồ sơ NCC.
 */
export default async function ProductionSharingPage() {
  await requirePermission("settings.vendors.manage");
  const t = await getTranslations("settings.productionSharing");

  const [shared, rows] = await Promise.all([
    readProductionSharing(),
    prisma.vendor.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, groups: { select: { groupCode: true } } },
    }),
  ]);
  const vendors: SharingVendor[] = rows.map((v) => ({ id: v.id, code: v.code, name: v.name, groupCodes: v.groups.map((g) => g.groupCode) }));

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <SharingForm vendors={vendors} initialGroups={shared.groupCodes} initialVendors={shared.vendorIds} />
      </div>
    </div>
  );
}
