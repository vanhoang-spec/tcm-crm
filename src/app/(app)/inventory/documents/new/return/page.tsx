import { getTranslations } from "next-intl/server";
import { ReturnForm } from "../../return-form";
import { loadDocFormData } from "../load";
import { hasPermission, requirePermission } from "@/lib/permissions";

/**
 * Trả đồ từ hiện trường về kho. K5: mỗi dòng khai được trạng thái/tình trạng THỰC TẾ lúc về —
 * phần khai lại đòi thêm quyền `inventory.lot.convert` (server kiểm lại, đây chỉ là ẩn/hiện ô).
 */
export default async function NewReturnPage() {
  await requirePermission("inventory.view");
  const t = await getTranslations("inventory.documents");
  const [{ warehouseOptions, projectsWithHoldings, holdingsByProject }, canRedeclare] = await Promise.all([
    loadDocFormData(),
    hasPermission("inventory.lot.convert"),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newReturn")}</h1>
      <ReturnForm
        warehouses={warehouseOptions}
        projects={projectsWithHoldings}
        holdingsByProject={holdingsByProject}
        canRedeclare={canRedeclare}
      />
    </div>
  );
}
