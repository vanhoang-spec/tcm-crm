"use client";

import { useLocale, useTranslations } from "next-intl";
import { Lock, CheckCircle2 } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import type { DepartmentTaskStatus } from "@/lib/department-tasks";
import {
  assignDepartmentTask,
  submitDepartmentTask,
  approveDepartmentTask,
  rejectDepartmentTask,
  createDepartmentTask,
  deleteDepartmentTask,
} from "./department-task-actions";

// Mirror src/app/(app)/creative/task-board.tsx — bản tổng quát, embed trong 1 tab bộ phận của 1 dự án
// (không có filter dự án/team/orderer vì đã scoped sẵn theo project+department).

export type DepartmentTaskData = {
  id: string;
  title: string;
  detail: string | null;
  status: DepartmentTaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  ordererId: string | null;
  ordererName: string | null;
  leadApprovalNotRequired: boolean;
  deadline: Date | null;
  deliverableLinkUrl: string | null;
  hoursSpent: number | null;
  revisionCount: number;
  deliveredAt: Date | null;
  locked: boolean;
  graceDaysLeft: number | null;
};
type Opt = { id: string; label: string };

const STATUS_ORDER = ["UNASSIGNED", "ASSIGNED", "REVISION", "SUBMITTED", "DELIVERED", "CANCELED"] as const;
const input =
  "h-8 rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export function DepartmentTaskBoard({
  projectId,
  department,
  tasks,
  staffOptions,
}: {
  projectId: string;
  department: string;
  tasks: DepartmentTaskData[];
  staffOptions: Opt[];
}) {
  const t = useTranslations("projects.deptTasks");

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-3 py-2 text-xs text-muted-foreground sm:hidden">
        {t("mobileFullDetailNote")}
      </p>

      {STATUS_ORDER.map((status) => {
        const group = tasks.filter((task) => task.status === status);
        if (group.length === 0) return null;
        return (
          <div key={status}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`group${status}`)} · {group.length}
            </h3>
            <div className="space-y-2">
              {group.map((task) => (
                <TaskCard key={task.id} task={task} staffOptions={staffOptions} t={t} />
              ))}
            </div>
          </div>
        );
      })}
      {tasks.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}

      {/* Tạo task lẻ */}
      <details className="rounded-lg border border-dashed border-border-strong p-3">
        <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("createTitle")}</summary>
        <form action={createDepartmentTask.bind(null, projectId, department)} className="mt-2 flex flex-wrap items-end gap-2">
          <input name="title" placeholder={t("taskTitle")} className={input + " min-w-[200px] flex-1"} required />
          <input name="detail" placeholder={t("detail")} className={input + " min-w-[160px] flex-1"} />
          <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
            {t("createTask")}
          </button>
        </form>
      </details>
    </div>
  );
}

