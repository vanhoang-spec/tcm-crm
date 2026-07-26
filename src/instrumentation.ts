/**
 * Bộ hẹn giờ cho các job kiểm-và-nhắc (xem lib/job-runner.ts).
 *
 * Chạy TRONG tiến trình Next thay vì dựng tiến trình/cron riêng, vì: không thêm dependency, không
 * mở tiến trình thứ hai ghi vào cùng file SQLite (single-writer), và không đổi quy trình deploy —
 * `pm2 restart` là đủ. Đi theo code nên dựng lại server không thể quên bật.
 *
 * Nhiều instance (pm2 cluster) sẽ có nhiều timer, nhưng "vé chạy" trong job-runner bảo đảm mỗi
 * chu kỳ chỉ một lượt chạy thật.
 */
export async function register() {
  // register() được gọi ở MỌI runtime; Prisma chỉ chạy được ở nodejs.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Đừng chạy job trong lúc `next build` (build cũng nạp file này).
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Import ĐỘNG để Prisma không bị kéo vào bundle của runtime khác.
  const { runDueJobs } = await import("@/lib/job-runner");

  void runDueJobs();
  const timer = setInterval(() => {
    void runDueJobs();
  }, 5 * 60_000);
  timer.unref(); // không chặn shutdown của pm2

  console.log("[jobs] scheduler bật — chu kỳ 5 phút");
}
