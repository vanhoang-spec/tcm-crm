"use client";

import { useMemo, useState } from "react";
import { Lock, CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import type { CreativeTaskStatus } from "@/lib/creative";
import {
  assignCreativeTask,
  submitCreativeTask,
  approveCreativeTask,
  rejectCreativeTask,
  createCreativeTask,
  deleteCreativeTask,
} from "./actions";

export type TaskData = {
  id: string;
  title: string;
  detail: string | null;
  status: CreativeTaskStatus;
  projectId: string;
  projectCode: string;
  projectName: string;
  teamCode: string | null;
  phase: "BIDDING" | "WORKING";
  taskTypeId: string | null;
  taskTypeLabel: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  ordererId: string | null;
  ordererName: string | null;
  cdApprovalNotRequired: boolean;
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
const PHASE_TONE = { BIDDING: "brand", WORKING: "success" } as const;
const input =
  "h-8 rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export function TaskBoard({
  tasks,
  creativeStaff,
  taskTypes,
  projects,
  teams,
  orderers,
}: {
  tasks: TaskData[];
  creativeStaff: Opt[];
  taskTypes: Opt[];
  projects: Opt[];
  teams: Opt[];
  orderers: Opt[];
}) {
  const t = useTranslations("creative");
  const [fProject, setFProject] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [fPhase, setFPhase] = useState("");
  const [fTeam, setFTeam] = useState("");
  const [fOrderer, setFOrderer] = useState("");

  const filtered = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (!fProject || task.projectId === fProject) &&
          (!fAssignee || task.assigneeId === fAssignee) &&
          (!fPhase || task.phase === fPhase) &&
          (!fTeam || task.teamCode === fTeam) &&
          (!fOrderer || task.ordererId === fOrderer),
      ),
    [tasks, fProject, fAssignee, fPhase, fTeam, fOrderer],
  );

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-3 py-2 text-xs text-muted-foreground sm:hidden">
        {t("mobileFullDetailNote")}
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect
          value={fProject}
          onChange={setFProject}
          placeholder={t("board.allProjects")}
          allowClear
          className="w-44"
          options={projects.map((p) => ({ value: p.id, label: p.label }))}
        />
        <SearchableSelect
          value={fAssignee}
          onChange={setFAssignee}
          placeholder={t("board.allAssignees")}
          allowClear
          className="w-44"
          options={creativeStaff.map((s) => ({ value: s.id, label: s.label }))}
        />
        <select aria-label={t("board.filterPhase")} value={fPhase} onChange={(e) => setFPhase(e.target.value)} className={input}>
          <option value="">{t("board.allPhases")}</option>
          <option value="BIDDING">{t("phaseBIDDING")}</option>
          <option value="WORKING">{t("phaseWORKING")}</option>
        </select>
        <select aria-label={t("board.filterTeam")} value={fTeam} onChange={(e) => setFTeam(e.target.value)} className={input}>
          <option value="">{t("board.allTeams")}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>{tm.label}</option>
          ))}
        </select>
        <SearchableSelect
          value={fOrderer}
          onChange={setFOrderer}
          placeholder={t("board.allOrderers")}
          allowClear
          className="w-44"
          options={orderers.map((o) => ({ value: o.id, label: o.label }))}
        />
      </div>

      {STATUS_ORDER.map((status) => {
        const group = filtered.filter((task) => task.status === status);
        if (group.length === 0) return null;
        return (
          <div key={status}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`board.group${status}`)} · {group.length}
            </h3>
            <div className="space-y-2">
              {group.map((task) => (
                <TaskCard key={task.id} task={task} creativeStaff={creativeStaff} taskTypes={taskTypes} t={t} />
              ))}
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && <p className="text-sm text-muted-foreground">{t("board.empty")}</p>}

      {/* Create ad-hoc task */}
      <details className="rounded-lg border border-dashed border-border-strong p-3">
        <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("task.createTitle")}</summary>
        <form action={createCreativeTask} className="mt-2 flex flex-wrap items-end gap-2">
          <SearchableSelect
            name="projectId"
            required
            placeholder={t("task.selectProject")}
            className="min-w-[160px]"
            options={projects.map((p) => ({ value: p.id, label: p.label }))}
          />
          <select name="taskTypeId" className={input}>
            <option value="">{t("task.selectTaskType")}</option>
            {taskTypes.map((tt) => (
              <option key={tt.id} value={tt.id}>{tt.label}</option>
            ))}
          </select>
          <input name="title" placeholder={t("task.taskTitle")} className={input + " min-w-[160px] flex-1"} required />
          <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
            {t("task.createTask")}
          </button>
        </form>
      </details>
    </div>
  );
}

