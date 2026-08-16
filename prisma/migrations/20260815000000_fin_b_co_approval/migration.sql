-- FIN-B (15/08/2026): tran chi di theo ban CO DA DUYET, khong con theo ban luu moi nhat.
-- Con tro theo revNo (khuon FinanceCostLine.sourceRevNo) — revNo la duy nhat trong tung sheet
-- (@@unique [costSheetId, revNo]) va revision bat bien, khong can khoa ngoai.
-- Viet tay ALTER TABLE: prisma migrate diff doi RedefineTables (DROP TABLE cost_sheet) cho mot cot nullable.
ALTER TABLE "cost_sheet" ADD COLUMN "approvedRevNo" INTEGER;
