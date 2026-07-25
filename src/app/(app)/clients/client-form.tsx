"use client";

import { useActionState, useRef, useState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { MAX_CONTACTS, OTHER_INTRODUCER } from "@/lib/validators/client";
import type { ClientFormState } from "./actions";

type Option = { id: string; label: string };

export function ClientForm({
  action,
  mode,
  teams,
  industries,
  statuses,
  classifications,
  potentialStatusId,
  introducers,
  brands,
  defaultValues,
  submitLabel,
}: {
  action: (state: ClientFormState, formData: FormData) => Promise<ClientFormState>;
  mode: "create" | "edit";
  teams: Option[];
  industries: Option[];
  statuses: Option[];
  classifications: Option[];
  /** dùng khi mode==="create": statusId luôn = Tiềm năng, không cho chọn tay. */
  potentialStatusId?: string;
  introducers: Option[];
  brands: string[];
  defaultValues?: {
    code?: string;
    name?: string;
    taxCode?: string;
    brandName?: string;
    industryId?: string;
    statusId?: string;
    classificationId?: string;
    ownerTeamId?: string;
    introducerId?: string;
    isNew?: boolean;
    paymentTermDays?: number;
    address?: string;
    phone?: string;
    email?: string;
    bankAccount?: string;
    note?: string;
  };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(action, {});
  const t = useTranslations("clients.form");
  const tCommon = useTranslations("common");

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("code")} error={state.fieldErrors?.code} required>
          <input
            name="code"
            defaultValue={defaultValues?.code}
            placeholder={t("codePlaceholder")}
            maxLength={3}
            className={cn(inputClass(!!state.fieldErrors?.code), "uppercase")}
          />
        </Field>

        <Field label={t("name")} error={state.fieldErrors?.name} required>
          <input
            name="name"
            defaultValue={defaultValues?.name}
            placeholder={t("namePlaceholder")}
            className={inputClass(!!state.fieldErrors?.name)}
          />
        </Field>

        <Field label={t("taxCode")} error={state.fieldErrors?.taxCode} required>
          <input
            name="taxCode"
            defaultValue={defaultValues?.taxCode}
            placeholder={t("taxCodePlaceholder")}
            className={inputClass(!!state.fieldErrors?.taxCode)}
          />
        </Field>

        <Field label={t("ownerTeam")} error={state.fieldErrors?.ownerTeamId} required>
          <select
            name="ownerTeamId"
            defaultValue={defaultValues?.ownerTeamId}
            className={inputClass(!!state.fieldErrors?.ownerTeamId)}
          >
            <option value="">{t("selectTeam")}</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("brand")} error={state.fieldErrors?.brandName} required>
          <Combobox
            name="brandName"
            options={brands}
            defaultValue={defaultValues?.brandName}
            placeholder={t("brandPlaceholder")}
            required
            hasError={!!state.fieldErrors?.brandName}
            newItemLabel={t("brandCreateNew")}
          />
        </Field>

        <Field label={t("industry")} error={state.fieldErrors?.industryId} required>
          <select
            name="industryId"
            defaultValue={defaultValues?.industryId}
            className={inputClass(!!state.fieldErrors?.industryId)}
          >
            <option value="">{t("selectIndustry")}</option>
            {industries.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("classification")} error={state.fieldErrors?.classificationId} required>
          <select
            name="classificationId"
            defaultValue={defaultValues?.classificationId}
            className={inputClass(!!state.fieldErrors?.classificationId)}
          >
            <option value="">{t("selectClassification")}</option>
            {classifications.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        {mode === "create" ? (
          <Field label={t("status")}>
            <input type="hidden" name="statusId" value={potentialStatusId ?? ""} />
            <div className={cn(inputClass(false), "flex items-center bg-surface-2 text-muted-foreground")}>
              {statuses.find((s) => s.id === potentialStatusId)?.label}
            </div>
          </Field>
        ) : (
          <Field label={t("status")} error={state.fieldErrors?.statusId} required>
            <select
              name="statusId"
              defaultValue={defaultValues?.statusId}
              className={inputClass(!!state.fieldErrors?.statusId)}
            >
              <option value="">{t("selectStatus")}</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={t("introducer")} error={state.fieldErrors?.introducerId} required>
          <SearchableSelect
            name="introducerId"
            defaultValue={defaultValues?.introducerId ?? ""}
            placeholder={t("selectIntroducer")}
            hasError={!!state.fieldErrors?.introducerId}
            options={[
              ...introducers.map((s) => ({ value: s.id, label: s.label })),
              { value: OTHER_INTRODUCER, label: t("introducerOther") },
            ]}
          />
        </Field>

        <Field label={t("paymentTerm")} error={state.fieldErrors?.paymentTermDays} required>
          <NumberField
            name="paymentTermDays"
            defaultValue={defaultValues?.paymentTermDays ?? 90}
            className={inputClass(!!state.fieldErrors?.paymentTermDays)}
          />
        </Field>

        <Field label={t("phone")} error={state.fieldErrors?.phone} required>
          <input name="phone" defaultValue={defaultValues?.phone} className={inputClass(!!state.fieldErrors?.phone)} />
        </Field>

        <Field label={t("email")} error={state.fieldErrors?.email} required>
          <input
            name="email"
            type="email"
            defaultValue={defaultValues?.email}
            className={inputClass(!!state.fieldErrors?.email)}
          />
        </Field>

        <Field label={t("bankAccount")} error={state.fieldErrors?.bankAccount} required className="sm:col-span-2">
          <input
            name="bankAccount"
            defaultValue={defaultValues?.bankAccount}
            placeholder={t("bankAccountPlaceholder")}
            className={inputClass(!!state.fieldErrors?.bankAccount)}
          />
        </Field>

        <Field label={t("address")} error={state.fieldErrors?.address} required className="sm:col-span-2">
          <input name="address" defaultValue={defaultValues?.address} className={inputClass(!!state.fieldErrors?.address)} />
        </Field>

        <Field label={t("note")} error={state.fieldErrors?.note} className="sm:col-span-2">
          <textarea name="note" defaultValue={defaultValues?.note} rows={3} className={inputClass(false)} />
        </Field>

        <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
          <input
            type="checkbox"
            name="isNew"
            defaultChecked={defaultValues?.isNew ?? true}
            className="h-4 w-4 rounded border-border-strong text-brand-500 focus:ring-brand-400"
          />
          {t("isNew")}
        </label>
      </fieldset>

      {mode === "create" && <ContactsFieldset error={state.fieldErrors?.contacts} />}

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function ContactsFieldset({ error }: { error?: string }) {
  const t = useTranslations("clients.form");
  const nextKey = useRef(1);
  const [rows, setRows] = useState<{ key: number }[]>([{ key: 0 }]);

  return (
    <fieldset className="space-y-3 border-t border-border pt-6">
      <div>
        <legend className="text-sm font-semibold text-foreground">{t("contactsTitle")}</legend>
        <p className="text-xs text-muted-foreground">{t("contactsHint", { max: MAX_CONTACTS })}</p>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={row.key} className="rounded-lg border border-border-strong p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t("picLabel", { n: index + 1 })}</span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                  className="inline-flex items-center gap-1 text-xs text-danger hover:underline"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("removeContact")}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input name={`contact_name_${index}`} placeholder={t("contactName")} required className={smallInput} />
              <input name={`contact_title_${index}`} placeholder={t("contactTitle")} required className={smallInput} />
              <input name={`contact_phone_${index}`} placeholder={t("contactPhone")} required className={smallInput} />
              <input
                name={`contact_email_${index}`}
                type="email"
                placeholder={t("contactEmail")}
                required
                className={smallInput}
              />
            </div>
          </div>
        ))}
      </div>

      {rows.length < MAX_CONTACTS && (
        <button
          type="button"
          onClick={() => {
            setRows((r) => [...r, { key: nextKey.current++ }]);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("addContact")}
        </button>
      )}
    </fieldset>
  );
}

function Field({
  label,
  error,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-foreground">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
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

const smallInput =
  "h-8 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