function TaskCard({
  task,
  staffOptions,
  t,
}: {
  task: DepartmentTaskData;
  staffOptions: Opt[];
  t: ReturnType<typeof useTranslations>;
}) {
  const locale = useLocale() as Locale;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{task.title}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {task.detail && <span>{task.detail}</span>}
        {task.ordererName && <span>· {t("orderer")}: {task.ordererName}</span>}
        {task.assigneeName && <span>· {t("assignedTo", { name: task.assigneeName })}</span>}
        {task.deadline && <span>· {t("deadline")}: {formatDate(task.deadline)}</span>}
        {task.revisionCount > 0 && <span>· {t("revisions", { count: task.revisionCount })}</span>}
      </div>

      {task.locked ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> {t("lockedCancel")}
        </p>
      ) : (
        <>
          {task.graceDaysLeft != null && (
            <p className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">
              {t("finishedGraceOpen", { days: task.graceDaysLeft })}
            </p>
          )}

          {/* UNASSIGNED → form giao */}
          {task.status === "UNASSIGNED" && (
            <div className="mt-2 space-y-2 border-t border-border pt-2">
              <form id={`assign-${task.id}`} action={assignDepartmentTask.bind(null, task.id)} className="space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                  <SearchableSelect
                    name="assigneeId"
                    required
                    defaultValue=""
                    placeholder={t("selectAssignee")}
                    className="min-w-[200px]"
                    options={staffOptions.map((s) => ({ value: s.id, label: s.label }))}
                  />
                  <DateField name="deadline" className={input} defaultValue={toDateInput(task.deadline)} />
                </div>
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" name="leadApprovalNotRequired" className="h-4 w-4 rounded border-border-strong" />
                  {t("leadNoApproval")}
                </label>
              </form>
              <div className="flex items-center gap-2">
                <button type="submit" form={`assign-${task.id}`} className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
                  {t("assign")}
                </button>
                <FormButton action={deleteDepartmentTask.bind(null, task.id)} label={t("delete")} danger />
              </div>
            </div>
          )}

          {/* ASSIGNED / REVISION → form GỬI */}
          {(task.status === "ASSIGNED" || task.status === "REVISION") && (
            <form action={submitDepartmentTask.bind(null, task.id)} className="mt-2 flex flex-wrap items-end gap-2 border-t border-border pt-2">
              <input name="deliverableLinkUrl" type="url" placeholder={t("deliverableLink")} className={input + " min-w-[200px] flex-1"} required />
              <label className="text-xs text-muted-foreground">
                {t("hours")}
                <input name="hoursSpent" type="number" step="0.25" min="0.25" placeholder="0.25" className={input + " ml-1 w-20"} required />
              </label>
              <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
                {t("submitResult")}
              </button>
              <span className="w-full text-[11px] text-muted-foreground">{t("hoursHint")}</span>
            </form>
          )}

          {/* SUBMITTED → lead duyệt/trả lại */}
          {task.status === "SUBMITTED" && (
            <div className="mt-2 space-y-2 border-t border-border pt-2">
              {task.deliverableLinkUrl && (
                <a href={task.deliverableLinkUrl} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium text-brand-600 hover:underline">
                  {task.deliverableLinkUrl}
                </a>
              )}
              {task.hoursSpent != null && <p className="text-xs text-muted-foreground">{t("hoursSpent", { hours: task.hoursSpent })}</p>}
              <FormButton action={approveDepartmentTask.bind(null, task.id)} label={t("approve")} success />
              <form action={rejectDepartmentTask.bind(null, task.id)} className="space-y-1.5">
                <textarea
                  name="rejectNote"
                  placeholder={t("rejectNote")}
                  rows={3}
                  className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <button type="submit" className="h-8 rounded-lg border border-danger/40 px-3 text-xs font-medium text-danger hover:bg-danger-bg">
                  {t("reject")}
                </button>
              </form>
            </div>
          )}

          {/* DELIVERED */}
          {task.status === "DELIVERED" && (
            <div className="mt-2 rounded-lg border border-success/30 bg-success-bg p-2">
              {task.deliverableLinkUrl && (
                <a href={task.deliverableLinkUrl} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium text-brand-600 hover:underline">
                  {task.deliverableLinkUrl}
                </a>
              )}
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {task.ordererName ? t("deliveredToOrderer", { name: task.ordererName }) : ""}
                {task.deliveredAt ? ` · ${formatDateTime(task.deliveredAt, locale)}` : ""}
                {task.hoursSpent != null ? ` · ${t("hoursSpent", { hours: task.hoursSpent })}` : ""}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Nút submit của 1 form bound-action riêng (tránh lồng form). */
function FormButton({ action, label, danger, success }: { action: () => void; label: string; danger?: boolean; success?: boolean }) {
  return (
    <form action={action}>
      <button
        type="submit"
        className={
          success
            ? "h-8 rounded-lg bg-success px-3 text-xs font-medium text-white hover:bg-success/90"
            : danger
              ? "h-8 rounded-lg border border-danger/40 px-2.5 text-xs text-danger hover:bg-danger-bg"
              : "h-8 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2"
        }
      >
        {label}
      </button>
    </form>
  );
}
