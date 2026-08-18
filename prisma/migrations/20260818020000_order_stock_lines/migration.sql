-- K6-3 (18/08/2026): dòng VẬT DỤNG (sản phẩm + số lượng) trên Order OPE/PRO. Bảng MỚI, không đụng bảng cũ.

-- CreateTable
CREATE TABLE "project_order_stock_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_order_stock_line_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "project_order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_order_stock_line_productId_fkey" FOREIGN KEY ("productId") REFERENCES "inventory_product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "project_order_stock_line_orderId_idx" ON "project_order_stock_line"("orderId");

-- CreateIndex
CREATE INDEX "project_order_stock_line_productId_idx" ON "project_order_stock_line"("productId");
