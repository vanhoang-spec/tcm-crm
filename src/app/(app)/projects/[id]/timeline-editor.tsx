"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Trash2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import {
  createTimelineItem,
  updateTimelineItem,
  deleteTimelineItem,
  moveTimelineItem,
  publishTimelineItem,
  unpublishTimelineItem,
} from "../actions";

export type TimelineItemData = {
  id: string;
  parentId: string | null;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  ownerStaffId: string | null;
  secondaryOwnerStaffId: string | null;
  departmentCode: string | null;
  accountableParty: string | null;
  quantity: number | null;
  unit: string | null;
  statusId: string | null;
  isShared: boolean;
  externalPublished: boolean;
  clientEditable: boolean;
  externalTitle: string | null;
  externalStartDate: Date | null;
  externalEndDate: Date | null;
  clientStatus: string | null;
  clientNote: string | null;
};
type Opt = { id: string; label: string };
type DeptOpt = { code: string; name: string };

const cellInput =
  "h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-xs outline-none hover:border-border-strong focus:border-brand-400 focus:bg-surface focus:ring-1 focus:ring-brand-100";
const drawerInput =
  "h-8 w-full rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const addInput =
  "h-8 rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

/** Duyệt cây parentId theo thứ tự sort (items đã sort ở server) → danh sách phẳng kèm depth. */
function flatten(items: TimelineItemData[]): { item: TimelineItemData; depth: number }[] {
  const byParent = new Map<string | null, TimelineItemData[]>();
  for (const it of items) {
    const arr = byParent.get(it.parentId) ?? [];
    arr.push(it);
    byParent.set(it.parentId, arr);
  }
  const out: { item: TimelineItemData; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const it of byParent.get(parentId) ?? []) {
      out.push({ item: it, depth });
      walk(it.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

type Ctx = {
  projectId: string;
  staff: Opt[];
  statuses: Opt[];
  departments: DeptOpt[];
  cols: Set<string>;
  t: (key: string, values?: Record<string, string | number>) => string;
  dirty: Set<string>;
  markDirty: (id: string) => void;
  clearDirty: (id: string) => void;
  open: Set<string>;
  toggleOpen: (id: string) => void;
};

export function TimelineEditor({
  projectId,
  items,
  staff,
  statuses,
  departments,
  columns,
}: {
  projectId: string;
  items: TimelineItemData[];
  staff: Opt[];
  statuses: Opt[];
  departments: DeptOpt[];
  columns: string[];
}) {
  const t = useTranslations("projects.timeline");
  const cols = useMemo(() => new Set(columns), [columns]);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());

  const markDirty = (id: string) => setDirty((s) => (s.has(id) ? s : new Set(s).add(id)));
  const clearDirty = (id: string) =>
    setDirty((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const ctx: Ctx = { projectId, staff, statuses, departments, cols, t, dirty, markDirty, clearDirty, open, toggleOpen };
  const rows = flatten(items);

  // Cột động, ưu tiên hiển thị (đặc biệt trên mobile khi cuộn ngang):
  // Title | PIC | Bắt đầu | Kết thúc | [Trạng thái] | [SL | ĐVT] | thao tác — 4 cột đầu luôn ưu tiên,
  // Trạng thái đứng ngay sau Timeline (quan trọng hơn SL/ĐVT), SL/ĐVT cuộn tiếp mới thấy.
  const showQty = cols.has("qty");
  const showUnit = cols.has("unit");
  const showStatus = cols.has("status");
  const gridCols = [
    "minmax(220px,1.6fr)", // title
    "minmax(120px,0.9fr)", // pic
    "104px", // start
    "104px", // end
    ...(showStatus ? ["minmax(110px,0.8fr)"] : []),
    ...(showQty ? ["70px"] : []),
    ...(showUnit ? ["70px"] : []),
    "132px", // actions
  ].join(" ");
  const totalCols = 5 + (showQty ? 1 : 0) + (showUnit ? 1 : 0) + (showStatus ? 1 : 0);

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <div className="min-w-[720px]" style={{ display: "grid", gridTemplateColumns: gridCols }}>
            {/* Header */}
            <HeaderCell className="pl-2">{t("colTitle")}</HeaderCell>
            <HeaderCell>{t("owner")}</HeaderCell>
            <HeaderCell>{t("start")}</HeaderCell>
            <HeaderCell>{t("end")}</HeaderCell>
            {showStatus && <HeaderCell>{t("status")}</HeaderCell>}
            {showQty && <HeaderCell>{t("quantity")}</HeaderCell>}
            {showUnit && <HeaderCell>{t("unit")}</HeaderCell>}
            <HeaderCell className="text-right pr-2">{""}</HeaderCell>

            {rows.map(({ item, depth }, idx) => (
              <ItemRow
                key={item.id}
                ctx={ctx}
                item={item}
                depth={depth}
                totalCols={totalCols}
                isFirst={idx === 0}
                isLast={idx === rows.length - 1}
                showQty={showQty}
                showUnit={showUnit}
                showStatus={showStatus}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add forms */}
      <AddForms ctx={ctx} />
    </div>
  );
}

function HeaderCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("sticky top-0 z-10 border-b border-border bg-surface-2 px-1.5 py-1.5 text-[11px] font-medium text-muted-foreground", className)}>
      {children}
    </div>
  );
}

function ItemRow({
  ctx,
  item,
  depth,
  totalCols,
  isFirst,
  isLast,
  showQty,
  showUnit,
  showStatus,
}: {
  ctx: Ctx;
  item: TimelineItemData;
  depth: number;
  totalCols: number;
  isFirst: boolean;
  isLast: boolean;
  showQty: boolean;
  showUnit: boolean;
  showStatus: boolean;
}) {
  const { projectId, staff, statuses, departments, cols, t, dirty, markDirty, clearDirty, open, toggleOpen } = ctx;
  const isPhase = depth === 0;
  const formId = `upd-${item.id}`;
  const isDirty = dirty.has(item.id);
  const isOpen = open.has(item.id);
  const onChange = () => markDirty(item.id);

  const rowBg = isPhase ? "bg-surface-2/70" : depth === 1 ? "bg-surface" : "bg-surface";
  const cellBase = cn("flex items-center border-b border-border/60 py-0.5", rowBg);

  return (
    <>
      {/* Hidden update form — mọi input dưới đây trỏ về form này qua thuộc tính form= */}
      <form
        id={formId}
        action={async (fd) => {
          await updateTimelineItem(projectId, item.id, fd);
          clearDirty(item.id);
        }}
        className="hidden"
      />

      {/* Title cell (chevron + text, thụt theo depth) */}
      <div className={cn(cellBase, "pl-1")} style={{ paddingLeft: 4 + depth * 16 }}>
        <button
          type="button"
          onClick={() => toggleOpen(item.id)}
          className="mr-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={isOpen ? t("rowDetailHide") : t("rowDetailShow")}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <input
          form={formId}
          name="title"
          defaultValue={item.title}
          onChange={onChange}
          required
          className={cn(cellInput, isPhase ? "font-semibold text-foreground" : "text-foreground")}
        />
      </div>

      {/* PIC */}
      <div className={cellBase}>
        <SearchableSelect
          form={formId}
          name="ownerStaffId"
          defaultValue={item.ownerStaffId ?? ""}
          onChange={onChange}
          placeholder={t("selectOwner")}
          className={cellInput}
          options={staff.map((s) => ({ value: s.id, label: s.label }))}
        />
      </div>

      {/* Start / End */}
      <div className={cellBase}>
        <DateField form={formId} name="startDate" defaultValue={toDateInput(item.startDate)} onChange={onChange} className={cellInput} />
      </div>
      <div className={cellBase}>
        <DateField form={formId} name="endDate" defaultValue={toDateInput(item.endDate)} onChange={onChange} className={cellInput} />
      </div>

      {/* Status — ưu tiên hiển thị ngay sau Timeline, trước SL/ĐVT */}
      {showStatus && (
        <div className={cellBase}>
          <select form={formId} name="statusId" defaultValue={item.statusId ?? ""} onChange={onChange} className={cellInput}>
            <option value="">{t("selectStatus")}</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Qty / Unit (checklist) */}
      {showQty && (
        <div className={cellBase}>
          <input form={formId} name="quantity" type="number" step="any" defaultValue={item.quantity ?? ""} onChange={onChange} className={cn(cellInput, "tabular-nums")} />
        </div>
      )}
      {showUnit && (
        <div className={cellBase}>
          <input form={formId} name="unit" defaultValue={item.unit ?? ""} onChange={onChange} className={cellInput} />
        </div>
      )}
      {/* Actions: save (khi dirty) + badges + delete */}
      <div className={cn(cellBase, "justify-end gap-1 pr-1.5")}>
        {item.isShared &&
          (item.externalPublished ? (
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-success" title={t("published")} />
          ) : (
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-warning" title={t("awaitingReview")} />
          ))}
        {isDirty && (
          <button form={formId} type="submit" className="h-6 rounded bg-brand-500 px-2 text-[11px] font-medium text-white hover:bg-brand-600">
            {t("save")}
          </button>
        )}
        <form action={deleteTimelineItem.bind(null, projectId, item.id)}>
          <button type="submit" className="text-muted-foreground hover:text-danger" aria-label={t("remove")}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>

      {/* Drawer — LUÔN mount (ẩn bằng CSS khi thu) để mọi field share/external/… luôn được submit
          cùng form update; nếu unmount khi thu, form thiếu field → isShared/externalPublished bị xóa nhầm. */}
      <div
        style={{ gridColumn: `1 / ${totalCols + 1}` }}
        className={cn("border-b border-border bg-surface-2/40 px-3 py-3", !isOpen && "hidden")}
      >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Các field còn lại — cùng trỏ form update */}
            {(cols.has("pic2") || true) && (
              <label className="text-xs text-muted-foreground">
                {t("secondaryOwner")}
                <SearchableSelect
                  form={formId}
                  name="secondaryOwnerStaffId"
                  defaultValue={item.secondaryOwnerStaffId ?? ""}
                  onChange={onChange}
                  placeholder={t("selectSecondaryOwner")}
                  className={drawerInput}
                  options={staff.map((s) => ({ value: s.id, label: s.label }))}
                />
              </label>
            )}
            <label className="text-xs text-muted-foreground">
              {t("accountableParty")}
              <input form={formId} name="accountableParty" defaultValue={item.accountableParty ?? ""} onChange={onChange} placeholder={t("accountablePlaceholder")} className={drawerInput} />
            </label>
            <label className="text-xs text-muted-foreground">
              {t("department")}
              <select form={formId} name="departmentCode" defaultValue={item.departmentCode ?? ""} onChange={onChange} className={drawerInput}>
                <option value="">{t("selectDepartment")}</option>
                {departments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            {/* Nếu Qty/Unit KHÔNG hiện inline thì cho sửa trong drawer */}
            {!showQty && (
              <label className="text-xs text-muted-foreground">
                {t("quantity")}
                <input form={formId} name="quantity" type="number" step="any" defaultValue={item.quantity ?? ""} onChange={onChange} className={drawerInput} />
              </label>
            )}
            {!showUnit && (
              <label className="text-xs text-muted-foreground">
                {t("unit")}
                <input form={formId} name="unit" defaultValue={item.unit ?? ""} onChange={onChange} className={drawerInput} />
              </label>
            )}
            {!showStatus && (
              <input form={formId} type="hidden" name="statusId" value={item.statusId ?? ""} />
            )}
          </div>

          {/* Share controls */}
          <ShareControls ctx={ctx} item={item} formId={formId} onChange={onChange} />

          {/* Actions: save + publish + move */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <button form={formId} type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
              {t("save")}
            </button>
            {item.isShared &&
              (item.externalPublished ? (
                <form action={unpublishTimelineItem.bind(null, projectId, item.id)}>
                  <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-2 py-1.5 text-xs text-foreground hover:bg-surface-2">
                    <EyeOff className="h-3.5 w-3.5" /> {t("unpublish")}
                  </button>
                </form>
              ) : (
                <form action={publishTimelineItem.bind(null, projectId, item.id)}>
                  <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-success px-2 py-1.5 text-xs font-medium text-white hover:bg-success/90">
                    <Eye className="h-3.5 w-3.5" /> {t("publish")}
                  </button>
                </form>
              ))}
            {!isFirst && (
              <form action={moveTimelineItem.bind(null, projectId, item.id, "up")}>
                <button type="submit" className="rounded-lg border border-border-strong px-2 py-1.5 text-xs text-muted-foreground hover:bg-surface-2">
                  ↑ {t("moveUp")}
                </button>
              </form>
            )}
            {!isLast && (
              <form action={moveTimelineItem.bind(null, projectId, item.id, "down")}>
                <button type="submit" className="rounded-lg border border-border-strong px-2 py-1.5 text-xs text-muted-foreground hover:bg-surface-2">
                  ↓ {t("moveDown")}
                </button>
              </form>
            )}
          </div>

          {/* Client feedback (read-only) */}
          {item.isShared && (item.clientStatus || item.clientNote) && (
            <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-2 text-xs">
              {item.clientStatus && (
                <p className="font-medium text-brand-700">
                  {t("clientStatusLabel")}: {t(`clientStatus${item.clientStatus}`)}
                </p>
              )}
              {item.clientNote && <p className="mt-0.5 text-muted-foreground">{item.clientNote}</p>}
            </div>
          )}

          {/* Thêm hạng mục/công việc con dưới dòng này (dựng 3 cấp) */}
          <form action={createTimelineItem.bind(null, projectId)} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-2">
            <input type="hidden" name="parentId" value={item.id} />
            <input name="title" placeholder={depth === 0 ? t("itemName") : t("taskName")} className={cn(addInput, "min-w-[160px] flex-1")} required />
            <DateField name="startDate" className={cn(addInput, "w-32")} />
            <DateField name="endDate" className={cn(addInput, "w-32")} />
            <button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong px-3 text-xs font-medium text-brand-600 hover:bg-surface-2">
              <Plus className="h-3.5 w-3.5" /> {depth === 0 ? t("addItem") : t("addSubTask")}
            </button>
          </form>
      </div>
    </>
  );
}

function ShareControls({
  ctx,
  item,
  formId,
  onChange,
}: {
  ctx: Ctx;
  item: TimelineItemData;
  formId: string;
  onChange: () => void;
}) {
  const { t } = ctx;
  const [shared, setShared] = useState(item.isShared);
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface p-2">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs font-medium text-foreground">
          <input
            form={formId}
            type="checkbox"
            name="isShared"
            defaultChecked={item.isShared}
            onChange={(e) => {
              setShared(e.target.checked);
              onChange();
            }}
            className="h-4 w-4 rounded border-border-strong"
          />
          {t("shareToggle")}
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-foreground">
          <input form={formId} type="checkbox" name="clientEditable" defaultChecked={item.clientEditable} onChange={onChange} className="h-4 w-4 rounded border-border-strong" />
          {t("clientEditableToggle")}
        </label>
      </div>
      {shared && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input form={formId} name="externalTitle" defaultValue={item.externalTitle ?? ""} onChange={onChange} placeholder={t("externalTitle")} className={drawerInput} />
          <DateField form={formId} name="externalStartDate" defaultValue={toDateInput(item.externalStartDate)} onChange={onChange} className={drawerInput} title={t("externalStart")} />
          <DateField form={formId} name="externalEndDate" defaultValue={toDateInput(item.externalEndDate)} onChange={onChange} className={drawerInput} title={t("externalEnd")} />
        </div>
      )}
    </div>
  );
}

/** Form thêm Phase gốc. (Thêm hạng mục/công việc con nằm trong drawer từng dòng — dựng 3 cấp.) */
function AddForms({ ctx }: { ctx: Ctx }) {
  const { projectId, t } = ctx;
  return (
    <details className="rounded-lg border border-dashed border-border-strong p-2">
      <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("addPhase")}</summary>
      <form action={createTimelineItem.bind(null, projectId)} className="mt-2 flex flex-wrap items-end gap-2">
        <input name="title" placeholder={t("phaseName")} className={cn(addInput, "min-w-[180px] flex-1")} required />
        <DateField name="startDate" className={cn(addInput, "w-36")} />
        <DateField name="endDate" className={cn(addInput, "w-36")} />
        <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
          {t("addPhase")}
        </button>
      </form>
    </details>
  );
}
