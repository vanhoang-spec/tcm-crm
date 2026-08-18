import { getTranslations } from "next-intl/server";
import { RequestForm } from "../../request-form";
import { loadRequestFormData } from "../../load";
import { requirePermission } from "@/lib/permissions";

/**
 * K6: thủ kho ĐỀ XUẤT HỦY hàng KHÁCH GỬI (mã DH) — team Account của dự án chủ duyệt rồi thủ kho mới chốt thành
 * phiếu XH. Hàng TCM vẫn hủy thẳng ở /inventory/documents/new/destroy; hàng khách bị chặn ở đó và trỏ về đây.
 */
export default async function NewDestroyRequestPage() {
  await requirePermission("inventory.destroy");
  const t = await getTranslations("inventory.requests");
  const { warehouseOptions, pickerItems, groupOptions } = await loadRequestFormData("DESTROY");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("newDestroyRequest")}</h1>
        <p className="text-sm text-muted-foreground">{t("newDestroyRequestHint")}</p>
      </div>
      <RequestForm kind="DESTROY" warehouses={warehouseOptions} items={pickerItems} groups={groupOptions} />
    </div>
  );
}
