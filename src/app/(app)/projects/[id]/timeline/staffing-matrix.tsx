"use client";

import { useTranslations } from "next-intl";
import { addStaffingCell, updateStaffingCell, removeStaffingCell } from "../../actions";

export type StaffingCell = { id: string; roleLabel: string; zoneLabel: string; headcount: number };

const input =
  "h-8 w-full rounded-lg border border-border-strong bg-surface px-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function StaffingMatrix({ projectId, cells }: { projectId: string; cells: StaffingCell[] }) {
  const t = useTranslations("projects.timeline");

  const roles = Array.from(new Set(cells.map((c) => c.roleLabel)));
  const zones = Array.from(new Set(cells.map((c) => c.zoneLabel)));
  const at = (r: string, z: string) => cells.find((c) => c.roleLabel === r && c.zoneLabel === z);
  const rowTotal = (r: string) => cells.filter((c) => c.roleLabel === r).reduce((a, c) => a + c.headcount, 0);
  const colTotal = (z: string) => cells.filter((c) => c.zoneLabel === z).reduce((a, c) => a + c.headcount, 0);
  const grand = cells.reduce((a, c) => a + c.headcount, 0);

  return (
    <div className="space-y-3">
      {cells.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("staffingEmpty")}</p>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-[420px] border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-muted-foreground">
                <th className="p-2">{t("staffingRole")}</th>
                {zones.map((z) => (
                  <th key={z} className="p-2 text-center">{z}</th>
                ))}
                <th className="p-2 text-center font-semibold">{t("staffingTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r} className="border-b border-border">
                  <td className="p-2 font-medium text-foreground">{r}</td>
                  {zones.map((z) => (
                    <td key={z} className="p-2 text-center text-muted-foreground">{at(r, z)?.headcount ?? ""}</td>
                  ))}
                  <td className="p-2 text-center font-semibold text-foreground">{rowTotal(r)}</td>
                </tr>
              ))}
              <tr>
                <td className="p-2 font-semibold text-foreground">{t("staffingTotal")}</td>
                {zones.map((z) => (
                  <td key={z} className="p-2 text-center font-semibold text-foreground">{colTotal(z)}</td>
                ))}
                <td className="p-2 text-center font-bold text-brand-600">{grand}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Editable cell list */}
      {cells.length > 0 && (
        <div className="space-y-1">
          {cells.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[140px] text-xs text-foreground">
                {c.roleLabel} · {c.zoneLabel}
              </span>
              <form action={updateStaffingCell.bind(null, projectId, c.id)} className="flex items-center gap-1">
                <input name="headcount" type="number" min="0" defaultValue={c.headcount} className={input + " w-20"} />
                <button type="submit" className="h-8 rounded-lg border border-border-strong px-2 text-xs text-foreground hover:bg-surface-2">
                  {t("saveStaffing")}
                </button>
              </form>
              <form action={removeStaffingCell.bind(null, projectId, c.id)}>
                <button type="submit" className="h-8 rounded-lg border border-danger/40 px-2 text-xs text-danger hover:bg-danger-bg">
                  {t("removeStaffing")}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* Add cell */}
      <details className="rounded-lg border border-dashed border-border-strong p-2">
        <summary className="cursor-pointer text-xs font-medium text-brand-600">{t("addStaffingCell")}</summary>
        <form action={addStaffingCell.bind(null, projectId)} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            {t("staffingRole")}
            <input name="roleLabel" className={input + " w-32"} required />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("staffingZone")}
            <input name="zoneLabel" className={input + " w-32"} required />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("staffingHeadcount")}
            <input name="headcount" type="number" min="0" defaultValue={0} className={input + " w-20"} />
          </label>
          <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
            {t("addStaffingCell")}
          </button>
        </form>
      </details>
    </div>
  );
}
