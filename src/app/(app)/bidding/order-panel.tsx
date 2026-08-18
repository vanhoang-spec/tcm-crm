"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatDateTime } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { acceptOrder, createBrainstormOrder, createDepartmentOrder, submitOrderResult } from "./order-actions";

const CREATIVE_LABELS = ["KEY_VISUAL", "DESIGN_2D", "DESIGN_3D", "SET_DESIGN", "VIDEO", "OTHER"] as const;
const DEPARTMENTS = [
  { code: "PLANNING", labelKey: "deptPLANNING" },
  { code: "CREATIVE", labelKey: "deptCREATIVE" },
  { code: "PCC", labelKey: "deptPCC" },
  { code: "OPE", labelKey: "deptOPE" },
  { code: "PRO", labelKey: "deptPRO" },
] as const;

export type OrderData = {
  id: string;
  department: string;
  status: string;
  briefLinkUrl: string | null;
  extraBriefInfo: string | null;
  outputRequest: string | null;
  desiredTimeline: Date | null;
  meetingAt: Date | null;
  meetingLocation: string | null;
  meetingFormat: string | null;
  sentByName: string | null;
  sentAt: Date;
  acceptedByName: string | null;
  acceptedAt: Date | null;
  resultLinkUrl: string | null;
  resultSentAt: Date | null;
  resultSentByName: string | null;
  creativeItems: { label: string; detail: string | null }[];
  attendeeNames: string[];
  /** K6-3: vật dụng kho cần dùng (order OPE/PRO) — sản phẩm + số lượng */
  stockLines: { productCode: string; productName: string; unit: string | null; quantity: number; note: string | null }[];
};

