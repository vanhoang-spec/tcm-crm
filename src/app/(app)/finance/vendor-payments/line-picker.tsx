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
 * DỰ ÁN — nay cũng có trần (tổng số thực trả còn lại của dự án), vượt trần phải có quyền riêng
 * kèm lý do. Dự án là BẮT BUỘC ở cả hai đường.
 *
 * Chỉ liệt kê dòng CÒN hạn mức: chọn dòng đã hết rồi bấm lưu thì server chặn im lặng, người dùng
 * không hiểu vì sao — thà không cho chọn.
 */
export function VendorPaymentLinePicker({
  projects,
  lines,
  projectCaps,
}: {
  projects: { value: string; label: string }[];
  lines: PickerLine[];
  projectCaps: Record<string, { remaining: number; hasLines: boolean }>;
}) {
  const t = useTranslations("finance.vendorPayments");
  const tc = useTranslations("finance.common");
  const [projectId, setProjectId] = useState("");

  const available = lines.filter((l) => l.projectId === projectId && l.remaining > 0);
  const cap = projectId ? projectCaps[projectId] : undefined;

  return (
    <>
      <label className="text-xs text-muted-foreground">
        {tc("projectLabel")}
        <SearchableSelect name="projectId" value={projectId} onChange={setProjectId} placeholder="—" options={projects} />
        {cap &&
          (cap.hasLines ? (
            <span className="mt-1 block text-[11px] leading-snug">
              {t("projectRemaining", { amount: formatNumber(cap.remaining, "vi") })}
            </span>
          ) : (
            <span className="mt-1 block text-[11px] leading-snug text-warning">{t("projectNoLines")}</span>
          ))}
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
