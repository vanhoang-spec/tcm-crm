import { getTranslations } from "next-intl/server";
import { DocForm } from "../../doc-form";
import { loadDocFormData } from "../load";
import { requirePermission } from "@/lib/permissions";

export default async function NewReturnPage() {
  await requirePermission("inventory.view");
  const t = await getTranslations("inventory.documents");
  const { warehouseOptions, pickerItems, projectsWithHoldings, holdingsByProject } = await loadDocFormData();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newReturn")}</h1>
      <DocForm
        kind="RETURN"
        warehouses={warehouseOptions}
        items={pickerItems}
        projects={projectsWithHoldings}
        holdingsByProject={holdingsByProject}
      />
    </div>
  );
}
