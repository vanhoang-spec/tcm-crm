-- Trưởng team (A1/A2/A3) — người gán người làm Planning trong team và duyệt khi team khác xin mượn.
--
-- ⚠ VIẾT TAY, CỐ Ý KHÔNG dùng bản `prisma migrate diff` sinh ra: bản đó là `RedefineTables`, tức
-- DROP TABLE "team" rồi dựng lại. Bảng `team` đang được 5 bảng khác trỏ tới (`staff.teamId`,
-- `client.ownerTeamId`, `project.ownerTeamId`, `client_transfer.fromTeamId` và `.toTeamId`) nên
-- dựng lại bảng là việc không đáng làm chỉ để thêm một cột nullable. Đây đúng bẫy đã né một lần khi
-- thêm cột `staff.isPlanningStaff` (xem HANDOVER mục 10.18).
--
-- SQLite cho phép ADD COLUMN kèm REFERENCES khi cột nullable và mặc định NULL — đúng trường hợp này.
ALTER TABLE "team" ADD COLUMN "leadStaffId" TEXT REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
