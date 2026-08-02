"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Paperclip, Link2, Ban, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { pickLabel } from "@/lib/utils";
import { isoDocDef } from "@/lib/iso-catalog";
import type { IsoDocState } from "@/lib/iso-report";
import type { Locale } from "@/i18n/locales";
import { attachIsoDoc, markIsoDocNotApplicable, clearIsoDoc, type IsoFormState } from "./actions";

type ProjectFileOption = { id: string; fileName: string };

export function IsoTable({
  projectId,
  states,
  files,
  canManage,
}: {
  projectId: string;
  states: IsoDocState[];
  files: ProjectFileOption[];
  canManage: boolean;
}) {
  const t = useTranslations("projects.iso");
  const locale = useLocale() as Locale;
  const [openCode, setOpenCode] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium w-14">#</th>
            <th className="px-3 py-2 text-left font-medium">{t("colDoc")}</th>
            <th className="px-3 py-2 text-left font-medium w-32">{t("colStatus")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("colEvidence")}</th>
            {canManage && <th className="px-3 py-2 text-left font-medium w-56">{t("colAction")}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {states.map((s, i) => {
            const def = isoDocDef(s.code);
            if (!def) return null;
            const label = pickLabel({ labelVi: def.labelVi, labelEn: def.labelEn }, locale);
            const hint = def.hintVi ? pickLabel({ labelVi: def.hintVi, labelEn: def.hintEn ?? def.hintVi }, locale) : null;
            return (
              <IsoRow
                key={s.code}
                index={i + 1}
                projectId={projectId}
                state={s}
                label={label}
                hint={hint}
                optional={def.optional === true}
                files={files}
                canManage={canManage}
                open={openCode === s.code}
                onToggle={() => setOpenCode(openCode === s.code ? null : s.code)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IsoRow({
  index,
  projectId,
  state,
  label,
  hint,
  optional,
  files,
  canManage,
  open,
  onToggle,
}: {
  index: number;
  projectId: string;
  state: IsoDocState;
  label: string;
  hint: string | null;
  optional: boolean;
  files: ProjectFileOption[];
  canManage: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("projects.iso");
  const [mode, setMode] = useState<"attach" | "na">("attach");

  const attachAction = attachIsoDoc.bind(null, projectId, state.code);
  const [attachState, attachFormAction, attachPending] = useActionState<IsoFormState, FormData>(attachAction, {});
  const naAction = markIsoDocNotApplicable.bind(null, projectId, state.code);
  const [naState, naFormAction, naPending] = useActionState<IsoFormState, FormData>(naAction, {});

  const tone = state.status === "PRESENT" ? "success" : state.status === "NA" ? "neutral" : optional ? "warning" : "danger";
  const statusLabel =
    state.status === "PRESENT" ? t("statusPresent") : state.status === "NA" ? t("statusNa") : t("statusMissing");

  const errText = (code?: string) =>
    code === "NEED_EVIDENCE"
      ? t("errNeedEvidence")
      : code === "NEED_REASON"
        ? t("errNeedReason")
        : code === "FILE_REJECTED"
          ? t("errFileRejected")
          : code
            ? t("errGeneric")
            : null;

  return (
    <>
      <tr className={open ? "bg-surface-2/50" : undefined}>
        <td className="px-3 py-2 text-muted-foreground tabular-nums">{index}</td>
        <td className="px-3 py-2">
          <span className="font-medium text-foreground">{label}</span>
          {optional && <span className="ml-1.5 text-[11px] text-muted-foreground">({t("optional")})</span>}
          {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </td>
        <td className="px-3 py-2">
          <Badge tone={tone}>{statusLabel}</Badge>
        </td>
        <td className="px-3 py-2 text-muted-foreground">
          {state.evidenceVi ? (
            <div className="flex flex-col items-start gap-0.5">
              {state.projectFileId ? (
                <a href={`/api/project-file/${state.projectFileId}`} className="text-brand-600 hover:underline">
                  {state.evidenceVi}
                </a>
              ) : state.linkUrl ? (
                <a href={state.linkUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                  {state.evidenceVi}
                </a>
              ) : (
                <span>{state.evidenceVi}</span>
              )}
              <span className="text-[11px] text-muted-foreground">
                {state.source === "AUTO" ? t("sourceAuto") : t("sourceManual")}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
        </td>
        {canManage && (
          <td className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onToggle}
                className="h-7 rounded-md border border-border-strong px-2 text-[11px] text-foreground hover:bg-surface-2"
              >
                {open ? t("close") : t("attach")}
              </button>
              {state.source === "MANUAL" && (
                <form action={clearIsoDoc.bind(null, projectId, state.code)}>
                  <button type="submit" className="h-7 rounded-md px-2 text-[11px] text-muted-foreground hover:underline">
                    {t("clear")}
                  </button>
                </form>
              )}
            </div>
          </td>
        )}
      </tr>

      {open && canManage && (
        <tr>
          <td colSpan={5} className="bg-surface-2/50 px-3 pb-4 pt-1">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode("attach")}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${mode === "attach" ? "bg-brand-600 text-white" : "border border-border-strong text-foreground"}`}
              >
                <Paperclip className="h-3 w-3" />
                {t("modeAttach")}
              </button>
              <button
                type="button"
                onClick={() => setMode("na")}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${mode === "na" ? "bg-brand-600 text-white" : "border border-border-strong text-foreground"}`}
              >
                <Ban className="h-3 w-3" />
                {t("modeNa")}
              </button>
              <button type="button" onClick={onToggle} className="ml-auto text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {mode === "attach" ? (
              <form action={attachFormAction} className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-muted-foreground">
                  {t("uploadLabel")}
                  <input type="file" name="files" className="mt-1 block w-full text-xs" />
                </label>
                {files.length > 0 && (
                  <label className="text-[11px] text-muted-foreground">
                    {t("pickExisting")}
                    <select name="projectFileId" defaultValue="" className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm">
                      <option value="">—</option>
                      {files.map((f) => (
                        <option key={f.id} value={f.id}>{f.fileName}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="text-[11px] text-muted-foreground sm:col-span-2">
                  <span className="inline-flex items-center gap-1">
                    <Link2 className="h-3 w-3" />
                    {t("orLink")}
                  </span>
                  <input
                    name="linkUrl"
                    defaultValue={state.linkUrl ?? ""}
                    placeholder={t("linkPlaceholder")}
                    className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm"
                  />
                </label>
                <label className="text-[11px] text-muted-foreground sm:col-span-2">
                  {t("noteLabel")}
                  <input
                    name="note"
                    defaultValue={state.note ?? ""}
                    className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={attachPending}
                    className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {attachPending ? "..." : t("save")}
                  </button>
                  {errText(attachState.error) && <span className="ml-2 text-[11px] text-danger">{errText(attachState.error)}</span>}
                </div>
              </form>
            ) : (
              <form action={naFormAction} className="grid gap-2">
                <label className="text-[11px] text-muted-foreground">
                  {t("naReasonLabel")}
                  <input
                    name="naReason"
                    defaultValue={state.naReason ?? ""}
                    placeholder={t("naReasonPlaceholder")}
                    className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm"
                  />
                </label>
                <div>
                  <button
                    type="submit"
                    disabled={naPending}
                    className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {naPending ? "..." : t("save")}
                  </button>
                  {errText(naState.error) && <span className="ml-2 text-[11px] text-danger">{errText(naState.error)}</span>}
                </div>
              </form>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
