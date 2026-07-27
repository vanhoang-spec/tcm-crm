"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { NumberField } from "@/components/ui/number-field";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createClientInvoice, recordClientPayment, voidClientInvoice, type FinanceFormState, type FinanceFormStateWithValues } from "../actions";

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

export function CreateInvoiceForm({
  projects,
  projectCaps,
  milestonesByProject,
}: {
  projects: { value: string; label: string }[];
  /** Trần còn được xuất theo dự án (CE + Chi hộ của CO/CE hiện hành trừ đã xuất) — null = chưa có
   *  CO/CE. Chỉ để HIỂN THỊ trước khi bấm lưu; server tính lại trong transaction. */
  projectCaps: Record<string, number | null>;
  /** Đợt thu (C5) theo dự án — dự án chưa có kế hoạch thì ẩn ô chọn. */
  milestonesByProject: Record<string, { value: string; label: string }[]>;
}) {
  const t = useTranslations("finance.debt");
  const tc = useTranslations("finance.common");
  const [state, formAction, pending] = useActionState<FinanceFormStateWithValues, FormData>(createClientInvoice, {});
  const [projectId, setProjectId] = useState("");
  const cap = projectId ? projectCaps[projectId] : undefined;
  const milestoneOpts = projectId ? milestonesByProject[projectId] ?? [] : [];

  return (
    <form action={formAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="text-xs text-muted-foreground">
        {tc("projectLabel")}
        <SearchableSelect name="projectId" required placeholder={tc("selectProject")} options={projects} onChange={setProjectId} />
        {cap !== undefined && (
          <span className={`mt-1 block text-[11px] leading-snug ${cap == null ? "text-warning" : ""}`}>
            {cap == null ? t("capNoSheet") : t("capRemaining", { remaining: cap.toLocaleString("vi-VN") })}
          </span>
        )}
      </label>
      <label className="text-xs text-muted-foreground">
        {t("invoiceNo")}
        {/* defaultValue từ state: React 19 reset input uncontrolled sau mỗi action — không giữ lại
            thì luồng vượt trần (lỗi → điền lý do → submit lại) bắt người dùng gõ lại số hóa đơn. */}
        <input name="invoiceNo" required defaultValue={state.values?.invoiceNo ?? ""} className={input} />
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
        <span className="mt-1 block text-[11px] leading-snug">{t("dueDateHint")}</span>
      </label>
      {milestoneOpts.length > 0 && (
        <label className="text-xs text-muted-foreground">
          {t("msPickLabel")}
          {/* key theo projectId: đổi dự án thì select reset về "" thay vì giữ đợt của dự án cũ */}
          <select key={projectId} name="milestoneId" defaultValue="" className={input}>
            <option value="">{t("msPickNone")}</option>
            {milestoneOpts.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="text-xs text-muted-foreground">
        {t("overCapNote")}
        <input name="overCapNote" defaultValue={state.values?.overCapNote ?? ""} className={input} />
        <span className="mt-1 block text-[11px] leading-snug">{t("overCapNoteHint")}</span>
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
