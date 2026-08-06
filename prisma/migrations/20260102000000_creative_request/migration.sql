-- ĐƯỜNG NHẬN VIỆC của bản mini: bảng `creative_request` + cột `creative_task.requestId`.
--
-- ⚠ MIGRATION VIẾT TAY. `prisma migrate diff` cho ra RedefineTables: nó DROP TABLE "creative_task"
-- rồi dựng lại chỉ để thêm MỘT cột nullable — trên bảng đã có dữ liệu là mất sạch. Thay bằng
-- ALTER TABLE ADD COLUMN, additive thuần. (Bẫy này đã cắn 6 lần ở bản TCM — xem HANDOVER 10.18/
-- 10.26/10.30.) SQLite chấp nhận thêm cột có REFERENCES qua ALTER TABLE.

CREATE TABLE "creative_request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT,
    "briefLinkUrl" TEXT,
    "note" TEXT,
    "deadline" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "creative_request_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "creative_request_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "creative_request_projectId_idx" ON "creative_request"("projectId");

-- Cột mới trên bảng CŨ — viết tay thay cho RedefineTables.
ALTER TABLE "creative_task" ADD COLUMN "requestId" TEXT REFERENCES "creative_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backstop DB cho spawn idempotent. SQLite coi nhiều NULL là KHÁC nhau ⇒ task CD tạo tay
-- (requestId NULL) không bao giờ đụng ràng buộc này, dù có trùng sourceItemLabel.
CREATE UNIQUE INDEX "creative_task_requestId_sourceItemLabel_key" ON "creative_task"("requestId", "sourceItemLabel");
