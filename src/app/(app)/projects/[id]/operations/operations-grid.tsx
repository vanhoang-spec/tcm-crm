"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2, Upload, Download, FileDown, Check, Banknote } from "lucide-react";
import { CTV_COLUMNS } from "@/lib/ctv-columns";
import { ctvRowCost, ctvEffectiveLineId, ctvPlanVsActual, type CtvPlanLine } from "@/lib/ctv-costing";
import { formatNumber } from "@/lib/utils";
import { DateField } from "@/components/ui/date-field";
import type { Locale } from "@/i18n/locales";
import {
  createCtvBatch,
  deleteCtvBatch,
  saveCtvBatchHeader,
  importCtvExcel,
  createCtvRow,
  updateCtvRow,
  deleteCtvRow,
  generateCtvContracts,
  createCtvBatchPayments,
  type CtvRowClient,
} from "./actions";

export type CtvRowData = CtvRowClient;
export type CtvBatchData = {
  id: string;
  name: string | null;
  programFrom: string | null;
  programTo: string | null;
  teamLeader: string | null;
  workLocation: string | null;
  hasSourceFile: boolean;
  /** Dòng CO/CE mặc định của cả đợt — dòng nào không gán riêng thì kế thừa dòng này. */
  defaultFinanceCostLineId: string | null;
  /** Phiếu chi còn hiệu lực đã sinh từ đợt ("Đề xuất thanh toán"). */
  paymentsCreated: number;
  paymentsTotal: number;
  paymentsPaid: number;
  rows: CtvRowData[];
};

/** Dòng CO/CE còn hiệu lực của dự án (đã đồng bộ sang module ④) — nguồn cho ô gán dòng. */
export type CostLineOption = CtvPlanLine;

const input =
  "h-8 w-full rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const cellInput = "h-8 w-full rounded border border-border-strong bg-surface px-1.5 text-xs outline-none focus:border-brand-400";

let uid = 0;
function nextKey() {
  uid += 1;
  return `new-${uid}`;
}

type EditableRow = CtvRowData & { key: string };

function toEditableRows(rows: CtvRowData[]): EditableRow[] {
  return rows.map((r) => ({ ...r, key: r.id || nextKey() }));
}

function blankRow(sort: number): EditableRow {
  return {
    key: nextKey(),
    id: "",
    sort,
    fullName: "",
    gender: null,
    dateOfBirth: null,
    nationality: null,
    idNumber: null,
    idIssueDate: null,
    idIssuePlace: null,
    permanentAddress: null,
    taxCode: null,
    bankAccountNo: null,
    bankName: null,
    bankBranch: null,
    phone: null,
    eventName: null,
    executionDate: null,
    acceptanceDate: null,
    executionLocation: null,
    workItem: null,
    unit: null,
    quantity: null,
    unitPrice: null,
    amount: null,
    grossNet: null,
    pitTax: null,
    netReceived: null,
    note: null,
    financeCostLineId: null,
    generated: false,
    generatedAt: null,
  };
}

/** Payload gửi lên server khi Lưu 1 dòng — khớp shape `ctvRowSchema` (validators/ctv.ts). */
function rowPayload(row: EditableRow, sort: number) {
  return {
    sort,
    fullName: row.fullName,
    gender: row.gender ?? "",
    dateOfBirth: row.dateOfBirth ?? "",
    nationality: row.nationality ?? "",
    idNumber: row.idNumber ?? "",
    idIssueDate: row.idIssueDate ?? "",
    idIssuePlace: row.idIssuePlace ?? "",
    permanentAddress: row.permanentAddress ?? "",
    taxCode: row.taxCode ?? "",
    bankAccountNo: row.bankAccountNo ?? "",
    bankName: row.bankName ?? "",
    bankBranch: row.bankBranch ?? "",
    phone: row.phone ?? "",
    eventName: row.eventName ?? "",
    executionDate: row.executionDate ?? "",
    acceptanceDate: row.acceptanceDate ?? "",
    executionLocation: row.executionLocation ?? "",
    workItem: row.workItem ?? "",
    unit: row.unit ?? "",
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    amount: row.amount,
    grossNet: row.grossNet ?? "",
    pitTax: row.pitTax,
    netReceived: row.netReceived,
    note: row.note ?? "",
    financeCostLineId: row.financeCostLineId ?? "",
  };
}

