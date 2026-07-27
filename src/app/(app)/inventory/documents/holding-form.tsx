"use client";

import { useActionState, useMemo, useState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { Minus, Plus, X } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createHoldingTransfer, type DocFormState } from "./actions";
import type { HoldingItem, ProjectOption } from "./doc-form";

type Line = { itemId: string; quantity: number; note: string };

const input =
  "h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/** Chuyển đồ đang ở hiện trường từ dự án A sang dự án B — không qua kho. Nguồn chọn = holding của A. */
export function HoldingForm({
  projects,
  projectsWithHoldings,
  holdingsByProject,
}: {
  projects: ProjectOption[];
  projectsWithHoldings: ProjectOption[];
  holdingsByProject: Record<string, HoldingItem[]>;
}) {
  const [state, formAction, pending] = useActionState<DocFormState, FormData>(createHoldingTransfer, {});
  const t = useTranslations("inventory.documents");

  const [fromProjectId, setFromProjectId] = useState(projectsWithHoldings[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const holdings = holdingsByProject[fromProjectId] ?? [];
  const pickerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return holdings.filter((h) => !q || h.code.toLowerCase().includes(q) || h.name.toLowerCase().includes(q));
  }, [holdings, search]);
  const itemById = useMemo(() => new Map(holdings.map((h) => [h.itemId, h])), [holdings]);

  return (
    <form action={formAction} className="space-y-4 pb-20">
      <input
        type="hidden"
        name="linesJson"
        value={JSON.stringify(lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note || undefined })))}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formFromProject")}
          <SearchableSelect
            name="fromProjectId"
            value={fromProjectId}
            onChange={(v) => {
              setFromProjectId(v);
              setLines([]);
            }}
            options={projectsWithHoldings.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formToProject")}
          <SearchableSelect
            name="projectId"
            value={projectId}
            onChange={setProjectId}
            options={projects.filter((p) => p.id !== fromProjectId).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            required
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formExpectedReturn")}
          <DateField name="expectedReturnAt" className={input + " w-full"} required />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formNote")}
          <input name="note" className={input + " w-full"} />
        </label>
      </div>

      <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{t("holdingHint")}</p>

      <div className="space-y-2">
        {lines.map((l) => {
          const info = itemById.get(l.itemId);
          return (
            <div key={l.itemId} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{info?.name ?? l.itemId}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {info?.code} · {t("holdingAt", { count: info?.quantity ?? 0 })}
                  </p>
                </div>
                <button type="button" onClick={() => setLines((p) => p.filter((x) => x.itemId !== l.itemId))} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLines((p) => p.map((x) => (x.itemId === l.itemId ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))}
                  className="h-11 w-11 rounded-lg border border-border-strong text-muted-foreground hover:bg-surface-2"
                >
                  <Minus className="mx-auto h-4 w-4" />
                </button>
                <NumberField
                  inputMode="numeric"
                  value={l.quantity}
                  onChange={(v) => setLines((p) => p.map((x) => (x.itemId === l.itemId ? { ...x, quantity: v } : x)))}
                  aria-label={t("colQty")}
                  className="h-11 w-24 rounded-lg border border-border-strong bg-surface text-center text-base font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setLines((p) => p.map((x) => (x.itemId === l.itemId ? { ...x, quantity: x.quantity + 1 } : x)))}
                  className="h-11 w-11 rounded-lg border border-border-strong text-muted-foreground hover:bg-surface-2"
                >
                  <Plus className="mx-auto h-4 w-4" />
                </button>
                <input
                  value={l.note}
                  onChange={(e) => setLines((p) => p.map((x) => (x.itemId === l.itemId ? { ...x, note: e.target.value } : x)))}
                  placeholder={t("formNote")}
                  className={input + " min-w-0 flex-1"}
                />
              </div>
            </div>
          );
        })}

        {pickerOpen ? (
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchItem")} autoFocus className={input + " min-w-0 flex-1"} />
              <button type="button" onClick={() => setPickerOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {pickerRows.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">{t("empty")}</li>}
              {pickerRows.map((h) => (
                <li key={h.itemId}>
                  <button
                    type="button"
                    onClick={() => {
                      setLines((p) => (p.some((x) => x.itemId === h.itemId) ? p : [...p, { itemId: h.itemId, quantity: 1, note: "" }]));
                      setPickerOpen(false);
                      setSearch("");
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-surface-2"
                  >
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
          <button type="button" onClick={() => setPickerOpen(true)} className="h-12 w-full rounded-xl border border-dashed border-border-strong text-sm font-medium text-muted-foreground hover:bg-surface-2">
            <Plus className="mr-1 inline h-4 w-4" />
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
