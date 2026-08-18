import { getTranslations } from "next-intl/server";
import { RequestForm } from "../../request-form";
import { loadRequestFormData } from "../../load";
import { requirePermission } from "@/lib/permissions";

/** K4: điều chuyển giữa 2 kho nay phải qua duyệt — tồn kho CHƯA đổi ở bước đề xuất này. */
export default async function NewTransferRequestPage() {
  await requirePermission("inventory.transfer.create");
  const t = await getTranslations("inventory.requests");
  const { warehouseOptions, pickerItems, groupOptions } = await loadRequestFormData("TRANSFER");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newTransferRequest")}</h1>
      <RequestForm kind="TRANSFER" warehouses={warehouseOptions} items={pickerItems} groups={groupOptions} />
    </div>
  );
}
