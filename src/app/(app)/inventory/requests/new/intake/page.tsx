import { getTranslations } from "next-intl/server";
import { RequestForm } from "../../request-form";
import { loadRequestFormData } from "../../load";
import { requirePermission } from "@/lib/permissions";

/** Workflow c: PUR/OPE/Account báo hàng về kho (PO, hàng khách gửi, tồn đầu kỳ) — thủ kho nhận. Đồ từ SITE về đi phiếu TH (K5), KHÔNG qua đây. */
export default async function NewIntakeRequestPage() {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const { warehouseOptions, pickerItems, poOptions, groupOptions } = await loadRequestFormData("INTAKE");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newIntakeRequest")}</h1>
      <RequestForm kind="INTAKE" warehouses={warehouseOptions} items={pickerItems} purchaseOrders={poOptions} groups={groupOptions} />
    </div>
  );
}
