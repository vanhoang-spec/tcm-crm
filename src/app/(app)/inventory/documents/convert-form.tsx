"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, X } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import { ITEM_CONDITION_CODES, ITEM_STATUS_CODES } from "@/lib/inventory-lot";
import { createConvertDoc, type DocFormState } from "./actions";

const input =
  "h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/** Lô v2 chọn được để chuyển đổi — bộ tách phần chọn ở CẤP CHA, available = số bộ đủ theo kho. */
export type ConvertPickerItem = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  statusCode: string;
  conditionCode: string;
  isSet: boolean;
  balances: Record<string, number>;
};

type Line = { itemId: string; quantity: number; toStatus: string; toCond: string; note: string };

export function ConvertForm({
  warehouses,
  items,
}: {
  warehouses: { id: string; name: string }[];
  items: ConvertPickerItem[];
}) {
  const [state, formAction, pending] = useActionState<DocFormState, FormData>(createConvertDoc, {});
  const t = useTranslations("inventory.documents");
  const ti = useTranslations("inventory.items");

  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const pickerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((it) => !q || it.code.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
      .map((it) => ({ ...it, available: it.balances[warehouseId] ?? 0 }));
  }, [search, items, warehouseId]);

  function addLine(itemId: string) {
    const src = itemById.get(itemId);
    if (!src) return;
    setLines((prev) =>
      prev.some((l) => l.itemId === itemId)
        ? prev
        : [...prev, { itemId, quantity: 1, toStatus: src.statusCode, toCond: src.conditionCode, note: "" }]
    );
    setPickerOpen(false);
    setSearch("");
  }
  function patch(itemId: string, p: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, ...p } : l)));
  }

  const hasSamePair = lines.some((l) => {
    const src = itemById.get(l.itemId);
    return src && src.statusCode === l.toStatus && src.conditionCode === l.toCond;
  });

  return (
    <form action={formAction} className="space-y-4 pb-20">
      <input
        type="hidden"
        name="linesJson"
        value={JSON.stringify(lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, toStatus: l.toStatus, toCond: l.toCond, note: l.note || undefined })))}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formWarehouse")}
          <select name="fromWarehouseId" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={input + " w-full"}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formNote")}
          <input name="note" className={input + " w-full"} />
        </label>
      </div>

      <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{t("convertHint")}</p>

      <div className="space-y-2">
        {lines.map((l) => {
          const src = itemById.get(l.itemId);
          if (!src) return null;
          const available = src.balances[warehouseId] ?? 0;
          const samePair = src.statusCode === l.toStatus && src.conditionCode === l.toCond;
          return (
            <div key={l.itemId} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{src.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {src.code}
                    <span className="ml-2">{t("balanceAt", { count: available })}</span>
                    {src.isSet && <span className="ml-2">({t("setUnitHint")})</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((x) => x.itemId !== l.itemId))}
                  aria-label={t("remove")}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => patch(l.itemId, { quantity: l.quantity - 1 })}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-foreground active:bg-surface-2"
                  aria-label="−"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <NumberField
                  value={l.quantity}
                  onChange={(v) => patch(l.itemId, { quantity: v })}
                  aria-label={t("qty")}
                  className="h-11 w-20 rounded-lg border border-border-strong bg-surface text-center text-base font-semibold"
                />
                <button
                  type="button"
                  onClick={() => patch(l.itemId, { quantity: l.quantity + 1 })}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-foreground active:bg-surface-2"
                  aria-label="+"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {src.unit && <span className="text-xs text-muted-foreground">{src.unit}</span>}
                {l.quantity > available && <span className="text-xs font-medium text-danger">{t("errorInsufficient", { item: src.code })}</span>}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  {t("convertToStatus")}
                  <select value={l.toStatus} onChange={(e) => patch(l.itemId, { toStatus: e.target.value })} className={input + " w-full"}>
                    {ITEM_STATUS_CODES.map((c) => (
                      <option key={c} value={c}>
                        {c} — {ti(`status${c}` as Parameters<typeof ti>[0])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  {t("convertToCond")}
                  <select value={l.toCond} onChange={(e) => patch(l.itemId, { toCond: e.target.value })} className={input + " w-full"}>
                    {ITEM_CONDITION_CODES.map((c) => (
                      <option key={c} value={c}>
                        {c} — {ti(`cond${c}` as Parameters<typeof ti>[0])}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {samePair && <p className="mt-1 text-xs font-medium text-danger">{t("errorConvertSameInline")}</p>}
              <input
                value={l.note}
                onChange={(e) => patch(l.itemId, { note: e.target.value })}
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

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 sm:items-center sm:justify-center" onClick={() => setPickerOpen(false)}>
          <div className="max-h-[75vh] w-full overflow-hidden rounded-t-2xl bg-surface p-3 sm:max-w-md sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchItem")} className={input + " flex-1"} />
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
                        {t("balanceAt", { count: r.available })}
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

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface p-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="submit"
            disabled={pending || lines.length === 0 || hasSamePair}
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
