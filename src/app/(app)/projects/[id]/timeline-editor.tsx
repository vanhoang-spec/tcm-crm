"use client";

import { useState } from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
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
  departmentCode: string | null;
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

const input =
  "h-8 w-full rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export function TimelineEditor({
  projectId,
  items,
  staff,
  statuses,
  departments,
}: {
  projectId: string;
  items: TimelineItemData[];
  staff: Opt[];
  statuses: Opt[];
  departments: DeptOpt[];
}) {
  const t = useTranslations("projects.timeline");
  const phases = items.filter((i) => i.parentId === null);

  return (
    <div className="space-y-3">
      {phases.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {phases.map((phase, idx) => (
        <PhaseBlock
          key={phase.id}
          projectId={projectId}
          phase={phase}
          taskChildren={items.filter((i) => i.parentId === phase.id)}
          staff={staff}
          statuses={statuses}
          departments={departments}
          isFirst={idx === 0}
          isLast={idx === phases.length - 1}
        />
      ))}

      {/* Add phase */}
      <details className="rounded-lg border border-dashed border-border-strong p-3">
        <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("addPhase")}</summary>
        <form action={createTimelineItem.bind(null, projectId)} className="mt-2 flex flex-wrap items-end gap-2">
          <input name="title" placeholder={t("phaseName")} className={input + " min-w-[180px] flex-1"} required />
          <input name="startDate" type="date" className={input + " w-36"} />
          <input name="endDate" type="date" className={input + " w-36"} />
          <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
            {t("addPhase")}
          </button>
        </form>
      </details>
    </div>
  );
}

