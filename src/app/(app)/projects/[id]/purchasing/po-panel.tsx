"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NumberField } from "@/components/ui/number-field";
import { formatNumber, formatDate } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import {
  createPurchaseOrder,
  receivePoLine,
  markPoFullyReceived,
  cancelPurchaseOrder,
  type PoFormState,
} from "./po-actions";

/**
 * Panel PO của tab Thu mua (C3): tạo PO neo từng dòng vào dòng CO, nhận hàng ghi ngay trên dòng,
 * đối chiếu 3 chiều ĐẶT ↔ NHẬN ↔ CHI (chi = phiếu chi gắn PO, lập ở /finance/vendor-payments).
 */
export type PoLineRow = {
  id: string;
  itemName: string;
  costLineLabel: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  receivedQty: number;
  receivedAt: string | null;
};

export type PoRow = {
  id: string;
  code: string;
  vendorName: string;
  status: string; // OPEN | RECEIVED | CANCELED
  note: string | null;
  orderedAt: string;
  ordered: number; // Σ amount
  received: number; // Σ round(receivedQty × unitPrice)
  paid: number; // Σ phiếu chi (chưa huỷ) gắn PO
  lines: PoLineRow[];
};

export type CostLineOpt = { value: string; label: string; itemName: string };

const input =
  "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function ReceiveLineForm({ line }: { line: PoLineRow }) {
  const t = useTranslations("projects.purchasing");
  const [state, formAction, pending] = useActionState<PoFormState, FormData>(receivePoLine.bind(null, line.id), {});
  return (
    <form action={formAction} className="flex items-center justify-end gap-1">
      <input
        name="receivedQty"
        type="number"
        step="any"
        min="0"
        defaultValue={line.receivedQty}
        className={input + " h-7 w-20 px-1.5 text-right text-xs tabular-nums"}
        aria-label={t("poReceivedQty")}
      />
      <button type="submit" disabled={pending} className="rounded-lg border border-border-strong px-2 py-1 text-[11px] font-medium hover:bg-surface-2 disabled:opacity-50">
        {t("poSaveReceived")}
      </button>
      {state.error && <span className="text-[10px] text-danger">{state.error}</span>}
    </form>
  );
}