export function OperationsPanel({
  projectId,
  batches,
  costLines,
}: {
  projectId: string;
  batches: CtvBatchData[];
  costLines: CostLineOption[];
}) {
  const t = useTranslations("projects.operations");
  const [creating, setCreating] = useState(false);

  async function handleCreate(formData: FormData) {
    setCreating(true);
    await createCtvBatch(projectId, formData);
    setCreating(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3">
        <span className="text-sm font-semibold text-foreground">{t("batchListTitle")}</span>
        <form action={handleCreate} className="flex items-center gap-2">
          <input name="name" placeholder={t("batchNamePlaceholder")} className={input + " w-56"} />
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> {t("newBatch")}
          </button>
        </form>
      </div>

      {batches.length === 0 && (
        <p className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted-foreground">{t("noBatches")}</p>
      )}

      {/* Chưa đồng bộ CO/CE sang module ④ thì chưa có dòng để gán — nhắc đúng chỗ phải bấm. */}
      {costLines.length === 0 && batches.length > 0 && (
        <p className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">{t("noCostLines")}</p>
      )}

      {batches.map((batch) => (
        <BatchCard key={batch.id} batch={batch} costLines={costLines} />
      ))}

      <p className="text-xs text-muted-foreground sm:hidden">{t("mobileNote")}</p>
    </div>
  );
}

function BatchCard({ batch, costLines }: { batch: CtvBatchData; costLines: CostLineOption[] }) {
  const t = useTranslations("projects.operations");
  const locale = useLocale() as Locale;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<EditableRow[]>(() => toEditableRows(batch.rows));
  const [hasSourceFile, setHasSourceFile] = useState(batch.hasSourceFile);

  const [headerPending, setHeaderPending] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [genPending, setGenPending] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  // Sửa từng dòng riêng: dòng nào đổi thì đánh dấu "dirty", chỉ dòng đó bị gửi lên server khi Lưu —
  // KHÔNG đụng các dòng khác (tránh mất generatedFileKey/generatedAt của dòng đã tạo biên bản).
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowDeleting, setRowDeleting] = useState<Record<string, boolean>>({});

  function updateRow(key: string, patch: Partial<EditableRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty((d) => ({ ...d, [key]: true }));
  }
  function addRow() {
    const row = blankRow(rows.length + 1);
    setRows((rs) => [...rs, row]);
    setDirty((d) => ({ ...d, [row.key]: true }));
  }

  async function removeRow(row: EditableRow) {
    if (!window.confirm(t("removeRowConfirm"))) return;
    if (!row.id) {
      // dòng mới thêm, chưa lưu — chỉ bỏ khỏi state, không gọi server.
      setRows((rs) => rs.filter((r) => r.key !== row.key));
      setDirty((d) => { const n = { ...d }; delete n[row.key]; return n; });
      return;
    }
    setRowDeleting((s) => ({ ...s, [row.key]: true }));
    const res = await deleteCtvRow(row.id);
    setRowDeleting((s) => ({ ...s, [row.key]: false }));
    if (res.error) {
      setRowError((e) => ({ ...e, [row.key]: res.error as string }));
      return;
    }
    setRows((rs) => rs.filter((r) => r.key !== row.key));
  }

  async function saveRow(row: EditableRow) {
    setRowSaving((s) => ({ ...s, [row.key]: true }));
    setRowError((e) => { const n = { ...e }; delete n[row.key]; return n; });
    const formData = new FormData();
    formData.set("rowJson", JSON.stringify(rowPayload(row, row.sort)));
    const res = row.id ? await updateCtvRow(row.id, formData) : await createCtvRow(batch.id, formData);
    setRowSaving((s) => ({ ...s, [row.key]: false }));
    if (res.error || !res.row) {
      setRowError((e) => ({ ...e, [row.key]: res.error ?? "ERROR" }));
      return;
    }
    const savedRow = res.row;
    setRows((rs) => rs.map((r) => (r.key === row.key ? { ...savedRow, key: row.key } : r)));
    setDirty((d) => { const n = { ...d }; delete n[row.key]; return n; });
  }

  async function handleSaveHeader(formData: FormData) {
    setHeaderPending(true);
    await saveCtvBatchHeader(batch.id, formData);
    setHeaderPending(false);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportMsg(null);
    setImportPending(true);
    const formData = new FormData();
    formData.set("file", file);
    const res = await importCtvExcel(batch.id, formData);
    setImportPending(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (res.error) {
      setImportError(res.error);
      return;
    }
    if (res.rows) setRows(toEditableRows(res.rows));
    setDirty({});
    setHasSourceFile(true);
    setImportMsg(t("importSuccess", { count: res.count ?? 0 }));
  }

  async function handleGenerate() {
    if (!window.confirm(t("generateConfirm", { count: rows.length }))) return;
    setGenError(null);
    setGenMsg(null);
    setGenPending(true);
    const res = await generateCtvContracts(batch.id);
    setGenPending(false);
    if (res.error) {
      setGenError(res.error);
      return;
    }
    if (res.rows) setRows(toEditableRows(res.rows));
    setGenMsg(t("generateSuccess", { count: res.count ?? 0 }));
  }

  async function handleDeleteBatch() {
    if (!window.confirm(t("deleteBatchConfirm"))) return;
    setDeletePending(true);
    await deleteCtvBatch(batch.id);
    setDeletePending(false);
  }

  const totalAmount = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const totalNet = rows.reduce((sum, r) => sum + (r.netReceived ?? 0), 0);
  const anyGenerated = rows.some((r) => r.generated);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      {/* Header info */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <form action={handleSaveHeader} className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <input type="hidden" name="name" defaultValue={batch.name ?? ""} />
          <label className="text-[11px] text-muted-foreground">
            {t("programFrom")}
            <input name="programFrom" defaultValue={batch.programFrom ?? ""} className={input} />
          </label>
          <label className="text-[11px] text-muted-foreground">
            {t("programTo")}
            <input name="programTo" defaultValue={batch.programTo ?? ""} className={input} />
          </label>
          <label className="text-[11px] text-muted-foreground">
            {t("teamLeader")}
            <input name="teamLeader" defaultValue={batch.teamLeader ?? ""} className={input} />
          </label>
          <label className="text-[11px] text-muted-foreground">
            {t("workLocation")}
            <input name="workLocation" defaultValue={batch.workLocation ?? ""} className={input} />
          </label>
          {/* Dòng CO mặc định của cả đợt: dòng nào không gán riêng thì kế thừa dòng này. Nằm ở cấp
              đợt nên SỐNG SÓT qua import Excel replace-all (import xoá gán theo từng dòng). */}
          <label className="col-span-2 text-[11px] text-muted-foreground sm:col-span-4">
            {t("defaultCostLine")}
            <select name="defaultFinanceCostLineId" defaultValue={batch.defaultFinanceCostLineId ?? ""} className={input}>
              <option value="">{t("defaultCostLineNone")}</option>
              {costLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {(l.itemCode ? l.itemCode + " · " : "") + l.sectionName + " — " + l.itemName + (l.isProxy ? " · " + t("proxyTag") : "")}
                </option>
              ))}
            </select>
          </label>
          <div className="col-span-2 sm:col-span-4">
            <button
              type="submit"
              disabled={headerPending}
              className="mt-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
            >
              {t("saveHeader")}
            </button>
          </div>
        </form>
        <button
          type="button"
          onClick={handleDeleteBatch}
          disabled={deletePending}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger-bg disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t("deleteBatch")}
        </button>
      </div>

      {/* Import */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleImport}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" /> {t("importExcel")}
        </button>
        <span className="text-xs text-muted-foreground">{t("importHint")}</span>
        {hasSourceFile && (
          <a href={`/api/ctv/${batch.id}?type=source`} className="text-xs font-medium text-brand-600 hover:underline">
            {t("downloadSource")}
          </a>
        )}
      </div>
      {importError && <p className="text-xs text-danger">{importError}</p>}
      {importMsg && <p className="text-xs text-success">{importMsg}</p>}
      <p className="text-xs text-warning">{t("importReplaceWarning")}</p>

      {/* Grid */}
      <div className="border-t border-border pt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">{t("gridTitle")}</span>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
          >
            <Plus className="h-3.5 w-3.5" /> {t("addRow")}
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noRows")}</p>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-lg border border-border">
            <table className="w-full min-w-[3500px] border-collapse text-xs">
              <thead>
                <tr className="sticky top-0 z-10 bg-surface-2 text-left">
                  <th className="w-10 px-2 py-2 font-medium text-muted-foreground">{t("sttLabel")}</th>
                  {CTV_COLUMNS.map((col) => (
                    <th key={col.key} className="min-w-[120px] px-2 py-2 font-medium text-muted-foreground">
                      {locale === "en" ? col.labelEn : col.labelVi}
                    </th>
                  ))}
                  <th className="min-w-[180px] px-2 py-2 font-medium text-muted-foreground">{t("rowCostLine")}</th>
                  <th className="w-24 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isDirty = !!dirty[row.key];
                  const isSaving = !!rowSaving[row.key];
                  const isDeleting = !!rowDeleting[row.key];
                  const error = rowError[row.key];
                  return (
                    <tr key={row.key} className="border-t border-border">
                      <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                      {CTV_COLUMNS.map((col) => (
                        <td key={col.key} className="px-2 py-1.5">
                          <input
                            type={col.type === "string" ? "text" : "number"}
                            step={col.type === "money" ? "1" : "any"}
                            value={(row[col.key] as string | number | null) ?? ""}
                            onChange={(e) =>
                              updateRow(row.key, {
                                [col.key]:
                                  col.type === "string"
                                    ? e.target.value
                                    : e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                              } as Partial<EditableRow>)
                            }
                            className={cellInput + (col.type !== "string" ? " text-right tabular-nums" : "")}
                          />
                        </td>
                      ))}
                      {/* Dòng CO của khoản chi này — trống = kế thừa dòng mặc định của đợt. */}
                      <td className="px-2 py-1.5">
                        <select
                          value={row.financeCostLineId ?? ""}
                          onChange={(e) => updateRow(row.key, { financeCostLineId: e.target.value || null })}
                          className={cellInput}
                        >
                          <option value="">{t("rowCostLineInherit")}</option>
                          {costLines.map((l) => (
                            <option key={l.id} value={l.id}>
                              {(l.itemCode ? l.itemCode + " · " : "") + l.itemName + (l.isProxy ? " · " + t("proxyTag") : "")}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          {isDirty ? (
                            <button
                              type="button"
                              onClick={() => saveRow(row)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" /> {t("saveRows")}
                            </button>
                          ) : row.generated ? (
                            <a
                              href={`/api/ctv/${row.id}`}
                              title={t("downloadDocx")}
                              className="rounded p-1 text-brand-600 hover:bg-surface-2"
                            >
                              <FileDown className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeRow(row)}
                            disabled={isDeleting}
                            className="rounded p-1 text-danger hover:bg-danger-bg disabled:opacity-50"
                            title={t("removeRow")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {error && <p className="mt-1 max-w-[140px] text-[10px] text-danger">{error}</p>}
                      </td>
                    </tr>
                  );
                })}
                {/* Cột: STT(1) + fullName..unitPrice(21) = 22 · amount(1) · grossNet+pitTax(2) · netReceived(1) · note+Dòng CO+actions(3) = 29 tổng */}
                <tr className="border-t border-border-strong bg-surface-2 font-semibold">
                  <td className="px-2 py-2" colSpan={22}>
                    {t("totalRow")}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatNumber(totalAmount, locale)}</td>
                  <td className="px-2 py-2" colSpan={2} />
                  <td className="px-2 py-2 text-right tabular-nums">{formatNumber(totalNet, locale)}</td>
                  <td className="px-2 py-2" colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={genPending || rows.length === 0}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {t("generateContracts")}
        </button>
        <span className="text-xs text-muted-foreground">{t("generateHint")}</span>
        {anyGenerated && (
          <a
            href={`/api/ctv/${batch.id}?zip=1`}
            className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
          >
            <Download className="h-3.5 w-3.5" /> {t("downloadAll")}
          </a>
        )}
      </div>
      {genError && <p className="text-xs text-danger">{genError}</p>}
      {genMsg && <p className="text-xs text-success">{genMsg}</p>}

      <PlanVsActualBlock batch={batch} costLines={costLines} rows={rows} locale={locale} />
    </div>
  );
}

