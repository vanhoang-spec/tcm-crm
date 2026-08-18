"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, X } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { ITEM_CONDITION_CODES, ITEM_STATUS_CODES } from "@/lib/inventory-lot";
import { lotOwnerKind } from "@/lib/inventory-request";
import { createDestroyRequest, createIntakeRequest, createIssueRequest, createReserveRequest, createTransferRequest, type RequestFormState } from "./actions";

const input =
  "h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export type RequestPickerItem = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  isReusable: boolean;
  /** ISSUE: tồn khả dụng theo kho (đã trừ phần đã duyệt chưa xuất). INTAKE: chỉ hiển thị tồn hiện có. */
  available: Record<string, number>;
  // ── K6 smart search: nhãn để OPS biết lô này của ai TRƯỚC KHI đề xuất, và để lọc ──
  productCode: string | null;
  groupCode: string | null; // mã nhóm gốc 2 ký tự (PO/DT/…)
  statusCode: string | null;
  conditionCode: string | null;
  ownerClientId: string | null;
  ownerClientCode: string | null;
  boundProjectId: string | null;
  boundProjectCode: string | null;
  boundTeamCode: string | null; // team Account của dự án sở hữu — người sẽ duyệt
};
export type GroupOption = { code: string; name: string };
/** Bộ lọc chủ sở hữu trong picker — cùng thang với lotOwnerKind (lib/inventory-request.ts). */
const OWNER_FILTERS = ["ALL", "TCM", "MINE", "OTHER_PROJECT", "CLIENT"] as const;
export type WarehouseOption = { id: string; name: string };
export type ProjectOption = { id: string; code: string; name: string };
export type PoOption = { id: string; label: string };

type Line = { itemId: string; quantity: number; note: string };

const ACTION_BY_KIND = {
  ISSUE: createIssueRequest,
  INTAKE: createIntakeRequest,
  RESERVE: createReserveRequest,
  TRANSFER: createTransferRequest,
  DESTROY: createDestroyRequest, // K6: đề xuất hủy hàng khách gửi — thủ kho lập, team Account chủ duyệt
} as const;

