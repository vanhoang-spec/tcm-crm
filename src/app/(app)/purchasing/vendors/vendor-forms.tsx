"use client";

import { useActionState, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Upload, Trash2, FileText, UserPlus, X } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { NumberField } from "@/components/ui/number-field";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import { RFQ_TEMPLATES } from "@/lib/rfq-templates";
import { VENDOR_DOC_KINDS, RFQ_FILE_MIME_TYPES, MAX_RFQ_FILE_BYTES } from "@/lib/rfq";
import { MAX_VENDOR_CONTACTS, type VendorFieldDefLite } from "@/lib/vendor-fields";
import { suggestVendorCode } from "@/lib/rfq";
import type { Locale } from "@/i18n/locales";
import { createVendor, updateVendor, uploadVendorDocument, deleteVendorDocument, type VendorFormState, type VendorDocState } from "./actions";

const input = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const area = "w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const CATEGORIES = ["PCC", "PRO", "OPE", "OTHER"] as const;

const ERR_KEY: Record<string, string> = {
  REQUIRED: "errRequired",
  CODE_FORMAT: "errCodeFormat",
  CODE_DUP: "errCodeDup",
  NOT_FOUND: "errNotFound",
  NO_FILE: "errNoFile",
  BAD_TYPE: "errBadType",
  TOO_BIG: "errTooBig",
  CUSTOM_REQUIRED: "errCustomRequired",
};

export type VendorContactRow = { name: string; title: string | null; phone: string | null; email: string | null; isPrimary: boolean };

export type VendorProfile = {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  category: string;
  taxCode: string | null;
  address: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountHolder: string | null;
  paymentTermsNote: string | null;
  note: string | null;
  isActive: boolean;
  groupCodes: string[];
  contacts: VendorContactRow[];
  custom: Record<string, unknown>;
};

const EMPTY_CONTACT: VendorContactRow = { name: "", title: null, phone: null, email: null, isPrimary: false };

/**
 * Các ô CHỮ đều controlled: React 19 gọi requestFormReset sau MỌI lần chạy action kể cả khi trả lỗi
 * — để defaultValue là gõ xong bị chặn vì thiếu một trường khác là mất hết (bài học KB-H2/OVH-1).
 * PUR-2: mã 3 ký tự sửa được · tên pháp nhân · người liên hệ 1..N (radio người chính) · trường tuỳ chỉnh.
 */
