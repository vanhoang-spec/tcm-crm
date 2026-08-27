"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatDate } from "@/lib/utils";
import { createTask, startTask, completeTask, confirmTask, type TaskFormState } from "./actions";

/**
 * Board module Tasks — danh sách DỌC nhóm theo trạng thái + nút đổi trạng thái bằng server action
 * (đúng khuôn creative/task-board.tsx đang chạy — KHÔNG kéo-thả, repo không có lib DnD).
 * Mọi số tính ở SERVER (overdueDays, subDone/subTotal) — client giữ thuần cho StrictMode.
 */

export type TaskItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  typeLabel: string | null;
  projectCode: string | null;
  creatorId: string;
  creatorName: string;
  assigneeId: string;
  assigneeName: string;
  dueDate: Date | null;
  overdueDays: number | null;
  parentId: string | null;
  parentTitle: string | null;
  subDone: number;
  subTotal: number;
};

export type Opt = { id: string; label: string; sublabel?: string };

const STATUS_ORDER = ["AWAIT_CONFIRM", "IN_PROGRESS", "OPEN", "DONE", "CANCELED"] as const;
const PRIORITY_TONE: Record<string, "danger" | "neutral" | "brand"> = { HIGH: "danger", NORMAL: "neutral", LOW: "brand" };
const input =
  "h-8 rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function sortByUrgency(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((a, b) => {
    const ao = a.overdueDays ?? -1;
    const bo = b.overdueDays ?? -1;
    if (ao !== bo) return bo - ao;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  });
}

function FormButton({ action, label, success }: { action: () => void; label: string; success?: boolean }) {
  return (
    <form action={action}>
      <button
        type="submit"
        className={
          success
            ? "h-7 rounded-lg bg-success px-2.5 text-xs font-medium text-white hover:bg-success/90"
            : "h-7 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2"
        }
      >
        {label}
      </button>
    </form>
  );
}

