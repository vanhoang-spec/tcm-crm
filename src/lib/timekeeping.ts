import { prisma } from "./prisma";
import { getNumberSetting, getStringSetting } from "./settings";

// ─────────────────────────────────────────────────────────
// MODULE ⑤ Chấm công & Ca làm việc — helper tuần thuần + engine phép năm + IO reads.
// Quy ước: tuần bắt đầu Thứ 2 00:00 giờ địa phương (app không dùng timezone).
// Công = lịch đã confirm − ngoại lệ: leaveTypeId null ⇒ giờ công = shift.hours; set ⇒ 0h.
// Phép năm đếm theo ca: 1 ca (4h) = 0.5 ngày.
// ─────────────────────────────────────────────────────────

export function weekStartOf(date: Date): Date {
  // getDay(): CN=0..T7=6 → lùi về Thứ 2
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** 7 ngày của tuần (T2..CN) từ weekStart. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** "YYYY-MM" → {start, end} nửa mở [start, end) — tháng công = ngày đầu → ngày cuối tháng dương lịch. */
export function monthRange(ym: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

/** Key ngày local "YYYY-MM-DD" — dùng làm khóa map, tránh lệch timezone của toISOString. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse "YYYY-MM-DD" thành Date 00:00 GIỜ ĐỊA PHƯƠNG (new Date(string) parse UTC — sẽ lệch ngày). */
export function parseDateKey(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Engine phép năm ───────────────────────────────────────

export type LeaveBalance = {
  year: number;
  /** Quota tích lũy tính đến hôm nay — 1 ngày/tháng đã trôi qua (chuẩn luật VN khi quota=12/năm). */
  entitlement: number;
  /** Phép năm trước mang sang — chỉ dùng được đến carryoverValidUntil (31/3), quá là mất. */
  carriedOver: number;
  carryoverValidUntil: Date;
  /** Tổng ngày phép đã dùng trong năm (mỗi ca = 0.5). */
  used: number;
  /** Còn lại tại thời điểm `today`: quota chưa dùng + phần carry-over còn hạn. */
  remaining: number;
};

/**
 * Quota tích lũy TÍNH ĐẾN `today` (không phải annualize cả năm): năm đã qua (y < năm hiện tại) → tích lũy
 * trọn 12 tháng; năm hiện tại → tích lũy đến hết tháng đang chạy (vd hết tháng 6 = 6 ngày với quota 12/năm);
 * năm chưa tới → 0. Nhân sự vào làm giữa năm → bắt đầu tích từ tháng vào làm.
 */
function entitlementForYear(year: number, today: Date, firstWorkDate: Date | null, annualLeaveDays: number): number {
  if (firstWorkDate && firstWorkDate.getFullYear() > year) return 0; // chưa vào làm năm đó
  const currentYear = today.getFullYear();
  const lastMonth = year < currentYear ? 11 : year > currentYear ? -1 : today.getMonth(); // tháng cuối đã tích lũy (0-index)
  const startMonth = firstWorkDate && firstWorkDate.getFullYear() === year ? firstWorkDate.getMonth() : 0;
  const monthsElapsed = Math.max(0, lastMonth - startMonth + 1);
  return Math.round(((annualLeaveDays / 12) * monthsElapsed) * 2) / 2;
}

/** Năm module Chấm công & Ca làm việc khai sinh — không có dữ liệu phép năm nào trước năm này trong hệ
 *  thống, nên carry-over từ các năm trước đó luôn = 0 (không suy diễn ngược từ firstWorkDate cũ). */
const LEAVE_TRACKING_START_YEAR = 2026;

function deadlineInYear(year: number, carryoverDeadline: string): Date {
  const m = /^(\d{2})-(\d{2})$/.exec(carryoverDeadline);
  const month = m ? Number(m[1]) : 3;
  const day = m ? Number(m[2]) : 31;
  return new Date(year, month - 1, day, 23, 59, 59);
}

/**
 * Tính số dư phép năm cho 1 nhân sự — THUẦN, chạy tuần tự từ năm đầu có dữ liệu
 * (carry-over năm sau phụ thuộc kết quả năm trước). Quy tắc trừ: ca nghỉ trước
 * hạn 31/3 dùng carry-over TRƯỚC (hết hạn sớm hơn), rồi mới tới quota năm hiện tại.
 */
export function computeLeaveBalance(input: {
  year: number;
  today: Date;
  firstWorkDate: Date | null;
  annualLeaveDays: number;
  carryoverDeadline: string; // "MM-DD"
  /** Ngày của MỌI ca đã đánh dấu Nghỉ phép năm (mọi năm) — mỗi ca = 0.5 ngày. */
  leaveShiftDates: Date[];
}): LeaveBalance {
  const { year, today, firstWorkDate, annualLeaveDays, carryoverDeadline, leaveShiftDates } = input;
  const earliestDataYear = Math.min(
    firstWorkDate?.getFullYear() ?? year,
    leaveShiftDates.length ? Math.min(...leaveShiftDates.map((d) => d.getFullYear())) : year,
    year
  );
  // Không suy diễn carry-over từ trước năm hệ thống khai sinh — kẹp startYear lại, dù nhân sự
  // vào làm từ lâu trước đó.
  const startYear = Math.max(earliestDataYear, Math.min(LEAVE_TRACKING_START_YEAR, year));

  let carryIn = 0;
  let result: LeaveBalance | null = null;
  for (let y = startYear; y <= year; y++) {
    const entitlement = entitlementForYear(y, today, firstWorkDate, annualLeaveDays);
    const deadline = deadlineInYear(y, carryoverDeadline);
    const shifts = leaveShiftDates.filter((d) => d.getFullYear() === y).sort((a, b) => a.getTime() - b.getTime());
    let carryRemaining = carryIn;
    let quotaUsed = 0;
    for (const d of shifts) {
      if (d.getTime() <= deadline.getTime() && carryRemaining >= 0.5) carryRemaining -= 0.5;
      else quotaUsed += 0.5;
    }
    const used = shifts.length * 0.5;
    if (y === year) {
      const carryStillValid = today.getTime() <= deadline.getTime() ? carryRemaining : 0;
      result = {
        year,
        entitlement,
        carriedOver: carryIn,
        carryoverValidUntil: deadline,
        used,
        remaining: Math.max(0, entitlement - quotaUsed) + carryStillValid,
      };
    }
    carryIn = Math.max(0, entitlement - quotaUsed); // phần quota chưa dùng mang sang năm sau
  }
  return result!;
}

// ── Settings ──────────────────────────────────────────────

export async function getTimekeepingSettings() {
  const [standardWeekHours, annualLeaveDays, carryoverDeadline] = await Promise.all([
    getNumberSetting("timekeeping", "standard_week_hours", 40),
    getNumberSetting("timekeeping", "annual_leave_days", 12),
    getStringSetting("timekeeping", "carryover_deadline", "03-31"),
  ]);
  return { standardWeekHours, annualLeaveDays, carryoverDeadline };
}

// ── IO reads ──────────────────────────────────────────────

/** Lịch tuần 1 bộ phận: week (nullable nếu chưa xếp) + staff active của dept + assignments. */
export async function getWeekSchedule(departmentId: string, weekStart: Date) {
  const weekEnd = addDays(weekStart, 7);
  const [week, staff, assignments] = await Promise.all([
    prisma.scheduleWeek.findUnique({
      where: { departmentId_weekStart: { departmentId, weekStart } },
      include: { confirmedBy: { select: { fullName: true } } },
    }),
    prisma.staff.findMany({
      where: { departmentId, isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, title: true },
    }),
    prisma.shiftAssignment.findMany({
      where: { date: { gte: weekStart, lt: weekEnd }, staff: { departmentId } },
      include: { shift: true, leaveType: true },
    }),
  ]);
  return { week, staff, assignments };
}

/** Ca của 1 nhân sự trong 1 tuần (mobile "Lịch của tôi"). */
export async function getMyWeek(staffId: string, weekStart: Date) {
  return prisma.shiftAssignment.findMany({
    where: { staffId, date: { gte: weekStart, lt: addDays(weekStart, 7) } },
    include: { shift: true, leaveType: true, week: { select: { status: true } } },
    orderBy: [{ date: "asc" }, { shift: { sort: "asc" } }],
  });
}

export type TimesheetRow = {
  staffId: string;
  code: string | null;
  fullName: string;
  departmentName: string | null;
  teamCode: string | null;
  /** dateKey → {hours, leaveCode} — leaveCode null = làm bình thường */
  days: Map<string, { hours: number; leaveCode: string | null }[]>;
  plannedHours: number;
  workedHours: number;
  leaveDays: Record<string, number>; // leaveType.code → số ngày (ca × 0.5)
  /** TCM không trả lương người này — dòng chỉ để THAM CHIẾU (ca trực điểm kho), không vào quỹ nào. */
  payrollExempt: boolean;
};

/** Bảng công tháng cho MỌI staff active — nguồn chung cho trang Chấm công + Excel export. */
export async function getMonthlyTimesheet(ym: string): Promise<TimesheetRow[] | null> {
  const range = monthRange(ym);
  if (!range) return null;
  const [staff, assignments] = await Promise.all([
    prisma.staff.findMany({
      where: { isActive: true },
      include: { department: { select: { name: true } }, team: { select: { code: true } } },
      orderBy: [{ department: { code: "asc" } }, { fullName: "asc" }],
    }),
    prisma.shiftAssignment.findMany({
      where: { date: { gte: range.start, lt: range.end }, week: { status: "CONFIRMED" } },
      include: { shift: true, leaveType: true },
    }),
  ]);

  const rows = new Map<string, TimesheetRow>();
  for (const s of staff) {
    rows.set(s.id, {
      staffId: s.id,
      code: s.code,
      fullName: s.fullName,
      departmentName: s.department?.name ?? null,
      teamCode: s.team?.code ?? null,
      days: new Map(),
      plannedHours: 0,
      workedHours: 0,
      leaveDays: {},
      payrollExempt: s.payrollExempt,
    });
  }
  for (const a of assignments) {
    const row = rows.get(a.staffId);
    if (!row) continue; // staff đã inactive
    const key = dateKey(a.date);
    const list = row.days.get(key) ?? [];
    const leaveCode = a.leaveType?.code ?? null;
    list.push({ hours: a.shift.hours, leaveCode });
    row.days.set(key, list);
    row.plannedHours += a.shift.hours;
    if (leaveCode === null) row.workedHours += a.shift.hours;
    else row.leaveDays[leaveCode] = (row.leaveDays[leaveCode] ?? 0) + 0.5;
  }
  return Array.from(rows.values());
}

/** Số dư phép năm của mọi staff active (tab Phép năm). */
export async function getLeaveBalances(year: number) {
  const settings = await getTimekeepingSettings();
  const [staff, leaveShifts] = await Promise.all([
    prisma.staff.findMany({
      // Phép năm là phúc lợi CÓ LƯƠNG → người TCM không trả lương không tích phép
      // (quyết định chủ dự án 28/07/2026). Họ vẫn có mặt ở bảng công tháng để tham chiếu.
      where: { isActive: true, payrollExempt: false },
      include: { department: { select: { name: true } } },
      orderBy: [{ department: { code: "asc" } }, { fullName: "asc" }],
    }),
    prisma.shiftAssignment.findMany({
      where: { leaveType: { code: "ANNUAL" }, week: { status: "CONFIRMED" } },
      select: { staffId: true, date: true },
    }),
  ]);
  const byStaff = new Map<string, Date[]>();
  for (const l of leaveShifts) {
    (byStaff.get(l.staffId) ?? byStaff.set(l.staffId, []).get(l.staffId)!).push(l.date);
  }
  const today = new Date();
  return staff.map((s) => ({
    staffId: s.id,
    fullName: s.fullName,
    title: s.title,
    departmentName: s.department?.name ?? null,
    missingFirstWorkDate: !s.firstWorkDate,
    balance: computeLeaveBalance({
      year,
      today,
      firstWorkDate: s.firstWorkDate,
      annualLeaveDays: settings.annualLeaveDays,
      carryoverDeadline: settings.carryoverDeadline,
      leaveShiftDates: byStaff.get(s.id) ?? [],
    }),
  }));
}
