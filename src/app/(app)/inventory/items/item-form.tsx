"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ITEM_CONDITION_CODES, ITEM_STATUS_CODES, buildLotCode } from "@/lib/inventory-lot";
import { createItem, updateItem, updateProduct, type ItemFormState } from "./actions";

const input =
  "h-11 sm:h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const btnPrimary = "h-11 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9";
// React 19 gọi requestFormReset sau MỌI lần chạy action kể cả khi TRẢ LỖI — select/checkbox/radio bị reset dù
// controlled (HANDOVER 10.37). Chặn sự kiện reset là mọi ô giữ nguyên sau action lỗi.
const keepValuesOnReset = (e: React.FormEvent<HTMLFormElement>) => e.preventDefault();

export type CategoryOption = {
  id: string;
  name: string;
  depth: number;
  rootCode: string | null;
  isClientOwned: boolean;
};
export type ClientOption = { id: string; code: string; name: string };
export type ProjectOption = { id: string; code: string; name: string; clientCode?: string | null; teamCode?: string | null };
/** Sản phẩm có sẵn để treo lô mới vào — nextLotSeq để xem trước mã lô sẽ sinh. */
export type ProductOption = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  partCount: number;
  rootCode: string | null;
  isClientOwned: boolean;
  nextLotSeq: number;
};

export type ProductEditPayload = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  isReusable: boolean;
  partCount: number;
  isActive: boolean;
  note: string | null;
  catNodeName: string | null;
};

export type ItemEditPayload = {
  id: string;
  code: string;
  productCode: string | null;
  name: string;
  isActive: boolean;
  note: string | null;
  statusCode: string | null;
  conditionCode: string | null;
  clientLabel: string | null; // "DHG — Dược Hậu Giang" | null (TCM)
  boundProjectCode: string | null;
  expiryDate: string | null; // yyyy-mm-dd
  clientDocNo: string | null;
  showExpiry: boolean; // node gốc isClientOwned
};

/**
 * Tạo LÔ mới (mã lô v3): chọn SẢN PHẨM CÓ SẴN hoặc khai SẢN PHẨM MỚI, rồi khai thuộc tính lô. Mã sinh tự động ở
 * cả hai cấp — người dùng không tự đặt mã (Câu 1+2 đã chốt). Xem trước mã: PO-0042.03 (sản phẩm có sẵn, số lô
 * kế tiếp) hoặc PO-####.01 (sản phẩm mới — số sản phẩm chỉ biết lúc lưu).
 */