function ProfileFields({ v, defs, t, locale, isNew }: { v: Partial<VendorProfile>; defs: VendorFieldDefLite[]; t: (k: string, x?: Record<string, string | number>) => string; locale: Locale; isNew: boolean }) {
  const codeTouched = useRef(false);
  const [f, setF] = useState({
    code: v.code ?? "",
    name: v.name ?? "",
    legalName: v.legalName ?? "",
    taxCode: v.taxCode ?? "",
    address: v.address ?? "",
    bankName: v.bankName ?? "",
    bankAccountNo: v.bankAccountNo ?? "",
    bankAccountHolder: v.bankAccountHolder ?? "",
    paymentTermsNote: v.paymentTermsNote ?? "",
    note: v.note ?? "",
  });
  const [contacts, setContacts] = useState<VendorContactRow[]>(() => (v.contacts && v.contacts.length ? v.contacts : [{ ...EMPTY_CONTACT, isPrimary: true }]));
  const [custom, setCustom] = useState<Record<string, string>>(() => Object.fromEntries(defs.map((d) => [d.key, v.custom?.[d.key] == null ? "" : String(v.custom[d.key])])));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setC = (i: number, k: keyof VendorContactRow, val: string) => setContacts((s) => s.map((c, j) => (j === i ? { ...c, [k]: val } : c)));
  const setPrimary = (i: number) => setContacts((s) => s.map((c, j) => ({ ...c, isPrimary: j === i })));
  const removeContact = (i: number) =>
    setContacts((s) => {
      const n = s.filter((_, j) => j !== i);
      if (n.length && !n.some((c) => c.isPrimary)) n[0] = { ...n[0], isPrimary: true };
      return n.length ? n : [{ ...EMPTY_CONTACT, isPrimary: true }];
    });
  const L = (k: string, req?: boolean) => (
    <span className="mb-1 block text-xs font-medium text-muted-foreground">
      {t(k)}
      {req && <span className="text-danger"> *</span>}
    </span>
  );
  const dl = (d: VendorFieldDefLite) => (locale === "en" ? d.labelEn || d.labelVi : d.labelVi);
  const primaryIdx = Math.max(0, contacts.findIndex((c) => c.isPrimary));

  return (
    <div className="space-y-4">
      {/* Định danh */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_180px]">
        <label className="block">
          {L("code", true)}
          <input
            name="code"
            value={f.code}
            onChange={(e) => {
              codeTouched.current = true;
              setF((s) => ({ ...s, code: e.target.value.toUpperCase().slice(0, 12) }));
            }}
            className={input + " font-mono uppercase"}
            placeholder="SLM"
            required={isNew}
            maxLength={12}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{isNew ? t("codeHint") : t("codeHintEdit")}</p>
        </label>
        <label className="block">
          {L("name", true)}
          <input
            name="name"
            value={f.name}
            onChange={(e) => {
              const name = e.target.value;
              // Form TẠO: gợi ý mã 3 ký tự theo tên cho tới khi PUR tự gõ vào ô mã.
              setF((s) => ({ ...s, name, code: isNew && !codeTouched.current ? suggestVendorCode(name) : s.code }));
            }}
            className={input}
            required
          />
        </label>
        <label className="block">
          {L("category")}
          <select name="category" defaultValue={v.category ?? "PCC"} className={input}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`cat${c}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px]">
        <label className="block">
          {L("legalName")}
          <input name="legalName" value={f.legalName} onChange={set("legalName")} className={input} placeholder={t("legalNamePlaceholder")} />
        </label>
        <label className="block">
          {L("taxCode")}
          <input name="taxCode" value={f.taxCode} onChange={set("taxCode")} className={input} />
        </label>
      </div>
      <label className="block">
        {L("address")}
        <input name="address" value={f.address} onChange={set("address")} className={input} />
      </label>

      {/* Nhóm hàng */}
      <div>
        {L("groups")}
        <div className="flex flex-wrap gap-2">
          {RFQ_TEMPLATES.map((tp) => (
            <label key={tp.code} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50">
              <input type="checkbox" name={`group_${tp.code}`} defaultChecked={(v.groupCodes ?? []).includes(tp.code)} className="h-3.5 w-3.5" />
              {locale === "en" ? tp.labelEn : tp.labelVi}
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("groupsHint")}</p>
      </div>

      {/* Người liên hệ 1..N */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">{t("contactsTitle")}</span>
          {contacts.length < MAX_VENDOR_CONTACTS && (
            <button type="button" onClick={() => setContacts((s) => [...s, { ...EMPTY_CONTACT }])} className="inline-flex h-7 items-center gap-1 rounded-lg border border-border-strong px-2 text-[11px] hover:bg-surface-2">
              <UserPlus className="h-3 w-3" /> {t("addContact")}
            </button>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("contactsHint", { max: MAX_VENDOR_CONTACTS })}</p>
        <div className="mt-2 space-y-2">
          {contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-border/60 bg-surface-2/40 p-2 sm:grid-cols-[auto_1.2fr_1fr_1fr_1.2fr_auto]">
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title={t("primaryContact")}>
                <input type="radio" name="contactPrimary" value={i} checked={primaryIdx === i} onChange={() => setPrimary(i)} className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("primaryShort")}</span>
              </label>
              <input name={`contact_${i}_name`} value={c.name} onChange={(e) => setC(i, "name", e.target.value)} className={input + " h-8 text-xs"} placeholder={t("contactName")} />
              <input name={`contact_${i}_title`} value={c.title ?? ""} onChange={(e) => setC(i, "title", e.target.value)} className={input + " h-8 text-xs"} placeholder={t("contactTitle")} />
              <input name={`contact_${i}_phone`} value={c.phone ?? ""} onChange={(e) => setC(i, "phone", e.target.value)} className={input + " h-8 text-xs"} placeholder={t("phone")} />
              <input name={`contact_${i}_email`} value={c.email ?? ""} onChange={(e) => setC(i, "email", e.target.value)} className={input + " h-8 text-xs"} placeholder={t("email")} />
              <button type="button" onClick={() => removeContact(i)} className="rounded p-1 text-muted-foreground hover:text-danger" title={t("removeContact")}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Ngân hàng + điều khoản */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          {L("bankName")}
          <input name="bankName" value={f.bankName} onChange={set("bankName")} className={input} />
        </label>
        <label className="block">
          {L("bankAccountNo")}
          <input name="bankAccountNo" value={f.bankAccountNo} onChange={set("bankAccountNo")} className={input} />
        </label>
        <label className="block">
          {L("bankAccountHolder")}
          <input name="bankAccountHolder" value={f.bankAccountHolder} onChange={set("bankAccountHolder")} className={input} />
        </label>
      </div>
      <label className="block">
        {L("paymentTermsNote")}
        <textarea name="paymentTermsNote" value={f.paymentTermsNote} onChange={set("paymentTermsNote")} rows={2} className={area} placeholder={t("paymentTermsPlaceholder")} />
      </label>

      {/* Trường tuỳ chỉnh (admin định nghĩa ở Settings) */}
      {defs.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <span className="text-xs font-semibold text-foreground">{t("customTitle")}</span>
          <p className="text-[11px] text-muted-foreground">{t("customHint")}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {defs.map((d) => (
              <label key={d.key} className={"block" + (d.type === "TEXTAREA" ? " sm:col-span-2" : "")}>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {dl(d)}
                  {d.required && <span className="text-danger"> *</span>}
                </span>
                {d.type === "BOOL" ? (
                  <input type="checkbox" name={`cf_${d.key}`} checked={custom[d.key] === "true"} onChange={(e) => setCustom((s) => ({ ...s, [d.key]: e.target.checked ? "true" : "" }))} className="h-4 w-4" />
                ) : d.type === "SELECT" ? (
                  <select name={`cf_${d.key}`} value={custom[d.key]} onChange={(e) => setCustom((s) => ({ ...s, [d.key]: e.target.value }))} className={input}>
                    <option value="">—</option>
                    {d.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : d.type === "DATE" ? (
                  <DateField name={`cf_${d.key}`} defaultValue={custom[d.key] || undefined} className={input} />
                ) : d.type === "NUMBER" ? (
                  // KHÔNG điều khiển: onChange của NumberField chỉ trả số nên xoá trắng ô sẽ thành 0 thay vì "không có
                  // giá trị". Uncontrolled + defaultValue thì ô trống gửi "" → server xoá khoá. An toàn vì form đã chặn reset.
                  <NumberField name={`cf_${d.key}`} defaultValue={custom[d.key] === "" ? null : Number(custom[d.key])} className={input} />
                ) : d.type === "TEXTAREA" ? (
                  <textarea name={`cf_${d.key}`} value={custom[d.key]} onChange={(e) => setCustom((s) => ({ ...s, [d.key]: e.target.value }))} rows={2} className={area} />
                ) : (
                  <input name={`cf_${d.key}`} value={custom[d.key]} onChange={(e) => setCustom((s) => ({ ...s, [d.key]: e.target.value }))} className={input} />
                )}
                {d.hint && <span className="mt-0.5 block text-[10px] text-muted-foreground">{d.hint}</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="block">
        {L("note")}
        <textarea name="note" value={f.note} onChange={set("note")} rows={2} className={area} />
      </label>
    </div>
  );
}

// ⚠ onReset chặn form.reset() mà React 19 gọi (requestFormReset) sau MỌI lần chạy action, kể cả khi action
// TRẢ LỖI. Ô CHỮ controlled đã né được, nhưng <select>, checkbox, radio thì KHÔNG (React không khôi phục
// chúng sau reset) — đã tái hiện: action báo lỗi mã NCC ⇒ nhóm hàng bỏ tick, người liên hệ chính nhảy về
// người đầu, trường "Xếp hạng" về rỗng, IM LẶNG; sửa mã rồi Lưu là ghi sai. Form này không cần reset:
// tạo xong thì redirect / remount theo key, sửa xong thì giá trị trên form chính là giá trị đã lưu.
const keepValuesOnReset = (e: React.FormEvent<HTMLFormElement>) => e.preventDefault();

export function VendorCreateForm({ defs }: { defs: VendorFieldDefLite[] }) {
  const t = useTranslations("purchasing.vendors");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(createVendor, {});

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600">
        <Plus className="h-3.5 w-3.5" /> {t("createBtn")}
      </button>
    );
  }
  return (
    <form action={formAction} onReset={keepValuesOnReset} className="space-y-3 rounded-xl border border-dashed border-border-strong bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("createTitle")}</h2>
      <ProfileFields v={{}} defs={defs} t={t} locale={locale} isNew />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {pending ? "..." : t("saveBtn")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
          {t("cancelBtn")}
        </button>
        {state.error && <span className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric", { detail: state.errorDetail ?? "" })}</span>}
      </div>
    </form>
  );
}

export function VendorEditForm({ vendor, defs }: { vendor: VendorProfile; defs: VendorFieldDefLite[] }) {
  const t = useTranslations("purchasing.vendors");
  const locale = useLocale() as Locale;
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(updateVendor.bind(null, vendor.id), {});
  return (
    <form action={formAction} onReset={keepValuesOnReset} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t("profileTitle")}</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isActive" defaultChecked={vendor.isActive} className="h-3.5 w-3.5" />
          {t("isActive")}
        </label>
      </div>
      <ProfileFields v={vendor} defs={defs} t={t} locale={locale} isNew={false} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {pending ? "..." : t("saveBtn")}
        </button>
        {state.error && <span className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric", { detail: state.errorDetail ?? "" })}</span>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

export type VendorDocRow = {
  id: string;
  kind: string;
  title: string;
  mime: string;
  size: number;
  amount: number | null;
  signedAt: Date | null;
  note: string | null;
  projectCode: string | null;
  uploadedByName: string | null;
  createdAt: Date;
};

export function VendorDocumentsPanel({
  vendorId,
  docs,
  projects,
  canManage,
}: {
  vendorId: string;
  docs: VendorDocRow[];
  projects: { id: string; label: string }[];
  canManage: boolean;
}) {
  const t = useTranslations("purchasing.vendors");
  const locale = useLocale() as Locale;
  const [state, formAction, pending] = useActionState<VendorDocState, FormData>(uploadVendorDocument.bind(null, vendorId), {});
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("docsTitle")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("docsHint")}</p>
      </div>

      {docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("docsEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
              <Badge tone={d.kind === "CONTRACT" ? "success" : d.kind === "PO" ? "brand" : "neutral"}>{t(`kind${d.kind}`)}</Badge>
              <a href={`/api/vendor-doc/${d.id}`} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                <FileText className="h-3.5 w-3.5" /> {d.title}
              </a>
              {d.projectCode && <span className="font-mono text-muted-foreground">{d.projectCode}</span>}
              {d.amount != null && <span className="tabular-nums text-foreground">{formatNumber(d.amount, locale)}</span>}
              {d.signedAt && <span className="text-muted-foreground">{t("signedOn", { date: formatDate(d.signedAt) })}</span>}
              <span className="text-muted-foreground">
                · {formatDate(d.createdAt)} · {d.uploadedByName ?? "—"}
              </span>
              {d.note && <span className="text-muted-foreground">— {d.note}</span>}
              {canManage && (
                <form
                  action={deleteVendorDocument.bind(null, d.id)}
                  onSubmit={(e) => {
                    if (!window.confirm(t("confirmDelete"))) e.preventDefault();
                  }}
                  className="ml-auto"
                >
                  <button type="submit" className="rounded border border-border-strong p-1 text-muted-foreground hover:text-danger" title={t("deleteDoc")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form action={formAction} className="space-y-2 rounded-lg border border-dashed border-border-strong p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Upload className="h-3.5 w-3.5" /> {t("uploadTitle")}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">{t("docKind")}</span>
              <select name="kind" defaultValue="QUOTE" className={input}>
                {VENDOR_DOC_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind${k}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] text-muted-foreground">{t("docTitle")}</span>
              <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} className={input} placeholder={t("docTitlePlaceholder")} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">{t("docProject")}</span>
              <select name="projectId" defaultValue="" className={input}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">{t("docAmount")}</span>
              <NumberField name="amount" className={input} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">{t("docSignedAt")}</span>
              <DateField name="signedAt" className={input} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] text-muted-foreground">{t("docNote")}</span>
              <input name="note" value={note} onChange={(e) => setNote(e.target.value)} className={input} />
            </label>
          </div>
          <input type="file" name="file" accept={RFQ_FILE_MIME_TYPES.join(",")} required className="block text-xs text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground">{t("uploadHint", { mb: Math.round(MAX_RFQ_FILE_BYTES / 1024 / 1024) })}</p>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              {pending ? "..." : t("uploadBtn")}
            </button>
            {state.error && <span className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</span>}
            {state.success && <span className="text-xs text-success">{t("uploaded")}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
