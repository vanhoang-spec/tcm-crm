"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, Zap, EyeOff, RotateCcw } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { MKT_CHANNELS, parseChannelsCsv } from "@/lib/mkt";
import { createPlanItem, updatePlanItem, togglePlanItemSkip, deletePlanItem, draftPlanItemNow, type PlanState } from "./actions";

export type Option = { value: string; label: string; sublabel?: string };
export type WeekView = { key: string; label: string; isCurrent: boolean; isDue: boolean };
export type PlanItemView = {
  id: string;
  weekKey: string;
  title: string;
  keyPoints: string;
  channels: string;
  contentTypeId: string | null;
  contentTypeLabel: string | null;
  projectId: string | null;
  projectLabel: string | null;
  status: string;
  postId: string | null;
  note: string | null;
  aiSuggested: boolean;
};

const input = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const btn = "inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50";
const btnPrimary = "inline-flex h-8 items-center gap-1 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50";

const ERR: Record<string, string> = {
  BAD_WEEK: "errBadWeek",
  NO_TITLE: "errNoTitle",
  NO_CHANNEL: "errNoChannel",
  BAD_REF: "errBadRef",
  NOT_FOUND: "errNotFound",
  LOCKED: "errLocked",
  WRONG_STATE: "errWrongState",
};

/**
 * ⚠ Mọi form ở đây chặn `reset`: React 19 gọi `requestFormReset` sau MỌI lần chạy action kể cả khi
 * action TRẢ LỖI, và nó xoá cả checkbox/select dù controlled (HANDOVER 10.37). Ô chữ vẫn controlled
 * để giữ được giá trị qua re-render.
 */
const keepOnReset = (e: React.FormEvent<HTMLFormElement>) => e.preventDefault();

