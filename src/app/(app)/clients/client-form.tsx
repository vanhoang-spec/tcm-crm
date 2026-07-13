"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClientFormState } from "./actions";

type Option = { id: string; label: string };

export function ClientForm({
  action,
  teams,
  industries,
  introducers,
  defaultValues,
  submitLabel,
}: {
  action: (state: ClientFormState, formData: FormData) => Promise<ClientFormState>;
  teams: Option[];
  industries: Option[];
  introducers: Option[];
  defaultValues?: {
    code?: string;
    name?: string;
    brand?: string;
    industryId?: string;
    ownerTeamId?: string;
    introducerId?: string;
    isNew?: boolean;
    paymentTermDays?: number;
    address?: string;
    phone?: string;
    email?: string;
    note?: string;
  };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Mã khách hàng" error={state.fieldErrors?.code} required>
          <input
            name="code"
            defaultValue={defaultValues?.code}
            placeholder="VD: LOF, DHG, CTL"
            className={inputClass(!!state.fieldErrors?.code)}
          />
        </Field>

        <Field label="Team phụ trách" error={state.fieldErrors?.ownerTeamId} required>
          <select
            name="ownerTeamId"
            defaultValue={defaultValues?.ownerTeamId}
            className={inputClass(!!state.fieldErrors?.ownerTeamId)}
          >
            <option value="">— Chọn team —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tên khách hàng" error={state.fieldErrors?.name} required className="sm:col-span-2">
          <input
            name="name"
            defaultValue={defaultValues?.name}
            placeholder="VD: Dược Hậu Giang"
            className={inputClass(!!state.fieldErrors?.name)}
          />
        </Field>

        <Field label="Brand / Nhãn hàng" error={state.fieldErrors?.brand}>
          <input name="brand" defaultValue={defaultValues?.brand} className={inputClass(false)} />
        </Field>

        <Field label="Ngành hàng" error={state.fieldErrors?.industryId}>
          <select name="industryId" defaultValue={defaultValues?.industryId} className={inputClass(false)}>
            <option value="">— Chọn ngành —</option>
            {industries.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Người giới thiệu" error={state.fieldErrors?.introducerId}>
          <select name="introducerId" defaultValue={defaultValues?.introducerId} className={inputClass(false)}>
            <option value="">— Không có —</option>
            {introducers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Payment term (ngày)" error={state.fieldErrors?.paymentTermDays} required>
          <input
            name="paymentTermDays"
            type="number"
            min={0}
            max={365}
            defaultValue={defaultValues?.paymentTermDays ?? 90}
            className={inputClass(!!state.fieldErrors?.paymentTermDays)}
          />
        </Field>

        <Field label="Số điện thoại" error={state.fieldErrors?.phone}>
          <input name="phone" defaultValue={defaultValues?.phone} className={inputClass(false)} />
        </Field>

        <Field label="Email" error={state.fieldErrors?.email}>
          <input name="email" type="email" defaultValue={defaultValues?.email} className={inputClass(!!state.fieldErrors?.email)} />
        </Field>

        <Field label="Địa chỉ" error={state.fieldErrors?.address} className="sm:col-span-2">
          <input name="address" defaultValue={defaultValues?.address} className={inputClass(false)} />
        </Field>

        <Field label="Ghi chú" error={state.fieldErrors?.note} className="sm:col-span-2">
          <textarea name="note" defaultValue={defaultValues?.note} rows={3} className={inputClass(false)} />
        </Field>

        <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
          <input
            type="checkbox"
            name="isNew"
            defaultChecked={defaultValues?.isNew ?? true}
            className="h-4 w-4 rounded border-border-strong text-brand-500 focus:ring-brand-400"
          />
          Khách hàng mới (KH Mới)
        </label>
      </fieldset>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  required,
  className,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-foreground">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return cn(
    "h-10 w-full rounded-lg border bg-surface px-3 text-sm outline-none focus:ring-2",
    hasError
      ? "border-danger focus:border-danger focus:ring-danger/20"
      : "border-border-strong focus:border-brand-400 focus:ring-brand-100",
  );
}
