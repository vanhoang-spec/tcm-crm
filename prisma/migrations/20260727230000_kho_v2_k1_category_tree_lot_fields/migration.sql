-- CreateTable
CREATE TABLE "inventory_category_node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "isClientOwned" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "inventory_category_node_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "inventory_category_node" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_inventory_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "unit" TEXT,
    "isReusable" BOOLEAN NOT NULL DEFAULT true,
    "partCount" INTEGER NOT NULL DEFAULT 1,
    "parentItemId" TEXT,
    "partNo" INTEGER,
    "catNodeId" TEXT,
    "statusCode" TEXT,
    "conditionCode" TEXT,
    "ownerClientId" TEXT,
    "boundProjectId" TEXT,
    "expiryDate" DATETIME,
    "clientDocNo" TEXT,
    "seq" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "inventory_item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_item_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "inventory_item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_item_catNodeId_fkey" FOREIGN KEY ("catNodeId") REFERENCES "inventory_category_node" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_item_ownerClientId_fkey" FOREIGN KEY ("ownerClientId") REFERENCES "client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_item_boundProjectId_fkey" FOREIGN KEY ("boundProjectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_inventory_item" ("categoryId", "code", "createdAt", "id", "isActive", "isReusable", "name", "note", "parentItemId", "partCount", "partNo", "unit", "updatedAt") SELECT "categoryId", "code", "createdAt", "id", "isActive", "isReusable", "name", "note", "parentItemId", "partCount", "partNo", "unit", "updatedAt" FROM "inventory_item";
DROP TABLE "inventory_item";
ALTER TABLE "new_inventory_item" RENAME TO "inventory_item";
CREATE UNIQUE INDEX "inventory_item_code_key" ON "inventory_item"("code");
CREATE INDEX "inventory_item_parentItemId_idx" ON "inventory_item"("parentItemId");
CREATE INDEX "inventory_item_categoryId_idx" ON "inventory_item"("categoryId");
CREATE INDEX "inventory_item_catNodeId_idx" ON "inventory_item"("catNodeId");
CREATE INDEX "inventory_item_ownerClientId_idx" ON "inventory_item"("ownerClientId");
CREATE INDEX "inventory_item_statusCode_idx" ON "inventory_item"("statusCode");
CREATE TABLE "new_stock_document_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER,
    "convertToItemId" TEXT,
    "note" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stock_document_line_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "stock_document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_document_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_document_line_convertToItemId_fkey" FOREIGN KEY ("convertToItemId") REFERENCES "inventory_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_stock_document_line" ("documentId", "id", "itemId", "note", "quantity", "receivedQuantity", "sort") SELECT "documentId", "id", "itemId", "note", "quantity", "receivedQuantity", "sort" FROM "stock_document_line";
DROP TABLE "stock_document_line";
ALTER TABLE "new_stock_document_line" RENAME TO "stock_document_line";
CREATE UNIQUE INDEX "stock_document_line_documentId_itemId_key" ON "stock_document_line"("documentId", "itemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "inventory_category_node_parentId_idx" ON "inventory_category_node"("parentId");

