"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { NumberField } from "@/components/ui/number-field";
import { DateField } from "@/components/ui/date-field";
import { createLiquidationInvoice, type LiquidationInvoiceState } from "../../actions";

/**
 * Phát hành hóa đơn ngay tại tab Nghiệm thu. Số tiền điền sẵn = phần CÒN ĐƯỢC XUẤT của bản CO/CE
 * đã chuyển nghiệm thu, nên kế toán không phải tự tra rồi gõ lại — đó chính là chỗ trước đây sinh
 * ra hai con số khác nhau giữa dự án và công nợ.
 */
const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function LiquidationInvoiceForm({
  projectId,
  milestones,
  suggestedAmount,
  defaultInvoiceDate,
  defaultDueDate,
}: {
  projectId: string;
  /** Đợt thu (C5) — rỗng thì ẩn ô chọn. */
  milestones: { value: string; label: string }[];
  suggestedAmount: number;
  defaultInvoiceDate: string;
  defaultDueDate: string;
}) {
  const t = useTranslations("projects.liquidation");
  const [state, formAction, pending] = useActionState<LiquidationInvoiceState, FormData>(
    createLiquidationInvoice.bind(null, projectId),
    {},
  );

  return (
    <form action={formAction} className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("invoiceNoLabel")}</label>
        <input name="invoiceNo" required className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("invoiceAmountLabel")}</label>
        <NumberField name="amount" defaultValue={suggestedAmount} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("invoiceDateLabel")}</label>
        <DateField name="invoiceDate" defaultValue={defaultInvoiceDate} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("invoiceDueDateLabel")}</label>
        <DateField name="dueDate" defaultValue={defaultDueDate} className={input} />
      </div>
      {milestones.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">{t("msPickLabel")}</label>
          <select name="milestoneId" defaultValue="" className={input}>
            <option value="">{t("msPickNone")}</option>
            {milestones.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      )}
      <div className={milestones.length > 0 ? "" : "sm:col-span-2"}>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("invoiceNoteLabel")}</label>
        <input name="note" className={input} />
      </div>
      {state.error && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-danger sm:col-span-2" role="alert">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {t("invoiceCreateBtn")}
        </button>
      </div>
    </form>
  );
}
