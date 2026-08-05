-- CO/CE v3 — CE-5: dòng KHÁCH YÊU CẦU BỎ (gạch ngang, CE = 0, chờ Account quyết).
--
-- ⚠ VIẾT TAY, cùng lý do đã ghi ở 20260809000000_coce_v3_ce1: `prisma migrate diff` xử lý cột
-- Boolean NOT NULL bằng RedefineTables (DROP TABLE "cost_line" rồi dựng lại + copy). `cost_line`
-- là bảng gốc của mọi số tiền CO/CE và FinanceCostLine khoá vào `stableKey` của nó — dựng lại
-- bảng chỉ để thêm một cờ là rủi ro không đáng nhận. SQLite cho ADD COLUMN NOT NULL kèm DEFAULT
-- hằng số, đúng ca này. (Bẫy RedefineTables lần thứ 5 — xem HANDOVER 10.18 và 10.26.)

ALTER TABLE "cost_line" ADD COLUMN "ceDropped" BOOLEAN NOT NULL DEFAULT false;
