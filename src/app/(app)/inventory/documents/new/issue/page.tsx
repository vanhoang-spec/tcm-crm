import { getTranslations } from "next-intl/server";
import { DocForm } from "../../doc-form";
import { loadDocFormData } from "../load";

export default async function NewIssuePage() {
  const t = await getTranslations("inventory.documents");
  const { warehouseOptions, pickerItems, projectOptions } = await loadDocFormData();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newIssue")}</h1>
      <DocForm kind="ISSUE" warehouses={warehouseOptions} items={pickerItems} projects={projectOptions} />
    </div>
  );
}