function TaskCard({
  task,
  creativeStaff,
  taskTypes,
  t,
}: {
  task: TaskData;
  creativeStaff: Opt[];
  taskTypes: Opt[];
  t: ReturnType<typeof useTranslations>;
}) {
  const locale = useLocale() as Locale;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{task.title}</span>
        <Badge tone={PHASE_TONE[task.phase]}>{t(`phase${task.phase}`)}</Badge>
        {task.taskTypeLabel && <Badge tone="neutral">{task.taskTypeLabel}</Badge>}
        <span className="font-mono text-xs text-muted-foreground">{task.projectCode}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>{task.projectName}</span>
        {task.ordererName && <span>· {t("task.orderer")}: {task.ordererName}</span>}
        {task.assigneeName && <span>· {t("task.assignedTo", { name: task.assigneeName })}</span>}
        {task.deadline && <span>· {t("task.deadline")}: {formatDate(task.deadline)}</span>}
        {task.revisionCount > 0 && <span>· {t("task.revisions", { count: task.revisionCount })}</span>}
      </div>

      {/* Locked */}
      {task.locked ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> {t("task.lockedCancel")}
        </p>
      ) : (
        <>
          {task.graceDaysLeft != null && (
            <p className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">
              {t("task.finishedGraceOpen", { days: task.graceDaysLeft })}
            </p>
          )}

          {/* UNASSIGNED → assign form */}
          {task.status === "UNASSIGNED" && (
            <div className="mt-2 space-y-2 border-t border-border pt-2">
              {/* Nút Xóa là form riêng → tách khỏi form assign (không lồng form), nối lại bằng thuộc tính form=. */}
              <form id={`assign-${task.id}`} action={assignCreativeTask.bind(null, task.id)} className="space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                  <SearchableSelect
                    name="assigneeId"
                    required
                    defaultValue=""
                    placeholder={t("task.selectAssignee")}
                    className="min-w-[150px]"
                    options={creativeStaff.map((s) => ({ value: s.id, label: s.label }))}
                  />
                  <select name="taskTypeId" className={input} defaultValue={task.taskTypeId ?? ""}>
                    <option value="">{t("task.selectTaskType")}</option>
                    {taskTypes.map((tt) => (
                      <option key={tt.id} value={tt.id}>{tt.label}</option>
                    ))}
                  </select>
                  <DateField name="deadline" className={input} defaultValue={toDateInput(task.deadline)} />
                </div>
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" name="cdApprovalNotRequired" className="h-4 w-4 rounded border-border-strong" />
                  {t("task.cdNoApproval")}
                </label>
              </form>
              <div className="flex items-center gap-2">
                <button type="submit" form={`assign-${task.id}`} className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
                  {t("task.assign")}
                </button>
                <FormButton action={deleteCreativeTask.bind(null, task.id)} label={t("task.delete")} danger />
              </div>
            </div>
          )}

          {/* ASSIGNED / REVISION → submit form */}
          {(task.status === "ASSIGNED" || task.status === "REVISION") && (
            <form action={submitCreativeTask.bind(null, task.id)} className="mt-2 flex flex-wrap items-end gap-2 border-t border-border pt-2">
              <input name="deliverableLinkUrl" type="url" placeholder={t("task.deliverableLink")} className={input + " min-w-[200px] flex-1"} required />
              <label className="text-xs text-muted-foreground">
                {t("task.hours")}
                <input name="hoursSpent" type="number" step="0.25" min="0.25" placeholder="0.25" className={input + " ml-1 w-20"} required />
              </label>
              <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
                {t("task.submitResult")}
              </button>
              <span className="w-full text-[11px] text-muted-foreground">{t("task.hoursHint")}</span>
            </form>
          )}

          {/* SUBMITTED → CD approve/reject */}
          {task.status === "SUBMITTED" && (
            <div className="mt-2 space-y-2 border-t border-border pt-2">
              {task.deliverableLinkUrl && (
                <a href={task.deliverableLinkUrl} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium text-brand-600 hover:underline">
                  {task.deliverableLinkUrl}
                </a>
              )}
              {task.hoursSpent != null && <p className="text-xs text-muted-foreground">{t("task.hoursSpent", { hours: task.hoursSpent })}</p>}
              <FormButton action={approveCreativeTask.bind(null, task.id)} label={t("task.approve")} success />
              <form action={rejectCreativeTask.bind(null, task.id)} className="space-y-1.5">
                <textarea
                  name="rejectNote"
                  placeholder={t("task.rejectNote")}
                  rows={3}
                  className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <button type="submit" className="h-8 rounded-lg border border-danger/40 px-3 text-xs font-medium text-danger hover:bg-danger-bg">
                  {t("task.reject")}
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
                {task.ordererName ? t("task.deliveredToOrderer", { name: task.ordererName }) : ""}
                {task.deliveredAt ? ` · ${formatDateTime(task.deliveredAt, locale)}` : ""}
                {task.hoursSpent != null ? ` · ${t("task.hoursSpent", { hours: task.hoursSpent })}` : ""}
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