export function ItemForm({
  categories,
  clients,
  projects,
  products,
}: {
  categories: CategoryOption[];
  clients: ClientOption[];
  projects: ProjectOption[];
  products: ProductOption[];
}) {
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(createItem, {});
  const t = useTranslations("inventory.items");

  const [productMode, setProductMode] = useState<"existing" | "new">(products.length ? "existing" : "new");
  const [productId, setProductId] = useState("");
  const [catNodeId, setCatNodeId] = useState("");
  const [statusCode, setStatusCode] = useState("R");
  const [conditionCode, setConditionCode] = useState("B");
  const [ownerClientId, setOwnerClientId] = useState("");
  const [boundProjectId, setBoundProjectId] = useState("");

  const selectedProduct = useMemo(() => products.find((p) => p.id === productId) ?? null, [products, productId]);
  const selectedNode = useMemo(() => categories.find((c) => c.id === catNodeId) ?? null, [categories, catNodeId]);
  const rootCode = productMode === "existing" ? selectedProduct?.rootCode : selectedNode?.rootCode;
  const clientOwned = productMode === "existing" ? !!selectedProduct?.isClientOwned : !!selectedNode?.isClientOwned;
  // K6: hàng khách gửi → KHÔNG chọn khách tay (khách = khách của dự án sở hữu); trạng thái C thì phải chọn khách.
  const needClient = !clientOwned && statusCode === "C";
  // K6: dự án sở hữu bắt buộc với hàng khách gửi + P + C; còn lại được để "Hàng chung TCM" nhưng phải chọn tường minh.
  const needProject = clientOwned || statusCode === "P" || statusCode === "C";
  const projectLabel = (p: ProjectOption) => `${p.code} — ${p.name}${p.clientCode ? ` · ${p.clientCode}` : ""}${p.teamCode ? ` · ${p.teamCode}` : ""}`;
  const codePreview =
    productMode === "existing"
      ? selectedProduct
        ? buildLotCode(selectedProduct.code, selectedProduct.nextLotSeq)
        : "—"
      : `${rootCode ?? "??"}-####.01`;

  return (
    <form action={formAction} onReset={keepValuesOnReset} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("newItem")}</h2>
        <span className="rounded-lg bg-surface-2 px-3 py-1 font-mono text-sm font-semibold text-foreground" title={t("codePreviewHint")}>
          {codePreview}
        </span>
      </div>

      {/* ── Sản phẩm: có sẵn / mới ── */}
      <input type="hidden" name="productMode" value={productMode} />
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="_mode" checked={productMode === "existing"} onChange={() => setProductMode("existing")} disabled={!products.length} className="h-4 w-4" />
          {t("modeExisting")}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="_mode" checked={productMode === "new"} onChange={() => setProductMode("new")} className="h-4 w-4" />
          {t("modeNew")}
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {productMode === "existing" ? (
          <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
            {t("formProduct")}
            <SearchableSelect
              name="productId"
              value={productId}
              onChange={setProductId}
              required
              options={products.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}${p.unit ? ` (${p.unit})` : ""}` }))}
            />
            {selectedProduct && (
              <span className="block text-[11px] leading-snug">
                {t("productSummary", { n: selectedProduct.nextLotSeq - 1, parts: selectedProduct.partCount })}
              </span>
            )}
          </label>
        ) : (
          <>
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
                    {`${"  ".repeat(c.depth)}${c.depth > 0 ? "· " : `${c.rootCode ?? "?"} — `}${c.name}`}
                  </option>
                ))}
              </select>
            </label>
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
          </>
        )}
      </div>

      {/* ── Thuộc tính LÔ ── */}
      <p className="text-xs font-medium text-foreground">{t("lotSection")}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formStatus")}
          <select name="statusCode" value={statusCode} onChange={(e) => setStatusCode(e.target.value)} className={input + " w-full"}>
            {ITEM_STATUS_CODES.map((c) => (
              <option key={c} value={c}>
                {t(`status${c}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formCondition")}
          <select name="conditionCode" value={conditionCode} onChange={(e) => setConditionCode(e.target.value)} className={input + " w-full"}>
            {ITEM_CONDITION_CODES.map((c) => (
              <option key={c} value={c}>
                {t(`cond${c}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formOwnerProject")}
          <SearchableSelect
            name="boundProjectId"
            value={boundProjectId}
            onChange={setBoundProjectId}
            required={needProject}
            options={[
              ...(needProject ? [] : [{ value: "", label: t("ownerProjectTcm") }]),
              ...projects.map((p) => ({ value: p.id, label: projectLabel(p) })),
            ]}
          />
          <span className={"block text-[11px] leading-snug " + (needProject ? "text-warning" : "")}>
            {clientOwned ? t("ownerProjectClientHint") : needProject ? t("ownerProjectRequiredHint") : t("ownerProjectHint")}
          </span>
        </label>
        {!clientOwned && (
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
        )}
        {clientOwned && (
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
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          {t("formNote")}
          <input name="note" className={input + " w-full"} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "..." : t("create")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && (
          <span className="text-xs text-success">{t("createdWithCode", { code: state.createdCode ?? "", product: state.productCode ?? "" })}</span>
        )}
      </div>
    </form>
  );
}

/** Sửa SẢN PHẨM — nguồn sự thật của tên/ĐVT/tái sử dụng; lan xuống mọi lô. Nhóm + số phần khoá (đã vào mã). */
export function ProductEditForm({ product }: { product: ProductEditPayload }) {
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(updateProduct.bind(null, product.id), {});
  const t = useTranslations("inventory.items");
  return (
    <form action={formAction} onReset={keepValuesOnReset} className="space-y-2 rounded-lg border border-border bg-surface-2/50 p-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-mono font-semibold text-foreground">{product.code}</span>
        {product.catNodeName ? ` · ${product.catNodeName}` : ""}
        {product.partCount > 1 ? ` · ${t("colParts")}: ${product.partCount}` : ""}
        <span className="mt-0.5 block">{t("productLockedHint")}</span>
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formName")}
          <input name="name" defaultValue={product.name} className={input + " w-full"} required />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("formUnit")}
          <input name="unit" defaultValue={product.unit ?? ""} className={input + " w-full"} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isReusable" defaultChecked={product.isReusable} className="h-4 w-4 rounded border-border-strong" />
          {t("formReusable")}
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isActive" defaultChecked={product.isActive} className="h-4 w-4 rounded border-border-strong" />
          {t("active")}
        </label>
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          {t("formNote")}
          <input name="note" defaultValue={product.note ?? ""} className={input + " w-full"} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "..." : t("save")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

/** Sửa LÔ — chỉ trường không đi qua phiếu (active, hạn dùng, số phiếu KH, ghi chú). Trạng thái/tình trạng đổi qua phiếu CD. */
export function LotEditForm({ item }: { item: ItemEditPayload }) {
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(updateItem.bind(null, item.id), {});
  const t = useTranslations("inventory.items");
  return (
    <form action={formAction} onReset={keepValuesOnReset} className="space-y-2">
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-mono font-semibold text-foreground">{item.code}</span>
        {item.statusCode ? ` · ${t(`status${item.statusCode}` as Parameters<typeof t>[0])}` : ""}
        {item.conditionCode ? ` · ${t(`cond${item.conditionCode}` as Parameters<typeof t>[0])}` : ""}
        {` · ${item.clientLabel ?? t("clientTcm")}`}
        {item.boundProjectCode ? ` · ${item.boundProjectCode}` : ""}
        <span className="mt-0.5 block">{t("editLockedHint")}</span>
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
          <input type="checkbox" name="isActive" defaultChecked={item.isActive} className="h-4 w-4 rounded border-border-strong" />
          {t("active")}
        </label>
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          {t("formNote")}
          <input name="note" defaultValue={item.note ?? ""} className={input + " w-full"} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "..." : t("save")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}
