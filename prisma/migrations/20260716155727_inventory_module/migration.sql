-- CreateTable
CREATE TABLE "warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "inventory_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "unit" TEXT,
    "isReusable" BOOLEAN NOT NULL DEFAULT true,
    "partCount" INTEGER NOT NULL DEFAULT 1,
    "parentItemId" TEXT,
    "partNo" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "inventory_item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_item_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "inventory_item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "projectId" TEXT,
    "expectedReturnAt" DATETIME,
    "returnReminderSentAt" DATETIME,
    "note" TEXT,
    "createdById" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" DATETIME,
    "canceledById" TEXT,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "stock_document_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_document_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_document_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_document_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_document_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER,
    "note" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stock_document_line_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "stock_document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_document_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_balance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warehouseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stock_balance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_balance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_holding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "project_holding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_holding_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_code_key" ON "warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_item_code_key" ON "inventory_item"("code");

-- CreateIndex
CREATE INDEX "inventory_item_parentItemId_idx" ON "inventory_item"("parentItemId");

-- CreateIndex
CREATE INDEX "inventory_item_categoryId_idx" ON "inventory_item"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_document_code_key" ON "stock_document"("code");

-- CreateIndex
CREATE INDEX "stock_document_type_status_idx" ON "stock_document"("type", "status");

-- CreateIndex
CREATE INDEX "stock_document_projectId_idx" ON "stock_document"("projectId");

-- CreateIndex
CREATE INDEX "stock_document_status_expectedReturnAt_idx" ON "stock_document"("status", "expectedReturnAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_document_line_documentId_itemId_key" ON "stock_document_line"("documentId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balance_warehouseId_itemId_key" ON "stock_balance"("warehouseId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "project_holding_projectId_itemId_key" ON "project_holding"("projectId", "itemId");
