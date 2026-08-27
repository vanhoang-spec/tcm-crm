"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  startTask,
  completeTask,
  confirmTask,
  returnTask,
  cancelTask,
  updateTask,
  addFollower,
  removeFollower,
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  addTaskComment,
  uploadTaskFiles,
  createTask,
  type TaskFormState,
} from "../actions";

export type TaskDetailData = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  typeLabel: string | null;
  projectCode: string | null;
  projectName: string | null;
  creatorId: string;
  creatorName: string;
  assigneeId: string;
  assigneeName: string;
  dueDate: Date | null;
  overdueDays: number | null;
  returnNote: string | null;
  parentId: string | null;
  parentTitle: string | null;
  fromRecurrence: string | null;
  createdAt: Date;
  followers: { staffId: string; name: string }[];
  checklist: { id: string; label: string; isDone: boolean }[];
  comments: { id: string; author: string; body: string; createdAt: Date }[];
  files: { id: string; fileName: string; fileSize: number; uploadedBy: string }[];
  children: { id: string; title: string; status: string; assigneeName: string; dueDate: Date | null; overdueDays: number | null }[];
};
type Opt = { id: string; label: string; sublabel?: string };

const STATUS_TONE: Record<string, "brand" | "warning" | "success" | "danger" | "neutral"> = {
  OPEN: "brand",
  IN_PROGRESS: "warning",
  AWAIT_CONFIRM: "warning",
  DONE: "success",
  CANCELED: "neutral",
};
const PRIORITY_TONE: Record<string, "danger" | "neutral" | "brand"> = { HIGH: "danger", NORMAL: "neutral", LOW: "brand" };
const input =
  "h-8 rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function TaskDetail({ task, meId, staff }: { task: TaskDetailData; meId: string; staff: Opt[] }) {
  const t = useTranslations("tasks");
  const isAssignee = task.assigneeId === meId;
  const isCreator = task.creatorId === meId;
  const closed = task.status === "DONE" || task.status === "CANCELED";
  const openSubs = task.children.filter((c) => c.status !== "DONE" && c.status !== "CANCELED").length;
  const isParent = task.parentId == null;

  const [showReturn, setShowReturn] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddSub, setShowAddSub] = useState(false);
  const [completeErr, setCompleteErr] = useState<number | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {/* ── Header + hành động theo vai ── */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{task.title}</h1>
            <Badge tone={STATUS_TONE[task.status] ?? "neutral"}>{t(`status${task.status}`)}</Badge>
            <Badge tone={PRIORITY_TONE[task.priority] ?? "neutral"}>{t(`priority${task.priority}`)}</Badge>
            {task.typeLabel && <Badge tone="neutral">{task.typeLabel}</Badge>}
            {task.overdueDays != null && <Badge tone="danger">{t("overdueDays", { days: task.overdueDays })}</Badge>}
          </div>
          {task.description && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{task.description}</p>}
          {task.returnNote && task.status === "IN_PROGRESS" && (
            <p className="mt-2 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-foreground">
              {t("returnedNote")}: {task.returnNote}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {isAssignee && task.status === "OPEN" && (
              <form action={startTask.bind(null, task.id)}>
                <button className="h-8 rounded-lg border border-border-strong px-3 text-xs text-foreground hover:bg-surface-2">{t("btnStart")}</button>
              </form>
            )}
            {isAssignee && (task.status === "OPEN" || task.status === "IN_PROGRESS") && (
              <form
                action={async () => {
                  const res = await completeTask(task.id);
                  setCompleteErr(res?.error === "SUBS_OPEN" ? (res.openSubs ?? 0) : null);
                }}
              >
                <button className="h-8 rounded-lg bg-success px-3 text-xs font-medium text-white hover:bg-success/90">{t("btnComplete")}</button>
              </form>
            )}
            {isCreator && task.status === "AWAIT_CONFIRM" && (
              <>
                <form action={confirmTask.bind(null, task.id)}>
                  <button className="h-8 rounded-lg bg-success px-3 text-xs font-medium text-white hover:bg-success/90">{t("btnConfirm")}</button>
                </form>
                <button
                  type="button"
                  onClick={() => setShowReturn((v) => !v)}
                  className="h-8 rounded-lg border border-warning/50 px-3 text-xs text-foreground hover:bg-warning-bg"
                >
                  {t("btnReturn")}
                </button>
              </>
            )}
            {isCreator && !closed && (
              <>
                <button type="button" onClick={() => setShowEdit((v) => !v)} className="h-8 rounded-lg border border-border-strong px-3 text-xs text-foreground hover:bg-surface-2">
                  {t("btnEdit")}
                </button>
                <form
                  action={cancelTask.bind(null, task.id)}
                  onSubmit={(e) => {
                    // Huỷ là không có đường hoàn tác — confirm theo tiền lệ kb-panel.
                    if (!window.confirm(t("cancelConfirm", { subs: openSubs }))) e.preventDefault();
                  }}
                >
                  <button className="h-8 rounded-lg border border-danger/40 px-3 text-xs text-danger hover:bg-danger-bg">{t("btnCancel")}</button>
                </form>
              </>
            )}
          </div>

          {completeErr != null && <p className="mt-2 text-xs text-danger">{t("errSUBS_OPEN", { count: completeErr })}</p>}

          {showReturn && (
            <form action={returnTask.bind(null, task.id)} className="mt-3 flex flex-wrap items-center gap-2">
              <input name="returnNote" required maxLength={500} placeholder={t("returnNotePlaceholder")} className={`${input} w-72`} />
              <button className="h-8 rounded-lg bg-warning px-3 text-xs font-medium text-white hover:bg-warning/90">{t("btnReturnSend")}</button>
            </form>
          )}

          {showEdit && (
            <form action={updateTask.bind(null, task.id)} onReset={(e) => e.preventDefault()} className="mt-3 space-y-2 rounded-lg border border-border bg-surface-2/50 p-3">
              <div className="flex flex-wrap gap-2">
                <div className="w-64">
                  <SearchableSelect name="assigneeId" defaultValue={task.assigneeId} options={staff.map((s) => ({ value: s.id, label: s.label, sublabel: s.sublabel }))} />
                </div>
                <DateField name="dueDate" defaultValue={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ""} title={t("dueLabel")} />
                <select name="priority" defaultValue={task.priority} className={input}>
                  <option value="LOW">{t("priorityLOW")}</option>
                  <option value="NORMAL">{t("priorityNORMAL")}</option>
                  <option value="HIGH">{t("priorityHIGH")}</option>
                </select>
              </div>
              <button className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700">{t("btnSave")}</button>
            </form>
          )}
        </section>

        {/* ── Sub-task (chỉ task cấp 1) ── */}
        {isParent && (
          <section className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                {t("subTitle")} · {task.children.length - openSubs}/{task.children.length}
              </h2>
              {!closed && (
                <button type="button" onClick={() => setShowAddSub((v) => !v)} className="h-7 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2">
                  {t("btnAddSub")}
                </button>
              )}
            </div>
            {task.children.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {task.children.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-1.5 text-sm">
                    <Link href={`/tasks/${c.id}`} className="font-medium text-foreground hover:text-brand-600 hover:underline">
                      {c.title}
                    </Link>
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{t(`status${c.status}`)}</Badge>
                    <span className="text-xs text-muted-foreground">{c.assigneeName}</span>
                    {c.dueDate && <span className="text-xs text-muted-foreground">{formatDate(c.dueDate)}</span>}
                    {c.overdueDays != null && <Badge tone="danger">{t("overdueDays", { days: c.overdueDays })}</Badge>}
                  </div>
                ))}
              </div>
            )}
            {showAddSub && <AddSubForm parentId={task.id} staff={staff} onDone={() => setShowAddSub(false)} />}
          </section>
        )}

        {/* ── Checklist ── */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("checklistTitle")}</h2>
          {task.checklist.length > 0 && (
            <div className="mt-2 space-y-1">
              {task.checklist.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <form action={toggleChecklistItem.bind(null, c.id)}>
                    <button type="submit" className="flex h-5 w-5 items-center justify-center rounded border border-border-strong text-xs hover:bg-surface-2" aria-label={t("checklistToggle")}>
                      {c.isDone ? "✓" : ""}
                    </button>
                  </form>
                  <span className={c.isDone ? "text-muted-foreground line-through" : "text-foreground"}>{c.label}</span>
                  {(isCreator || isAssignee) && !closed && (
                    <form action={deleteChecklistItem.bind(null, c.id)}>
                      <button type="submit" className="text-xs text-muted-foreground hover:text-danger" aria-label={t("checklistDelete")}>
                        ×
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
          {!closed && (
            <form action={addChecklistItem.bind(null, task.id)} className="mt-2 flex gap-2">
              <input name="label" required maxLength={300} placeholder={t("checklistPlaceholder")} className={`${input} flex-1`} />
              <button className="h-8 rounded-lg border border-border-strong px-3 text-xs text-foreground hover:bg-surface-2">{t("btnAdd")}</button>
            </form>
          )}
        </section>

        {/* ── Bình luận ── */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("commentsTitle")}</h2>
          {task.comments.length > 0 && (
            <div className="mt-2 space-y-2">
              {task.comments.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-surface-2/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.author}</span> · {formatDateTime(c.createdAt)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
                </div>
              ))}
            </div>
          )}
          <CommentForm taskId={task.id} />
        </section>

        {/* ── File đính kèm ── */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("filesTitle")}</h2>
          {task.files.length > 0 && (
            <div className="mt-2 space-y-1">
              {task.files.map((f) => (
                <p key={f.id} className="text-sm">
                  <a href={`/api/task-file/${f.id}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                    {f.fileName}
                  </a>{" "}
                  <span className="text-xs text-muted-foreground">
                    ({fmtSize(f.fileSize)} · {f.uploadedBy})
                  </span>
                </p>
              ))}
            </div>
          )}
          {!closed && (
            <form
              action={async (fd: FormData) => {
                const res = await uploadTaskFiles(task.id, fd);
                setUploadErr(res?.error ?? null);
              }}
              className="mt-2 flex flex-wrap items-center gap-2"
            >
              <input type="file" name="files" multiple className="text-xs" />
              <button className="h-8 rounded-lg border border-border-strong px-3 text-xs text-foreground hover:bg-surface-2">{t("btnUpload")}</button>
              {uploadErr && <p className="text-xs text-danger">{t(`errFile${uploadErr}`)}</p>}
            </form>
          )}
        </section>
      </div>

      {/* ── Cột phải: thông tin + người theo dõi ── */}
      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-surface p-4 text-sm">
          <h2 className="text-sm font-semibold text-foreground">{t("infoTitle")}</h2>
          <dl className="mt-2 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("infoCreator")}</dt>
              <dd className="text-foreground">{task.creatorName}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("infoAssignee")}</dt>
              <dd className="text-foreground">{task.assigneeName}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("dueLabel")}</dt>
              <dd className="text-foreground">{task.dueDate ? formatDate(task.dueDate) : "—"}</dd>
            </div>
            {task.projectCode && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("infoProject")}</dt>
                <dd className="text-foreground">
                  {task.projectCode} — {task.projectName}
                </dd>
              </div>
            )}
            {task.fromRecurrence && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("infoRecurrence")}</dt>
                <dd className="text-foreground">{task.fromRecurrence}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("infoCreatedAt")}</dt>
              <dd className="text-foreground">{formatDateTime(task.createdAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-foreground">{t("followersTitle")}</h2>
          {task.followers.length > 0 && (
            <div className="mt-2 space-y-1">
              {task.followers.map((f) => (
                <div key={f.staffId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground">{f.name}</span>
                  {(f.staffId === meId || isCreator) && (
                    <form action={removeFollower.bind(null, task.id)}>
                      <input type="hidden" name="staffId" value={f.staffId} />
                      <button className="text-xs text-muted-foreground hover:text-danger">×</button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
          {!closed && <AddFollowerForm taskId={task.id} staff={staff} existing={[task.creatorId, task.assigneeId, ...task.followers.map((f) => f.staffId)]} />}
        </section>
      </div>
    </div>
  );
}

function CommentForm({ taskId }: { taskId: string }) {
  const t = useTranslations("tasks");
  // key remount sau khi gửi để ô về trắng (không form.reset() — bẫy React 19).
  const [epoch, setEpoch] = useState(0);
  return (
    <form
      key={epoch}
      action={async (fd: FormData) => {
        await addTaskComment(taskId, fd);
        setEpoch((e) => e + 1);
      }}
      className="mt-2 flex gap-2"
    >
      <input name="body" required maxLength={4000} placeholder={t("commentPlaceholder")} className={`${input} flex-1`} />
      <button className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700">{t("btnSend")}</button>
    </form>
  );
}

function AddFollowerForm({ taskId, staff, existing }: { taskId: string; staff: Opt[]; existing: string[] }) {
  const t = useTranslations("tasks");
  const [epoch, setEpoch] = useState(0);
  const options = staff.filter((s) => !existing.includes(s.id));
  return (
    <form
      key={epoch}
      action={async (fd: FormData) => {
        await addFollower(taskId, fd);
        setEpoch((e) => e + 1);
      }}
      className="mt-2 flex items-center gap-2"
    >
      <div className="flex-1">
        <SearchableSelect name="staffId" options={options.map((s) => ({ value: s.id, label: s.label, sublabel: s.sublabel }))} placeholder={t("followerPlaceholder")} />
      </div>
      <button className="h-8 shrink-0 rounded-lg border border-border-strong px-3 text-xs text-foreground hover:bg-surface-2">{t("btnAdd")}</button>
    </form>
  );
}

/** Tạo sub lẻ — dùng CHUNG action createTask với ô parentId ẩn (một đường ghi duy nhất). */
function AddSubForm({ parentId, staff, onDone }: { parentId: string; staff: Opt[]; onDone: () => void }) {
  const t = useTranslations("tasks");
  const [state, action] = useActionState<TaskFormState, FormData>(async (prev, fd) => {
    const res = await createTask(prev, fd);
    if (res?.ok) onDone();
    return res;
  }, null);
  return (
    <form action={action} onReset={(e) => e.preventDefault()} className="mt-3 space-y-2 rounded-lg border border-border bg-surface-2/50 p-3">
      <input type="hidden" name="parentId" value={parentId} />
      <input name="title" required maxLength={200} placeholder={t("titlePlaceholder")} className={`${input} w-full`} />
      <div className="flex flex-wrap gap-2">
        <div className="w-64">
          <SearchableSelect name="assigneeIds" options={staff.map((s) => ({ value: s.id, label: s.label, sublabel: s.sublabel }))} placeholder={t("assigneePlaceholder")} required />
        </div>
        <DateField name="dueDate" title={t("dueLabel")} />
      </div>
      {state?.error && <p className="text-xs text-danger">{t(`err${state.error}`)}</p>}
      <button className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700">{t("btnCreate")}</button>
    </form>
  );
}
