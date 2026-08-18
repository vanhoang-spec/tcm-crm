-- K6 (18/08/2026): duyệt xuất kho theo CHỦ SỞ HỮU + duyệt từng dòng 0..n.
-- VIẾT TAY (additive): stock_request + cột FK nullable, stock_request_line + cột số. Không RedefineTables.

-- AlterTable
ALTER TABLE "stock_request" ADD COLUMN "ownerProjectId" TEXT REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "stock_request_ownerProjectId_idx" ON "stock_request"("ownerProjectId");

-- AlterTable
ALTER TABLE "stock_request_line" ADD COLUMN "approvedQuantity" INTEGER;

-- AlterTable (K6-4: phiếu hàng overhead công ty — HR Manager duyệt)
ALTER TABLE "stock_request" ADD COLUMN "isOverhead" BOOLEAN NOT NULL DEFAULT false;