export function RequestForm({
  kind,
  warehouses,
  items,
  projects,
  purchaseOrders,
  reservedFree,
  groups = [],
}: {
  kind: "ISSUE" | "INTAKE" | "RESERVE" | "TRANSFER" | "DESTROY";
  warehouses: WarehouseOption[];
  items: RequestPickerItem[];
  projects?: ProjectOption[];
  purchaseOrders?: PoOption[];
  /** `${kho}|${item}|${dự án}` → giữ chỗ CÒN TRỐNG; cộng lại cho đúng dự án đang chọn. */
  reservedFree?: Record<string, number>;
  /** K6 smart search: danh sách nhóm gốc để lọc. */
  groups?: GroupOption[];
}) {
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(ACTION_BY_KIND[kind], {});
  const t = useTranslations("inventory.requests");
  const tItems = useTranslations("inventory.items");

  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [toWarehouseId, setToWarehouseId] = useState(kind === "TRANSFER" ? warehouses[1]?.id ?? "" : "");
  const [projectId, setProjectId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  // K6 smart search: lọc nhóm / trạng thái / tình trạng / chủ sở hữu — mặc định KHÔNG lọc gì để không giấu hàng;
  // nhãn chủ sở hữu trên từng dòng là thứ chính, bộ lọc chỉ để thu hẹp khi danh mục dài.
  const [fGroup, setFGroup] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fCond, setFCond] = useState("");
  const [fOwner, setFOwner] = useState<(typeof OWNER_FILTERS)[number]>("ALL");

  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  // Số hiển thị = khả dụng chung + phần giữ chỗ CÒN TRỐNG của chính dự án đang chọn (hàng đó vẫn
  // dùng được cho dự án đó). Chỉ là con số cho người dùng nhìn — server kiểm lại lần cuối.
  const availableFor = useMemo(
    () => (itemId: string) =>
      (items.find((x) => x.id === itemId)?.available[warehouseId] ?? 0) +
      (projectId ? (reservedFree?.[`${warehouseId}|${itemId}|${projectId}`] ?? 0) : 0),
    [items, warehouseId, projectId, reservedFree]
  );
  const pickerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((it) => !q || it.code.toLowerCase().includes(q) || it.name.toLowerCase().includes(q) || (it.productCode ?? "").toLowerCase().includes(q))
      .filter((it) => !fGroup || it.groupCode === fGroup)
      .filter((it) => !fStatus || it.statusCode === fStatus)
      .filter((it) => !fCond || it.conditionCode === fCond)
      .filter((it) => fOwner === "ALL" || lotOwnerKind(it, projectId || null) === fOwner)
      .map((it) => ({ ...it, qty: availableFor(it.id), ownerKind: lotOwnerKind(it, projectId || null) }));
  }, [search, items, availableFor, fGroup, fStatus, fCond, fOwner, projectId]);

  const hasReusableLine = kind === "ISSUE" && lines.some((l) => itemById.get(l.itemId)?.isReusable);

  return (
    <form action={formAction} className="space-y-4 pb-20">
      <input
        type="hidden"
        name="linesJson"
        value={JSON.stringify(lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note || undefined })))}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {kind === "ISSUE" || kind === "TRANSFER" || kind === "DESTROY" ? t("formFromWarehouse") : t("formToWarehouse")}
          <select name="warehouseId" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={input + " w-full"}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {(kind === "ISSUE" || kind === "RESERVE") && (
          <>
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("formProject")}
              <SearchableSelect
                name="projectId"
                value={projectId}
                onChange={setProjectId}
                required
                options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
              />
            </label>
            {kind === "ISSUE" && (
              <label className="space-y-1 text-xs text-muted-foreground">
                {t("formExpectedReturn")}
                <DateField name="expectedReturnAt" required={hasReusableLine} className={input + " w-full"} />
                <span className="block text-[11px] leading-snug">{t("reusableHint")}</span>
              </label>
            )}
          </>
        )}
        {kind === "TRANSFER" && (
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
        )}
        {kind === "INTAKE" && (
          <label className="space-y-1 text-xs text-muted-foreground">
            {t("formPo")}
            <SearchableSelect
              name="purchaseOrderId"
              value={purchaseOrderId}
              onChange={setPurchaseOrderId}
              allowClear
              options={[{ value: "", label: t("noPo") }, ...(purchaseOrders ?? []).map((p) => ({ value: p.id, label: p.label }))]}
            />
            <span className="block text-[11px] leading-snug">{t("intakeSourceHint")}</span>
          </label>
        )}
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          {kind === "DESTROY" ? t("destroyReason") : t("formNote")}
          <input name="note" required={kind === "DESTROY"} className={input + " w-full"} />
          {kind === "DESTROY" && <span className="block text-[11px] leading-snug">{t("destroyReasonHint")}</span>}
        </label>
      </div>

      <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
        {kind === "ISSUE"
          ? t("issueFlowHint")
          : kind === "RESERVE"
            ? t("reserveFlowHint")
            : kind === "TRANSFER"
              ? t("transferFlowHint")
              : t("intakeFlowHint")}
      </p>

      <div className="space-y-2">
        {lines.map((l) => {
          const info = itemById.get(l.itemId);
          if (!info) return null;
          const avail = availableFor(l.itemId);
          return (
            <div key={l.itemId} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{info.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {info.code}
                    {kind !== "INTAKE" && <span className="ml-2">{t("availableAt", { count: avail })}</span>}
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
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.map((x) => (x.itemId === l.itemId ? { ...x, quantity: x.quantity - 1 } : x)))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-foreground active:bg-surface-2"
                  aria-label="−"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <NumberField
                  value={l.quantity}
                  onChange={(v) => setLines((prev) => prev.map((x) => (x.itemId === l.itemId ? { ...x, quantity: v } : x)))}
                  aria-label={t("qty")}
                  className="h-11 w-20 rounded-lg border border-border-strong bg-surface text-center text-base font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.map((x) => (x.itemId === l.itemId ? { ...x, quantity: x.quantity + 1 } : x)))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-foreground active:bg-surface-2"
                  aria-label="+"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {info.unit && <span className="text-xs text-muted-foreground">{info.unit}</span>}
                {(kind === "ISSUE" || kind === "TRANSFER") && l.quantity > avail && (
                  <span className="text-xs font-medium text-danger">{t("overAvailable", { item: info.code })}</span>
                )}
              </div>
              <input
                value={l.note}
                onChange={(e) => setLines((prev) => prev.map((x) => (x.itemId === l.itemId ? { ...x, note: e.target.value } : x)))}
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
            {/* K6 smart search — 4 bộ lọc nhanh */}
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <select value={fGroup} onChange={(e) => setFGroup(e.target.value)} aria-label={t("filterGroup")} className={input + " h-9 text-xs"}>
                <option value="">{t("filterGroup")}</option>
                {groups.map((g) => (
                  <option key={g.code} value={g.code}>{g.code} — {g.name}</option>
                ))}
              </select>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label={t("filterStatus")} className={input + " h-9 text-xs"}>
                <option value="">{t("filterStatus")}</option>
                {ITEM_STATUS_CODES.map((c) => (
                  <option key={c} value={c}>{tItems(`status${c}` as Parameters<typeof tItems>[0])}</option>
                ))}
              </select>
              <select value={fCond} onChange={(e) => setFCond(e.target.value)} aria-label={t("filterCondition")} className={input + " h-9 text-xs"}>
                <option value="">{t("filterCondition")}</option>
                {ITEM_CONDITION_CODES.map((c) => (
                  <option key={c} value={c}>{tItems(`cond${c}` as Parameters<typeof tItems>[0])}</option>
                ))}
              </select>
              <select value={fOwner} onChange={(e) => setFOwner(e.target.value as (typeof OWNER_FILTERS)[number])} aria-label={t("filterOwner")} className={input + " h-9 text-xs"}>
                {OWNER_FILTERS.map((k) => (
                  <option key={k} value={k}>{t(`owner${k}` as Parameters<typeof t>[0])}</option>
                ))}
              </select>
            </div>
            <ul className="mt-2 max-h-[55vh] space-y-1 overflow-y-auto">
              {pickerRows.map((r) => {
                const added = lines.some((l) => l.itemId === r.id);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => {
                        setLines((prev) => (prev.some((l) => l.itemId === r.id) ? prev : [...prev, { itemId: r.id, quantity: 1, note: "" }]));
                        setPickerOpen(false);
                        setSearch("");
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-surface-2 disabled:opacity-40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{r.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {r.statusCode && <Badge tone={r.statusCode === "R" ? "success" : "neutral"}>{tItems(`status${r.statusCode}` as Parameters<typeof tItems>[0])}</Badge>}
                          {r.conditionCode && <Badge tone="neutral">{tItems(`cond${r.conditionCode}` as Parameters<typeof tItems>[0])}</Badge>}
                          {/* K6: nhãn CHỦ SỞ HỮU — quyết định ai duyệt. Hàng của chủ khác vẫn xin được (K6-2), chỉ là người duyệt khác. */}
                          {r.ownerKind === "TCM" && <Badge tone="neutral">{t("ownerTCM")}</Badge>}
                          {r.ownerKind === "MINE" && <Badge tone="success">{t("ownerMineShort", { project: r.boundProjectCode ?? "" })}</Badge>}
                          {r.ownerKind === "OTHER_PROJECT" && <Badge tone="warning">{t("ownerOtherShort", { project: r.boundProjectCode ?? "", team: r.boundTeamCode ?? "?" })}</Badge>}
                          {r.ownerKind === "CLIENT" && <Badge tone="brand">{t("ownerClientShort", { client: r.ownerClientCode ?? "", project: r.boundProjectCode ?? "—", team: r.boundTeamCode ?? "?" })}</Badge>}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {kind === "ISSUE" || kind === "TRANSFER" || kind === "DESTROY" ? t("availableAt", { count: r.qty }) : ""}
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
            disabled={pending || lines.length === 0}
            className="h-12 flex-1 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-10 sm:max-w-xs"
          >
            {pending ? "..." : t("submitRequest")}
          </button>
          {state.error && <span className="text-xs font-medium text-danger">{state.error}</span>}
        </div>
      </div>
    </form>
  );
}
