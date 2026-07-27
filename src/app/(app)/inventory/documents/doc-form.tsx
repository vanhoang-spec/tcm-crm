"use client";

import { useActionState, useMemo, useState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { Minus, Plus, X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createAdjustDoc,
  createDestroyDoc,
  createImportDoc,
  createLossDoc,
  createReturnDoc,
  type DocFormState,
} from "./actions";

/** Chuyển kho + xuất kho cho dự án KHÔNG còn ở đây — cả hai đi qua đề xuất + duyệt (inventory/requests). */
export type DocKind = "IMPORT" | "ADJUST" | "RETURN" | "DESTROY" | "LOSS";

export type PickerItem = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  isReusable: boolean;
  /** tồn theo kho (stockable item) — RETURN dùng holdings thay thế */
  balances: Record<string, number>;
};

export type WarehouseOption = { id: string; name: string };
export type ProjectOption = { id: string; code: string; name: string };
/** RETURN: đồ đang giữ theo dự án */
export type HoldingItem = { itemId: string; code: string; name: string; unit: string | null; quantity: number };

type Line = { itemId: string; quantity: number; note: string };

const ACTIONS: Record<DocKind, (prev: DocFormState, fd: FormData) => Promise<DocFormState>> = {
  IMPORT: createImportDoc,
  ADJUST: createAdjustDoc,
  RETURN: createReturnDoc,
  DESTROY: createDestroyDoc,
  LOSS: createLossDoc,
};

