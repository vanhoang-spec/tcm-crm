"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ITEM_CONDITION_CODES, ITEM_STATUS_CODES, TCM_OWNER_SEG, itemCodePrefix } from "@/lib/inventory-lot";
import { createItem, updateItem, type ItemFormState } from "./actions";

const input =
  "h-11 sm:h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export type CategoryOption = {
  id: string;
  name: string;
  depth: number;
  rootCode: string | null;
  isClientOwned: boolean;
};
export type ClientOption = { id: string; code: string; name: string };
export type ProjectOption = { id: string; code: string; name: string };

export type ItemEditPayload = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  isReusable: boolean;
  partCount: number;
  isActive: boolean;
  note: string | null;
  statusCode: string | null;
  conditionCode: string | null;
  catNodeName: string | null;
  clientLabel: string | null; // "DHG — Dược Hậu Giang" | null (TCM)
  expiryDate: string | null; // yyyy-mm-dd
  clientDocNo: string | null;
  showExpiry: boolean; // node gốc isClientOwned
};

/** Tạo lô mới: mã sinh tự động từ tổ hợp — người dùng không tự đặt mã (Câu 1+2 đã chốt). */
export function ItemForm({
  categories,
  clients,
  projects,
  item,
}: {
  categories: CategoryOption[];
  clients: ClientOption[];
  projects: ProjectOption[];
  item?: ItemEditPayload;
}) {
  const action = item ? updateItem.bind(null, item.id) : createItem;
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(action, {});
  const t = useTranslations("inventory.items");

  const [catNodeId, setCatNodeId] = useState("");
  const [statusCode, setStatusCode] = useState("R");
  const [conditionCode, setConditionCode] = useState("B");
  const [ownerClientId, setOwnerClientId] = useState("");
  const [boundProjectId, setBoundProjectId] = useState("");

  const selectedNode = useMemo(() => categories.find((c) => c.id === catNodeId) ?? null, [categories, catNodeId]);
  const clientSeg = useMemo(
    () => (ownerClientId ? clients.find((c) => c.id === ownerClientId)?.code ?? "?" : TCM_OWNER_SEG),
    [ownerClientId, clients]
  );
  const needClient = !!selectedNode?.isClientOwned || statusCode === "C";
  const needProject = statusCode === "P";
  const codePreview = `${itemCodePrefix(selectedNode?.rootCode ?? "?", statusCode, conditionCode, clientSeg)}###`;

  if (item) {
    // ── Sửa lô: các khối nằm trong mã bị khóa — đổi trạng thái/tình trạng qua phiếu CHUYỂN ĐỔI LÔ ──
    return (
      <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("edit")}</h2>
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{item.code}</span>
          {item.catNodeName ? ` · ${item.catNodeName}` : ""}
          {item.statusCode ? ` · ${t(`status${item.statusCode}` as Parameters<typeof t>[0])}` : ""}
          {item.conditionCode ? ` · ${t(`cond${item.conditionCode}` as Parameters<typeof t>[0])}` : ""}
          {` · ${item.clientLabel ?? TCM_OWNER_SEG}`}
          <span className="mt-0.5 block">{t("editLockedHint")}</span>
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            {t("formName")}
            <input name="name" defaultValue={item.name} className={input + " w-full"} required />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            {t("formUnit")}
            <input name="unit" defaultValue={item.unit ?? ""} className={input + " w-full"} />
          </label>
          {(item.showExpiry || item.expiryDate || item.clientDocNo) && (
            <>
              <label className="space-y-1 text-xs text-muted-foreground">
                {t("formExpiry")}
                <DateField name="expiryDate" defaultValue={item.expiryDate ?? ""} className={input + " w-full"} />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                {t("formClientDocNo")}
                <input name="clientDocNo" defaultValue={item.clientDocNo ?? ""} className={input + " w-full"} />
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="isReusable" defaultChecked={item.isReusable} className="h-4 w-4 rounded border-border-strong" />
            {t("formReusable")}
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="isActive" defaultChecked={item.isActive} className="h-4 w-4 rounded border-border-strong" />
            {t("active")}
          </label>
          <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
            {t("formNote")}
            <input name="note" defaultValue={item.note ?? ""} className={input + " w-full"} />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="h-11 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9"
          >
            {pending ? "..." : t("save")}
          </button>
          {state.error && <span className="text-xs text-danger">{state.error}</span>}
          {state.success && <span className="text-xs text-success">{t("saved")}</span>}
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("newItem")}</h2>
        <span className="rounded-lg bg-surface-2 px-3 py-1 font-mono text-sm font-semibold text-foreground" title={t("codePreviewHint")}>
          {codePreview}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formName")}
          <input name="name" className={input + " w-full"} required />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formCategory")}
          <select name="catNodeId" value={catNodeId} onChange={(e) => setCatNodeId(e.target.value)} className={input + " w-full"} required>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {`${"  ".repeat(c.depth)}${c.depth > 0 ? "· " : `${c.rootCode ?? "?"} — `}${c.name}`}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formStatus")}
          <select name="statusCode" value={statusCode} onChange={(e) => setStatusCode(e.target.value)} className={input + " w-full"}>
            {ITEM_STATUS_CODES.map((c) => (
              <option key={c} value={c}>
                {c} — {t(`status${c}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formCondition")}
          <select name="conditionCode" value={conditionCode} onChange={(e) => setConditionCode(e.target.value)} className={input + " w-full"}>
            {ITEM_CONDITION_CODES.map((c) => (
              <option key={c} value={c}>
                {c} — {t(`cond${c}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formClient")}
          <SearchableSelect
            name="ownerClientId"
            value={ownerClientId}
            onChange={setOwnerClientId}
            required={needClient}
            options={[
              { value: "", label: t("clientTcm") },
              ...clients.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
            ]}
          />
          {needClient && <span className="block text-[11px] leading-snug text-warning">{t("clientRequiredHint")}</span>}
        </label>
        {needProject && (
          <label className="space-y-1 text-xs text-muted-foreground">
            {t("formBoundProject")}
            <SearchableSelect
              name="boundProjectId"
              value={boundProjectId}
              onChange={setBoundProjectId}
              required
              options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            />
          </label>
        )}
        {selectedNode?.isClientOwned && (
          <>
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("formExpiry")}
              <DateField name="expiryDate" className={input + " w-full"} />
              <span className="block text-[11px] leading-snug">{t("expiryHint")}</span>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("formClientDocNo")}
              <input name="clientDocNo" className={input + " w-full"} />
            </label>
          </>
        )}
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formUnit")}
          <input name="unit" className={input + " w-full"} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formPartCount")}
          <select name="partCount" defaultValue="1" className={input + " w-full"}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="block text-[11px] leading-snug text-muted-foreground">{t("formPartCountHint", { code: codePreview })}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isReusable" defaultChecked className="h-4 w-4 rounded border-border-strong" />
          {t("formReusable")}
        </label>
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          {t("formNote")}
          <input name="note" className={input + " w-full"} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9"
        >
          {pending ? "..." : t("create")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && (
          <span className="text-xs text-success">
            {t("createdWithCode", { code: state.createdCode ?? "" })}
          </span>
        )}
      </div>
    </form>
  );
}
