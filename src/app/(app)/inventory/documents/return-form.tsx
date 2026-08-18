"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, X } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ITEM_CONDITION_CODES, ITEM_STATUS_CODES, lotCodePreview } from "@/lib/inventory-lot";
import { createReturnDoc, type DocFormState } from "./actions";
import type { HoldingItem, ProjectOption, WarehouseOption } from "./doc-form";

const input =
  "h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/**
 * Một DÒNG = một tình trạng hàng về. Cùng một lô nguồn có thể có nhiều dòng (60 cái còn tốt về lô
 * cũ, 40 cái đã dùng về lô S) nên khoá React phải là `key` riêng, KHÔNG phải itemId.
 */
type Line = { key: string; itemId: string; quantity: number; note: string; toStatus: string; toCond: string };

/**
 * Phiếu TRẢ VỀ KHO — tách riêng khỏi doc-form.tsx (đúng tiền lệ convert-form.tsx của K1) vì trình
 * soạn dòng khác hẳn: nguồn là đồ đang ở hiện trường, mỗi dòng khai thêm trạng thái/tình trạng
 * THỰC TẾ lúc về, và một lô được phép tách thành nhiều dòng.
 */
export function ReturnForm({
  warehouses,
  projects,
  holdingsByProject,
  canRedeclare,
}: {
  warehouses: WarehouseOption[];
  projects: ProjectOption[];
  holdingsByProject: Record<string, HoldingItem[]>;
  /** Có quyền `inventory.lot.convert` — không có thì chỉ trả nguyên lô (server kiểm lại). */
  canRedeclare: boolean;
}) {
  const [state, formAction, pending] = useActionState<DocFormState, FormData>(createReturnDoc, {});
  const t = useTranslations("inventory.documents");
  const ti = useTranslations("inventory.items"); // nhãn trạng thái/tình trạng lô nằm ở namespace danh mục

  const [toWarehouseId, setToWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [seq, setSeq] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const holdings = holdingsByProject[projectId] ?? [];
  const byItem = useMemo(() => new Map(holdings.map((h) => [h.itemId, h])), [holdings]);
  const pickerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return holdings.filter((h) => !q || h.code.toLowerCase().includes(q) || h.name.toLowerCase().includes(q));
  }, [holdings, search]);

  /** Đã khai bao nhiêu trên tất cả các dòng của cùng một lô — so với số đang giữ để cảnh báo sớm. */
  const claimedByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.quantity);
    return m;
  }, [lines]);

  function addLine(h: HoldingItem) {
    setLines((prev) => [
      ...prev,
      { key: `l${seq}`, itemId: h.itemId, quantity: 1, note: "", toStatus: h.statusCode ?? "", toCond: h.conditionCode ?? "" },
    ]);
    setSeq((s) => s + 1);
    setPickerOpen(false);
    setSearch("");
  }
  const patch = (key: string, p: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const payload = lines.map((l) => {
    const h = byItem.get(l.itemId);
    const changed = canRedeclare && !!h && (l.toStatus !== h.statusCode || l.toCond !== h.conditionCode);
    return {
      itemId: l.itemId,
      quantity: l.quantity,
      note: l.note || undefined,
      ...(changed ? { toStatus: l.toStatus, toCond: l.toCond } : {}),
    };
  });

  return (
    <form action={formAction} className="space-y-4 pb-20">
      <input type="hidden" name="linesJson" value={JSON.stringify(payload)} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formProject")}
          <SearchableSelect
            name="projectId"
            value={projectId}
            onChange={(v) => {
              setProjectId(v);
              setLines([]);
            }}
            options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formToWarehouse")}
          <select name="toWarehouseId" value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} className={input + " w-full"}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          {t("formNote")}
          <input name="note" className={input + " w-full"} />
        </label>
      </div>

      <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{t("returnHint")}</p>
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
        {canRedeclare ? t("redeclareHint") : t("redeclareNoPermHint")}
      </p>

      <div className="space-y-2">
        {lines.map((l) => {
          const h = byItem.get(l.itemId);
          if (!h) return null;
          const claimed = claimedByItem.get(l.itemId) ?? 0;
          const changed = l.toStatus !== h.statusCode || l.toCond !== h.conditionCode;
          const canLineRedeclare = canRedeclare && !h.isPart && !!h.productCode && !!h.statusCode && !!h.conditionCode;
          return (
            <div key={l.key} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{h.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {h.code}
                    <span className="ml-2">{t("holdingAt", { count: h.quantity })}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                  aria-label={t("remove")}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => patch(l.key, { quantity: Math.max(1, l.quantity - 1) })}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-foreground active:bg-surface-2"
                  aria-label="−"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <NumberField
                  value={l.quantity}
                  onChange={(v) => patch(l.key, { quantity: v })}
                  aria-label={t("qty")}
                  className="h-11 w-20 rounded-lg border border-border-strong bg-surface text-center text-base font-semibold"
                />
                <button
                  type="button"
                  onClick={() => patch(l.key, { quantity: l.quantity + 1 })}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-foreground active:bg-surface-2"
                  aria-label="+"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {h.unit && <span className="text-xs text-muted-foreground">{h.unit}</span>}
                {claimed > h.quantity && <span className="text-xs font-medium text-danger">{t("errorOverHolding", { item: h.code })}</span>}
              </div>

              {canLineRedeclare && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    {t("toStatus")}
                    <select value={l.toStatus} onChange={(e) => patch(l.key, { toStatus: e.target.value })} className={input + " w-full"}>
                      {ITEM_STATUS_CODES.map((c) => (
                        <option key={c} value={c}>
                          {c} — {ti(`status${c}` as Parameters<typeof ti>[0])}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    {t("toCondition")}
                    <select value={l.toCond} onChange={(e) => patch(l.key, { toCond: e.target.value })} className={input + " w-full"}>
                      {ITEM_CONDITION_CODES.map((c) => (
                        <option key={c} value={c}>
                          {c} — {ti(`cond${c}` as Parameters<typeof ti>[0])}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {canLineRedeclare && changed && (
                <p className="mt-1 font-mono text-[11px] text-brand-600">
                  → {lotCodePreview(h.productCode!)}
                </p>
              )}
              {canRedeclare && h.isPart && <p className="mt-1 text-[11px] text-muted-foreground">{t("redeclarePartHint")}</p>}

              <input
                value={l.note}
                onChange={(e) => patch(l.key, { note: e.target.value })}
                placeholder={t("note")}
                className="mt-2 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs"
              />
            </div>
          );
        })}

        {pickerOpen ? (
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchItem")} autoFocus className={input + " min-w-0 flex-1"} />
              <button type="button" onClick={() => setPickerOpen(false)} aria-label={t("remove")} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {pickerRows.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">{t("empty")}</li>}
              {pickerRows.map((h) => (
                <li key={h.itemId}>
                  <button type="button" onClick={() => addLine(h)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">{h.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{h.code}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t("holdingAt", { count: h.quantity })}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="h-11 w-full rounded-xl border border-dashed border-border-strong text-sm font-medium text-brand-600 hover:bg-surface-2"
          >
            {t("addLine")}
          </button>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface p-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
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