function TaskCard({ task, meId }: { task: TaskItem; meId: string }) {
  const t = useTranslations("tasks");
  const isAssignee = task.assigneeId === meId;
  const isCreator = task.creatorId === meId;
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/tasks/${task.id}`} className="text-sm font-medium text-foreground hover:text-brand-600 hover:underline">
          {task.title}
        </Link>
        <Badge tone={PRIORITY_TONE[task.priority] ?? "neutral"}>{t(`priority${task.priority}`)}</Badge>
        {task.typeLabel && <Badge tone="neutral">{task.typeLabel}</Badge>}
        {task.projectCode && <Badge tone="brand">{task.projectCode}</Badge>}
        {task.subTotal > 0 && <Badge tone={task.subDone === task.subTotal ? "success" : "warning"}>{t("subProgress", { done: task.subDone, total: task.subTotal })}</Badge>}
        {task.overdueDays != null && <Badge tone="danger">{t("overdueDays", { days: task.overdueDays })}</Badge>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("cardMeta", { creator: task.creatorName, assignee: task.assigneeName })}
        {task.dueDate ? ` · ${t("dueLabel")}: ${formatDate(task.dueDate)}` : ""}
        {task.parentTitle ? ` · ${t("belongsTo")}: ${task.parentTitle}` : ""}
      </p>
      {(isAssignee || isCreator) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {isAssignee && task.status === "OPEN" && <FormButton action={startTask.bind(null, task.id)} label={t("btnStart")} />}
          {/* Cha còn sub treo thì KHÔNG mời bấm Hoàn thành ở board (server cũng chặn) — trang chi tiết giải thích đích danh. */}
          {isAssignee && (task.status === "OPEN" || task.status === "IN_PROGRESS") && (task.subTotal === 0 || task.subDone === task.subTotal) && (
            <FormButton action={completeTask.bind(null, task.id) as unknown as () => void} label={t("btnComplete")} success />
          )}
          {isCreator && task.status === "AWAIT_CONFIRM" && <FormButton action={confirmTask.bind(null, task.id)} label={t("btnConfirm")} success />}
        </div>
      )}
    </div>
  );
}

/** Ô chọn NHIỀU người nhận: chip đã chọn + SearchableSelect controlled thêm dần; mỗi người một hidden input. */
function MultiAssigneePicker({ staff }: { staff: Opt[] }) {
  const t = useTranslations("tasks");
  const [ids, setIds] = useState<string[]>([]);
  const byId = useMemo(() => new Map(staff.map((s) => [s.id, s.label])), [staff]);
  const remaining = useMemo(() => staff.filter((s) => !ids.includes(s.id)), [staff, ids]);
  return (
    <div className="space-y-1.5">
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-foreground">
              {byId.get(id)}
              <button type="button" className="text-muted-foreground hover:text-danger" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label={t("removeAssignee")}>
                ×
              </button>
              <input type="hidden" name="assigneeIds" value={id} />
            </span>
          ))}
        </div>
      )}
      <SearchableSelect
        options={remaining.map((s) => ({ value: s.id, label: s.label, sublabel: s.sublabel }))}
        value=""
        onChange={(v) => {
          if (v) setIds((prev) => (prev.includes(v) ? prev : [...prev, v]));
        }}
        placeholder={ids.length === 0 ? t("assigneePlaceholder") : t("assigneeAddMore")}
      />
      {ids.length > 1 && <p className="text-[11px] text-muted-foreground">{t("multiAssigneeHint", { count: ids.length })}</p>}
    </div>
  );
}

export function CreateTaskForm({ staff, taskTypes, projects }: { staff: Opt[]; taskTypes: Opt[]; projects: Opt[] }) {
  const t = useTranslations("tasks");
  const [state, action] = useActionState<TaskFormState, FormData>(createTask, null);
  // Remount khối nhập khi tạo thành công để form về trắng — KHÔNG dùng form.reset() (bẫy React 19
  // requestFormReset xoá cả select/checkbox khi action trả lỗi — HANDOVER 10.37).
  const [epoch, setEpoch] = useState(0);
  const [lastOk, setLastOk] = useState(false);
  if (state?.ok && !lastOk) {
    setLastOk(true);
    setEpoch((e) => e + 1);
  } else if (!state?.ok && lastOk) {
    setLastOk(false);
  }
  return (
    <form key={epoch} action={action} onReset={(e) => e.preventDefault()} className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-foreground">{t("createTitle")}</h3>
      <input name="title" required maxLength={200} placeholder={t("titlePlaceholder")} className={`${input} w-full`} />
      <MultiAssigneePicker staff={staff} />
      <div className="flex flex-wrap gap-2">
        <DateField name="dueDate" title={t("dueLabel")} />
        <select name="priority" defaultValue="NORMAL" className={input}>
          <option value="LOW">{t("priorityLOW")}</option>
          <option value="NORMAL">{t("priorityNORMAL")}</option>
          <option value="HIGH">{t("priorityHIGH")}</option>
        </select>
        <select name="typeId" defaultValue="" className={input}>
          <option value="">{t("typePlaceholder")}</option>
          {taskTypes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <SearchableSelect name="projectId" options={projects.map((p) => ({ value: p.id, label: p.label }))} placeholder={t("projectPlaceholder")} allowClear />
      <textarea name="description" rows={2} maxLength={4000} placeholder={t("descriptionPlaceholder")} className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
      {state?.error && <p className="text-xs text-danger">{t(`err${state.error}`)}</p>}
      <button type="submit" className="h-8 rounded-lg bg-brand-600 px-4 text-xs font-medium text-white hover:bg-brand-700">
        {t("btnCreate")}
      </button>
    </form>
  );
}

export function TasksBoard({ tasks, meId }: { tasks: TaskItem[]; meId: string }) {
  const t = useTranslations("tasks");
  return (
    <div className="space-y-5">
      {STATUS_ORDER.map((status) => {
        const group = sortByUrgency(tasks.filter((x) => x.status === status));
        if (group.length === 0) return null;
        return (
          <div key={status}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`status${status}`)} · {group.length}
            </h3>
            <div className="space-y-2">
              {group.map((task) => (
                <TaskCard key={task.id} task={task} meId={meId} />
              ))}
            </div>
          </div>
        );
      })}
      {tasks.length === 0 && <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>}
    </div>
  );
}
