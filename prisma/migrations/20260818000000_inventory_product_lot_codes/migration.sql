-- Mã lô v3 (18/08/2026): tách SẢN PHẨM (danh tính) khỏi LÔ (trạng thái).
-- VIẾT TAY: `prisma migrate diff` đòi RedefineTables cho inventory_item (DROP + tạo lại) chỉ vì thêm một
-- cột FK nullable — bảng có 6 cạnh FK trỏ tới (stock_balance, stock_document_line, project_holding,
-- stock_request_line, và chính nó). SQLite cho phép ALTER TABLE ADD COLUMN ... REFERENCES khi mặc định
-- là NULL, nên thêm cột thẳng. Không đụng dòng nào (hai bên đều 0 mặt hàng lúc viết).

-- CreateTable
CREATE TABLE "inventory_product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "catNodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "isReusable" BOOLEAN NOT NULL DEFAULT true,
    "partCount" INTEGER NOT NULL DEFAULT 1,
    "seq" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "inventory_product_catNodeId_fkey" FOREIGN KEY ("catNodeId") REFERENCES "inventory_category_node" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_product_code_key" ON "inventory_product"("code");

-- CreateIndex
CREATE INDEX "inventory_product_catNodeId_idx" ON "inventory_product"("catNodeId");

-- AlterTable (additive, nullable — không RedefineTables)
ALTER TABLE "inventory_item" ADD COLUMN "productId" TEXT REFERENCES "inventory_product" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "inventory_item_productId_idx" ON "inventory_item"("productId");
