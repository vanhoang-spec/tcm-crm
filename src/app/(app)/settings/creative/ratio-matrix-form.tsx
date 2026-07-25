"use client";

import { useActionState } from "react";
import { NumberField } from "@/components/ui/number-field";
import { useTranslations } from "next-intl";
import { saveRatioMatrix, type CreativeSettingsState } from "./actions";

export function RatioMatrixForm({
  periodCode,
  positions,
  taskTypes,
  ratioByKey,
}: {
  periodCode: string;
  positions: string[];
  taskTypes: { id: string; label: string }[];
  ratioByKey: Record<string, number>;
}) {
  const action = saveRatioMatrix.bind(null, periodCode);
  const [state, formAction, pending] = useActionState<CreativeSettingsState, FormData>(action, {});
  const t = useTranslations("settings.creative");

  return (
    <form action={formAction} className="space-y-3">
      <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-muted-foreground">
              <th className="py-1.5 pr-2">{t("matrixPosition")}</th>
              {taskTypes.map((tt) => (
                <th key={tt.id} className="py-1.5 pr-2 text-center">{tt.label}</th>
              ))}
              <th className="py-1.5 pr-2 text-center">{t("matrixSum")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {positions.map((title, i) => (
              <tr key={title}>
                <td className="py-1.5 pr-2 font-medium text-foreground">
                  {title}
                  <input type="hidden" name={`position_${i}`} value={title} />
                </td>
                {taskTypes.map((tt) => (
                  <td key={tt.id} className="py-1.5 pr-2">
                    <NumberField decimals={2}
                      name={`ratio_${i}_${tt.id}`}
                      defaultValue={ratioByKey[`${title}|${tt.id}`] ?? 0}
                      className="h-8 w-16 rounded-lg border border-border-strong bg-surface px-1.5 text-center text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </td>
                ))}
                <RowSum title={title} taskTypes={taskTypes} ratioByKey={ratioByKey} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
          {t("save")}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

// Hiện tổng % ban đầu (từ dữ liệu đã lưu) — chỉ mang tính tham khảo lúc render, KHÔNG realtime theo input
// (form không dùng React state cho các ô — giữ đơn giản, submit lại để thấy cảnh báo RATIO_SUM_NOT_100 ở trang report).
function RowSum({ title, taskTypes, ratioByKey }: { title: string; taskTypes: { id: string; label: string }[]; ratioByKey: Record<string, number> }) {
  const sum = taskTypes.reduce((s, tt) => s + (ratioByKey[`${title}|${tt.id}`] ?? 0), 0);
  return <td className={`py-1.5 pr-2 text-center font-medium ${Math.round(sum) === 100 ? "text-success" : "text-warning"}`}>{sum}%</td>;
}
