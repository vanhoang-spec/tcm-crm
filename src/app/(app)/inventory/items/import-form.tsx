"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { importItemsCsv, type ImportFormState } from "./actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportFormState, FormData>(importItemsCsv, {});
  const t = useTranslations("inventory.items");

  // Message code từ parser/action → key i18n errXXX; fallback hiện raw code
  const msg = (code: string) => {
    try {
      return t(`err${code}` as Parameters<typeof t>[0]);
    } catch {
      return code;
    }
  };

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("importTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("importDesc")}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          aria-label={t("importFile")}
          className="text-sm file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-surface-2 file:px-4 file:text-sm file:font-medium sm:file:h-9"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9"
        >
          {pending ? "..." : t("importSubmit")}
        </button>
        <a
          href="/inventory/items/sample-csv"
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground hover:bg-surface-2 sm:h-9"
        >
          <Download className="h-4 w-4" />
          {t("downloadSample")}
        </a>
      </div>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      {state.success && (
        <p className="text-xs text-success">
          {t("importSuccess", { items: state.importedItems ?? 0, products: state.importedProducts ?? 0, docs: state.importedDocs ?? 0 })}
        </p>
      )}
      {state.rowErrors && state.rowErrors.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg p-3">
          <p className="text-xs font-semibold text-danger">{t("importErrorsTitle")}</p>
          <ul className="mt-1 space-y-0.5">
            {state.rowErrors.map((e, i) => (
              <li key={i} className="text-xs text-danger">
                {t("errLine", { line: e.line, message: msg(e.message) })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
