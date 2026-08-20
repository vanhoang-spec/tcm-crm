"use client";

import { useActionState, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { suggestGroupCode } from "@/lib/rfq-templates";
import { createRfqGroup, updateRfqGroup, createRfqGroupField, toggleRfqGroupField, type RfqGroupFormState } from "./actions";

export type GroupFieldRow = {
  id: string;
  kind: string;
  key: string;
  labelVi: string;
  labelEn: string;
  type: string;
  isAmountFactor: boolean;
  isActive: boolean;
  sort: number;
};

export type GroupRow = {
  id: string;
  code: string;
  labelVi: string;
  labelEn: string;
  descVi: string;
  descEn: string;
  keywords: string;
  unitPriceLabelVi: string;
  unitPriceLabelEn: string;
  isSystem: boolean;
  isActive: boolean;
  sort: number;
  vendorCount: number;
  rfqCount: number;
  fields: GroupFieldRow[];
};

const input = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const label = "block text-xs font-medium text-muted-foreground";
const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";
const btnPrimary = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50";

/**
 * ⚠ Mọi form ở đây chặn `reset` (`onReset preventDefault`): React 19 gọi `requestFormReset` sau MỌI
 * lần chạy action KỂ CẢ khi action trả lỗi, và nó xoá cả `<select>`/checkbox dù đang controlled —
 * người dùng gõ 8 ô, sai một ô là mất sạch (HANDOVER mục 10.37).
 */
const keepOnReset = (e: React.FormEvent<HTMLFormElement>) => e.preventDefault();

export function GroupCreateForm() {
  const t = useTranslations("settings.rfqGroups");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RfqGroupFormState, FormData>(createRfqGroup, {});
  const [labelVi, setLabelVi] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [seq, setSeq] = useState(0);

  // Tạo xong thì dựng lại khối nhập (mẫu "điều chỉnh state lúc render", KHÔNG useEffect).
  const [lastOk, setLastOk] = useState(false);
  if (state.success && !lastOk) {
    setLastOk(true);
    setLabelVi("");
    setCode("");
    setCodeTouched(false);
    setSeq((n) => n + 1);
  } else if (!state.success && lastOk) setLastOk(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
        <Plus className="h-3.5 w-3.5" /> {t("createBtn")}
      </button>
    );
  }

  return (
    <form action={action} onReset={keepOnReset} className="space-y-3 rounded-xl border border-dashed border-border-strong bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("createTitle")}</h2>
      <p className="text-xs text-muted-foreground">{t("createHint")}</p>
      <div key={seq} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          {t("fLabelVi")}
          <input
            name="labelVi"
            value={labelVi}
            onChange={(e) => {
              setLabelVi(e.target.value);
              if (!codeTouched) setCode(suggestGroupCode(e.target.value));
            }}
            className={input}
            required
          />
        </label>
        <label>
          {t("fCode")}
          <input
            name="code"
            value={code}
            onChange={(e) => {
              setCodeTouched(true);
              setCode(e.target.value.toUpperCase());
            }}
            className={input + " font-mono"}
            required
          />
          <span className="mt-0.5 block text-[11px] text-warning">{t("fCodeHint")}</span>
        </label>
        <label>
          {t("fLabelEn")}
          <input name="labelEn" className={input} />
        </label>
        <label className="sm:col-span-2">
          {t("fDescVi")}
          <input name="descVi" className={input} />
        </label>
        <label className="sm:col-span-2">
          {t("fDescEn")}
          <input name="descEn" className={input} />
        </label>
        <label className="sm:col-span-2">
          {t("fKeywords")}
          <input name="keywords" className={input} placeholder={t("fKeywordsPh")} />
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{t("fKeywordsHint")}</span>
        </label>
        <label>
          {t("fUnitPriceVi")}
          <input name="unitPriceLabelVi" className={input} placeholder={t("fUnitPricePh")} />
        </label>
        <label>
          {t("fUnitPriceEn")}
          <input name="unitPriceLabelEn" className={input} />
        </label>
        <label>
          {t("fSort")}
          <input name="sort" type="number" defaultValue={100} className={input} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "..." : t("saveBtn")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btn}>
          {t("cancelBtn")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

export function GroupCard({ g }: { g: GroupRow }) {
  const t = useTranslations("settings.rfqGroups");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RfqGroupFormState, FormData>(updateRfqGroup.bind(null, g.id), {});

  const live = g.fields.filter((f) => f.isActive);
  const factors = live.filter((f) => f.kind === "LINE" && f.isAmountFactor);

  return (
    <div className={"rounded-xl border bg-surface " + (g.isActive ? "border-border" : "border-dashed border-border-strong opacity-70")}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 p-3 text-left hover:bg-surface-2">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="font-mono text-[11px] text-muted-foreground">{g.code}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{locale === "en" ? g.labelEn : g.labelVi}</span>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
          {g.isSystem ? t("badgeSystem") : t("badgeCustom")}
        </span>
        {!g.isActive && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">{t("badgeOff")}</span>}
        <span className="shrink-0 text-[11px] text-muted-foreground">{t("counts", { vendors: g.vendorCount, rfqs: g.rfqCount })}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <form action={action} onReset={keepOnReset} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              {t("fLabelVi")}
              <input name="labelVi" defaultValue={g.labelVi} className={input} required />
            </label>
            <label>
              {t("fLabelEn")}
              <input name="labelEn" defaultValue={g.labelEn} className={input} />
            </label>
            <label>
              {t("fSort")}
              <input name="sort" type="number" defaultValue={g.sort} className={input} />
            </label>
            <label className="sm:col-span-2">
              {t("fDescVi")}
              <input name="descVi" defaultValue={g.descVi} className={input} />
            </label>
            <label className="sm:col-span-2">
              {t("fDescEn")}
              <input name="descEn" defaultValue={g.descEn} className={input} />
            </label>
            <label className="sm:col-span-2">
              {t("fKeywords")}
              <input name="keywords" defaultValue={g.keywords} className={input} />
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{t("fKeywordsHint")}</span>
            </label>
            {!g.isSystem && (
              <>
                <label>
                  {t("fUnitPriceVi")}
                  <input name="unitPriceLabelVi" defaultValue={g.unitPriceLabelVi} className={input} />
                </label>
                <label>
                  {t("fUnitPriceEn")}
                  <input name="unitPriceLabelEn" defaultValue={g.unitPriceLabelEn} className={input} />
                </label>
              </>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
              <input type="checkbox" name="isActive" defaultChecked={g.isActive} className="h-3.5 w-3.5" />
              {t("fActive")}
            </label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={pending} className={btnPrimary}>
                {pending ? "..." : t("saveBtn")}
              </button>
              {state.error && <span className="text-xs text-danger">{state.error}</span>}
              {state.success && <span className="text-xs text-success">{t("saved")}</span>}
            </div>
          </form>

          {g.isSystem ? (
            <p className="rounded-lg border border-dashed border-border-strong p-3 text-xs text-muted-foreground">{t("systemFieldsNote")}</p>
          ) : (
            <FieldsPanel g={g} live={live} factors={factors} />
          )}
        </div>
      )}
    </div>
  );
}

function FieldsPanel({ g, live, factors }: { g: GroupRow; live: GroupFieldRow[]; factors: GroupFieldRow[] }) {
  const t = useTranslations("settings.rfqGroups");
  const locale = useLocale();
  const [state, action, pending] = useActionState<RfqGroupFormState, FormData>(createRfqGroupField.bind(null, g.id), {});
  const [kind, setKind] = useState("LINE");
  const [type, setType] = useState("text");
  const [seq, setSeq] = useState(0);
  const [lastOk, setLastOk] = useState(false);
  if (state.success && !lastOk) {
    setLastOk(true);
    setSeq((n) => n + 1);
  } else if (!state.success && lastOk) setLastOk(false);

  const typeOptions = kind === "TERM" ? ["number", "text", "textarea"] : ["number", "text", "select", "bool"];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("fieldsTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("fieldsHint")}</p>
        <p className="mt-1 text-xs text-foreground">
          {t("formula")}{" "}
          <span className="font-mono">
            {t("formulaQty")}
            {factors.map((f) => ` × ${locale === "en" ? f.labelEn : f.labelVi}`).join("")} × {t("formulaPrice")}
          </span>
        </p>
      </div>

      {g.fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("fieldsEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {g.fields.map((f) => (
            <li key={f.id} className={"flex flex-wrap items-center gap-2 px-3 py-2 text-xs " + (f.isActive ? "" : "opacity-60")}>
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{f.kind === "TERM" ? t("kindTerm") : t("kindLine")}</span>
              <span className="font-medium text-foreground">{locale === "en" ? f.labelEn : f.labelVi}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{f.key}</span>
              <span className="text-muted-foreground">{f.type}</span>
              {f.isAmountFactor && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">{t("badgeFactor")}</span>}
              {!f.isActive && <span className="text-[10px] text-muted-foreground">{t("badgeOff")}</span>}
              <form action={toggleRfqGroupField.bind(null, f.id)} className="ml-auto">
                <button type="submit" className="text-brand-600 hover:underline">
                  {f.isActive ? t("turnOff") : t("turnOn")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={action} onReset={keepOnReset} className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-border-strong p-3 sm:grid-cols-2">
        <p className="text-xs font-medium text-foreground sm:col-span-2">{t("addFieldTitle")}</p>
        <label>
          {t("fKind")}
          <select
            name="kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setType("text");
            }}
            className={input}
          >
            <option value="LINE">{t("kindLine")}</option>
            <option value="TERM">{t("kindTerm")}</option>
          </select>
        </label>
        <label>
          {t("fType")}
          <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={input}>
            {typeOptions.map((x) => (
              <option key={x} value={x}>
                {t(`type_${x}`)}
              </option>
            ))}
          </select>
        </label>
        <div key={seq} className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
          <label>
            {t("fLabelVi")}
            <input name="labelVi" className={input} required />
          </label>
          <label>
            {t("fLabelEn")}
            <input name="labelEn" className={input} />
          </label>
          <label>
            {t("fHintVi")}
            <input name="hintVi" className={input} />
          </label>
          <label>
            {t("fDefault")}
            <input name="defaultValue" className={input} />
          </label>
          {kind === "LINE" && type === "select" && (
            <label className="sm:col-span-2">
              {t("fOptions")}
              <textarea name="options" rows={3} className="w-full rounded-lg border border-border-strong bg-surface p-2 text-sm" placeholder={t("fOptionsPh")} />
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{t("fOptionsHint")}</span>
            </label>
          )}
          <label>
            {t("fSort")}
            <input name="sort" type="number" className={input} />
          </label>
        </div>
        {kind === "LINE" && type === "number" && (
          <label className="flex items-start gap-2 text-xs text-muted-foreground sm:col-span-2">
            <input type="checkbox" name="isAmountFactor" className="mt-0.5 h-3.5 w-3.5" />
            <span>
              {t("fFactor")}
              <span className="mt-0.5 block text-[11px]">{t("fFactorHint")}</span>
            </span>
          </label>
        )}
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending} className={btn}>
            <Plus className="h-3.5 w-3.5" /> {pending ? "..." : t("addFieldBtn")}
          </button>
          {state.error && <span className="text-xs text-danger">{state.error}</span>}
          {state.success && <span className="text-xs text-success">{t("saved")}</span>}
          <span className="ml-auto text-[11px] text-muted-foreground">{t("liveCount", { n: live.length })}</span>
        </div>
      </form>
    </div>
  );
}
