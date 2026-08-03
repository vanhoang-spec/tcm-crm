-- LOF-V1: nhãn chặng trên dòng CO/CE + loại phiên bản + nhóm chiến dịch.
--
-- ⚠ VIẾT TAY, KHÔNG dùng bản `prisma migrate diff` sinh ra: bản đó chọn `RedefineTables` cho bảng
-- `project` (DROP TABLE rồi dựng lại) vì có thêm cột FK. Bảng `project` có hàng chục cạnh FK trỏ
-- tới — dựng lại là rủi ro không cần thiết. SQLite cho phép ADD COLUMN kèm REFERENCES miễn là mặc
-- định NULL, nên ba cột dưới đây đều thêm được tại chỗ. Cùng lý do đã ghi ở HANDOVER mục 10.18
-- (cột Staff.isPlanningStaff).

-- Nhãn CHẶNG (tỉnh/điểm/đợt) của dòng chi phí. Thuần nhãn, không vào công thức tiền nào.
ALTER TABLE "cost_line" ADD COLUMN "legCode" TEXT;

-- Vai trò của bản snapshot trong hồ sơ khách: QUOTE | CONTRACT | ACCEPTANCE. NULL = bản nội bộ.
ALTER TABLE "cost_sheet_revision" ADD COLUMN "kind" TEXT;

-- Nhóm chiến dịch — gom nhiều dự án của cùng một chiến dịch nhiều giai đoạn.
CREATE TABLE "project_group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "project_group_code_key" ON "project_group"("code");

-- ON DELETE SET NULL: nhóm không có đường xoá trong app, nhưng nếu ai đó xoá tay dưới DB thì dự án
-- phải mất NHÓM chứ không được biến mất theo.
ALTER TABLE "project" ADD COLUMN "groupId" TEXT REFERENCES "project_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
