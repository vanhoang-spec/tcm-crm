"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber, cn } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { NewAdvanceForm } from "../finance/advance-board";

export type RequestLine = {
  id: string;
  itemCode: string | null;
  sectionName: string;
  itemName: string;
  /** Còn được chi thêm của dòng (payCap − đã ứng − đã thanh toán) — cùng con số server chặn. */
  remaining: number;
  vendorId: string | null;
  vendors: { id: string; label: string }[];
  staff: { id: string; label: string }[];
};

/**
 * Bảng dòng chi phí RÚT GỌN cho người đề nghị tạm ứng: tên dòng + còn được chi + form đề nghị.
 *
 * CỐ Ý không dùng lại AdvanceBoard của /finance: bảng đó mang các nút của kế toán (xác nhận chi,
 * hoàn ứng, huỷ) và danh sách tạm ứng của NGƯỜI KHÁC kèm số tài khoản ngân hàng của họ — không
 * phải thứ để mở cho 20 nhóm quyền. Form đề nghị thì DÙNG CHUNG (NewAdvanceForm) để một hành vi.
 */
export function MyRequestBoard({ lines }: { lines: RequestLine[] }) {
  const t = useTranslations("myAdvances");
  const tAdv = useTranslations("finance.advances");
  const locale = useLocale() as Locale;
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[1.2fr_1.8fr_1fr_auto] gap-2 border-b border-border pb-1.5 text-[11px] font-medium text-muted-foreground">
          <span>{tAdv("colSection")}</span>
          <span>{tAdv("colItem")}</span>
          <span className="text-right">{t("colRemaining")}</span>
          <span className="w-16" />
        </div>
        {lines.map((line) => {
          const isOpen = openId === line.id;
          const canRequest = line.remaining > 0;
          return (
            <div key={line.id} className="border-b border-border/60">
              <div className="grid grid-cols-[1.2fr_1.8fr_1fr_auto] items-center gap-2 py-1.5 text-sm">
                <span className="truncate text-xs text-muted-foreground">{line.sectionName}</span>
                <span className="flex items-center gap-1 truncate text-foreground">
                  {canRequest && (
                    <button type="button" onClick={() => setOpenId(isOpen ? null : line.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  {line.itemCode && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{line.itemCode}</span>}
                  <span className="truncate">{line.itemName}</span>
                </span>
                <span className={cn("text-right tabular-nums font-medium", canRequest ? "text-success" : "text-muted-foreground")}>
                  {formatNumber(line.remaining, locale)}
                </span>
                <span className="flex w-16 justify-end">
                  {canRequest && (
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : line.id)}
                      className="rounded-lg bg-brand-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-600"
                    >
                      {tAdv("advanceBtn")}
                    </button>
                  )}
                </span>
              </div>
              {isOpen && canRequest && (
                <div className="mb-2 rounded-lg border border-border bg-surface-2/40 p-3">
                  <NewAdvanceForm line={line} t={tAdv} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
