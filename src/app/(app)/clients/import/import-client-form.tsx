"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { importClientsFromExcel, type ImportState } from "./actions";

const STATUS_LABEL_KEY: Record<string, string> = {
  BIDDING: "statusBidding",
  PROCESSING: "statusProcessing",
  LIQUIDATION: "statusLiquidation",
};

export function ImportClientForm() {
  const t = useTranslations("clients.import");
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importClientsFromExcel, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("uploadTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("uploadDesc")}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            aria-label={t("fileLabel")}
            className="text-sm file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-surface-2 file:px-4 file:text-sm file:font-medium sm:file:h-9"
          />
          <button
            type="submit"
            name="mode"
            value="preview"
            disabled={pending}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground hover:bg-surface-2 disabled:opacity-50 sm:h-9"
          >
            <Upload className="h-4 w-4" />
            {pending ? t("working") : t("previewButton")}
          </button>
        </div>
      </div>

      {state.fatalError && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{t("fatalErrorTitle")}</p>
            <p className="mt-0.5 text-xs">{state.fatalError}</p>
          </div>
        </div>
      )}
      {state.error && <p className="text-xs text-danger">{t(`err${state.error}` as Parameters<typeof t>[0])}</p>}

      {state.result && (
        <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success-bg p-4 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{t("doneTitle")}</p>
            <p className="mt-0.5 text-xs">
              {t("doneSummary", {
                created: state.result.clientsCreated,
                updated: state.result.clientsUpdated,
                contacts: state.result.contactsCreated,
                projects: state.result.projectsCreated,
                notes: state.result.careNotesCreated,
              })}
            </p>
          </div>
        </div>
      )}

      {state.preview && !state.result && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-foreground">
              {t("previewSummary", {
                clients: state.preview.clients.length,
                projects: state.preview.totalProjects,
                existing: state.preview.existingCodeCount,
                unassigned: state.preview.teamUnassignedCount,
              })}
            </p>
            {state.preview.warnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-warning/30 bg-warning-bg p-3">
                <p className="text-xs font-semibold text-warning">{t("warningsTitle")}</p>
                <ul className="mt-1 space-y-0.5">
                  {state.preview.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-warning">
                      {t("warningLine", { line: w.line, message: w.message })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="submit"
              name="mode"
              value="confirm"
              disabled={pending}
              className="mt-3 inline-flex h-10 items-center rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? t("working") : t("confirmButton", { count: state.preview.clients.length })}
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-surface-2 text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t("colCode")}</th>
                    <th className="px-3 py-2">{t("colClient")}</th>
                    <th className="px-3 py-2">{t("colTeam")}</th>
                    <th className="px-3 py-2">{t("colPic1")}</th>
                    <th className="px-3 py-2">{t("colProjects")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {state.preview.clients.map((c) => (
                    <tr key={c.sourceLine} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{c.code}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{c.name}</p>
                        {c.legalNameVi && <p className="text-xs text-muted-foreground">{c.legalNameVi}</p>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{c.teamCode ?? t("teamUnassignedShort")}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {c.pic1 ? (
                          <>
                            <p>{c.pic1.name}</p>
                            {c.pic1.email && <p>{c.pic1.email}</p>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {c.projects.length === 0
                          ? "—"
                          : c.projects.map((p) => `${p.name} (${t(STATUS_LABEL_KEY[p.statusCode])})`).join("; ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
