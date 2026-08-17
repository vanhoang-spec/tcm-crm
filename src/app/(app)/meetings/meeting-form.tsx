"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateField } from "@/components/ui/date-field";
import { RAG_CODES } from "@/lib/meetings";
import { buildWeeklyPack, parseMinutesWithAi, saveMeeting, type MeetingFormState, type MeetingSavePayload, type MinutesParseState, type PackState } from "./actions";
import { ImportMinutesPanel, type ParsedMinutes } from "./import-minutes-panel";

export type MeetingRowData = {
  id: string | null;
  clientId: string;
  clientCode: string;
  clientName: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  statusLabel: string;
  rag: string | null;
  update: string;
  risks: string;
  nextSteps: string;
  movedTeam: boolean;
};
export type MeetingActionData = {
  id: string | null;
  title: string;
  assigneeStaffId: string;
  assigneeName?: string;
  dueDate: string; // ISO yyyy-mm-dd hoặc ""
  status: "OPEN" | "DONE";
  rowId: string | null;
};
export type MeetingFormData = {
  teamId: string;
  teamCode: string;
  weekKey: string;
  meetingId: string | null;
  finalized: boolean;
  note: string;
  rawMinutes: string | null;
  rows: MeetingRowData[];
  actions: MeetingActionData[];
  clientOptions: { id: string; code: string; name: string }[];
  staffOptions: { value: string; label: string }[];
  canWrite: boolean;
  canAi: boolean;
};

type RowState = MeetingRowData & { key: string; deleted: boolean };
type ActionState = MeetingActionData & { key: string; deleted: boolean; rowKey: string | null };

const ERR_KEY: Record<string, string> = {
  BAD_PAYLOAD: "errBadPayload",
  NOT_FOUND: "errNotFound",
  NO_ACCESS: "errNoAccess",
  BAD_WEEK: "errBadWeek",
  FINALIZED: "errFinalized",
  DUP_ROW: "errDupRow",
};

const input = "h-8 w-full rounded-md border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const area = "w-full rounded-md border border-border-strong bg-surface px-2 py-1 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const RAG_CLS: Record<string, string> = { GREEN: "bg-success-bg text-success", YELLOW: "bg-warning-bg text-warning", RED: "bg-danger-bg text-danger" };

let seq = 0;
const nextKey = () => `k${++seq}`;

/**
 * Form biên bản tuần: dòng theo dự án (gộp theo khách) + việc tuần này + ghi chú. Toàn bộ trạng thái ở React,
 * gửi lên dạng MỘT payload JSON (khuôn sectionsJson của builder CO/CE). ⚠ `onReset` chặn requestFormReset của
 * React 19 (HANDOVER 10.37) — select RAG / SearchableSelect / DateField sẽ mất giá trị sau action lỗi nếu không.
 * Trang remount form theo `key` (updatedAt) sau khi lưu thành công nên state luôn khớp DB.
 */
