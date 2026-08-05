-- CO/CE v3 — CE-1: CE theo dòng + gộp nhóm CE + %VAT theo dòng + phí quản lý theo mục L1
-- + nguồn gốc revision (import) + template báo giá theo khách + trần chi hiệu lực (payCap).
--
-- ⚠ VIẾT TAY, CỐ Ý KHÔNG dùng nguyên bản `prisma migrate diff`: bản đó xử lý `payCap` bằng
-- RedefineTables (DROP TABLE "finance_cost_line" rồi dựng lại + copy). Bảng này là TRẦN CHI đang
-- được VendorPayment/Advance đối chiếu — dựng lại bảng chỉ để thêm một cột default là rủi ro không
-- đáng nhận. SQLite cho ADD COLUMN NOT NULL kèm DEFAULT hằng số — đúng ca này.
-- (Cùng bài học đã né ở staff.isPlanningStaff và team.leadStaffId — xem HANDOVER 10.18.)

-- Client: template báo giá mặc định của khách (registry trong CODE lib/quote-templates.ts)
ALTER TABLE "client" ADD COLUMN "quoteTemplateCode" TEXT;

-- CostLine: CE theo dòng + khoá gộp nhóm + nhãn CE + %VAT (null = bảng chế độ cũ / chưa chọn %)
ALTER TABLE "cost_line" ADD COLUMN "ceGroupKey" TEXT;
ALTER TABLE "cost_line" ADD COLUMN "ceName" TEXT;
ALTER TABLE "cost_line" ADD COLUMN "ceQuantity" REAL;
ALTER TABLE "cost_line" ADD COLUMN "ceUnitPrice" BIGINT;
ALTER TABLE "cost_line" ADD COLUMN "vatPct" REAL;

-- CostSheetRevision: nguồn gốc bản (IMPORT = từ file khách trả) + khoá file gốc
ALTER TABLE "cost_sheet_revision" ADD COLUMN "importFileKey" TEXT;
ALTER TABLE "cost_sheet_revision" ADD COLUMN "origin" TEXT;

-- CostSheetSection: phí quản lý BÁO KHÁCH theo mục layer 1 (đừng nhầm CostSheet.mgmtFeePct nội bộ)
ALTER TABLE "cost_sheet_section" ADD COLUMN "clientFeePct" REAL;

-- FinanceCostLine: trần chi hiệu lực. Backfill = netAmount (hành vi cũ) — dòng VAT chỉ nở trần
-- khi Account chọn % ở CO/CE và sheet được lưu lại (Q4).
ALTER TABLE "finance_cost_line" ADD COLUMN "payCap" BIGINT NOT NULL DEFAULT 0;
UPDATE "finance_cost_line" SET "payCap" = "netAmount";