/**
 * Khối "Đối chiếu CO ↔ CTV" + đề xuất thanh toán của một đợt.
 *
 * Đối chiếu tính CLIENT-SIDE từ chính state lưới (cập nhật ngay khi gõ, kể cả dòng chưa Lưu);
 * server tính lại toàn bộ trong createCtvBatchPayments trước khi ghi — số ở đây chỉ để nhìn.
 * Dòng Chi hộ tách khối riêng, KHÔNG cộng vào tổng giá vốn (bất biến #2).
 */
function PlanVsActualBlock({
  batch,
  costLines,
  rows,
  locale,
}: {
  batch: CtvBatchData;
  costLines: CostLineOption[];
  rows: EditableRow[];
  locale: Locale;
}) {
  const t = useTranslations("projects.operations");
  const [payPending, setPayPending] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  // Trạng thái "đã đề xuất" giữ ở state để cập nhật ngay sau khi bấm (page revalidate theo sau).
  const [paymentsCreated, setPaymentsCreated] = useState(batch.paymentsCreated);
  const [paymentsTotal, setPaymentsTotal] = useState(batch.paymentsTotal);

  const cmp = ctvPlanVsActual(
    costLines,
    rows.map((r) => ({
      lineId: ctvEffectiveLineId(r.financeCostLineId, batch.defaultFinanceCostLineId),
      cost: ctvRowCost(r),
    })),
  );
  const costRows = cmp.byLine.filter((l) => !l.isProxy);
  const proxyRows = cmp.byLine.filter((l) => l.isProxy);
  const hasOver = cmp.overLineIds.length > 0;

  async function handleCreatePayments(formData: FormData) {
    setPayError(null);
    setPayMsg(null);
    setPayPending(true);
    const res = await createCtvBatchPayments(batch.id, {}, formData);
    setPayPending(false);
    if (res.error) {
      setPayError(res.error);
      return;
    }
    setPaymentsCreated(res.created ?? 0);
    setPaymentsTotal(res.total ?? 0);
    setPayMsg(t("paySuccess", { count: res.created ?? 0, total: formatNumber(res.total ?? 0, locale) }));
  }

  if (cmp.byLine.length === 0 && cmp.unassignedCost === 0) return null;

  return (
    <div className="border-t border-border pt-3">
      <span className="text-sm font-semibold text-foreground">{t("cmpTitle")}</span>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("cmpHint")}</p>

      {costRows.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="bg-surface-2 text-left text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">{t("cmpLine")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("cmpPlan")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("cmpCtv")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("cmpVariance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {costRows.map((l) => (
                <tr key={l.lineId} className={l.variance > 0 ? "text-danger" : ""}>
                  <td className="px-2 py-1.5">{(l.itemCode ? l.itemCode + " · " : "") + l.itemName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(l.plan, locale)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(l.ctv, locale)}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                    {l.variance > 0 ? "+" : ""}
                    {formatNumber(l.variance, locale)}
                  </td>
                </tr>
              ))}
              <tr className="bg-surface-2 font-semibold">
                <td className="px-2 py-1.5">{t("cmpTotalCost")}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(costRows.reduce((s, l) => s + l.plan, 0), locale)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(costRows.reduce((s, l) => s + l.ctv, 0), locale)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatNumber(costRows.reduce((s, l) => s + l.ctv - l.plan, 0), locale)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Chi hộ: trần riêng theo dòng, NGOÀI giá vốn — không gộp vào bảng trên. */}
      {proxyRows.length > 0 && (
        <div className="mt-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          {t("cmpProxyNote")}{" "}
          {proxyRows.map((l) => `${l.itemName}: ${formatNumber(l.ctv, locale)}/${formatNumber(l.plan, locale)}`).join(" · ")}
        </div>
      )}

      {cmp.unassignedCost > 0 && (
        <p className="mt-2 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
          {t("cmpUnassigned", { amount: formatNumber(cmp.unassignedCost, locale) })}
        </p>
      )}

      {/* Đề xuất thanh toán: OPE đề xuất → kế toán chuyển khoản theo BM08. Mỗi dòng CO một phiếu
          chi SCHEDULED — ăn trần dòng + vào cashflow qua đúng hệ phiếu chi sẵn có. */}
      <div className="mt-3">
        {paymentsCreated > 0 ? (
          <p className="text-xs text-success">
            {t("payCreatedInfo", { count: paymentsCreated, total: formatNumber(paymentsTotal, locale) })}{" "}
            <a href="/finance/vendor-payments" className="font-medium text-brand-600 hover:underline">
              {t("payViewLink")}
            </a>
          </p>
        ) : (
          <form action={handleCreatePayments} className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-muted-foreground">
              {t("payDueDate")}
              {/* DateField chứ KHÔNG phải <input type="date"> thuần: input native hiển thị theo
                  locale của HĐH/trình duyệt (Chromium bỏ qua lang), nên máy đặt tiếng Anh-Mỹ sẽ
                  hiện mm/dd/yyyy trong khi cả app dùng dd/mm/yyyy. Submit y hệt: cùng `name`,
                  cùng giá trị ISO yyyy-mm-dd. */}
              <DateField name="dueDate" className={input + " w-40"} />
            </label>
            {hasOver && (
              <label className="text-[11px] text-muted-foreground">
                {t("payOverCapNote")}
                <input name="overCapNote" placeholder={t("payOverCapNotePlaceholder")} className={input + " w-64"} />
              </label>
            )}
            <button
              type="submit"
              disabled={payPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <Banknote className="h-3.5 w-3.5" /> {t("payCreate")}
            </button>
            <span className="text-[11px] text-muted-foreground">{t("payHint")}</span>
          </form>
        )}
        {payError && <p className="mt-1 text-xs text-danger">{payError}</p>}
        {payMsg && <p className="mt-1 text-xs text-success">{payMsg}</p>}
      </div>
    </div>
  );
}
