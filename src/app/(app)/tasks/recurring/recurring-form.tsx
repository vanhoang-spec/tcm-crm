"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { parseChecklistJson } from "@/lib/tasks";
import { saveRecurrence, toggleRecurrence, type TaskFormState } from "../actions";

export type RecurrenceRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  typeId: string | null;
  typeLabel: string | null;
  projectId: string | null;
  projectCode: string | null;
  creatorId: string;
  creatorName: string;
  assigneeId: string;
  assigneeName: string;
  freq: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  dueOffsetDays: number;
  checklistJson: string | null;
  isActive: boolean;
  lastSpawnKey: string | null;
};
type Opt = { id: string; label: string; sublabel?: string };

// ⚠ text-base (16px) trên MOBILE: iOS Safari TỰ PHÓNG TO trang khi focus ô nhập có cỡ chữ dưới
// 16px, làm nút trôi khỏi mép màn hình (bài học HANDOVER 10.52 — đã phải vá cho chat). Từ sm trở
// lên mới về text-xs cho gọn lưới.
const input =
  "h-8 rounded-lg border border-border-strong bg-surface px-2 text-base sm:text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function RuleForm({
  rule,
  staff,
  taskTypes,
  projects,
  onDone,
}: {
  rule: RecurrenceRow | null;
  staff: Opt[];
  taskTypes: Opt[];
  projects: Opt[];
  onDone: () => void;
}) {
  const t = useTranslations("tasks");
  const [freq, setFreq] = useState(rule?.freq ?? "WEEKLY");
  const [state, action] = useActionState<TaskFormState, FormData>(async (prev, fd) => {
    const res = await saveRecurrence(prev, fd);
    if (res?.ok) onDone();
    return res;
  }, null);
  return (
    <form action={action} onReset={(e) => e.preventDefault()} className="space-y-2 rounded-xl border border-border bg-surface p-4">
      {rule && <input type="hidden" name="recurrenceId" value={rule.id} />}
      <h3 className="text-sm font-semibold text-foreground">{rule ? t("recurringEdit") : t("recurringCreate")}</h3>
      <input name="title" required maxLength={200} defaultValue={rule?.title ?? ""} placeholder={t("titlePlaceholder")} className={`${input} w-full`} />
      <div className="w-full">
        <SearchableSelect
          name="assigneeId"
          defaultValue={rule?.assigneeId ?? ""}
          options={staff.map((s) => ({ value: s.id, label: s.label, sublabel: s.sublabel }))}
          placeholder={t("assigneePlaceholder")}
          required
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select name="freq" value={freq} onChange={(e) => setFreq(e.target.value)} className={input}>
          <option value="DAILY">{t("freqDAILY")}</option>
          <option value="WEEKLY">{t("freqWEEKLY")}</option>
          <option value="MONTHLY">{t("freqMONTHLY")}</option>
        </select>
        {freq === "WEEKLY" && (
          <select name="dayOfWeek" defaultValue={String(rule?.dayOfWeek ?? 1)} className={input}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <option key={d} value={d}>
                {t(`dow${d}`)}
              </option>
            ))}
          </select>
        )}
        {freq === "MONTHLY" && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            {t("dayOfMonthLabel")}
            <input name="dayOfMonth" type="number" min={1} max={31} defaultValue={rule?.dayOfMonth ?? 1} className={`${input} w-16`} />
          </label>
        )}
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {t("dueOffsetLabel")}
          <input name="dueOffsetDays" type="number" min={0} max={60} defaultValue={rule?.dueOffsetDays ?? 0} className={`${input} w-16`} />
        </label>
        <select name="priority" defaultValue={rule?.priority ?? "NORMAL"} className={input}>
          <option value="LOW">{t("priorityLOW")}</option>
          <option value="NORMAL">{t("priorityNORMAL")}</option>
          <option value="HIGH">{t("priorityHIGH")}</option>
        </select>
        <select name="typeId" defaultValue={rule?.typeId ?? ""} className={input}>
          <option value="">{t("typePlaceholder")}</option>
          {taskTypes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <SearchableSelect name="projectId" defaultValue={rule?.projectId ?? ""} options={projects.map((p) => ({ value: p.id, label: p.label }))} placeholder={t("projectPlaceholder")} allowClear />
      <textarea
        name="description"
        rows={2}
        maxLength={4000}
        defaultValue={rule?.description ?? ""}
        placeholder={t("descriptionPlaceholder")}
        className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-base sm:text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <textarea
        name="checklist"
        rows={3}
        defaultValue={rule ? parseChecklistJson(rule.checklistJson).join("\n") : ""}
        placeholder={t("recurChecklistPlaceholder")}
        className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-base sm:text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      {state?.error && <p className="text-xs text-danger">{t(`err${state.error}`)}</p>}
      <button className="h-8 rounded-lg bg-brand-600 px-4 text-xs font-medium text-white hover:bg-brand-700">{t("btnSave")}</button>
    </form>
  );
}

export function RecurringList({
  meId,
  rules,
  staff,
  taskTypes,
  projects,
}: {
  meId: string;
  rules: RecurrenceRow[];
  staff: Opt[];
  taskTypes: Opt[];
  projects: Opt[];
}) {
  const t = useTranslations("tasks");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // Remount form theo epoch sau khi lưu — dữ liệu mới nhất về qua server render.
  const [epoch, setEpoch] = useState(0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <section className="space-y-2">
        {rules.length === 0 && <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">{t("recurringEmpty")}</p>}
        {rules.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{r.title}</span>
              <Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? t("recurActive") : t("recurPaused")}</Badge>
              {r.typeLabel && <Badge tone="neutral">{r.typeLabel}</Badge>}
              {r.projectCode && <Badge tone="brand">{r.projectCode}</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.freq === "DAILY" && t("recurLineDaily")}
              {r.freq === "WEEKLY" && t("recurLineWeekly", { day: t(`dow${r.dayOfWeek ?? 1}`) })}
              {r.freq === "MONTHLY" && t("recurLineMonthly", { day: r.dayOfMonth ?? 1 })}
              {" · "}
              {t("recurLineMeta", { assignee: r.assigneeName, creator: r.creatorName })}
              {r.lastSpawnKey ? ` · ${t("recurLastSpawn", { date: r.lastSpawnKey })}` : ""}
            </p>
            {r.creatorId === meId && (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(editingId === r.id ? null : r.id);
                    setEpoch((e) => e + 1);
                  }}
                  className="h-7 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2"
                >
                  {t("btnEdit")}
                </button>
                <form action={toggleRecurrence.bind(null, r.id)}>
                  <button className="h-7 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2">
                    {r.isActive ? t("btnPause") : t("btnResume")}
                  </button>
                </form>
              </div>
            )}
            {editingId === r.id && (
              <div className="mt-3">
                <RuleForm key={epoch} rule={r} staff={staff} taskTypes={taskTypes} projects={projects} onDone={() => setEditingId(null)} />
              </div>
            )}
          </div>
        ))}
      </section>
      <div>
        {showCreate ? (
          <RuleForm key={epoch} rule={null} staff={staff} taskTypes={taskTypes} projects={projects} onDone={() => { setShowCreate(false); setEpoch((e) => e + 1); }} />
        ) : (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="h-9 w-full rounded-xl border border-dashed border-border-strong text-sm text-muted-foreground hover:bg-surface-2"
          >
            + {t("recurringCreate")}
          </button>
        )}
      </div>
    </div>
  );
}
