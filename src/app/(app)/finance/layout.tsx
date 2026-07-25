import { getTranslations } from "next-intl/server";
import { FinanceNav } from "./finance-nav";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("finance.nav");
  const labels = { advances: t("advances"), vendorPayments: t("vendorPayments"), debt: t("debt"), cashflow: t("cashflow") };

  return (
    <div className="space-y-4">
      <FinanceNav labels={labels} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
