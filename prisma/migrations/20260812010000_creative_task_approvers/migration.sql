-- CR-1 (A7) — DUYỆT NHIỀU BÊN: danh sách người duyệt đích danh của một task Creative.
-- Nghiệp vụ (chủ dự án 06/08/2026): Master KV cần Creative + Art + Account CÙNG ký;
-- adapt cần Design lead + Account. Task không có dòng nào ở đây đi đường duyệt cũ (một người).
-- Bảng MỚI thuần CREATE TABLE — đã soi `prisma migrate diff`, không có RedefineTables.
CREATE TABLE "creative_task_approver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "approvedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "creative_task_approver_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "creative_task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "creative_task_approver_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "creative_task_approver_taskId_staffId_key" ON "creative_task_approver"("taskId", "staffId");
