import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/permissions";
import { OverheadNav } from "./overhead-nav";

export default async function OverheadLayout({ children }: { children: React.ReactNode }) {
  // Gác ở layout CHỈ để khỏi render khung cho người không có quyền — KHÔNG phải hàng rào thật.
  // Hàng rào thật là requirePermission ở đầu từng page.tsx và từng server action (HANDOVER 10.1:
  // layout không re-render khi điều hướng phía client và không chặn được server action).
  await requirePermission("overhead.view");
  const t = await getTranslations("overhead");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>
      {/* useSearchParams cần Suspense khi render tĩnh — bọc lại cho khỏi vỡ build. */}
      <Suspense fallback={<div className="h-10" />}>
        <OverheadNav labels={{ overview: t("navOverview"), spends: t("navSpends"), budget: t("navBudget") }} />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
