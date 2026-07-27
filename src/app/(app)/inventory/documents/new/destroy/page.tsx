import { getTranslations } from "next-intl/server";
import { DocForm } from "../../doc-form";
import { loadDocFormData } from "../load";
import { requirePermission } from "@/lib/permissions";

/** Phiếu XUẤT HỦY (kho v2): đường ra duy nhất cho hàng hết hạn / trạng thái D — bắt buộc lý do. */
export default async function NewDestroyPage() {
  await requirePermission("inventory.view");
  const t = await getTranslations("inventory.documents");
  const { warehouseOptions, pickerItems } = await loadDocFormData();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newDestroy")}</h1>
      <DocForm kind="DESTROY" warehouses={warehouseOptions} items={pickerItems} />
    </div>
  );
}
