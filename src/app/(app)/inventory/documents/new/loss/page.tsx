import { getTranslations } from "next-intl/server";
import { DocForm } from "../../doc-form";
import { loadDocFormData } from "../load";
import { requirePermission } from "@/lib/permissions";

/**
 * Phiếu BÁO MẤT / HỎNG ở hiện trường (K4) — trừ đồ đang giữ của dự án, KHÔNG cộng lại kho.
 * Đây là lối thoát bắt buộc của kỳ chiến dịch: đồ mất không trả về được, thiếu phiếu này thì dự án
 * kẹt holding vĩnh viễn và bị khoá khỏi mọi lệnh xuất mới.
 */
export default async function NewLossPage() {
  await requirePermission("inventory.view");
  const t = await getTranslations("inventory.documents");
  const { warehouseOptions, pickerItems, projectsWithHoldings, holdingsByProject } = await loadDocFormData();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newLoss")}</h1>
      <DocForm
        kind="LOSS"
        warehouses={warehouseOptions}
        items={pickerItems}
        projects={projectsWithHoldings}
        holdingsByProject={holdingsByProject}
      />
    </div>
  );
}
