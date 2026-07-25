"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { confirmWeek, setAssignmentLeave, toggleAssignment } from "./actions";

export type GridShift = { id: string; code: string; name: string; startTime: string; endTime: string; hours: number };
export type GridStaff = { id: string; fullName: string; title: string | null };
export type GridLeaveType = { id: string; code: string; label: string };
export type GridAssignment = {
  id: string;
  staffId: string;
  dateKey: string;
  shiftId: string;
  hours: number;
  leaveTypeId: string | null;
  leaveTypeCode: string | null;
  note: string | null;
};
export type GridDay = { key: string; label: string; isWeekend: boolean };

export function ScheduleGrid({
  departmentId,
  weekStartKey,
  weekId,
  weekStatus,
  needsReconfirm,
  confirmedInfo,
  days,
  staff,
  shifts,
  leaveTypes,
  assignments,
  standardWeekHours,
}: {
  departmentId: string;
  weekStartKey: string;
  weekId: string | null;
  weekStatus: string | null;
  needsReconfirm: boolean;
  confirmedInfo: string | null;
  days: GridDay[];
  staff: GridStaff[];
  shifts: GridShift[];
  leaveTypes: GridLeaveType[];
  assignments: GridAssignment[];
  standardWeekHours: number;
}) {
  const t = useTranslations("staff.schedule");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  // Ô đang mở form nghỉ: assignment id
  const [editing, setEditing] = useState<GridAssignment | null>(null);
  const [leaveTypeId, setLeaveTypeId] = useState<string>("");
  const [note, setNote] = useState("");

  const byCell = new Map<string, GridAssignment>();
  for (const a of assignments) byCell.set(`${a.staffId}|${a.dateKey}|${a.shiftId}`, a);
  const totalByStaff = new Map<string, number>();
  for (const a of assignments) {
    if (a.leaveTypeId === null) totalByStaff.set(a.staffId, (totalByStaff.get(a.staffId) ?? 0) + a.hours);
  }

  function onChipClick(a: GridAssignment | undefined, staffId: string, dateKey: string, shiftId: string) {
    setMessage(null);
    if (!a) {
      startTransition(async () => {
        const res = await toggleAssignment(departmentId, weekStartKey, staffId, dateKey, shiftId);
        if (res.error) setMessage({ error: res.error });
      });
      return;
    }
    setEditing(a);
    setLeaveTypeId(a.leaveTypeId ?? "");
    setNote(a.note ?? "");
  }

  function saveLeave() {
    if (!editing) return;
    startTransition(async () => {
      const res = await setAssignmentLeave(editing.id, leaveTypeId || null, note);
      if (res.error) setMessage({ error: res.error });
      else setEditing(null);
    });
  }

  function removeShift() {
    if (!editing) return;
    startTransition(async () => {
      const res = await toggleAssignment(departmentId, weekStartKey, editing.staffId, editing.dateKey, editing.shiftId);
      if (res.error) setMessage({ error: res.error });
      else setEditing(null);
    });
  }

  function onConfirm() {
    if (!weekId) return;
    setMessage(null);
    startTransition(async () => {
      const res = await confirmWeek(weekId);
      if (res.error) setMessage({ error: res.error });
      else setMessage({ ok: t("confirmed", { count: res.notified ?? 0 }) });
    });
  }

  const leaveTone = (code: string | null) =>
    code === "ANNUAL" ? "bg-success-bg text-success" : code === "SICK" || code === "OTHER" ? "bg-warning-bg text-warning" : "bg-danger-bg text-danger";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {weekStatus === "CONFIRMED" ? (
          <Badge tone={needsReconfirm ? "warning" : "success"}>{t("statusCONFIRMED")}</Badge>
        ) : (
          <Badge tone="neutral">{t("statusDRAFT")}</Badge>
        )}
        {confirmedInfo && <span className="text-xs text-muted-foreground">{confirmedInfo}</span>}
        {needsReconfirm && <span className="text-xs font-medium text-warning">{t("modifiedAfterConfirm")}</span>}
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || !weekId}
          className="ml-auto h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : weekStatus === "CONFIRMED" ? t("reconfirm") : t("confirm")}
        </button>
      </div>
      {message?.error && <p className="text-xs font-medium text-danger">{message.error}</p>}
      {message?.ok && <p className="text-xs font-medium text-success">{message.ok}</p>}

      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 bg-surface px-3 py-2">{t("colStaff")}</th>
              {days.map((d) => (
                <th key={d.key} className={cn("px-2 py-2 text-center", d.isWeekend && "bg-surface-2")}>
                  {d.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right">{t("colTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const total = totalByStaff.get(s.id) ?? 0;
              return (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="sticky left-0 bg-surface px-3 py-2">
                    <p className="font-medium text-foreground">{s.fullName}</p>
                    {s.title && <p className="text-xs text-muted-foreground">{s.title}</p>}
                  </td>
                  {days.map((d) => (
                    <td key={d.key} className={cn("px-1.5 py-2 align-top", d.isWeekend && "bg-surface-2/60")}>
                      <div className="flex flex-col items-stretch gap-1">
                        {shifts.map((sh) => {
                          const a = byCell.get(`${s.id}|${d.key}|${sh.id}`);
                          return (
                            <button
                              key={sh.id}
                              type="button"
                              disabled={pending}
                              onClick={() => onChipClick(a, s.id, d.key, sh.id)}
                              title={`${sh.name} ${sh.startTime}–${sh.endTime}`}
                              className={cn(
                                "h-7 rounded-md border px-1.5 text-[11px] font-medium transition-colors disabled:opacity-60",
                                !a && "border-dashed border-border text-muted-foreground/50 hover:border-brand-400 hover:text-brand-600",
                                a && a.leaveTypeId === null && "border-brand-200 bg-brand-50 text-brand-700",
                                a && a.leaveTypeId !== null && cn("border-transparent", leaveTone(a.leaveTypeCode))
                              )}
                            >
                              {sh.name}
                              {a?.leaveTypeCode ? ` · ${a.leaveTypeCode}` : ""}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right align-top">
                    <Badge tone={total === standardWeekHours ? "success" : total === 0 ? "neutral" : "warning"}>{total}h</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground sm:hidden">{t("fullGridHint")}</p>

      {/* Form đánh dấu nghỉ / gỡ ca */}
      {editing && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 sm:items-center sm:justify-center" onClick={() => setEditing(null)}>
          <div className="w-full rounded-t-2xl bg-surface p-4 sm:max-w-md sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {t("leaveFormTitle", {
                  shift: shifts.find((sh) => sh.id === editing.shiftId)?.name ?? "",
                  name: staff.find((s) => s.id === editing.staffId)?.fullName ?? "",
                  date: editing.dateKey.split("-").reverse().join("/"),
                })}
              </h3>
              <button type="button" onClick={() => setEditing(null)} aria-label="close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <label className="block space-y-1 text-xs text-muted-foreground">
                {t("leaveTypeLabel")}
                <select
                  value={leaveTypeId}
                  onChange={(e) => setLeaveTypeId(e.target.value)}
                  className="h-11 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9"
                >
                  <option value="">{t("leaveNone")}</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">
                {t("leaveNote")}
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-11 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm sm:h-9"
                />
              </label>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveLeave}
                  disabled={pending}
                  className="h-11 flex-1 rounded-lg bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9"
                >
                  {pending ? "..." : t("save")}
                </button>
                <button
                  type="button"
                  onClick={removeShift}
                  disabled={pending}
                  className="h-11 rounded-lg border border-danger/40 px-3 text-sm font-medium text-danger hover:bg-danger-bg disabled:opacity-50 sm:h-9"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {message?.error && <p className="text-xs text-danger">{message.error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
