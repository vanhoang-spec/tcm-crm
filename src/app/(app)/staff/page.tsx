import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, pickLabel } from "@/lib/utils";
import type { Locale } from "@/i18n/locales";
import { getCurrentStaff } from "@/lib/current-staff";
import { addDays, dateKey, getMyWeek, getTimekeepingSettings, getWeekSchedule, parseDateKey, weekDays, weekStartOf } from "@/lib/timekeeping";
import { ScheduleGrid, type GridAssignment, type GridDay } from "./schedule-grid";
import { requirePermission } from "@/lib/permissions";

export default async function StaffSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; week?: string }>;
}) {
  await requirePermission("staff.view");
  const { dept, week: weekParam } = await searchParams;
  const [t, locale, me, settings] = await Promise.all([
    getTranslations("staff.schedule"),
    getLocale() as Promise<Locale>,
    getCurrentStaff(),
    getTimekeepingSettings(),
  ]);

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    include: { lead: { select: { id: true, fullName: true } } },
    orderBy: { code: "asc" },
  });
  // Mặc định: bộ phận mình làm trưởng → bộ phận mình thuộc về → bộ phận đầu tiên
  const myLedDept = departments.find((d) => d.lead?.id === me?.id);
  const departmentId = dept && departments.some((d) => d.id === dept) ? dept : (myLedDept ?? departments.find((d) => d.id === me?.departmentId) ?? departments[0])?.id;
  const department = departments.find((d) => d.id === departmentId)!;

  const weekStart = weekStartOf((weekParam && parseDateKey(weekParam)) || new Date());
  const prevWeek = dateKey(addDays(weekStart, -7));
  const nextWeek = dateKey(addDays(weekStart, 7));

  const [{ week, staff, assignments }, shifts, leaveTypeSet, myAssignments] = await Promise.all([
    getWeekSchedule(department.id, weekStart),
    prisma.workShift.findMany({ where: { isActive: true }, orderBy: { sort: "asc" } }),
    prisma.optionSet.findUnique({
      where: { code: "leave_type" },
      include: { items: { where: { isActive: true }, orderBy: { sort: "asc" } } },
    }),
    me ? getMyWeek(me.id, weekStart) : Promise.resolve([]),
  ]);

  const dayFmt = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { weekday: "short" });
  const days: GridDay[] = weekDays(weekStart).map((d) => ({
    key: dateKey(d),
    label: `${dayFmt.format(d)} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
    isWeekend: d.getDay() === 0 || d.getDay() === 6,
  }));
  const gridAssignments: GridAssignment[] = assignments.map((a) => ({
    id: a.id,
    staffId: a.staffId,
    dateKey: dateKey(a.date),
    shiftId: a.shiftId,
    hours: a.shift.hours,
    leaveTypeId: a.leaveTypeId,
    leaveTypeCode: a.leaveType?.code ?? null,
    note: a.note,
  }));

  // Đã sửa sau confirm: updatedAt vượt confirmedAt quá 2s (confirm tự bump updatedAt cùng lúc)
  const needsReconfirm =
    week?.status === "CONFIRMED" && week.confirmedAt !== null && week.updatedAt.getTime() > week.confirmedAt.getTime() + 2000;

  function withParams(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const merged = { dept: department.id, week: dateKey(weekStart), ...next };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `/staff?${sp.toString()}`;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("standardHint", { hours: settings.standardWeekHours })}</p>
      </div>

      {/* Lịch của tôi — mobile-first cho NV xem nhanh */}
      <section className="rounded-xl border border-border bg-surface p-3 sm:hidden">
        <h2 className="text-sm font-semibold text-foreground">{t("myWeekTitle")}</h2>
        {myAssignments.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{t("myWeekEmpty")}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {myAssignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">
                  {formatDate(a.date)} · {a.shift.name} {a.shift.startTime}–{a.shift.endTime}
                </span>
                <span className="flex items-center gap-1">
                  {a.leaveType && <Badge tone="warning">{pickLabel(a.leaveType, locale)}</Badge>}
                  {a.week.status !== "CONFIRMED" && <span className="text-[11px] text-muted-foreground">{t("myWeekPending")}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Điều khiển bộ phận + tuần */}
      <div className="flex flex-wrap items-center gap-2">
        <form action="/staff" method="get" className="flex items-center gap-2">
          <input type="hidden" name="week" value={dateKey(weekStart)} />
          <select
            name="dept"
            defaultValue={department.id}
            aria-label={t("filterDepartment")}
            className="h-10 rounded-lg border border-border-strong bg-surface px-2.5 text-sm"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button type="submit" className="h-10 rounded-lg border border-border-strong px-3 text-sm font-medium hover:bg-surface-2">
            OK
          </button>
        </form>
        {department.lead && (
          <span className="text-xs text-muted-foreground">
            {t("lead")}: <span className="font-medium text-foreground">{department.lead.fullName}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Link href={withParams({ week: prevWeek })} className="rounded-lg border border-border-strong px-3 py-2 text-xs font-medium hover:bg-surface-2">
            {t("prevWeek")}
          </Link>
          <span className="text-sm font-semibold text-foreground">
            {t("weekOf", { from: formatDate(weekStart), to: formatDate(addDays(weekStart, 6)) })}
          </span>
          <Link href={withParams({ week: nextWeek })} className="rounded-lg border border-border-strong px-3 py-2 text-xs font-medium hover:bg-surface-2">
            {t("nextWeek")}
          </Link>
        </div>
      </div>

      <ScheduleGrid
        departmentId={department.id}
        weekStartKey={dateKey(weekStart)}
        weekId={week?.id ?? null}
        weekStatus={week?.status ?? null}
        needsReconfirm={!!needsReconfirm}
        confirmedInfo={
          week?.confirmedAt && week.confirmedBy
            ? t("confirmedBy", { name: week.confirmedBy.fullName, time: formatDateTime(week.confirmedAt, locale) })
            : null
        }
        days={days}
        staff={staff}
        shifts={shifts}
        leaveTypes={(leaveTypeSet?.items ?? []).map((i) => ({ id: i.id, code: i.code, label: pickLabel(i, locale) }))}
        assignments={gridAssignments}
        standardWeekHours={settings.standardWeekHours}
      />
    </div>
  );
}
