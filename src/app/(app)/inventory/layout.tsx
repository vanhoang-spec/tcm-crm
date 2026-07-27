import { getTranslations } from "next-intl/server";
import { InventoryNav } from "./inventory-nav";

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("inventory.nav");
  const labels = { stock: t("stock"), requests: t("requests"), documents: t("documents"), items: t("items") };

  return (
    <div className="space-y-4">
      <InventoryNav labels={labels} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
