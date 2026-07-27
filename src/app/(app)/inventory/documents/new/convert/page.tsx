import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { completeSets } from "@/lib/inventory";
import { ConvertForm, type ConvertPickerItem } from "../../convert-form";
import { requirePermission } from "@/lib/permissions";

/** Phiếu CHUYỂN ĐỔI LÔ (kho v2, Câu 2): đổi trạng thái/tình trạng = chạy số lượng giữa 2 mã trong cùng kho. */
export default async function NewConvertPage() {
  await requirePermission("inventory.view");
  const t = await getTranslations("inventory.documents");
  const [warehouses, lots] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: [{ isMain: "desc" }, { code: "asc" }] }),
    prisma.inventoryItem.findMany({
      // Chỉ lô v2 (có trạng thái) chọn ở CẤP CHA — phần con chuyển cùng cả bộ
      where: { isActive: true, parentItemId: null, statusCode: { not: null } },
      include: { balances: true, parts: { where: { isActive: true }, include: { balances: true } } },
      orderBy: { code: "asc" },
    }),
  ]);

  const items: ConvertPickerItem[] = lots.map((it) => {
    const isSet = it.partCount > 1;
    const balances: Record<string, number> = {};
    if (isSet) {
      // available theo kho = số BỘ đủ = min tồn các phần trong kho đó
      for (const w of warehouses) {
        balances[w.id] = completeSets(it.parts.map((p) => p.balances.find((b) => b.warehouseId === w.id)?.quantity ?? 0));
      }
    } else {
      for (const b of it.balances) balances[b.warehouseId] = b.quantity;
    }
    return {
      id: it.id,
      code: it.code,
      name: it.name,
      unit: it.unit,
      statusCode: it.statusCode!,
      conditionCode: it.conditionCode ?? "B",
      isSet,
      balances,
    };
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">{t("newConvert")}</h1>
      <ConvertForm warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} items={items} />
    </div>
  );
}