function CancelPoButton({ poId }: { poId: string }) {
  const t = useTranslations("projects.purchasing");
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<PoFormState, FormData>(cancelPurchaseOrder.bind(null, poId), {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-muted-foreground hover:text-danger">
        {t("poCancel")}
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input name="cancelNote" placeholder={t("poCancelReason")} className={input + " h-8 w-44 text-xs"} />
      <button type="submit" disabled={pending} className="rounded-lg border border-danger/40 px-2 py-1 text-[11px] font-medium text-danger hover:bg-danger-bg disabled:opacity-50">
        {t("poCancel")}
      </button>
      {state.error && <span className="text-[10px] text-danger">{state.error}</span>}
    </form>
  );
}

function ReceiveAllButton({ poId }: { poId: string }) {
  const t = useTranslations("projects.purchasing");
  const [state, formAction, pending] = useActionState<PoFormState, FormData>(markPoFullyReceived.bind(null, poId), {});
  return (
    <form action={formAction} className="inline">
      <button type="submit" disabled={pending} className="inline-flex items-center gap-1 rounded-lg border border-success/40 px-2 py-1 text-[11px] font-medium text-success hover:bg-success/10 disabled:opacity-50">
        <PackageCheck className="h-3 w-3" /> {t("poReceiveAll")}
      </button>
      {state.error && <span className="ml-1 text-[10px] text-danger">{state.error}</span>}
    </form>
  );
}

type NewLine = { key: number; financeCostLineId: string; itemName: string; quantity: number; unitPrice: number };

function CreatePoForm({ projectId, vendors, costLines }: { projectId: string; vendors: { value: string; label: string }[]; costLines: CostLineOpt[] }) {
  const t = useTranslations("projects.purchasing");
  const [state, formAction, pending] = useActionState<PoFormState, FormData>(createPurchaseOrder.bind(null, projectId), {});
  const [rows, setRows] = useState<NewLine[]>([{ key: 1, financeCostLineId: "", itemName: "", quantity: 1, unitPrice: 0 }]);
  const update = (key: number, patch: Partial<NewLine>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-border pt-3">
      <input type="hidden" name="linesJson" value={JSON.stringify(rows)} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-muted-foreground">
          {t("poVendor")}
          <select name="vendorId" required className={input + " block w-56"} defaultValue="">
            <option value="" disabled>{t("poPickVendor")}</option>
            {vendors.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-[11px] text-muted-foreground">
          {t("poNote")}
          <input name="note" className={input + " block w-full"} />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-surface-2 text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">{t("poColCostLine")}</th>
              <th className="px-2 py-1.5 font-medium">{t("poColItem")}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t("poColQty")}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t("poColPrice")}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t("poColAmount")}</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-2 py-1">
                  <select
                    value={r.financeCostLineId}
                    onChange={(e) => {
                      const opt = costLines.find((c) => c.value === e.target.value);
                      // Chọn dòng CO thì điền sẵn tên hạng mục (sửa lại được).
                      update(r.key, { financeCostLineId: e.target.value, itemName: r.itemName || (opt?.itemName ?? "") });
                    }}
                    className={input + " h-8 w-64 text-xs"}
                  >
                    <option value="">{t("poPickCostLine")}</option>
                    {costLines.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input value={r.itemName} onChange={(e) => update(r.key, { itemName: e.target.value })} className={input + " h-8 w-full text-xs"} />
                </td>
                <td className="px-2 py-1">
                  <input type="number" step="any" min="0" value={r.quantity} onChange={(e) => update(r.key, { quantity: Number(e.target.value) })} className={input + " h-8 w-20 text-right text-xs tabular-nums"} />
                </td>
                <td className="px-2 py-1">
                  <NumberField value={r.unitPrice} onChange={(v) => update(r.key, { unitPrice: v })} className={input + " h-8 w-32 text-right text-xs"} />
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{(Math.round(r.quantity * r.unitPrice) || 0).toLocaleString("vi-VN")}</td>
                <td className="px-2 py-1 text-center">
                  <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-danger hover:text-danger/80" disabled={rows.length === 1}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setRows((rs) => [...rs, { key: Math.max(...rs.map((x) => x.key)) + 1, financeCostLineId: "", itemName: "", quantity: 1, unitPrice: 0 }])} className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-2">
          <Plus className="h-3.5 w-3.5" /> {t("poAddLine")}
        </button>
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {t("poCreate")}
        </button>
        <span className="text-[11px] text-muted-foreground">{t("poCreateHint")}</span>
      </div>
      {state.error && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function PoPanel({
  projectId,
  pos,
  vendors,
  costLines,
  canManage,
  canReceive,
}: {
  projectId: string;
  pos: PoRow[];
  vendors: { value: string; label: string }[];
  costLines: CostLineOpt[];
  canManage: boolean;
  canReceive: boolean;
}) {
  const t = useTranslations("projects.purchasing");
  const locale = useLocale() as Locale;
  const [creating, setCreating] = useState(false);
  const tone = (s: string) => (s === "RECEIVED" ? "success" : s === "CANCELED" ? "danger" : "warning") as "success" | "danger" | "warning";

  return (
    <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("poTitle")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("poSubtitle")}</p>
        </div>
        {canManage && !creating && (
          <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600">
            <Plus className="h-3.5 w-3.5" /> {t("poNew")}
          </button>
        )}
      </div>

      {creating && <CreatePoForm projectId={projectId} vendors={vendors} costLines={costLines} />}

      {pos.length === 0 && !creating && (
        <p className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted-foreground">{t("poEmpty")}</p>
      )}

      {pos.map((po) => (
        <div key={po.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{po.code}</span>
              <span className="text-xs text-muted-foreground">{po.vendorName}</span>
              <Badge tone={tone(po.status)}>{t(`poStatus${po.status}`)}</Badge>
              <span className="text-[11px] text-muted-foreground">{formatDate(new Date(po.orderedAt))}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canReceive && po.status === "OPEN" && <ReceiveAllButton poId={po.id} />}
              {canManage && po.status !== "CANCELED" && <CancelPoButton poId={po.id} />}
            </div>
          </div>

          {/* Đối chiếu 3 chiều — CHI lập ở Thanh toán NCC (gắn PO), không lập ở đây. */}
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-surface-2 px-2 py-1.5">{t("poOrdered")}: <span className="font-semibold tabular-nums">{formatNumber(po.ordered, locale)}</span></div>
            <div className="rounded-lg bg-surface-2 px-2 py-1.5">{t("poReceived")}: <span className="font-semibold tabular-nums">{formatNumber(po.received, locale)}</span></div>
            <div className={`rounded-lg bg-surface-2 px-2 py-1.5 ${po.paid > po.received ? "text-warning" : ""}`}>{t("poPaid")}: <span className="font-semibold tabular-nums">{formatNumber(po.paid, locale)}</span></div>
          </div>
          {po.paid > po.received && <p className="mt-1 text-[11px] text-warning">{t("poPaidOverReceived")}</p>}

          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">{t("poColItem")}</th>
                  <th className="px-2 py-1 font-medium">{t("poColCostLine")}</th>
                  <th className="px-2 py-1 text-right font-medium">{t("poColQty")}</th>
                  <th className="px-2 py-1 text-right font-medium">{t("poColPrice")}</th>
                  <th className="px-2 py-1 text-right font-medium">{t("poColAmount")}</th>
                  <th className="px-2 py-1 text-right font-medium">{t("poColReceived")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {po.lines.map((l) => (
                  <tr key={l.id} className={l.receivedQty >= l.quantity ? "" : "text-foreground"}>
                    <td className="px-2 py-1.5">{l.itemName}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{l.costLineLabel ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(l.unitPrice, locale)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(l.amount, locale)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {canReceive && po.status !== "CANCELED" ? (
                        <ReceiveLineForm line={l} />
                      ) : (
                        <span className={`tabular-nums ${l.receivedQty < l.quantity ? "text-warning" : ""}`}>{l.receivedQty}/{l.quantity}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {po.note && <p className="mt-1 text-[11px] text-muted-foreground">{po.note}</p>}
        </div>
      ))}
    </section>
  );
}
