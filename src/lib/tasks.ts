/**
 * Module Tasks — giao việc nội bộ TỰ DO (27/08/2026). File THUẦN: hằng + phép tính, không Prisma
 * client, không IO — server action nạp dữ liệu rồi gọi vào đây (CODING-RULES §4.1).
 *
 * ⚠ RANH GIỚI: việc sinh từ ORDER dự án đi CreativeTask/DepartmentTask; việc họp tuần đi
 * AccountMeetingAction. Module này chỉ cho việc KHÔNG thuộc luồng chuyên biệt nào.
 */

/** Vòng đời CỐ ĐỊNH trong code — không tuỳ biến trạng thái (bài học monday/ClickUp). */
export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "AWAIT_CONFIRM", "DONE", "CANCELED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Trạng thái còn "sống" — tính quá hạn, chặn đóng cha, đếm banner. */
export const ACTIVE_TASK_STATUSES = ["OPEN", "IN_PROGRESS", "AWAIT_CONFIRM"] as const;

export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_RECUR_FREQS = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type TaskRecurFreq = (typeof TASK_RECUR_FREQS)[number];

/** Trần file đính kèm — cùng hằng với chat (MAX_CHAT_FILES/MAX_TOTAL_UPLOAD_BYTES). */
export const MAX_TASK_FILES_PER_UPLOAD = 10;
export const MAX_TASK_UPLOAD_TOTAL_BYTES = 25 * 1024 * 1024;
export const MAX_TASK_FILE_BYTES = 15 * 1024 * 1024;

/**
 * ⚠ MỘT NGUỒN SỰ THẬT cho "ai thấy việc này" — dùng ở MỌI câu query danh sách, trang chi tiết và
 * route tải file. Phạm vi quyết định ở TẦNG TRUY VẤN, không lọc bằng JSX (bài học KB-H2).
 *
 * Một việc hiện với: người giao · người nhận · người theo dõi · quản lý trực tiếp của NGƯỜI NHẬN
 * (Staff.managerId) · trưởng phòng của NGƯỜI NHẬN (Department.leadStaffId) — và với cây cha-con:
 * thấy cha ⇒ thấy sub, tham gia sub ⇒ xem được cha (cần ngữ cảnh việc tổng).
 * Người có `tasks.view_all` thì KHÔNG lọc — caller tự bỏ where này.
 */
export function taskVisibleWhere(meId: string) {
  const direct = {
    OR: [
      { creatorId: meId },
      { assigneeId: meId },
      { followers: { some: { staffId: meId } } },
      { assignee: { managerId: meId } },
      { assignee: { department: { leadStaffId: meId } } },
    ],
  };
  return {
    OR: [
      direct,
      { parent: { is: direct } }, // tham gia/quản CHA ⇒ thấy sub
      { children: { some: direct } }, // tham gia một SUB ⇒ xem được cha
    ],
  };
}

/** Số ngày quá hạn (null = chưa quá hạn hoặc việc đã đóng). Cùng phép với taskOverdueDays của Creative. */
export function taskOverdue(status: string, dueDate: Date | null, now: Date = new Date()): number | null {
  if (!dueDate) return null;
  if (!(ACTIVE_TASK_STATUSES as readonly string[]).includes(status)) return null;
  const ms = now.getTime() - new Date(dueDate).getTime();
  if (ms <= 0) return null;
  return Math.max(1, Math.floor(ms / 86_400_000));
}

/**
 * Chuỗi ngày ĐỊA PHƯƠNG "YYYY-MM-DD" — khoá chống sinh trùng của lịch lặp.
 * ⚠ Đọc thành phần ĐỊA PHƯƠNG, không getUTC*: mốc UTC trong khung 0–7h sáng giờ VN rơi về ngày
 * hôm trước (đúng bug đã vá ở Kho K4/MKT). Server bắt buộc TZ=Asia/Ho_Chi_Minh (HANDOVER §8).
 */
export function localDayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Hôm nay có phải ngày sinh việc của rule không? DAILY luôn đúng; WEEKLY khớp thứ; MONTHLY khớp
 * ngày — rule đặt ngày 29/30/31 thì tháng ngắn KẸP về ngày cuối tháng (rule "ngày 31" vẫn chạy
 * ngày 28/2). Chỉ nhìn NGÀY, không nhìn giờ — job tick 5 phút, lượt đầu trong ngày sẽ sinh.
 */
export function recurMatchesToday(
  rule: { freq: string; dayOfWeek: number | null; dayOfMonth: number | null },
  now: Date = new Date(),
): boolean {
  if (rule.freq === "DAILY") return true;
  if (rule.freq === "WEEKLY") return rule.dayOfWeek != null && now.getDay() === rule.dayOfWeek;
  if (rule.freq === "MONTHLY") {
    if (rule.dayOfMonth == null) return false;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return now.getDate() === Math.min(rule.dayOfMonth, lastDay);
  }
  return false;
}

/** dueDate cho việc sinh từ lịch lặp: UTC-midnight của (hôm nay địa phương + offset) — quy ước §4.3. */
export function recurDueDate(dueOffsetDays: number, now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + dueOffsetDays));
}

/** Đọc checklistJson của rule — mảng label; hỏng khuôn thì coi như rỗng, KHÔNG ném. */
export function parseChecklistJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 50);
  } catch {
    return [];
  }
}
