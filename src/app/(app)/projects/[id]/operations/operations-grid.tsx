"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2, Upload, Download, FileDown, Check } from "lucide-react";
import { CTV_COLUMNS } from "@/lib/ctv-columns";
import { formatNumber } from "@/lib/utils";
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
  rows: CtvRowData[];
};

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
  };
}

export function OperationsPanel({ projectId, batches }: { projectId: string; batches: CtvBatchData[] }) {
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

      {batches.map((batch) => (
        <BatchCard key={batch.id} batch={batch} />
      ))}

      <p className="text-xs text-muted-foreground sm:hidden">{t("mobileNote")}</p>
    </div>
  );
}

function BatchCard({ batch }: { batch: CtvBatchData }) {
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
                {/* Cột: STT(1) + fullName..unitPrice(21) = 22 · amount(1) · grossNet+pitTax(2) · netReceived(1) · note+actions(2) = 28 tổng */}
                <tr className="border-t border-border-strong bg-surface-2 font-semibold">
                  <td className="px-2 py-2" colSpan={22}>
                    {t("totalRow")}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatNumber(totalAmount, locale)}</td>
                  <td className="px-2 py-2" colSpan={2} />
                  <td className="px-2 py-2 text-right tabular-nums">{formatNumber(totalNet, locale)}</td>
                  <td className="px-2 py-2" colSpan={2} />
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
    </div>
  );
}
