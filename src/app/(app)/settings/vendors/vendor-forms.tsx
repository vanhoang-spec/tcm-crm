"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createVendor, updateVendor, type VendorFormState } from "./actions";

export type VendorData = {
  id: string;
  code: string;
  name: string;
  category: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  taxCode: string | null;
  isActive: boolean;
};

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

const CATEGORIES = ["PCC", "PRO", "OPE", "OTHER"] as const;

function Fields({ defaults }: { defaults?: Partial<VendorData> }) {
  const t = useTranslations("settings.vendors");
  return (
    <>
      <label className="text-xs text-muted-foreground">
        {t("name")}
        <input name="name" required defaultValue={defaults?.name ?? ""} className={input} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("category")}
        <select name="category" defaultValue={defaults?.category ?? "PCC"} className={input}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(`cat${c}`)}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        {t("contact")}
        <input name="contact" defaultValue={defaults?.contact ?? ""} className={input} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("phone")}
        <input name="phone" defaultValue={defaults?.phone ?? ""} className={input} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("email")}
        <input name="email" defaultValue={defaults?.email ?? ""} className={input} />
      </label>
      <label className="text-xs text-muted-foreground">
        {t("taxCode")}
        <input name="taxCode" defaultValue={defaults?.taxCode ?? ""} className={input} />
      </label>
    </>
  );
}

export function CreateVendorForm() {
  const t = useTranslations("settings.vendors");
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(createVendor, {});

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600">
        <Plus className="h-3.5 w-3.5" /> {t("createBtn")}
      </button>
    );
  }
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-xl border border-dashed border-border-strong p-4 sm:grid-cols-3">
      <label className="text-xs text-muted-foreground">
        {t("code")}
        <input name="code" required placeholder="VD: NCC-IN01" className={input} />
        <span className="mt-1 block text-[11px] leading-snug">{t("codeHint")}</span>
      </label>
      <Fields />
      {state.error && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-danger sm:col-span-3" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-2 sm:col-span-3">
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {t("createBtn")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-border-strong px-3 text-xs">
          {t("cancelBtn")}
        </button>
      </div>
    </form>
  );
}

export function VendorRow({ vendor }: { vendor: VendorData }) {
  const t = useTranslations("settings.vendors");
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(updateVendor.bind(null, vendor.id), {});

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3">
      <div className="flex items-center gap-2 sm:col-span-3">
        <span className="font-mono text-sm font-semibold text-foreground">{vendor.code}</span>
        {!vendor.isActive && <Badge tone="neutral">{t("inactive")}</Badge>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
      <Fields defaults={vendor} />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="isActive" defaultChecked={vendor.isActive} /> {t("isActive")}
      </label>
      {state.error && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-danger sm:col-span-3" role="alert">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-3">
        <button type="submit" disabled={pending} className="h-9 rounded-lg border border-border-strong px-4 text-xs font-medium hover:bg-surface-2 disabled:opacity-60">
          {t("saveBtn")}
        </button>
      </div>
    </form>
  );
}
