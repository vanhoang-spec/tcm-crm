import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getOrderStockLines } from "@/lib/inventory-order";
import { RequestForm, type OrderLineHint } from "../../request-form";
import { loadRequestFormData } from "../../load";
import { requirePermission } from "@/lib/permissions";

/**
 * Workflow a bước 1: OPE đề xuất xuất kho cho dự án (tồn kho CHƯA đổi ở bước này).
 * K6-3: nhận `?projectId&orderId` từ tab Vận hành/Sản xuất — chọn sẵn dự án + hiện bảng vật dụng theo Order.
 */
export default async function NewIssueRequestPage({ searchParams }: { searchParams: Promise<{ projectId?: string; orderId?: string }> }) {
  await requirePermission("inventory.request.create");
  const t = await getTranslations("inventory.requests");
  const { projectId, orderId } = await searchParams;
  const { warehouseOptions, pickerItems, projectOptions, reservedFree, groupOptions } = await loadRequestFormData("ISSUE");
  // Chỉ nhận dự án có trong danh sách hợp lệ của form (đang thực thi) — id lạ thì bỏ qua, không lỗi.
  const initialProjectId = projectId && projectOptions.some((p) => p.id === projectId) ? projectId : undefined;
  let orderLines: OrderLineHint[] = [];
  if (initialProjectId && orderId) {
    const order = await prisma.projectOrder.findFirst({ where: { id: orderId, projectId: initialProjectId }, select: { id: true } });
    if (order) {
      orderLines = (await getOrderStockLines(order.id, initialProjectId)).map((l) => ({
        productCode: l.productCode,
        productName: l.productName,
        quantity: l.quantity,
        requested: l.requested,
        issued: l.issued,
      }));
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newIssueRequest")}</h1>
      <RequestForm
        kind="ISSUE"
        warehouses={warehouseOptions}
        items={pickerItems}
        projects={projectOptions}
        reservedFree={reservedFree}
        groups={groupOptions}
        initialProjectId={initialProjectId}
        orderLines={orderLines}
      />
    </div>
  );
}
