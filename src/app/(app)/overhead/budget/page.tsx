import { getTranslations } from "next-intl/server";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { loadBudgetYears, loadBudgetHeader, loadOverheadReport } from "@/lib/overhead-data";
import { isBudgetEditable } from "@/lib/overhead";
import { YearPicker } from "../year-picker";
import { ImportPanel, DuplicatePanel, ApprovalPanel, BudgetItemTable } from "./budget-panels";

export default async function OverheadBudgetPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  await requirePermission("overhead.view");
  const sp = await searchParams;

  const [t, years, canManage, canCfo, canCeo] = await Promise.all([
    getTranslations("overhead"),
    loadBudgetYears(),
    hasPermission("overhead.budget.manage"),
    hasPermission("overhead.budget.approve_cfo"),
    hasPermission("overhead.budget.approve_ceo"),
  ]);

  const year = Number(sp.year) || years[0] || new Date().getFullYear();
  const [header, data] = await Promise.all([loadBudgetHeader(year), loadOverheadReport(year)]);
  const latestYear = years[0];

  return (
    <div className="space-y-4">
      <YearPicker years={years} current={year} />

      {!header && canManage && <ImportPanel fiscalYear={year} />}
      {!header && !canManage && (
        <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
          {t("noBudget", { year })}
        </p>
      )}

      {header && (
        <>
          <ApprovalPanel header={header} canManage={canManage} canCfo={canCfo} canCeo={canCeo} />
          {data && (
            <BudgetItemTable
              fiscalYear={year}
              items={data.report.items}
              editable={isBudgetEditable(header.status)}
              canManage={canManage}
            />
          )}
        </>
      )}

      {/* Nhân bản chỉ hiện ở năm MỚI NHẤT: nhân bản từ năm cũ sẽ đè lên năm đã có, hoặc tạo bản dựa
          trên số đã lỗi thời. Ẩn nút là cách rẻ nhất để không phải giải thích ca đó.
          Và chỉ khi năm nguồn ĐÃ KHOÁ: nhân bản từ một bản còn DRAFT/chờ duyệt là lấy con số chưa ai
          chốt làm nền cho cả năm sau — người bấm không có cách nào biết mình đang copy số nháp. */}
      {canManage && year === latestYear && header?.status === "LOCKED" && !years.includes(year + 1) && (
        <DuplicatePanel fromYear={year} />
      )}
    </div>
  );
}
