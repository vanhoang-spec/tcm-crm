"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatNumber } from "@/lib/utils";

export type PickerLine = {
  id: string;
  projectId: string;
  itemCode: string | null;
  itemName: string;
  sectionName: string;
  /** Còn được chi = thực trả − đã ứng − đã trả. Dòng hết hạn mức không cho chọn. */
  remaining: number;
};

/**
 * Chọn dự án → chọn dòng chi phí của dự án đó.
 *
 * Hai ô phải đi cùng nhau: `createVendorPayment` khi có dòng chi phí sẽ lấy projectId TỪ DÒNG
 * (không tin ô chọn dự án), và áp trần chi chung với tạm ứng. Bỏ trống ô dòng = khoản chi cấp
 * dự án như trước, không có trần theo dòng.
 *
 * Chỉ liệt kê dòng CÒN hạn mức: chọn dòng đã hết rồi bấm lưu thì server chặn im lặng, người dùng
 * không hiểu vì sao — thà không cho chọn.
 */
export function VendorPaymentLinePicker({
  projects,
  lines,
}: {
  projects: { value: string; label: string }[];
  lines: PickerLine[];
}) {
  const t = useTranslations("finance.vendorPayments");
  const tc = useTranslations("finance.common");
  const [projectId, setProjectId] = useState("");

  const available = lines.filter((l) => l.projectId === projectId && l.remaining > 0);

  return (
    <>
      <label className="text-xs text-muted-foreground">
        {tc("projectLabel")}
        <SearchableSelect name="projectId" value={projectId} onChange={setProjectId} placeholder="—" options={projects} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("costLine")}
        <SearchableSelect
          name="financeCostLineId"
          placeholder={projectId ? (available.length ? t("costLinePlaceholder") : t("costLineNone")) : t("costLinePickProject")}
          options={available.map((l) => ({
            value: l.id,
            label: `${l.itemCode ? l.itemCode + " · " : ""}${l.itemName} — ${t("costLineRemaining", { amount: formatNumber(l.remaining, "vi") })}`,
          }))}
        />
        <span className="mt-1 block text-[11px] leading-snug">{t("costLineHint")}</span>
      </label>
    </>
  );
}