const input =
  "h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function DocForm({
  kind,
  warehouses,
  items,
  projects,
  holdingsByProject,
}: {
  kind: DocKind;
  warehouses: WarehouseOption[];
  items: PickerItem[];
  projects?: ProjectOption[];
  holdingsByProject?: Record<string, HoldingItem[]>;
}) {
  const [state, formAction, pending] = useActionState<DocFormState, FormData>(ACTIONS[kind], {});
  const t = useTranslations("inventory.documents");

  const [fromWarehouseId, setFromWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [projectId, setProjectId] = useState(projects?.[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Nguồn hiển thị tồn: DESTROY = kho nguồn; IMPORT/ADJUST = kho đích; RETURN/LOSS = holding của dự án
  const sourceWarehouseId = kind === "IMPORT" || kind === "ADJUST" ? toWarehouseId : fromWarehouseId;
  const holdings = useMemo(
    () => (kind === "RETURN" || kind === "LOSS" ? (holdingsByProject?.[projectId] ?? []) : null),
    [kind, holdingsByProject, projectId]
  );

  const pickerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (holdings) {
      return holdings
        .filter((h) => !q || h.code.toLowerCase().includes(q) || h.name.toLowerCase().includes(q))
        .map((h) => ({ id: h.itemId, code: h.code, name: h.name, unit: h.unit, available: h.quantity }));
    }
    return items
      .filter((it) => !q || it.code.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
      .map((it) => ({ id: it.id, code: it.code, name: it.name, unit: it.unit, available: it.balances[sourceWarehouseId] ?? 0 }));
  }, [search, items, holdings, sourceWarehouseId]);

  const itemById = useMemo(() => {
    const m = new Map<string, { code: string; name: string; unit: string | null; isReusable: boolean; available: number }>();
    for (const it of items) m.set(it.id, { code: it.code, name: it.name, unit: it.unit, isReusable: it.isReusable, available: it.balances[sourceWarehouseId] ?? 0 });
    if (holdings) for (const h of holdings) m.set(h.itemId, { code: h.code, name: h.name, unit: h.unit, isReusable: true, available: h.quantity });
    return m;
  }, [items, holdings, sourceWarehouseId]);

  function addLine(itemId: string) {
    setLines((prev) => (prev.some((l) => l.itemId === itemId) ? prev : [...prev, { itemId, quantity: 1, note: "" }]));
    setPickerOpen(false);
    setSearch("");
  }
  function setQty(itemId: string, quantity: number) {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, quantity } : l)));
  }
  function setNote(itemId: string, note: string) {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, note } : l)));
  }
  function removeLine(itemId: string) {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
  }

  return (
    <form action={formAction} className="space-y-4 pb-20">
      <input type="hidden" name="linesJson" value={JSON.stringify(lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note || undefined })))} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kind === "DESTROY" && (
          <label className="space-y-1 text-xs text-muted-foreground">
            {t("formFromWarehouse")}
            <select name="fromWarehouseId" value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)} className={input + " w-full"}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(kind === "RETURN" || kind === "IMPORT" || kind === "ADJUST") && (
          <label className="space-y-1 text-xs text-muted-foreground">
            {kind === "RETURN" ? t("formToWarehouse") : t("formWarehouse")}
            <select
              name={kind === "IMPORT" || kind === "ADJUST" ? "warehouseId" : "toWarehouseId"}
              value={toWarehouseId}
              onChange={(e) => setToWarehouseId(e.target.value)}
              className={input + " w-full"}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(kind === "RETURN" || kind === "LOSS") && (
          <label className="space-y-1 text-xs text-muted-foreground">
            {t("formProject")}
            <SearchableSelect
              name="projectId"
              value={projectId}
              onChange={(v) => { setProjectId(v); setLines([]); }}
              options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            />
          </label>
        )}
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          {kind === "DESTROY" ? t("formReason") : kind === "LOSS" ? t("formLossReason") : t("formNote")}
          <input name="note" required={kind === "DESTROY" || kind === "LOSS"} className={input + " w-full"} />
        </label>
      </div>

      {kind === "ADJUST" && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{t("adjustHint")}</p>}
      {kind === "RETURN" && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{t("returnHint")}</p>}
      {kind === "DESTROY" && <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{t("destroyHint")}</p>}
      {kind === "LOSS" && <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{t("lossHint")}</p>}

      {/* Dòng hàng */}
      <div className="space-y-2">
        {lines.map((l) => {
          const info = itemById.get(l.itemId);
          if (!info) return null;
          const max = kind === "IMPORT" ? undefined : info.available;
          return (
            <div key={l.itemId} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{info.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {info.code}
                    {kind !== "IMPORT" && kind !== "ADJUST" && (
                      <span className="ml-2">
                        {kind === "RETURN" || kind === "LOSS" ? t("holdingAt", { count: info.available }) : t("balanceAt", { count: info.available })}
                      </span>
                    )}
                  </p>
                </div>
                <button type="button" onClick={() => removeLine(l.itemId)} aria-label={t("remove")} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQty(l.itemId, l.quantity - 1)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-foreground active:bg-surface-2"
                  aria-label="−"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <NumberField
                  value={l.quantity}
                  onChange={(v) => setQty(l.itemId, v)}
                  aria-label={t("qty")}
                  className="h-11 w-20 rounded-lg border border-border-strong bg-surface text-center text-base font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setQty(l.itemId, l.quantity + 1)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-foreground active:bg-surface-2"
                  aria-label="+"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {info.unit && <span className="text-xs text-muted-foreground">{info.unit}</span>}
                {max !== undefined && kind !== "ADJUST" && l.quantity > max && (
                  <span className="text-xs font-medium text-danger">{t("errorInsufficient", { item: info.code })}</span>
                )}
              </div>
              <input
                value={l.note}
                onChange={(e) => setNote(l.itemId, e.target.value)}
                placeholder={t("note")}
                className="mt-2 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs"
              />
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="h-11 w-full rounded-xl border border-dashed border-border-strong text-sm font-medium text-brand-600 hover:bg-surface-2"
        >
          {t("addLine")}
        </button>
      </div>

      {/* Bottom-sheet chọn hàng */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 sm:items-center sm:justify-center" onClick={() => setPickerOpen(false)}>
          <div
            className="max-h-[75vh] w-full overflow-hidden rounded-t-2xl bg-surface p-3 sm:max-w-md sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchItem")}
                className={input + " flex-1"}
              />
              <button type="button" onClick={() => setPickerOpen(false)} aria-label={t("remove")} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="mt-2 max-h-[55vh] space-y-1 overflow-y-auto">
              {pickerRows.map((r) => {
                const added = lines.some((l) => l.itemId === r.id);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => addLine(r.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-surface-2 disabled:opacity-40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{r.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {kind === "RETURN" || kind === "LOSS" ? t("holdingAt", { count: r.available }) : t("balanceAt", { count: r.available })}
                        {r.unit ? ` ${r.unit}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
              {pickerRows.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">—</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Thanh submit dính đáy — tầm ngón cái trên mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface p-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="submit"
            disabled={pending || lines.length === 0}
            className="h-12 flex-1 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-10 sm:max-w-xs"
          >
            {pending ? "..." : t("submit")}
          </button>
          {state.error && <span className="text-xs font-medium text-danger">{state.error}</span>}
        </div>
      </div>
    </form>
  );
}