export function MeetingForm({ data }: { data: MeetingFormData }) {
  const t = useTranslations("meetings");
  const [state, formAction, pending] = useActionState<MeetingFormState, FormData>(saveMeeting, {});
  const [note, setNote] = useState(data.note);
  const [rows, setRows] = useState<RowState[]>(() => data.rows.map((r) => ({ ...r, key: r.id ?? `p:${r.projectId}`, deleted: false })));
  const [actions, setActions] = useState<ActionState[]>(() =>
    data.actions.map((a) => ({ ...a, key: a.id ?? nextKey(), deleted: false, rowKey: a.rowId })),
  );
  const [pickClient, setPickClient] = useState("");
  const [rawMinutes, setRawMinutes] = useState<string | null>(data.rawMinutes);
  const readOnly = !data.canWrite || data.finalized;
  // useActionState của AI + gói họp nằm ở ĐÂY (không ở panel): áp kết quả AI là setState của CHÍNH
  // component này, nên mẫu "điều chỉnh state lúc render" mới hợp lệ (xem ghi chú trong import-minutes-panel).
  const [aiState, aiAction, aiPending] = useActionState<MinutesParseState, FormData>(parseMinutesWithAi, {});
  const [packState, packAction, packPending] = useActionState<PackState, FormData>(buildWeeklyPack, {});
  // ⚠ CHỐT THEO CHÍNH `parsed`, KHÔNG theo identity của `aiState`. Chốt theo aiState thì lần render ĐẦU
  // (kể cả render phía server, lúc chưa ai bấm AI) đã khác `null` ⇒ setState ngay trong thân render ⇒
  // "Too many re-renders" và trang trả 500. Với `parsed`: chưa chạy AI thì undefined, không setState lần nào.
  const [appliedParsed, setAppliedParsed] = useState<ParsedMinutes | null>(null);
  if (aiState.parsed && aiState.parsed !== appliedParsed) {
    setAppliedParsed(aiState.parsed);
    applyParsed(aiState.parsed);
  }

  const liveRows = rows.filter((r) => !r.deleted);
  const liveActions = actions.filter((a) => !a.deleted);
  const usedClientIds = new Set(liveRows.filter((r) => !r.projectId).map((r) => r.clientId));
  const clientChoices = data.clientOptions.filter((c) => !usedClientIds.has(c.id)).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }));

  // Nhóm theo khách để render tiêu đề nhóm (rows đã được server sắp theo mã khách). Không useMemo:
  // liveRows dựng mới mỗi lần render nên memo không giữ được (React Compiler tự lo phần tối ưu).
  const groups: { clientId: string; clientCode: string; clientName: string; rows: RowState[] }[] = [];
  for (const r of liveRows) {
    const g = groups[groups.length - 1];
    if (g && g.clientId === r.clientId) g.rows.push(r);
    else groups.push({ clientId: r.clientId, clientCode: r.clientCode, clientName: r.clientName, rows: [r] });
  }

  const setRow = (key: string, patch: Partial<RowState>) => setRows((s) => s.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setAct = (key: string, patch: Partial<ActionState>) => setActions((s) => s.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const addClientRow = () => {
    const c = data.clientOptions.find((x) => x.id === pickClient);
    if (!c) return;
    setRows((s) => [...s, { key: nextKey(), id: null, clientId: c.id, clientCode: c.code, clientName: c.name, projectId: null, projectCode: null, projectName: null, statusLabel: "", rag: null, update: "", risks: "", nextSteps: "", movedTeam: false, deleted: false }]);
    setPickClient("");
  };
  const addAction = () => setActions((s) => [...s, { key: nextKey(), id: null, title: "", assigneeStaffId: "", dueDate: "", status: "OPEN", rowId: null, deleted: false, rowKey: null }]);

  /**
   * Áp kết quả AI vào state form: dòng KHỚP dự án/khách đã có thì ghi đè RAG + 3 ô văn bản (chỉ khi AI có
   * nội dung — không xoá thứ người dùng đã gõ); dòng chưa có thì thêm mới. Việc AI đọc được thêm vào cuối.
   * KHÔNG tự lưu: mọi thứ vẫn phải qua nút Lưu như thao tác tay (mirror parseCvWithAi).
   */
  function applyParsed(pr: ParsedMinutes) {
    setRawMinutes(pr.rawMinutes);
    setRows((cur) => {
      const next = [...cur];
      for (const r of pr.rows) {
        const i = next.findIndex((x) => !x.deleted && (r.projectId ? x.projectId === r.projectId : !x.projectId && x.clientId === r.clientId));
        if (i >= 0) {
          next[i] = {
            ...next[i],
            rag: r.rag ?? next[i].rag,
            update: r.update || next[i].update,
            risks: r.risks || next[i].risks,
            nextSteps: r.nextSteps || next[i].nextSteps,
          };
        } else {
          const c = data.clientOptions.find((x) => x.id === r.clientId);
          next.push({
            key: nextKey(),
            id: null,
            clientId: r.clientId,
            clientCode: c?.code ?? "",
            clientName: c?.name ?? "",
            projectId: r.projectId,
            projectCode: null,
            projectName: null,
            statusLabel: "",
            rag: r.rag,
            update: r.update,
            risks: r.risks,
            nextSteps: r.nextSteps,
            movedTeam: false,
            deleted: false,
          });
        }
      }
      return next;
    });
    setActions((cur) => [
      ...cur,
      ...pr.actions.map((a) => ({
        key: nextKey(),
        id: null,
        title: a.title,
        assigneeStaffId: a.assigneeStaffId ?? "",
        dueDate: a.dueDate ?? "",
        status: "OPEN" as const,
        rowId: null,
        deleted: false,
        rowKey: null,
      })),
    ]);
    if (pr.generalNote) setNote((n) => (n ? n + "\n" + pr.generalNote : pr.generalNote));
  }

  /** Dựng payload lúc submit — hạn đọc từ DateField (input ẩn theo tên `due_<key>`). */
  function buildPayload(fd: FormData): MeetingSavePayload {
    const rowIndexByKey = new Map<string, number>();
    liveRows.forEach((r, i) => rowIndexByKey.set(r.key, i));
    return {
      teamId: data.teamId,
      weekKey: data.weekKey,
      note,
      rows: liveRows.map((r) => ({ id: r.id, clientId: r.clientId, projectId: r.projectId, rag: (r.rag as MeetingSavePayload["rows"][number]["rag"]) ?? null, update: r.update, risks: r.risks, nextSteps: r.nextSteps })),
      deleteRowIds: rows.filter((r) => r.deleted && r.id).map((r) => r.id!),
      actions: liveActions
        .filter((a) => a.title.trim())
        .map((a) => {
          const due = String(fd.get(`due_${a.key}`) ?? "").trim();
          return { id: a.id, title: a.title, assigneeStaffId: a.assigneeStaffId || null, dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null, status: a.status, rowIndex: a.rowKey != null && rowIndexByKey.has(a.rowKey) ? rowIndexByKey.get(a.rowKey)! : null };
        }),
      deleteActionIds: actions.filter((a) => a.deleted && a.id).map((a) => a.id!),
      rawMinutes,
    };
  }

  const rowLabel = (r: RowState) => (r.projectCode ? `${r.projectCode} — ${r.projectName}` : `${r.clientCode} — ${r.clientName}`);

  return (
    <div className="space-y-4">
      {/* ⚠ Panel NẰM NGOÀI <form> — HTML cấm form lồng form. */}
      <ImportMinutesPanel
        teamId={data.teamId}
        weekKey={data.weekKey}
        canWrite={!readOnly}
        canAi={data.canAi}
        aiState={aiState}
        aiAction={aiAction}
        aiPending={aiPending}
        packState={packState}
        packAction={packAction}
        packPending={packPending}
      />

      <form
        action={(fd) => {
          fd.set("payload", JSON.stringify(buildPayload(fd)));
          formAction(fd);
        }}
        onReset={(e) => e.preventDefault()}
        className="space-y-4"
      >
      {/* ── Dòng theo dự án, gộp theo khách ── */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("rowsTitle")}</h2>
          <span className="text-xs text-muted-foreground">{t("projectsRunning", { n: liveRows.filter((r) => r.projectId).length })}</span>
        </div>
        {readOnly && <p className="mb-2 text-xs text-muted-foreground">{data.finalized ? t("finalizedLocked") : t("readOnlyHint")}</p>}
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[960px] text-xs">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-muted-foreground">
                <th className="w-[240px] py-1.5 pr-2">{t("colProject")}</th>
                <th className="w-[110px] py-1.5 pr-2">{t("colRag")}</th>
                <th className="py-1.5 pr-2">{t("colUpdate")}</th>
                <th className="w-[22%] py-1.5 pr-2">{t("colRisks")}</th>
                <th className="w-[22%] py-1.5 pr-2">{t("colNext")}</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">{t("noRows")}</td></tr>
              )}
              {groups.map((g) => (
                <GroupRows key={g.clientId} g={g} readOnly={readOnly} setRow={setRow} setRows={setRows} t={t} rowLabel={rowLabel} />
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="w-72">
              <SearchableSelect options={clientChoices} value={pickClient} onChange={setPickClient} placeholder={t("pickClient")} allowClear />
            </div>
            <button type="button" onClick={addClientRow} disabled={!pickClient} className="inline-flex h-8 items-center gap-1 rounded-md border border-border-strong px-2 text-xs hover:bg-surface-2 disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> {t("addClientRow")}
            </button>
          </div>
        )}
      </section>

      {/* ── Việc tuần này ── */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("actionsTitle")}</h2>
          {!readOnly && (
            <button type="button" onClick={addAction} className="inline-flex h-8 items-center gap-1 rounded-md border border-border-strong px-2 text-xs hover:bg-surface-2">
              <Plus className="h-3.5 w-3.5" /> {t("addAction")}
            </button>
          )}
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">{t("actionsHint")}</p>
        {liveActions.some((a) => a.title.trim() && !a.assigneeStaffId) && (
          <p className="mb-2 text-[11px] font-medium text-warning">
            {t("unassignedCount", { n: liveActions.filter((a) => a.title.trim() && !a.assigneeStaffId).length })}
          </p>
        )}
        {liveActions.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
        <div className="space-y-2">
          {liveActions.map((a) => (
            <div key={a.key} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_220px_130px_200px_70px_28px] sm:items-center">
              <input value={a.title} onChange={(e) => setAct(a.key, { title: e.target.value })} placeholder={t("actionTitle")} maxLength={300} disabled={readOnly} className={input} />
              {/* Bỏ trống được: việc chưa chốt ai làm vẫn lưu và vẫn mang sang tuần sau, chỉ là chưa báo cho ai. */}
              <SearchableSelect options={data.staffOptions} value={a.assigneeStaffId} onChange={(v) => setAct(a.key, { assigneeStaffId: v })} placeholder={t("assigneeOptional")} disabled={readOnly} allowClear className="text-xs" />
              <DateField name={`due_${a.key}`} defaultValue={a.dueDate || null} disabled={readOnly} className={input} aria-label={t("dueDate")} />
              <select value={a.rowKey ?? ""} onChange={(e) => setAct(a.key, { rowKey: e.target.value || null })} disabled={readOnly} className={input} aria-label={t("linkRow")}>
                <option value="">{t("noRow")}</option>
                {liveRows.map((r) => (
                  <option key={r.key} value={r.key}>{rowLabel(r)}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={a.status === "DONE"} onChange={(e) => setAct(a.key, { status: e.target.checked ? "DONE" : "OPEN" })} disabled={readOnly} className="h-3.5 w-3.5 rounded border-border-strong" />
                {t("done")}
              </label>
              {!readOnly && (
                <button type="button" onClick={() => setAct(a.key, { deleted: true })} className="text-muted-foreground hover:text-danger" aria-label={t("removeAction")} title={t("removeAction")}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Ghi chú + Lưu ── */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("noteLabel")}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} disabled={readOnly} placeholder={t("notePlaceholder")} className={area} />
        </label>
        {!readOnly && (
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={pending} className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {pending ? "..." : t("save")}
            </button>
            {state.error && <span className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</span>}
            {state.success && <span className="text-xs text-success">{t("saved")}</span>}
          </div>
        )}
      </section>
      </form>
    </div>
  );
}

function GroupRows({
  g,
  readOnly,
  setRow,
  setRows,
  t,
  rowLabel,
}: {
  g: { clientId: string; clientCode: string; clientName: string; rows: RowState[] };
  readOnly: boolean;
  setRow: (key: string, patch: Partial<RowState>) => void;
  setRows: React.Dispatch<React.SetStateAction<RowState[]>>;
  t: ReturnType<typeof useTranslations<"meetings">>;
  rowLabel: (r: RowState) => string;
}) {
  return (
    <>
      <tr className="bg-surface-2/60">
        <td colSpan={6} className="py-1 pr-2 text-[11px] font-semibold text-foreground">
          {g.clientCode} — {g.clientName}
        </td>
      </tr>
      {g.rows.map((r) => (
        <tr key={r.key} className="border-b border-border align-top">
          <td className="py-1.5 pr-2">
            {r.projectCode ? (
              <>
                <span className="font-mono font-medium text-foreground">{r.projectCode}</span>
                <span className="block text-muted-foreground">{r.projectName}</span>
                {r.statusLabel && <span className="text-[10px] text-muted-foreground">{r.statusLabel}</span>}
              </>
            ) : (
              <span className="italic text-muted-foreground">{t("clientOnlyRow")}</span>
            )}
            {r.movedTeam && <span className="ml-1 rounded bg-warning-bg px-1 text-[10px] text-warning">{t("movedTeam")}</span>}
            {!r.id && r.projectId && <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] text-muted-foreground">{t("draftRow")}</span>}
          </td>
          <td className="py-1.5 pr-2">
            <select value={r.rag ?? ""} onChange={(e) => setRow(r.key, { rag: e.target.value || null })} disabled={readOnly} className={input + " " + (r.rag ? RAG_CLS[r.rag] : "")} aria-label={rowLabel(r)}>
              <option value="">{t("ragNone")}</option>
              {RAG_CODES.map((c) => (
                <option key={c} value={c}>{t(`rag${c}`)}</option>
              ))}
            </select>
          </td>
          <td className="py-1.5 pr-2"><textarea value={r.update} onChange={(e) => setRow(r.key, { update: e.target.value })} rows={2} maxLength={4000} disabled={readOnly} className={area} /></td>
          <td className="py-1.5 pr-2"><textarea value={r.risks} onChange={(e) => setRow(r.key, { risks: e.target.value })} rows={2} maxLength={2000} disabled={readOnly} className={area} /></td>
          <td className="py-1.5 pr-2"><textarea value={r.nextSteps} onChange={(e) => setRow(r.key, { nextSteps: e.target.value })} rows={2} maxLength={2000} disabled={readOnly} className={area} /></td>
          <td className="py-1.5">
            {!readOnly && (r.id || !r.projectId) && (
              <button type="button" onClick={() => setRows((s) => s.map((x) => (x.key === r.key ? { ...x, deleted: true } : x)))} className="text-muted-foreground hover:text-danger" aria-label={t("removeRow")} title={t("removeRow")}>
                <X className="h-4 w-4" />
              </button>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
