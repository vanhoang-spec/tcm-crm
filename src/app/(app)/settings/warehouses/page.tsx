import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { WarehouseRow } from "./warehouse-row";
import { WarehouseCreateForm } from "./warehouse-create-form";
import { requirePermission } from "@/lib/permissions";

export default async function WarehousesSettingsPage() {
  await requirePermission("settings.warehouses.manage");
  const t = await getTranslations("settings.warehouses");
  const warehouses = await prisma.warehouse.findMany({ orderBy: [{ isMain: "desc" }, { code: "asc" }] });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="space-y-2">
        {warehouses.map((w) => (
          <WarehouseRow key={w.id} warehouse={w} />
        ))}
      </div>
      <WarehouseCreateForm />
    </div>
  );
}