function PlanItemForm({
  weeks,
  contentTypes,
  projects,
  initial,
  onDone,
}: {
  weeks: WeekView[];
  contentTypes: Option[];
  projects: Option[];
  initial?: PlanItemView;
  onDone?: () => void;
}) {
  const t = useTranslations("mkt.plan");
  const action = initial ? updatePlanItem.bind(null, initial.id) : createPlanItem;
  const [state, formAction, pending] = useActionState<PlanState, FormData>(action, {});
  const [title, setTitle] = useState(initial?.title ?? "");
  const [keyPoints, setKeyPoints] = useState(initial?.keyPoints ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [channels, setChannels] = useState<string[]>(initial ? parseChannelsCsv(initial.channels) : [...MKT_CHANNELS]);
  const [seq, setSeq] = useState(0);

  // Tạo xong thì trắng form (mẫu "điều chỉnh state lúc render", không useEffect); sửa xong thì đóng.
  const [lastOk, setLastOk] = useState(false);
  if (state.success && !lastOk) {
    setLastOk(true);
    if (!initial) {
      setTitle("");
      setKeyPoints("");
      setNote("");
      setSeq((n) => n + 1);
    } else onDone?.();
  } else if (!state.success && lastOk) setLastOk(false);

  const defaultWeek = initial?.weekKey ?? (weeks.find((w) => !w.isDue) ?? weeks[0])?.key;

  return (
    <form action={formAction} onReset={keepOnReset} className="space-y-3 rounded-xl border border-dashed border-border-strong bg-surface p-3">
      <div key={seq} className="grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] text-muted-foreground">
          {t("fWeek")}
          <select name="weekStart" defaultValue={defaultWeek} className={input + " mt-1"}>
            {weeks.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
                {w.isCurrent ? ` · ${t("thisWeek")}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("fContentType")}
          <SearchableSelect name="contentTypeId" options={contentTypes} defaultValue={initial?.contentTypeId ?? ""} className="mt-1" />
        </label>
        <label className="text-[11px] text-muted-foreground sm:col-span-2">
          {t("fTitle")}
          <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} className={input + " mt-1"} />
        </label>
        <label className="text-[11px] text-muted-foreground sm:col-span-2">
          {t("fKeyPoints")}
          <textarea
            name="keyPoints"
            rows={4}
            value={keyPoints}
            onChange={(e) => setKeyPoints(e.target.value)}
            placeholder={"- …\n- …"}
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{t("fKeyPointsHint")}</span>
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("fProject")}
          <SearchableSelect name="projectId" options={projects} defaultValue={initial?.projectId ?? ""} placeholder={t("fProjectPh")} className="mt-1" />
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("fNote")}
          <input name="note" value={note} onChange={(e) => setNote(e.target.value)} className={input + " mt-1"} />
        </label>
      </div>
      <fieldset>
        <legend className="text-[11px] text-muted-foreground">{t("fChannels")}</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {MKT_CHANNELS.map((ch) => (
            <label key={ch} className="flex items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                name={`channel_${ch}`}
                value="1"
                checked={channels.includes(ch)}
                onChange={(e) => setChannels((prev) => (e.target.checked ? [...prev, ch] : prev.filter((x) => x !== ch)))}
                className="h-4 w-4"
              />
              {ch === "LINKEDIN" ? "LinkedIn" : "Fanpage"}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "…" : initial ? t("saveBtn") : t("addBtn")}
        </button>
        {initial && onDone && (
          <button type="button" onClick={onDone} className={btn}>
            {t("cancelBtn")}
          </button>
        )}
        {state.error && <span className="text-xs text-danger">{t(ERR[state.error] ?? "errGeneric")}</span>}
        {state.success && !initial && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

function DraftNowButton({ id, aiProvider }: { id: string; aiProvider: string }) {
  const t = useTranslations("mkt.plan");
  const [state, action, pending] = useActionState<PlanState, FormData>(draftPlanItemNow.bind(null, id), {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t("confirmDraftNow", { provider: aiProvider }))) e.preventDefault();
      }}
      className="inline"
    >
      <button type="submit" disabled={pending} className={btn} title={t("draftNowHint")}>
        <Zap className="h-3.5 w-3.5" /> {pending ? "…" : t("draftNow")}
      </button>
      {state.error && <span className="ml-2 text-xs text-danger">{t(ERR[state.error] ?? "errGeneric")}</span>}
    </form>
  );
}

function ItemRow({ item, weeks, contentTypes, projects, canReview, aiProvider }: { item: PlanItemView; weeks: WeekView[]; contentTypes: Option[]; projects: Option[]; canReview: boolean; aiProvider: string }) {
  const t = useTranslations("mkt.plan");
  const [editing, setEditing] = useState(false);
  const chans = parseChannelsCsv(item.channels);
  const tone = item.status === "DRAFTED" ? "success" : item.status === "SKIPPED" ? "neutral" : "warning";

  if (editing) return <PlanItemForm weeks={weeks} contentTypes={contentTypes} projects={projects} initial={item} onDone={() => setEditing(false)} />;

  return (
    <li className={"rounded-lg border border-border p-3 " + (item.status === "SKIPPED" ? "opacity-60" : "")}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {item.status === "DRAFTED" && item.postId ? (
              <Link href={`/mkt/${item.postId}`} className="hover:text-brand-600 hover:underline">
                {item.title}
              </Link>
            ) : (
              item.title
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {chans.map((c) => (
              <span key={c} className="rounded border border-border px-1.5 py-0.5">
                {c === "LINKEDIN" ? "LinkedIn" : "Fanpage"}
              </span>
            ))}
            {item.contentTypeLabel && <span>· {item.contentTypeLabel}</span>}
            {item.projectLabel && <span>· {item.projectLabel}</span>}
            {item.aiSuggested && <span>· {t("aiSuggestedTag")}</span>}
          </p>
          {item.keyPoints && <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{item.keyPoints}</p>}
          {item.note && <p className="mt-1 text-[11px] italic text-muted-foreground">{item.note}</p>}
        </div>
        <Badge tone={tone}>{t(`status${item.status}` as "statusPLANNED")}</Badge>
      </div>
      {canReview && item.status !== "DRAFTED" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className={btn}>
            <Pencil className="h-3.5 w-3.5" /> {t("editBtn")}
          </button>
          {item.status === "PLANNED" && <DraftNowButton id={item.id} aiProvider={aiProvider} />}
          <form action={togglePlanItemSkip.bind(null, item.id)} className="inline">
            <button type="submit" className={btn}>
              {item.status === "SKIPPED" ? <RotateCcw className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {item.status === "SKIPPED" ? t("restoreBtn") : t("skipBtn")}
            </button>
          </form>
          <form
            action={deletePlanItem.bind(null, item.id)}
            onSubmit={(e) => {
              if (!window.confirm(t("confirmDelete"))) e.preventDefault();
            }}
            className="inline"
          >
            <button type="submit" className={btn + " text-danger"}>
              <Trash2 className="h-3.5 w-3.5" /> {t("deleteBtn")}
            </button>
          </form>
        </div>
      )}
      {item.status === "DRAFTED" && item.postId && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <Link href={`/mkt/${item.postId}`} className="text-brand-600 hover:underline">
            {t("openPost")} →
          </Link>
        </p>
      )}
    </li>
  );
}

export function PlanBoard({
  weeks,
  items,
  contentTypes,
  projects,
  canReview,
  aiProvider,
}: {
  weeks: WeekView[];
  items: PlanItemView[];
  contentTypes: Option[];
  projects: Option[];
  canReview: boolean;
  aiProvider: string;
}) {
  const t = useTranslations("mkt.plan");
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {canReview && (
        <div>
          {adding ? (
            <PlanItemForm weeks={weeks} contentTypes={contentTypes} projects={projects} onDone={() => setAdding(false)} />
          ) : (
            <button type="button" onClick={() => setAdding(true)} className={btnPrimary}>
              <Plus className="h-3.5 w-3.5" /> {t("addItemBtn")}
            </button>
          )}
        </div>
      )}

      {weeks.map((w) => {
        const rows = items.filter((i) => i.weekKey === w.key);
        const planned = rows.filter((r) => r.status !== "SKIPPED");
        const li = planned.filter((r) => parseChannelsCsv(r.channels).includes("LINKEDIN")).length;
        const fb = planned.filter((r) => parseChannelsCsv(r.channels).includes("FANPAGE")).length;
        return (
          <section key={w.key} className={"rounded-xl border bg-surface p-4 " + (w.isCurrent ? "border-brand-400" : "border-border")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {t("weekOf", { date: w.label })}
                {w.isCurrent && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">{t("thisWeek")}</span>}
                {w.isDue && !w.isCurrent && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">{t("dueTag")}</span>}
              </h2>
              <span className="text-[11px] text-muted-foreground">{t("weekCount", { li, fb })}</span>
            </div>
            {rows.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("weekEmpty")}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {rows.map((item) => (
                  <ItemRow key={item.id} item={item} weeks={weeks} contentTypes={contentTypes} projects={projects} canReview={canReview} aiProvider={aiProvider} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
