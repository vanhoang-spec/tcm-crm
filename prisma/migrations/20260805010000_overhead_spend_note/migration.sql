-- Ghi chú tự do cho khoản chi — cột "GHI CHÚ" của sheet chi tiết (vd "Đang tạm ứng").
-- Tách thành migration riêng thay vì sửa bản 20260805000000 đã áp: sửa migration đã chạy làm
-- lệch checksum, và `prisma migrate dev` sẽ đòi RESET cả DB (đã vấp một lần trong đợt này).

-- AlterTable
ALTER TABLE "overhead_spend" ADD COLUMN "note" TEXT;

