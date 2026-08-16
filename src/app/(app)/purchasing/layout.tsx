import { getTranslations } from "next-intl/server";
import { PurchasingNav } from "./purchasing-nav";

/**
 * Sub-module Thu mua (PUR-1): tab RFQ · Nhà cung cấp. Layout chỉ dựng thanh tab — KHÔNG gác quyền ở
 * đây (layout không chặn được server action, HANDOVER 10.1); mỗi page tự requirePermission.
 */
export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("purchasing.nav");
  return (
    <div className="space-y-4">
      <PurchasingNav labels={{ rfq: t("rfq"), vendors: t("vendors") }} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