function PhaseBlock({
  projectId,
  phase,
  taskChildren,
  staff,
  statuses,
  departments,
  isFirst,
  isLast,
}: {
  projectId: string;
  phase: TimelineItemData;
  taskChildren: TimelineItemData[];
  staff: Opt[];
  statuses: Opt[];
  departments: DeptOpt[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("projects.timeline");
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <ItemRow
        projectId={projectId}
        item={phase}
        staff={staff}
        statuses={statuses}
        departments={departments}
        isPhase
        isFirst={isFirst}
        isLast={isLast}
      />
      <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
        {taskChildren.map((child, ci) => (
          <ItemRow
            key={child.id}
            projectId={projectId}
            item={child}
            staff={staff}
            statuses={statuses}
            departments={departments}
            isFirst={ci === 0}
            isLast={ci === taskChildren.length - 1}
          />
        ))}
        <details className="rounded-lg border border-dashed border-border-strong p-2">
          <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("addTask")}</summary>
          <form action={createTimelineItem.bind(null, projectId)} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="parentId" value={phase.id} />
            <input name="title" placeholder={t("taskName")} className={input + " min-w-[160px] flex-1"} required />
            <input name="startDate" type="date" className={input + " w-32"} />
            <input name="endDate" type="date" className={input + " w-32"} />
            <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
              {t("addTask")}
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}

function ItemRow({
  projectId,
  item,
  staff,
  statuses,
  departments,
  isPhase = false,
  isFirst,
  isLast,
}: {
  projectId: string;
  item: TimelineItemData;
  staff: Opt[];
  statuses: Opt[];
  departments: DeptOpt[];
  isPhase?: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("projects.timeline");
  const [shared, setShared] = useState(item.isShared);

  return (
    <details className="rounded-lg border border-border bg-surface">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-2 text-sm">
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        <span className={isPhase ? "font-semibold text-foreground" : "text-foreground"}>{item.title}</span>
        {item.startDate && (
          <span className="text-xs text-muted-foreground">
            {formatDate(item.startDate)}
            {item.endDate ? ` – ${formatDate(item.endDate)}` : ""}
          </span>
        )}
        {item.isShared &&
          (item.externalPublished ? (
            <Badge tone="success">{t("published")}</Badge>
          ) : (
            <Badge tone="warning">{t("awaitingReview")}</Badge>
          ))}
        {item.clientEditable && <Badge tone="brand">{t("clientEditableToggle")}</Badge>}
      </summary>

      <div className="space-y-3 border-t border-border p-3">
        {/* Edit form */}
        <form action={updateTimelineItem.bind(null, projectId, item.id)} className="space-y-2">
          <input name="title" defaultValue={item.title} className={input} required />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              {t("start")}
              <input name="startDate" type="date" defaultValue={toDateInput(item.startDate)} className={input} />
            </label>
            <label className="text-xs text-muted-foreground">
              {t("end")}
              <input name="endDate" type="date" defaultValue={toDateInput(item.endDate)} className={input} />
            </label>
            <label className="text-xs text-muted-foreground">
              {t("owner")}
              <select name="ownerStaffId" defaultValue={item.ownerStaffId ?? ""} className={input}>
                <option value="">{t("selectOwner")}</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              {t("status")}
              <select name="statusId" defaultValue={item.statusId ?? ""} className={input}>
                <option value="">{t("selectStatus")}</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">
            {t("department")}
            <select name="departmentCode" defaultValue={item.departmentCode ?? ""} className={input + " sm:w-48"}>
              <option value="">{t("selectDepartment")}</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          {/* Share controls */}
          <div className="rounded-lg border border-border bg-surface-2/40 p-2">
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                <input type="checkbox" name="isShared" defaultChecked={item.isShared} onChange={(e) => setShared(e.target.checked)} className="h-4 w-4 rounded border-border-strong" />
                {t("shareToggle")}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                <input type="checkbox" name="clientEditable" defaultChecked={item.clientEditable} className="h-4 w-4 rounded border-border-strong" />
                {t("clientEditableToggle")}
              </label>
            </div>
            {shared && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input name="externalTitle" defaultValue={item.externalTitle ?? ""} placeholder={t("externalTitle")} className={input} />
                <input name="externalStartDate" type="date" defaultValue={toDateInput(item.externalStartDate)} className={input} title={t("externalStart")} />
                <input name="externalEndDate" type="date" defaultValue={toDateInput(item.externalEndDate)} className={input} title={t("externalEnd")} />
              </div>
            )}
          </div>

          <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
            {t("save")}
          </button>
        </form>

        {/* Actions row: publish / move / delete */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          {item.isShared &&
            (item.externalPublished ? (
              <form action={unpublishTimelineItem.bind(null, projectId, item.id)}>
                <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-2 py-1 text-xs text-foreground hover:bg-surface-2">
                  <EyeOff className="h-3.5 w-3.5" /> {t("unpublish")}
                </button>
              </form>
            ) : (
              <form action={publishTimelineItem.bind(null, projectId, item.id)}>
                <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-success px-2 py-1 text-xs font-medium text-white hover:bg-success/90">
                  <Eye className="h-3.5 w-3.5" /> {t("publish")}
                </button>
              </form>
            ))}
          {!isFirst && (
            <form action={moveTimelineItem.bind(null, projectId, item.id, "up")}>
              <button type="submit" className="rounded-lg border border-border-strong px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2">
                ↑ {t("moveUp")}
              </button>
            </form>
          )}
          {!isLast && (
            <form action={moveTimelineItem.bind(null, projectId, item.id, "down")}>
              <button type="submit" className="rounded-lg border border-border-strong px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2">
                ↓ {t("moveDown")}
              </button>
            </form>
          )}
          <form action={deleteTimelineItem.bind(null, projectId, item.id)}>
            <button type="submit" className="rounded-lg border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger-bg">
              {t("remove")}
            </button>
          </form>
        </div>

        {/* Client feedback (read-only for internal) */}
        {item.isShared && (item.clientStatus || item.clientNote) && (
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-2 text-xs">
            {item.clientStatus && (
              <p className="font-medium text-brand-700">
                {t("clientStatusLabel")}: {t(`clientStatus${item.clientStatus}`)}
              </p>
            )}
            {item.clientNote && <p className="mt-0.5 text-muted-foreground">{item.clientNote}</p>}
          </div>
        )}
      </div>
    </details>
  );
}
