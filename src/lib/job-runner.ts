import { prisma } from "./prisma";
import {
  checkOrderDeadlineReminders,
  checkAcceptanceSignReminders,
  checkCreativeTaskDeadlineReminders,
  checkDepartmentTaskDeadlineReminders,
  checkInventoryReturnReminders,
  checkArOverdueReminders,
  checkExpiryWarnings,
  checkTaskDeadlineReminders,
  spawnRecurringTasks,
} from "./reminders";
import { checkSpecialOccasions } from "./occasions";
import { checkChatReminders } from "./chat-reminders";
import { checkPendingPush } from "./push";
import { runMktPlanAutoDraft } from "./mkt-plan-server";
import { checkMktTokenExpiry, runMktMetricsPull, runMktScheduledPublish } from "./mkt-publish-server";

// ─────────────────────────────────────────────────────────
// Chạy các job kiểm-và-nhắc theo lịch.
//
// Trước đây 7 job này được gọi thẳng trong (app)/layout.tsx, tức CHỈ chạy khi có người đăng nhập
// mở một trang: cuối tuần / ngày lễ không ai mở app thì không có nhắc nào, và mỗi lượt render lại
// quét cả 7 job. Nay scheduler ở src/instrumentation.ts gọi định kỳ, còn layout chỉ là lưới an toàn.
//
// "Vé chạy" (compare-and-set trên bảng setting) là thứ khiến gọi từ nhiều nơi vẫn an toàn: nhiều
// request đồng thời, hoặc pm2 chạy cluster nhiều instance, chỉ MỘT lượt thật sự chạy job.
// Cùng một mẫu claim đang dùng ở chat-reminders.ts.
// ─────────────────────────────────────────────────────────

/** Nhỏ hơn chu kỳ tick 5 phút để một lần render lẻ không làm tick kế tiếp bị bỏ qua. */
const MIN_INTERVAL_MS = 4 * 60_000;

const TICKET = { module: "jobs", key: "last_run_at", scope: "GLOBAL", scopeRef: "" };

/** Giành vé chạy. Ghi mốc TRƯỚC khi chạy job để 2 lượt đồng thời không cùng vào. */
async function claimRun(now: Date): Promise<boolean> {
  const row = await prisma.setting.findFirst({ where: TICKET });
  if (!row) {
    try {
      await prisma.setting.create({ data: { ...TICKET, value: String(now.getTime()) } });
      return true;
    } catch {
      return false; // thua race tạo row — lượt kia đang chạy
    }
  }
  const last = Number(row.value);
  if (Number.isFinite(last) && now.getTime() - last < MIN_INTERVAL_MS) return false;
  // Chỉ ai đổi được đúng giá trị vừa đọc mới thắng.
  const res = await prisma.setting.updateMany({
    where: { ...TICKET, value: row.value },
    data: { value: String(now.getTime()) },
  });
  return res.count === 1;
}

const JOBS: [string, () => Promise<unknown>][] = [
  ["order-deadline", checkOrderDeadlineReminders],
  ["acceptance-sign", checkAcceptanceSignReminders],
  ["creative-task-deadline", checkCreativeTaskDeadlineReminders],
  ["dept-task-deadline", checkDepartmentTaskDeadlineReminders],
  ["inventory-return", checkInventoryReturnReminders],
  ["ar-overdue", checkArOverdueReminders],
  ["inventory-expiry", checkExpiryWarnings],
  ["special-occasions", checkSpecialOccasions],
  // MKT-2a: dựng bài từ master plan khi tới hạn. Job trả về nhanh — phần AI thả chạy nền (xem
  // mkt-plan-server.ts). Đặt TRƯỚC push-dispatch để thông báo "đã dựng bài" được đẩy ngay chu kỳ này.
  ["mkt-plan-autodraft", runMktPlanAutoDraft],
  // MKT-2b/2c: đăng bài tới giờ hẹn · kéo số liệu bài đã đăng · cảnh báo hạn token. Cả ba tự tắt
  // khi chưa khai MKT_TOKEN_SECRET hoặc chưa nối kênh nào.
  ["mkt-scheduled-publish", runMktScheduledPublish],
  ["mkt-metrics-pull", runMktMetricsPull],
  ["mkt-token-expiry", checkMktTokenExpiry],
  // MODULE TASKS (27/08/2026): sinh việc theo lịch lặp + nhắc việc quá hạn. Đặt TRƯỚC
  // push-dispatch để notification vừa sinh được đẩy ngay trong cùng chu kỳ.
  ["tasks-recur", spawnRecurringTasks],
  ["tasks-deadline", checkTaskDeadlineReminders],
  // ⚠ ĐẶT CUỐI DANH SÁCH: các job trên có thể vừa tạo thông báo mới, chạy sau thì đẩy luôn trong
  // cùng một chu kỳ thay vì đợi thêm 5 phút nữa.
  ["push-dispatch", checkPendingPush],
  ["chat-reminders", checkChatReminders],
];

/**
 * Chạy mọi job đến hạn. KHÔNG BAO GIỜ throw: layout đang render trang không được chết vì một job
 * hỏng, và scheduler không được dừng vòng lặp. Lỗi ghi ra console để soi bằng `pm2 logs`.
 */
export async function runDueJobs(): Promise<{ ran: boolean; failed: string[] }> {
  const now = new Date();
  if (!(await claimRun(now).catch(() => false))) return { ran: false, failed: [] };

  const results = await Promise.allSettled(JOBS.map(([, fn]) => fn()));
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      failed.push(JOBS[i][0]);
      console.error(`[jobs] ${JOBS[i][0]} thất bại:`, r.reason);
    }
  });
  return { ran: true, failed };
}
