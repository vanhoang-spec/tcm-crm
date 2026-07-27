"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { NumberField } from "@/components/ui/number-field";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createClientInvoice, recordClientPayment, voidClientInvoice, type FinanceFormState } from "../actions";

/**
 * Hai form của trang Công nợ, tách ra client để HIỆN LỖI từ server action.
 *
 * Trước đây form gọi thẳng action (server component): action bị chặn thì chỉ `return` rỗng — form
 * đóng lại, không có dòng mới, kế toán tưởng đã lưu. Tiền vào sổ sai từ đó. Nay dùng useActionState
 * như NewAdvanceForm bên bảng tạm ứng.
 */

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function ErrorLine({ state }: { state: FinanceFormState }) {
  if (!state.error) return null;
  return (
    <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
      {state.error}
    </p>
  );
}

export function CreateInvoiceForm({ projects }: { projects: { value: string; label: string }[] }) {
  const t = useTranslations("finance.debt");
  const tc = useTranslations("finance.common");
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(createClientInvoice, {});

  return (
    <form action={formAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="text-xs text-muted-foreground">
        {tc("projectLabel")}
        <SearchableSelect name="projectId" required placeholder={tc("selectProject")} options={projects} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("invoiceNo")}
        <input name="invoiceNo" required className={input} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("amount")}
        <NumberField name="amount" required className={input} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("invoiceDate")}
        <DateField name="invoiceDate" className={input} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("dueDate")}
        <DateField name="dueDate" className={input} />
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {t("createInvoice")}
        </button>
      </div>
      <div className="sm:col-span-3">
        <ErrorLine state={state} />
      </div>
    </form>
  );
}

/** Huỷ hóa đơn xuất sai. Ẩn sau một cú bấm — mở ra mới thấy ô lý do (lý do bắt buộc ở server). */
export function VoidInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("finance.debt");
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(
    voidClientInvoice.bind(null, invoiceId),
    {},
  );

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted-foreground hover:text-danger">
        {t("voidBtn")}
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input name="voidNote" placeholder={t("voidNotePlaceholder")} className={input + " w-56"} />
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-lg border border-danger/40 px-3 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-60"
      >
        {t("voidBtn")}
      </button>
      {state.error && (
        <p className="text-xs text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function RecordPaymentForm({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("finance.debt");
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(
    recordClientPayment.bind(null, invoiceId),
    {},
  );

  return (
    <form action={formAction} className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          {t("paymentAmount")}
          <NumberField name="amount" className={input + " w-40"} />
        </label>
        <label className="text-xs text-muted-foreground">
          {t("paidDate")}
          <DateField name="paidDate" className={input + " w-40"} />
        </label>
        <label className="text-xs text-muted-foreground">
          {t("method")}
          <input name="method" className={input + " w-40"} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {t("recordPayment")}
        </button>
      </div>
      <div className="mt-2">
        <ErrorLine state={state} />
      </div>
    </form>
  );
}
