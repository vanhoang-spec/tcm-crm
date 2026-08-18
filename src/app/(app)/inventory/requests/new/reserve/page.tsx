import { getTranslations } from "next-intl/server";
import { RequestForm } from "../../request-form";
import { loadRequestFormData } from "../../load";
import { requirePermission } from "@/lib/permissions";

/**
 * Workflow b bước 1 (K3): Account xin GIỮ CHỖ hàng còn tồn cho dự án sắp chạy, để đưa vào CO với
 * đơn giá 0. Tồn kho KHÔNG đổi ở bước này — giữ chỗ chỉ là lời hứa mềm cho tới khi OPE xuất thật.
 */
export default async function NewReserveRequestPage() {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const { warehouseOptions, pickerItems, projectOptions, reservedFree, groupOptions } = await loadRequestFormData("RESERVE");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newReserveRequest")}</h1>
      <RequestForm
        kind="RESERVE"
        warehouses={warehouseOptions}
        items={pickerItems}
        projects={projectOptions}
        reservedFree={reservedFree}
        groups={groupOptions}
      />
    </div>
  );
}
