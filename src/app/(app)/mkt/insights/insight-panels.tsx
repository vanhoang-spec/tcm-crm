"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { AiResult } from "@/app/(app)/ai/ai-shared";
import { MKT_FILE_CHANNELS, MKT_INSIGHT_MIME_TYPES } from "@/lib/mkt";
import {
  createInsightReport,
  updateInsightNote,
  uploadInsightFiles,
  deleteInsightFile,
  deleteInsightReport,
  type MktState,
} from "../actions";
import { generateInsights } from "../ai-actions";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function useErr() {
  const t = useTranslations("mkt");
  return (code?: string) => (code ? t(`err${code}` as "errGeneric") : null);
}

export function CreateReportForm() {
  const t = useTranslations("mkt");
  const err = useErr();
  const [state, formAction, pending] = useActionState<MktState, FormData>(createInsightReport, {});
  const now = new Date();
  // Ô chữ controlled — bẫy requestFormReset (React 19) xoá trắng ô khi action trả lỗi.
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.success) {
      setNote("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Plus className="h-4 w-4" />
        {t("insightsNew")}
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-[11px] text-muted-foreground">
          {t("insightsYear")}
          <input name="year" type="number" defaultValue={now.getFullYear()} min={2020} max={2100} className={input} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          {t("insightsQuarter")}
          <select name="quarter" defaultValue={Math.floor(now.getMonth() / 3) + 1} className={input}>
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-[11px] text-muted-foreground">
        {t("insightsNote")}
        <textarea
          name="note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {pending ? "..." : t("create")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-border-strong px-3 text-sm hover:bg-surface-2">
          {t("cancel")}
        </button>
        {err(state.error) && <span className="text-xs text-danger">{err(state.error)}</span>}
      </div>
    </form>
  );
}

export type ReportFile = { id: string; fileName: string; channel: string; fileSize: number };

export function ReportPanel({
  report,
  canReview,
  canGenerate,
  aiConfigured,
}: {
  report: {
    id: string;
    year: number;
    quarter: number;
    note: string | null;
    aiResult: string | null;
    aiRanAt: Date | null;
    files: ReportFile[];
    statsText: string;
  };
  canReview: boolean;
  canGenerate: boolean;
  aiConfigured: boolean;
}) {
  const t = useTranslations("mkt");
  const err = useErr();
  const [noteState, noteAction, notePending] = useActionState<MktState, FormData>(updateInsightNote.bind(null, report.id), {});
  const [upState, upAction, upPending] = useActionState<MktState, FormData>(uploadInsightFiles.bind(null, report.id), {});
  const [genState, genAction, genPending] = useActionState<MktState, FormData>(generateInsights.bind(null, report.id), {});
  const [delState, delAction, delPending] = useActionState<MktState, FormData>(deleteInsightReport.bind(null, report.id), {});
  const [note, setNote] = useState(report.note ?? "");

  const rejected = upState.message?.split(" · ").filter(Boolean) ?? [];

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t("quarterLabel", { q: report.quarter, year: report.year })}</h3>
        {canReview && (
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!window.confirm(t("insightsDeleteReportConfirm"))) e.preventDefault();
            }}
          >
            <button
              type="submit"
              disabled={delPending}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-danger/40 px-2 text-[11px] text-danger hover:bg-danger-bg disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              {t("insightsDeleteReport")}
            </button>
            {err(delState.error) && <span className="ml-1 text-[11px] text-danger">{err(delState.error)}</span>}
          </form>
        )}
      </div>

      {/* Số app tự đếm — đặt cạnh kết quả AI để người đọc đối chiếu được ngay. */}
      <div className="mt-2 rounded-lg border border-border bg-surface-2 p-3">
        <p className="text-[11px] font-medium text-muted-foreground">{t("insightsStatsTitle")}</p>
        <pre className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">{report.statsText}</pre>
      </div>

      {/* Tệp export */}
      <div className="mt-3">
        <p className="text-[11px] font-medium text-muted-foreground">{t("insightsFiles")}</p>
        {report.files.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{t("insightsNoFiles")}</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {report.files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-xs text-foreground">
                <span className="rounded bg-surface-2 px-1.5 text-[10px] text-muted-foreground">{t(`channel${f.channel}` as "channelOTHER")}</span>
                <span className="min-w-0 truncate">{f.fileName}</span>
                <span className="text-[10px] text-muted-foreground">{Math.round(f.fileSize / 1024)} KB</span>
                {canReview && <DeleteFileButton reportId={report.id} fileId={f.id} />}
              </li>
            ))}
          </ul>
        )}

        {canReview && (
          <form action={upAction} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-muted-foreground">
              {t("insightsChannelOfFile")}
              <select name="channel" defaultValue="OTHER" className={input + " w-32"}>
                {MKT_FILE_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {t(`channel${c}` as "channelOTHER")}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 flex-1 text-[11px] text-muted-foreground">
              {t("insightsUpload")}
              <input
                type="file"
                name="files"
                multiple
                accept={MKT_INSIGHT_MIME_TYPES.join(",")}
                className="mt-1 block w-full text-xs text-muted-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
              />
            </label>
            <button
              type="submit"
              disabled={upPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs hover:bg-surface-2 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {upPending ? "..." : t("insightsUpload")}
            </button>
            {err(upState.error) && <span className="text-[11px] text-danger">{err(upState.error)}</span>}
          </form>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">{t("insightsFilesHint")}</p>
        {rejected.length > 0 && <p className="text-[11px] text-warning">{t("rejectedFiles", { names: rejected.join(", ") })}</p>}
      </div>

      {/* Ghi chú HR */}
      {canReview && (
        <form action={noteAction} className="mt-3 space-y-2">
          <label className="block text-[11px] text-muted-foreground">
            {t("insightsNote")}
            <textarea
              name="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={notePending} className="h-8 rounded-lg border border-border-strong px-3 text-xs hover:bg-surface-2 disabled:opacity-50">
              {notePending ? "..." : t("save")}
            </button>
            {noteState.success && <span className="text-[11px] text-success">{t("saved")}</span>}
            {err(noteState.error) && <span className="text-[11px] text-danger">{err(noteState.error)}</span>}
          </div>
        </form>
      )}

      {/* AI phân tích */}
      {canGenerate && (
        <div className="mt-3 border-t border-border pt-3">
          {!aiConfigured ? (
            <p className="rounded-lg border border-dashed border-border-strong p-2 text-[11px] text-muted-foreground">{t("aiNotConfigured")}</p>
          ) : (
            <form
              action={genAction}
              onSubmit={(e) => {
                if (!window.confirm(t("insightsRunConfirm"))) e.preventDefault();
              }}
            >
              <button
                type="submit"
                disabled={genPending}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-brand-400 px-3 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {genPending ? t("aiRunning") : t("insightsRun")}
              </button>
              {err(genState.error) && <span className="ml-2 text-[11px] text-danger">{err(genState.error)}</span>}
            </form>
          )}
        </div>
      )}

      {(report.aiResult || genState.aiError) && <AiResult text={report.aiResult ?? undefined} error={genState.aiError} />}
    </section>
  );
}

function DeleteFileButton({ reportId, fileId }: { reportId: string; fileId: string }) {
  const t = useTranslations("mkt");
  const [, formAction, pending] = useActionState<MktState, FormData>(deleteInsightFile.bind(null, reportId, fileId), {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(t("deleteFileConfirm"))) e.preventDefault();
      }}
    >
      <button type="submit" disabled={pending} title={t("deleteFile")} className="text-muted-foreground hover:text-danger disabled:opacity-50">
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
