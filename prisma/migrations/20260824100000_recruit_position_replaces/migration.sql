-- JobPosition.replacesStaffId — nhân sự mà vị trí này tuyển để THAY THẾ.
--
-- ⚠ VIẾT TAY, KHÔNG dùng bản `prisma migrate diff` sinh ra: bản đó là RedefineTables (DROP TABLE
-- job_position rồi dựng lại), trong khi bảng `candidate` có khoá ngoại trỏ tới nó và production
-- đang có dữ liệu tuyển dụng thật. SQLite CHO PHÉP thêm cột kèm REFERENCES miễn là mặc định NULL,
-- nên ALTER TABLE là đủ và không đụng một dòng dữ liệu nào.
ALTER TABLE "job_position" ADD COLUMN "replacesStaffId" TEXT REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
