"use client";

// CE-4 — khối "Khách trả file về": chọn file, xem thay đổi khách đã sửa, rồi tự áp vào bảng.
// Chỉ TRÌNH BÀY; mọi con số do server tính (`matchSavedImport`), mọi thay đổi chỉ thành thật khi
// Account bấm Lưu ở builder phía trên.

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Upload, ArrowUpRight, ArrowDownRight, Trash2, HelpCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn, formatNumber } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { importClientQuotation, type ImportFormState } from "./import-actions";

export type ImportChangeView = {
  stableKey: string;
  name: string;
  fileName: string;
  matchedBy: "key" | "name";
  beforeQty: number | null;
  beforePrice: number | null;
  beforeAmount: number;
  afterQty: number | null;
  afterPrice: number | null;
  afterAmount: number;
  direction: "up" | "down" | "same";
};

export type ImportResultView = {
  fileKey: string;
  changed: ImportChangeView[];
  /** Dòng khách thêm/không khớp được — Account tự quyết, hệ thống KHÔNG đoán. */
  unmatched: { name: string; amount: number | null; sheet: string; row: number }[];
  /** Dòng của bảng không còn trong file — khách đã xoá. */
  missing: { name: string; amount: number }[];
};

export function ImportPanel({
  projectId,
  result,
  canEdit,
}: {
  projectId: string;
  result: ImportResultView | null;
  canEdit: boolean;
}) {
  const t = useTranslations("projects.coce.import");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const action = importClientQuotation.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ImportFormState, FormData>(action, {});

  // Import xong → đưa khoá file lên URL để trang dựng bản nháp (server đọc lại và khớp).
  if (state.fileKey && (!result || result.fileKey !== state.fileKey)) {
    router.replace(`/projects/${projectId}/co-ce?import=${encodeURIComponent(state.fileKey)}`);
  }

  const money = (n: number | null) => (n == null ? "—" : formatNumber(n, locale));

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
      <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{t("desc")}</p>

      {canEdit && (
        <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="text-xs file:mr-2 file:rounded-lg file:border file:border-border-strong file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:font-medium"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {pending ? t("reading") : t("submit")}
          </button>
        </form>
      )}
      {state.error && <p className="mt-2 text-xs font-medium text-danger">{t(`error${state.error}` as "errorEMPTY")}</p>}

      {result && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="text-success">{t("countChanged", { n: result.changed.length })}</span>
            <span className="text-danger">{t("countMissing", { n: result.missing.length })}</span>
            <span className="text-warning">{t("countUnmatched", { n: result.unmatched.length })}</span>
          </div>

          {result.changed.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[680px] text-xs">
                <thead className="bg-surface-2 text-left text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5">{t("colLine")}</th>
                    <th className="px-2 py-1.5 text-right">{t("colBefore")}</th>
                    <th className="px-2 py-1.5 text-right">{t("colAfter")}</th>
                    <th className="px-2 py-1.5 text-right">{t("colDelta")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.changed.map((c) => {
                    const delta = c.afterAmount - c.beforeAmount;
                    return (
                      <tr key={c.stableKey}>
                        <td className="px-2 py-1.5">
                          <span className="font-medium text-foreground">{c.name}</span>
                          {/* Khách đổi tên dòng nhưng khoá ẩn vẫn khớp — nói rõ để người rà không hoang mang. */}
                          {c.fileName !== c.name && <span className="ml-1 text-[11px] text-muted-foreground">{t("renamedTo", { name: c.fileName })}</span>}
                          {c.matchedBy === "name" && <span className="ml-1 text-[11px] text-warning">{t("matchedByName")}</span>}
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {t("qtyPrice", { qty: money(c.beforeQty), price: money(c.beforePrice) })} → {t("qtyPrice", { qty: money(c.afterQty), price: money(c.afterPrice) })}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{money(c.beforeAmount)}</td>
                        <td className={cn("px-2 py-1.5 text-right font-semibold tabular-nums", c.direction === "up" ? "text-success" : "text-warning")}>{money(c.afterAmount)}</td>
                        <td className={cn("px-2 py-1.5 text-right tabular-nums", delta > 0 ? "text-success" : "text-warning")}>
                          <span className="inline-flex items-center gap-1">
                            {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {money(Math.abs(delta))}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {result.missing.length > 0 && (
            <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-danger">
                <Trash2 className="h-3.5 w-3.5" />
                {t("missingTitle")}
              </p>
              <ul className="mt-1 space-y-0.5">
                {result.missing.map((x) => (
                  <li key={x.name} className="text-xs text-danger line-through">
                    {x.name} — {money(x.amount)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.unmatched.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                <HelpCircle className="h-3.5 w-3.5" />
                {t("unmatchedTitle")}
              </p>
              <ul className="mt-1 space-y-0.5">
                {result.unmatched.map((x, i) => (
                  <li key={`${x.sheet}-${x.row}-${i}`} className="text-xs text-warning">
                    {x.name} — {money(x.amount)} <span className="opacity-70">({x.sheet} · {t("rowNo", { n: x.row })})</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-warning/80">{t("unmatchedHint")}</p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">{t("applyHint")}</p>
        </div>
      )}
    </section>
  );
}
