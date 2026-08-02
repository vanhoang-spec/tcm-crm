"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Upload, CopyPlus, Plus, Check, X, Undo2 } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import { formatNumber, formatDateTime } from "@/lib/utils";
import { MONTHS, OVERHEAD_REQUEST_KINDS } from "@/lib/overhead";
import type { Locale } from "@/i18n/locales";
import type { OverheadBudgetHeader } from "@/lib/overhead-data";
import type { OverheadItemReport } from "@/lib/overhead";
import {
  previewBudgetImport,
  confirmBudgetImport,
  createNextYearBudget,
  setBudgetItemMonths,
  addBudgetItem,
  toggleBudgetItem,
  submitBudget,
  cfoApproveBudget,
  ceoApproveBudget,
  rejectBudget,
  type ImportState,
  type OverheadState,
} from "../actions";

function useErr() {
  const t = useTranslations("overhead");
  return (code?: string) => (code ? t(`err${code}` as "errGeneric") : null);
}

// ─────────────────────────────────────────────────────────

export function ImportPanel({ fiscalYear }: { fiscalYear: number }) {
  const t = useTranslations("overhead");
  const locale = useLocale() as Locale;
  const err = useErr();
  const preview = previewBudgetImport.bind(null, fiscalYear);
  const [pState, pAction, pPending] = useActionState<ImportState, FormData>(preview, {});

  const money = (n: number) => `${formatNumber(n, locale)}đ`;
  const p = pState.preview;

  return (
    <section className="rounded-xl border border-dashed border-border-strong p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">{t("importTitle")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("importDesc")}</p>
      </div>

      {!p ? (
        <form action={pAction} className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-muted-foreground">
            {t("importFile")}
            <input type="file" name="file" accept=".xlsx" className="mt-1 block text-xs" />
          </label>
          <button
            type="submit"
            disabled={pPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {pPending ? "..." : t("importPreview")}
          </button>
          {err(pState.error) && <span className="text-[11px] text-danger">{err(pState.error)}</span>}
        </form>
      ) : (
        <ImportPreviewBlock fiscalYear={fiscalYear} preview={p} money={money} />
      )}
    </section>
  );
}

function ImportPreviewBlock({
  fiscalYear,
  preview,
  money,
}: {
  fiscalYear: number;
  preview: NonNullable<ImportState["preview"]>;
  money: (n: number) => string;
}) {
  const t = useTranslations("overhead");
  const err = useErr();
  const confirm = confirmBudgetImport.bind(null, fiscalYear, preview.fileKey);
  const [cState, cAction, cPending] = useActionState<ImportState, FormData>(confirm, {});

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs">
        <p className="font-medium text-foreground">{preview.fileName}</p>
        <p className="mt-1 text-muted-foreground">
          {t("previewItems", { n: preview.itemCount })} · {t("previewSpends", { n: preview.spendCount })}
        </p>
        <p className="text-muted-foreground">{t("previewPlan", { amount: money(preview.planYear) })}</p>
        <p className="text-muted-foreground">{t("previewPaid", { amount: money(preview.paidParsed) })}</p>
      </div>

      {preview.warnings.length > 0 && (
        <details className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-xs">
          <summary className="cursor-pointer font-medium text-warning">
            {t("previewWarnings")} ({preview.warnings.length})
          </summary>
          <ul className="mt-2 space-y-1 text-warning">
            {preview.warnings.map((w, i) => (
              <li key={i}>· {w}</li>
            ))}
          </ul>
        </details>
      )}

      {preview.mismatches.length > 0 && (
        <details className="rounded-lg border border-border bg-surface p-3 text-xs">
          <summary className="cursor-pointer font-medium text-foreground">
            {t("mismatchTitle", { n: preview.mismatches.length })}
          </summary>
          <p className="mt-1 text-muted-foreground">{t("mismatchDesc")}</p>
          <table className="mt-2 w-full">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left font-medium">{t("colPid")}</th>
                <th className="text-right font-medium">{t("mismatchFile")}</th>
                <th className="text-right font-medium">{t("mismatchDetail")}</th>
                <th className="text-right font-medium">{t("mismatchDiff")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.mismatches.map((m) => (
                <tr key={m.pidCode}>
                  <td className="font-mono">{m.pidCode}</td>
                  <td className="text-right tabular-nums">{money(m.usedInFile)}</td>
                  <td className="text-right tabular-nums">{money(m.parsedFromDetail)}</td>
                  <td className="text-right tabular-nums text-danger">{money(m.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <form action={cAction}>
        <button
          type="submit"
          disabled={cPending}
          className="h-9 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {cPending ? "..." : t("importConfirm")}
        </button>
        {err(cState.error) && <span className="ml-2 text-[11px] text-danger">{err(cState.error)}</span>}
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────

export function DuplicatePanel({ fromYear }: { fromYear: number }) {
  const t = useTranslations("overhead");
  const err = useErr();
  const action = createNextYearBudget.bind(null, fromYear);
  const [state, formAction, pending] = useActionState<OverheadState, FormData>(action, {});

  return (
    <section className="rounded-xl border border-dashed border-border-strong p-4 space-y-2">
      <p className="text-sm font-medium text-foreground">{t("duplicateTitle", { year: fromYear + 1 })}</p>
      <p className="text-xs text-muted-foreground">{t("duplicateDesc", { from: fromYear })}</p>
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <CopyPlus className="h-3.5 w-3.5" />
          {pending ? "..." : t("duplicateBtn", { year: fromYear + 1 })}
        </button>
        {err(state.error) && <span className="ml-2 text-[11px] text-danger">{err(state.error)}</span>}
        {state.success && state.message && (
          <span className="ml-2 text-[11px] text-success">
            {t("duplicateDone", { items: state.message.split("/")[0], actual: state.message.split("/")[1] })}
          </span>
        )}
      </form>
    </section>
  );
}

// ─────────────────────────────────────────────────────────

export function ApprovalPanel({ header, canManage, canCfo, canCeo }: { header: OverheadBudgetHeader; canManage: boolean; canCfo: boolean; canCeo: boolean }) {
  const t = useTranslations("overhead");
  const err = useErr();
  const [rejecting, setRejecting] = useState<"CFO" | "CEO" | null>(null);

  const submit = submitBudget.bind(null, header.fiscalYear);
  const [sState, sAction, sPending] = useActionState<OverheadState, FormData>(submit, {});
  const cfo = cfoApproveBudget.bind(null, header.fiscalYear);
  const [fState, fAction, fPending] = useActionState<OverheadState, FormData>(cfo, {});
  const ceo = ceoApproveBudget.bind(null, header.fiscalYear);
  const [eState, eAction, ePending] = useActionState<OverheadState, FormData>(ceo, {});
  const rej = rejectBudget.bind(null, header.fiscalYear, rejecting ?? "CFO");
  const [rState, rAction, rPending] = useActionState<OverheadState, FormData>(rej, {});

  const anyErr = err(sState.error) ?? err(fState.error) ?? err(eState.error) ?? err(rState.error);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canManage && (header.status === "DRAFT" || header.status === "REJECTED") && (
          <form action={sAction}>
            <button type="submit" disabled={sPending} className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {sPending ? "..." : t("submit")}
            </button>
          </form>
        )}
        {canCfo && header.status === "PENDING_CFO" && (
          <>
            <form action={fAction}>
              <button type="submit" disabled={fPending} className="inline-flex h-8 items-center gap-1 rounded-lg bg-success px-3 text-xs font-medium text-white disabled:opacity-50">
                <Check className="h-3.5 w-3.5" />
                {fPending ? "..." : t("approveCfo")}
              </button>
            </form>
            <button type="button" onClick={() => setRejecting("CFO")} className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/40 px-3 text-xs text-danger hover:bg-danger-bg">
              <X className="h-3.5 w-3.5" />
              {t("reject")}
            </button>
          </>
        )}
        {canCeo && header.status === "PENDING_CEO" && (
          <>
            <form action={eAction}>
              <button type="submit" disabled={ePending} className="inline-flex h-8 items-center gap-1 rounded-lg bg-success px-3 text-xs font-medium text-white disabled:opacity-50">
                <Check className="h-3.5 w-3.5" />
                {ePending ? "..." : t("approveCeo")}
              </button>
            </form>
            <button type="button" onClick={() => setRejecting("CEO")} className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/40 px-3 text-xs text-danger hover:bg-danger-bg">
              <X className="h-3.5 w-3.5" />
              {t("reject")}
            </button>
          </>
        )}
        {anyErr && <span className="text-[11px] text-danger">{anyErr}</span>}
      </div>

      {rejecting && (
        <form action={rAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-danger/30 bg-danger-bg p-2">
          <label className="text-[11px] text-danger">
            {t("rejectReason")}
            <input name="rejectedNote" className="mt-1 h-8 w-72 rounded-md border border-border-strong bg-surface px-2 text-xs" />
          </label>
          <button type="submit" disabled={rPending} className="h-8 rounded-md bg-danger px-3 text-xs font-medium text-white disabled:opacity-50">
            {rPending ? "..." : t("reject")}
          </button>
          <button type="button" onClick={() => setRejecting(null)} className="text-[11px] text-muted-foreground hover:underline">
            {t("importCancel")}
          </button>
        </form>
      )}

      <div className="space-y-0.5 text-[11px] text-muted-foreground">
        <p className="font-medium text-foreground">{t("approvalTrail")}</p>
        {header.submittedAt && <p>{t("submittedBy", { name: header.submittedByName ?? "—", date: formatDateTime(header.submittedAt) })}</p>}
        {header.cfoApprovedAt && <p>{t("cfoBy", { name: header.cfoApprovedByName ?? "—", date: formatDateTime(header.cfoApprovedAt) })}</p>}
        {header.ceoApprovedAt && <p>{t("ceoBy", { name: header.ceoApprovedByName ?? "—", date: formatDateTime(header.ceoApprovedAt) })}</p>}
        {header.rejectedAt && (
          <p className="text-danger">
            {t("rejectedBy", { name: header.rejectedByName ?? "—", date: formatDateTime(header.rejectedAt) })} — {header.rejectedNote}
          </p>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────

export function BudgetItemTable({
  fiscalYear,
  items,
  editable,
  canManage,
}: {
  fiscalYear: number;
  items: OverheadItemReport[];
  editable: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("overhead");
  const locale = useLocale() as Locale;
  const err = useErr();
  const [openId, setOpenId] = useState<string | null>(null);
  const add = addBudgetItem.bind(null, fiscalYear);
  const [aState, aAction, aPending] = useActionState<OverheadState, FormData>(add, {});
  const money = (n: number) => `${formatNumber(n, locale)}đ`;

  return (
    <div className="space-y-3">
      {canManage && editable && (
        <form action={aAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border-strong p-3">
          <input name="pidCode" placeholder={t("addPid")} className="h-9 w-40 rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
          <input name="name" placeholder={t("addName")} className="h-9 w-64 rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
          <input name="categoryLabel" placeholder={t("addCategory")} className="h-9 w-48 rounded-lg border border-border-strong bg-surface px-2.5 text-sm" />
          <select name="requestKind" defaultValue="MONTHLY" className="h-9 rounded-lg border border-border-strong bg-surface px-2 text-sm">
            {OVERHEAD_REQUEST_KINDS.map((k) => (
              <option key={k} value={k}>{t(`kind${k}` as "kindMONTHLY")}</option>
            ))}
          </select>
          <button type="submit" disabled={aPending} className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" />
            {aPending ? "..." : t("addItem")}
          </button>
          {err(aState.error) && <span className="text-[11px] text-danger">{err(aState.error)}</span>}
        </form>
      )}

      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("colPid")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colName")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colKind")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("colPlanYear")}</th>
              {canManage && <th className="px-3 py-2 text-left font-medium w-40">{t("colActions")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => (
              <BudgetRow
                key={i.itemId}
                item={i}
                money={money}
                editable={editable}
                canManage={canManage}
                open={openId === i.itemId}
                onToggle={() => setOpenId(openId === i.itemId ? null : i.itemId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BudgetRow({
  item,
  money,
  editable,
  canManage,
  open,
  onToggle,
}: {
  item: OverheadItemReport;
  money: (n: number) => string;
  editable: boolean;
  canManage: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("overhead");
  const err = useErr();
  const action = setBudgetItemMonths.bind(null, item.itemId);
  const [state, formAction, pending] = useActionState<OverheadState, FormData>(action, {});

  return (
    <>
      <tr className={item.isActive ? undefined : "opacity-50"}>
        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{item.pidCode}</td>
        <td className="px-3 py-2">
          <span className="text-foreground">{item.name}</span>
          {/* Bảng này chỉ có cột NGÂN SÁCH, không có cột thực chi — nên nhãn ở đây luôn là chỉ dẫn
              NGUỒN, không phải trạng thái "đang chờ" như bên tab Tổng quan. */}
          {item.actualSource === "PAYROLL" && (
            <span className="ml-1.5 rounded bg-surface-2 px-1.5 text-[10px] text-muted-foreground">{t("payrollSource")}</span>
          )}
          {!item.isActive && <span className="ml-1.5 text-[10px] text-muted-foreground">({t("inactive")})</span>}
        </td>
        <td className="px-3 py-2 text-[11px] text-muted-foreground">{t(`kind${item.requestKind}` as "kindMONTHLY")}</td>
        <td className="px-3 py-2 text-right tabular-nums">{money(item.planYear)}</td>
        {canManage && (
          <td className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {editable && (
                <button type="button" onClick={onToggle} className="h-7 rounded-md border border-border-strong px-2 text-[11px] hover:bg-surface-2">
                  {open ? t("importCancel") : t("save")}
                </button>
              )}
              {editable && (
                <form action={toggleBudgetItem.bind(null, item.itemId)}>
                  <button type="submit" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:underline">
                    {item.isActive ? <X className="h-3 w-3" /> : <Undo2 className="h-3 w-3" />}
                    {item.isActive ? t("remove") : t("restore")}
                  </button>
                </form>
              )}
            </div>
          </td>
        )}
      </tr>
      {open && editable && canManage && (
        <tr>
          <td colSpan={5} className="bg-surface-2/50 px-3 pb-3 pt-2">
            <form action={formAction} className="space-y-2">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
                {MONTHS.map((m) => (
                  <label key={m} className="text-[10px] text-muted-foreground">
                    T{m}
                    <NumberField
                      name={`m${m}`}
                      defaultValue={item.months[m - 1]?.plan ?? 0}
                      className="mt-0.5 h-8 w-full rounded-md border border-border-strong bg-surface px-1.5 text-xs"
                    />
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={pending} className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                  {pending ? "..." : t("save")}
                </button>
                {state.success && <span className="text-[11px] text-success">{t("saved")}</span>}
                {err(state.error) && <span className="text-[11px] text-danger">{err(state.error)}</span>}
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
