import { getTranslations } from "next-intl/server";
import { RequestForm } from "../../request-form";
import { loadRequestFormData } from "../../load";
import { requirePermission } from "@/lib/permissions";

/** Workflow a bước 1: OPE đề xuất xuất kho cho dự án (tồn kho CHƯA đổi ở bước này). */
export default async function NewIssueRequestPage() {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const { warehouseOptions, pickerItems, projectOptions, reservedFree, groupOptions } = await loadRequestFormData("ISSUE");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newIssueRequest")}</h1>
      <RequestForm kind="ISSUE" warehouses={warehouseOptions} items={pickerItems} projects={projectOptions} reservedFree={reservedFree} groups={groupOptions} />
    </div>
  );
}
