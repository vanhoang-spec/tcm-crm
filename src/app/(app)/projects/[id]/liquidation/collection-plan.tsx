"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { NumberField } from "@/components/ui/number-field";
import { formatNumber, formatDate } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { saveCollectionMilestone, deleteCollectionMilestone, type MilestoneFormState } from "../../actions";

/**
 * Kế hoạch thu theo đợt (C5) — đợt định nghĩa bằng % trên tổng thanh toán, số tiền tính ĐỘNG
 * theo bảng CO/CE sống (server tính, truyền xuống đây chỉ để hiển thị). "Đã xuất" = Σ hóa đơn
 * chưa huỷ gắn vào đợt. Xoá chỉ được khi đợt chưa có hóa đơn.
 */
export type MilestoneRow = {
  id: string;
  name: string;
  pct: number;
  dueDate: string | null; // ISO yyyy-mm-dd
  planAmount: number;
  invoicedAmount: number;
};

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function DeleteMilestoneButton({ id }: { id: string }) {
  const t = useTranslations("projects.liquidation");
  const [state, formAction, pending] = useActionState<MilestoneFormState, FormData>(
    deleteCollectionMilestone.bind(null, id),
    {},
  );
  return (
    <form action={formAction} className="inline">
      <button type="submit" disabled={pending} title={t("msDelete")} className="rounded p-1 text-danger hover:bg-danger-bg disabled:opacity-50">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {state.error && <p className="text-[10px] text-danger">{state.error}</p>}
    </form>
  );
}

export function CollectionPlanPanel({
  projectId,
  rows,
  canManage,
}: {
  projectId: string;
  rows: MilestoneRow[];
  canManage: boolean;
}) {
  const t = useTranslations("projects.liquidation");
  const locale = useLocale() as Locale;
  const [adding, setAdding] = useState(false);
  const [state, formAction, pending] = useActionState<MilestoneFormState, FormData>(
    saveCollectionMilestone.bind(null, projectId),
    {},
  );

  const totalPct = rows.reduce((s, r) => s + r.pct, 0);

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t("msTitle")}</h3>
        <span className={`text-xs ${totalPct > 100 ? "font-semibold text-danger" : "text-muted-foreground"}`}>
          {t("msTotalPct", { pct: Math.round(totalPct * 100) / 100 })}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("msHint")}</p>

      {rows.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="bg-surface-2 text-left text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">{t("msName")}</th>
                <th className="px-2 py-1.5 text-right font-medium">%</th>
                <th className="px-2 py-1.5 font-medium">{t("msDue")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("msPlan")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("msInvoiced")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("msRemaining")}</th>
                {canManage && <th className="px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const remaining = r.planAmount - r.invoicedAmount;
                return (
                  <tr key={r.id}>
                    <td className="px-2 py-1.5 font-medium text-foreground">{r.name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.pct}%</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.dueDate ? formatDate(new Date(r.dueDate)) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.planAmount, locale)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-success">{formatNumber(r.invoicedAmount, locale)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${remaining < 0 ? "text-danger" : ""}`}>{formatNumber(remaining, locale)}</td>
                    {canManage && (
                      <td className="px-2 py-1.5 text-right">
                        <DeleteMilestoneButton id={r.id} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage &&
        (adding ? (
          <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-muted-foreground">
              {t("msName")}
              <input name="name" required placeholder={t("msNamePlaceholder")} className={input + " w-52"} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              %
              <NumberField name="pct" decimals={2} className={input + " w-20"} />
            </label>
            <label className="text-[11px] text-muted-foreground">
              {t("msDue")}
              <DateField name="dueDate" className={input + " w-36"} />
            </label>
            <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              {t("msAdd")}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="h-9 rounded-lg border border-border-strong px-3 text-xs">
              {t("msCancel")}
            </button>
            {state.error && (
              <p className="w-full text-xs text-danger" role="alert">
                {state.error}
              </p>
            )}
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-2">
            <Plus className="h-3.5 w-3.5" /> {t("msAdd")}
          </button>
        ))}
    </div>
  );
}
