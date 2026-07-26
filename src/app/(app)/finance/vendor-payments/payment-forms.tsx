"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { NumberField } from "@/components/ui/number-field";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createVendorPayment, markVendorPaymentPaid, type FinanceFormState } from "../actions";
import { VendorPaymentLinePicker, type PickerLine } from "./line-picker";

/**
 * Form thanh toán NCC, tách ra client để HIỆN LỖI từ server action.
 *
 * Đây là chỗ nguy hiểm nhất: phiếu vượt trần dòng chi phí bị chặn TRONG transaction, nhưng trước
 * đây action chỉ `return` rỗng nên form đóng lại như đã lưu thành công. Kế toán không có cách nào
 * biết phiếu chưa được ghi.
 */

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function CreateVendorPaymentForm({
  vendors,
  projects,
  lines,
}: {
  vendors: { value: string; label: string }[];
  projects: { value: string; label: string }[];
  lines: PickerLine[];
}) {
  const t = useTranslations("finance.vendorPayments");
  const tc = useTranslations("finance.common");
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(createVendorPayment, {});

  return (
    <form action={formAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="text-xs text-muted-foreground">
        {t("vendor")}
        <SearchableSelect name="vendorId" required placeholder={t("selectVendor")} options={vendors} />
      </label>
      <VendorPaymentLinePicker projects={projects} lines={lines} />
      <label className="text-xs text-muted-foreground">
        {tc("amount")}
        <NumberField name="amount" className={input} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("dueDate")}
        <DateField name="dueDate" className={input} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("invoiceNo")}
        <input name="invoiceNo" className={input} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("note")}
        <input name="note" className={input} />
      </label>
      {state.error && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-danger sm:col-span-2" role="alert">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {t("create")}
        </button>
      </div>
    </form>
  );
}

export function MarkPaidButton({ id }: { id: string }) {
  const t = useTranslations("finance.vendorPayments");
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(
    markVendorPaymentPaid.bind(null, id),
    {},
  );

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-success/40 px-2 py-1 text-xs font-medium text-success hover:bg-success/10 disabled:opacity-60"
      >
        {t("markPaid")}
      </button>
      {state.error && (
        <p className="mt-1 text-[11px] text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
