-- Cờ "người này làm function Planning" (quyết định chủ dự án 01/08/2026: bộ phận Planning độc lập
-- giải thể, nhân sự về thẳng các team Account nên không suy được từ departmentId nữa).
--
-- CỐ Ý viết tay ALTER TABLE thay vì giữ bản `prisma migrate diff` sinh ra: bản đó là RedefineTables
-- (tạo bảng mới → copy toàn bộ → DROP TABLE staff → rename), tức đụng dao vào bảng có 82 cạnh FK
-- trỏ tới, trên DB production đang chạy. Thêm cột có DEFAULT là thao tác additive thuần, SQLite làm
-- được bằng một lệnh, không cần dựng lại bảng.
ALTER TABLE "staff" ADD COLUMN "isPlanningStaff" BOOLEAN NOT NULL DEFAULT false;
