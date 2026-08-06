-- CR-1 — 3 TEAM NHỎ CREATIVE (creative_squad) + điều phối việc.
--
-- ⚠ MIGRATION VIẾT TAY (lần thứ 6 dính bẫy RedefineTables — xem HANDOVER 10.18/10.26/10.30):
-- `prisma migrate diff` đòi DROP + dựng lại CẢ `staff` (82 cạnh FK trỏ tới) LẪN `creative_task`
-- (có FK từ bảng khác + @@unique([orderId, sourceItemLabel])) chỉ để thêm MỘT cột nullable mỗi
-- bảng. Thay bằng ALTER TABLE ADD COLUMN — additive thuần, không đụng dữ liệu.
-- (SQLite chấp nhận thêm cột có REFERENCES qua ALTER TABLE; ràng buộc FK áp cho dòng ghi mới.)

-- 1) Bảng team nhỏ Creative — bản Prisma sinh, giữ nguyên (bảng mới, an toàn)
CREATE TABLE "creative_squad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadStaffId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "creative_squad_leadStaffId_fkey" FOREIGN KEY ("leadStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "creative_squad_code_key" ON "creative_squad"("code");

-- 2) staff.creativeSquadId — VIẾT TAY thay cho RedefineTables (mirror 20260803_staff_is_planning_staff)
ALTER TABLE "staff" ADD COLUMN "creativeSquadId" TEXT REFERENCES "creative_squad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) creative_task.squadId — VIẾT TAY, cùng lý do
ALTER TABLE "creative_task" ADD COLUMN "squadId" TEXT REFERENCES "creative_squad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
