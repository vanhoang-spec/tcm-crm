"use client";

import { Send, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import {
  syncProjectOrders,
  dispatchProjectOrder,
  updateProjectOrderItem,
  addProjectOrderItem,
  removeProjectOrderItem,
} from "../../actions";

export type OrderItemData = {
  id: string;
  label: string;
  detail: string | null;
  desiredReceiptAt: Date | null;
  status: string;
  fromTimeline: boolean;
};
export type OrderData = {
  id: string;
  department: string;
  deptLabel: string;
  isDraft: boolean;
  status: string;
  sentByName: string | null;
  items: OrderItemData[];
};

const input =
  "h-8 w-full rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export function OrderReview({ projectId, orders }: { projectId: string; orders: OrderData[] }) {
  const t = useTranslations("projects.orders");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("refreshHint")}</p>
        <form action={syncProjectOrders.bind(null, projectId)}>
          <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2">
            <RefreshCw className="h-3.5 w-3.5" /> {t("refreshFromTimeline")}
          </button>
        </form>
      </div>

      {orders.length === 0 && <p className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted-foreground">{t("empty")}</p>}

      {orders.map((order) => (
        <div key={order.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{order.deptLabel}</span>
            {order.isDraft ? (
              <Badge tone="warning">{t("draftBadge")}</Badge>
            ) : order.status === "DONE" ? (
              <Badge tone="success">{t("doneBadge")}</Badge>
            ) : order.status === "ACCEPTED" ? (
              <Badge tone="brand">{t("acceptedBadge")}</Badge>
            ) : (
              <Badge tone="neutral">{t("sentBadge")}</Badge>
            )}
            {order.sentByName && !order.isDraft && (
              <span className="text-xs text-muted-foreground">
                {t("sentByLabel")}: {order.sentByName}
              </span>
            )}
          </div>

          {/* Items */}
          <div className="mt-3 space-y-2">
            {order.items.length === 0 && <p className="text-xs text-muted-foreground">{t("noItems")}</p>}
            {order.items.map((it) => (
              <form
                key={it.id}
                action={updateProjectOrderItem.bind(null, projectId, it.id)}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface-2/40 p-2"
              >
                <label className="min-w-[160px] flex-1 text-[11px] text-muted-foreground">
                  {t("itemLabel")}
                  <input name="label" defaultValue={it.label} className={input} />
                </label>
                <label className="min-w-[160px] flex-1 text-[11px] text-muted-foreground">
                  {t("itemDetail")}
                  <input name="detail" defaultValue={it.detail ?? ""} className={input} />
                </label>
                <label className="text-[11px] text-muted-foreground">
                  {t("desiredReceipt")}
                  <DateField name="desiredReceiptAt" defaultValue={toDateInput(it.desiredReceiptAt)} className={input + " w-36"} />
                </label>
                <Badge tone={it.fromTimeline ? "brand" : "neutral"}>{it.fromTimeline ? t("fromTimeline") : t("manualItem")}</Badge>
                <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
                  {t("saveItem")}
                </button>
                <button
                  type="submit"
                  formAction={removeProjectOrderItem.bind(null, projectId, it.id)}
                  className="h-8 rounded-lg border border-danger/40 px-2 text-xs text-danger hover:bg-danger-bg"
                >
                  {t("removeItem")}
                </button>
              </form>
            ))}
          </div>

          {/* Add manual item */}
          <details className="mt-2 rounded-lg border border-dashed border-border-strong p-2">
            <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("addItem")}</summary>
            <form action={addProjectOrderItem.bind(null, projectId, order.id)} className="mt-2 flex flex-wrap items-end gap-2">
              <input name="label" placeholder={t("itemLabel")} className={input + " min-w-[160px] flex-1"} required />
              <input name="detail" placeholder={t("itemDetail")} className={input + " min-w-[160px] flex-1"} />
              <DateField name="desiredReceiptAt" className={input + " w-36"} />
              <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
                {t("addItem")}
              </button>
            </form>
          </details>

          {/* Dispatch */}
          {order.isDraft && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <form action={dispatchProjectOrder.bind(null, projectId, order.id)}>
                <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-success/90">
                  <Send className="h-3.5 w-3.5" /> {t("dispatch")}
                </button>
              </form>
              <span className="text-[11px] text-muted-foreground">{t("dispatchHint")}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