export function OrderPanel({
  projectId,
  briefLinkUrl,
  orders,
  staff,
  preselectedAttendeeIds,
  accountName,
  suggestedTimeline,
  products = [],
}: {
  projectId: string;
  briefLinkUrl: string;
  orders: OrderData[];
  staff: { id: string; label: string }[];
  /** CR-1/B1: lead 3 team nhỏ Creative — tick SẴN trong danh sách mời (gợi ý, Account bỏ tick được). */
  preselectedAttendeeIds?: string[];
  accountName: string;
  suggestedTimeline: string; // yyyy-mm-dd
  /** K6-3: danh mục SẢN PHẨM kho để Account ghi vật dụng cần dùng lên order OPE/PRO */
  products?: { id: string; code: string; name: string; unit: string | null }[];
}) {
  const t = useTranslations("bidding.order");
  const locale = useLocale() as Locale;
  const ordersByDept = Object.fromEntries(orders.map((o) => [o.department, o]));
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  function toggle(code: string) {
    setTicked((s) => ({ ...s, [code]: !s[code] }));
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("desc")}</p>

      <div className="mt-4 space-y-3">
        {/* Brainstorm */}
        <div className="rounded-lg border border-border-strong p-3">
          <label className="flex items-center gap-3 py-1 text-sm font-medium text-foreground">
            {!ordersByDept.BRAINSTORM && (
              <input type="checkbox" checked={!!ticked.BRAINSTORM} onChange={() => toggle("BRAINSTORM")} className="h-5 w-5 rounded border-border-strong" />
            )}
            {t("deptBrainstorm")}
          </label>
          {ordersByDept.BRAINSTORM ? (
            <BrainstormCard order={ordersByDept.BRAINSTORM} locale={locale} t={t} />
          ) : (
            ticked.BRAINSTORM && <BrainstormForm projectId={projectId} staff={staff} preselected={preselectedAttendeeIds} t={t} />
          )}
        </div>

        {/* 5 phòng ban */}
        {DEPARTMENTS.map((d) => {
          const order = ordersByDept[d.code];
          return (
            <div key={d.code} className="rounded-lg border border-border-strong p-3">
              <label className="flex items-center gap-3 py-1 text-sm font-medium text-foreground">
                {!order && (
                  <input type="checkbox" checked={!!ticked[d.code]} onChange={() => toggle(d.code)} className="h-5 w-5 rounded border-border-strong" />
                )}
                {t(d.labelKey)}
              </label>
              {order ? (
                <DepartmentCard projectId={projectId} order={order} locale={locale} t={t} accountName={accountName} />
              ) : (
                ticked[d.code] && (
                  <DepartmentForm
                    projectId={projectId}
                    department={d.code}
                    isCreative={d.code === "CREATIVE"}
                    briefLinkUrl={briefLinkUrl}
                    suggestedTimeline={suggestedTimeline}
                    products={products}
                    t={t}
                  />
                )
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BrainstormForm({
  projectId,
  staff,
  preselected,
  t,
}: {
  projectId: string;
  staff: { id: string; label: string }[];
  preselected?: string[];
  t: (key: string) => string;
}) {
  const bound = createBrainstormOrder.bind(null, projectId);
  const pre = new Set(preselected ?? []);
  return (
    <form action={bound} className="mt-3 space-y-2">
      <Field label={t("meetingAt")}>
        <input name="meetingAt" type="datetime-local" required className={inputClass} />
      </Field>
      <Field label={t("meetingLocation")}>
        <input name="meetingLocation" className={inputClass} />
      </Field>
      <Field label={t("meetingFormat")}>
        <select name="meetingFormat" defaultValue="OFFLINE" className={inputClass}>
          <option value="OFFLINE">{t("meetingOffline")}</option>
          <option value="ONLINE">{t("meetingOnline")}</option>
        </select>
      </Field>
      <Field label={t("meetingAttendees")}>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border-strong p-2">
          {staff.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-xs text-foreground">
              <input type="checkbox" name="attendeeIds" value={s.id} defaultChecked={pre.has(s.id)} className="h-3.5 w-3.5 rounded border-border-strong" />
              {s.label}
            </label>
          ))}
        </div>
      </Field>
      <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-medium text-white hover:bg-brand-600">
        {t("meetingSubmit")}
      </button>
    </form>
  );
}

function DepartmentForm({
  projectId,
  department,
  isCreative,
  briefLinkUrl,
  suggestedTimeline,
  products,
  t,
}: {
  projectId: string;
  department: string;
  isCreative: boolean;
  briefLinkUrl: string;
  suggestedTimeline: string;
  products: { id: string; code: string; name: string; unit: string | null }[];
  t: (key: string) => string;
}) {
  const bound = createDepartmentOrder.bind(null, projectId, department);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // K6-3: vật dụng kho cần dùng — chỉ order OPE/PRO (bộ phận nhận hàng vật lý). Sản phẩm + SL + ghi chú → stockLinesJson.
  const canStock = department === "OPE" || department === "PRO";
  const [stockLines, setStockLines] = useState<{ productId: string; quantity: number; note: string }[]>([]);
  const patchLine = (i: number, patch: Partial<{ productId: string; quantity: number; note: string }>) =>
    setStockLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form action={bound} className="mt-3 space-y-2">
      <Field label={t("briefLinkLabel")}>
        <a href={briefLinkUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand-600 hover:underline">
          {briefLinkUrl}
        </a>
      </Field>
      <Field label={t("extraBriefInfo")}>
        <textarea name="extraBriefInfo" rows={2} placeholder={t("extraBriefInfoPlaceholder")} className={inputClass} />
      </Field>
      {isCreative ? (
        <Field label={t("outputRequest")}>
          <div className="space-y-1.5">
            {CREATIVE_LABELS.map((label) => (
              <div key={label}>
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    name={`creative_item_${label}`}
                    checked={!!checked[label]}
                    onChange={(e) => setChecked((c) => ({ ...c, [label]: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-border-strong"
                  />
                  {t(creativeLabelKey(label))}
                </label>
                {checked[label] && (
                  <input
                    name={`creative_detail_${label}`}
                    placeholder={t("creativeDetailPlaceholder")}
                    className={`${inputClass} mt-1`}
                  />
                )}
              </div>
            ))}
          </div>
        </Field>
      ) : (
        <Field label={t("outputRequest")}>
          <textarea name="outputRequest" rows={2} placeholder={t("outputRequestPlaceholder")} className={inputClass} />
        </Field>
      )}
      <Field label={t("desiredTimeline")}>
        <DateField name="desiredTimeline" defaultValue={suggestedTimeline} className={inputClass} />
      </Field>
      {canStock && (
        <Field label={t("stockLinesLabel")}>
          <input type="hidden" name="stockLinesJson" value={JSON.stringify(stockLines.filter((l) => l.productId && l.quantity > 0))} />
          <div className="space-y-1.5">
            {stockLines.map((l, i) => (
              <div key={i} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_88px_1fr_28px]">
                <SearchableSelect
                  value={l.productId}
                  onChange={(v) => patchLine(i, { productId: v })}
                  options={products.map((pr) => ({ value: pr.id, label: `${pr.code} — ${pr.name}${pr.unit ? ` (${pr.unit})` : ""}` }))}
                  placeholder={t("stockLineProduct")}
                  className="text-xs"
                />
                <input type="number" min={1} value={l.quantity} onChange={(e) => patchLine(i, { quantity: Number(e.target.value) })} aria-label={t("stockLineQty")} className={inputClass} />
                <input value={l.note} onChange={(e) => patchLine(i, { note: e.target.value })} placeholder={t("stockLineNote")} className={inputClass} />
                <button type="button" onClick={() => setStockLines((prev) => prev.filter((_, j) => j !== i))} aria-label={t("stockLineRemove")} className="h-9 rounded-lg border border-border-strong text-xs text-muted-foreground hover:bg-surface-2">
                  ×
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setStockLines((prev) => [...prev, { productId: "", quantity: 1, note: "" }])} className="h-8 rounded-lg border border-dashed border-border-strong px-3 text-xs font-medium text-brand-600 hover:bg-surface-2">
              + {t("stockLineAdd")}
            </button>
            <p className="text-[11px] text-muted-foreground">{t("stockLinesHint")}</p>
          </div>
        </Field>
      )}
      <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-medium text-white hover:bg-brand-600">
        {t("submit")}
      </button>
    </form>
  );
}

function creativeLabelKey(label: string): string {
  switch (label) {
    case "KEY_VISUAL":
      return "creativeKeyVisual";
    case "DESIGN_2D":
      return "creativeDesign2d";
    case "DESIGN_3D":
      return "creativeDesign3d";
    case "SET_DESIGN":
      return "creativeSetDesign";
    case "VIDEO":
      return "creativeVideo";
    default:
      return "creativeOther";
  }
}

function BrainstormCard({ order, locale, t }: { order: OrderData; locale: Locale; t: (key: string, values?: Record<string, string>) => string }) {
  return (
    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
      <p>
        {order.meetingAt ? formatDateTime(order.meetingAt, locale) : "—"}
        {order.meetingLocation && <> · {order.meetingLocation}</>}
        {order.meetingFormat && <> · {order.meetingFormat === "ONLINE" ? t("meetingOnline") : t("meetingOffline")}</>}
      </p>
      {order.attendeeNames.length > 0 && <p>{order.attendeeNames.join(", ")}</p>}
      <p>{t("sentBy", { name: order.sentByName ?? "—", date: formatDateTime(order.sentAt, locale) })}</p>
    </div>
  );
}

function DepartmentCard({
  projectId,
  order,
  locale,
  t,
  accountName,
}: {
  projectId: string;
  order: OrderData;
  locale: Locale;
  t: (key: string, values?: Record<string, string>) => string;
  accountName: string;
}) {
  const acceptBound = acceptOrder.bind(null, projectId, order.id);

  return (
    <div className="mt-2 space-y-1.5 text-xs">
      {order.extraBriefInfo && <p className="text-muted-foreground">{order.extraBriefInfo}</p>}
      {order.outputRequest && <p className="text-muted-foreground">{order.outputRequest}</p>}
      {order.creativeItems.length > 0 && (
        <ul className="list-inside list-disc text-muted-foreground">
          {order.creativeItems.map((it) => (
            <li key={it.label}>
              {t(creativeLabelKey(it.label))}
              {it.detail && <>: {it.detail}</>}
            </li>
          ))}
        </ul>
      )}
      {order.stockLines.length > 0 && (
        <div>
          <p className="font-medium text-foreground">{t("stockLinesLabel")}</p>
          <ul className="list-inside list-disc text-muted-foreground">
            {order.stockLines.map((sl, i) => (
              <li key={i}>
                <span className="font-mono">{sl.productCode}</span> {sl.productName} × {sl.quantity}{sl.unit ? ` ${sl.unit}` : ""}{sl.note ? ` — ${sl.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {order.desiredTimeline && <p className="text-muted-foreground">{t("desiredTimeline")}: {formatDateTime(order.desiredTimeline, locale)}</p>}
      <p className="text-muted-foreground">{t("sentBy", { name: order.sentByName ?? "—", date: formatDateTime(order.sentAt, locale) })}</p>
      {order.status === "SENT" && (
        <div className="space-y-1">
          <form action={acceptBound}>
            <button type="submit" className="h-8 rounded-lg bg-success px-3 text-xs font-medium text-white hover:bg-success/90">
              {t("accept")}
            </button>
          </form>
          <p className="text-[11px] italic text-muted-foreground">{t("acceptNote", { name: accountName })}</p>
        </div>
      )}
      {(order.status === "ACCEPTED" || order.status === "DONE") && (
        <p className="inline-flex items-center gap-1 font-medium text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t("acceptedBy", { name: order.acceptedByName ?? "—", date: order.acceptedAt ? formatDateTime(order.acceptedAt, locale) : "" })}
        </p>
      )}
      {order.status === "ACCEPTED" && (
        <ResultForm projectId={projectId} orderId={order.id} t={t} />
      )}
      {order.status === "DONE" && order.resultLinkUrl && (
        <div className="rounded-lg border border-success/30 bg-success-bg p-2">
          <a href={order.resultLinkUrl} target="_blank" rel="noreferrer" className="block truncate font-medium text-brand-600 hover:underline">
            {order.resultLinkUrl}
          </a>
          <p className="mt-0.5 text-muted-foreground">
            {t("resultSentBy", { name: order.resultSentByName ?? "—", date: order.resultSentAt ? formatDateTime(order.resultSentAt, locale) : "" })}
          </p>
        </div>
      )}
    </div>
  );
}

function ResultForm({ projectId, orderId, t }: { projectId: string; orderId: string; t: (key: string) => string }) {
  const bound = submitOrderResult.bind(null, projectId, orderId);
  return (
    <form action={bound} className="space-y-1.5">
      <input name="resultLinkUrl" type="url" placeholder={t("resultLinkPlaceholder")} required className={inputClass} />
      <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
        {t("submitResult")}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
