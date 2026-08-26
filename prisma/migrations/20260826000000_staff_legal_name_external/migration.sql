-- Staff.legalName (tên đầy đủ theo giấy tờ) + Staff.isExternal (người ngoài công ty có tài khoản TCM)
--
-- ⚠ VIẾT TAY. Bản `prisma migrate diff` sinh ra là RedefineTables: DROP TABLE "staff" rồi dựng lại —
-- trên bảng có 82 cạnh khoá ngoại trỏ tới và dữ liệu nhân sự thật đang chạy. Đúng lý do đã viết tay
-- migration `20260803000000_staff_is_planning_staff`.
-- Hai lệnh dưới là additive thuần: cột nullable và cột boolean có default ⇒ không đụng một dòng nào.
ALTER TABLE "staff" ADD COLUMN "legalName" TEXT;
ALTER TABLE "staff" ADD COLUMN "isExternal" BOOLEAN NOT NULL DEFAULT false;
