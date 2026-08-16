import { getTranslations } from "next-intl/server";
import { hasPermission } from "@/lib/permissions";
import { FinanceNav } from "./finance-nav";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const [t, canSeeCashflow] = await Promise.all([
    getTranslations("finance.nav"),
    // Chỉ là TRANG TRÍ (ẩn tab cho người bấm vào chỉ để bị đá về SAFE_LANDING) — hàng rào thật
    // là requirePermission("dashboard.cashflow") ở đầu trang cashflow. Không gate bằng layout.
    hasPermission("dashboard.cashflow"),
  ]);
  const labels = { advances: t("advances"), vendorPayments: t("vendorPayments"), debt: t("debt"), cashflow: t("cashflow") };

  return (
    <div className="space-y-4">
      <FinanceNav labels={labels} showCashflow={canSeeCashflow} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
