import { getTranslations } from "next-intl/server";
import { RequestForm } from "../../request-form";
import { loadRequestFormData } from "../../load";
import { requirePermission } from "@/lib/permissions";

/** Workflow c: PUR/OPE/Account báo hàng về kho (PO, hàng khách gửi, đồ site quay về) — thủ kho nhận. */
export default async function NewIntakeRequestPage() {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const { warehouseOptions, pickerItems, poOptions } = await loadRequestFormData("INTAKE");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newIntakeRequest")}</h1>
      <RequestForm kind="INTAKE" warehouses={warehouseOptions} items={pickerItems} purchaseOrders={poOptions} />
    </div>
  );
}
