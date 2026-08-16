"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { VENDOR_FIELD_TYPES } from "@/lib/vendor-fields";
import { createVendorField, updateVendorField, type VendorFieldFormState } from "./actions";

export type VendorFieldRowData = {
  id: string;
  key: string;
  labelVi: string;
  labelEn: string | null;
  type: string;
  options: string[];
  hint: string | null;
  required: boolean;
  sort: number;
  isActive: boolean;
};

// ⚠ onReset chặn form.reset() mà React 19 gọi (requestFormReset) sau MỌI lần chạy action, kể cả khi action
// TRẢ LỖI. Ô CHỮ controlled đã né được, nhưng <select>, checkbox, radio thì KHÔNG (React không khôi phục
// chúng sau reset) — đã tái hiện: action báo lỗi mã NCC ⇒ nhóm hàng bỏ tick, người liên hệ chính nhảy về
// người đầu, trường "Xếp hạng" về rỗng, IM LẶNG; sửa mã rồi Lưu là ghi sai. Form này không cần reset:
// tạo xong thì redirect / remount theo key, sửa xong thì giá trị trên form chính là giá trị đã lưu.
const keepValuesOnReset = (e: React.FormEvent<HTMLFormElement>) => e.preventDefault();

const field =
  "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/** Phần thân form dùng chung cho tạo + sửa — chỉ khác giá trị khởi tạo. */
function FieldInputs({ v, isNew }: { v?: VendorFieldRowData; isNew: boolean }) {
  const t = useTranslations("settings.vendorFields");
  // Ô CHỮ controlled — React 19 requestFormReset chạy sau MỌI lần gọi action, kể cả khi trả lỗi.
  const [labelVi, setLabelVi] = useState(v?.labelVi ?? "");
  const [labelEn, setLabelEn] = useState(v?.labelEn ?? "");
  const [hint, setHint] = useState(v?.hint ?? "");
  const [type, setType] = useState(v?.type ?? "TEXT");
  const [options, setOptions] = useState((v?.options ?? []).join("\n"));
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_130px_70px]">
      <label className="block text-[11px] text-muted-foreground">
        {t("labelVi")}
        <input name="labelVi" value={labelVi} onChange={(e) => setLabelVi(e.target.value)} maxLength={80} required className={field + " mt-1 w-full"} placeholder={isNew ? t("labelViPlaceholder") : undefined} />
      </label>
      <label className="block text-[11px] text-muted-foreground">
        {t("labelEn")}
        <input name="labelEn" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} maxLength={80} className={field + " mt-1 w-full"} />
      </label>
      <label className="block text-[11px] text-muted-foreground">
        {t("type")}
        <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={field + " mt-1 w-full"}>
          {VENDOR_FIELD_TYPES.map((x) => (
            <option key={x} value={x}>
              {t(`type${x}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[11px] text-muted-foreground">
        {t("sort")}
        <input name="sort" type="number" min={0} max={999} defaultValue={v?.sort ?? 0} className={field + " mt-1 w-full"} />
      </label>
      {type === "SELECT" && (
        <label className="block text-[11px] text-muted-foreground sm:col-span-2">
          {t("options")}
          <textarea name="options" value={options} onChange={(e) => setOptions(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand-400" placeholder={t("optionsPlaceholder")} />
          <span className="block text-[10px]">{t("optionsHint")}</span>
        </label>
      )}
      <label className={"block text-[11px] text-muted-foreground " + (type === "SELECT" ? "sm:col-span-2" : "sm:col-span-4")}>
        {t("hint")}
        <input name="hint" value={hint} onChange={(e) => setHint(e.target.value)} maxLength={200} className={field + " mt-1 w-full"} />
      </label>
    </div>
  );
}

export function VendorFieldRow({ def }: { def: VendorFieldRowData }) {
  const t = useTranslations("settings.vendorFields");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<VendorFieldFormState, FormData>(updateVendorField.bind(null, def.id), {});
  return (
    <form action={formAction} onReset={keepValuesOnReset} className={"rounded-lg border border-border p-3 " + (def.isActive ? "" : "opacity-70")}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>{t("key")}</span>
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-foreground">{def.key}</code>
        <span className="text-[10px]">{t("keyHint")}</span>
      </div>
      <FieldInputs v={def} isNew={false} />
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="required" defaultChecked={def.required} className="h-3.5 w-3.5 rounded border-border-strong" />
          {t("required")}
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isActive" defaultChecked={def.isActive} className="h-3.5 w-3.5 rounded border-border-strong" />
          {t("active")}
        </label>
        <button type="submit" disabled={pending} className="ml-auto h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50">
          {pending ? "..." : tCommon("save")}
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function VendorFieldCreateForm() {
  const t = useTranslations("settings.vendorFields");
  const [state, formAction, pending] = useActionState<VendorFieldFormState, FormData>(createVendorField, {});
  // Ô chữ là controlled nên KHÔNG tự trắng sau khi tạo xong — remount phần nhập khi action báo thành công
  // (mẫu "điều chỉnh state lúc render", không useEffect).
  const [seen, setSeen] = useState(state);
  const [resetKey, setResetKey] = useState(0);
  if (state !== seen) {
    setSeen(state);
    if (state.success) setResetKey((k) => k + 1);
  }
  return (
    <form action={formAction} onReset={keepValuesOnReset} className="rounded-lg border border-dashed border-border-strong p-3">
      <p className="mb-2 text-xs font-medium text-foreground">{t("addTitle")}</p>
      <div key={resetKey}>
        <FieldInputs isNew />
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="required" className="h-3.5 w-3.5 rounded border-border-strong" />
            {t("required")}
          </label>
          <button type="submit" disabled={pending} className="ml-auto h-9 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {pending ? "..." : t("add")}
          </button>
        </div>
      </div>
      {state.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
    </form>
  );
}
