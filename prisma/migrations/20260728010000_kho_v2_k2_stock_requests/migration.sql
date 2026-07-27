-- CreateTable
CREATE TABLE "stock_request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "warehouseId" TEXT NOT NULL,
    "projectId" TEXT,
    "purchaseOrderId" TEXT,
    "expectedReturnAt" DATETIME,
    "note" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "rejectedById" TEXT,
    "rejectedAt" DATETIME,
    "rejectReason" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" DATETIME,
    "canceledById" TEXT,
    "canceledAt" DATETIME,
    "documentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "stock_request_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_request_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "stock_document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_request_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "confirmedQuantity" INTEGER,
    "note" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stock_request_line_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "stock_request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_request_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_request_code_key" ON "stock_request"("code");

-- CreateIndex
CREATE INDEX "stock_request_type_status_idx" ON "stock_request"("type", "status");

-- CreateIndex
CREATE INDEX "stock_request_projectId_idx" ON "stock_request"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_request_line_requestId_itemId_key" ON "stock_request_line"("requestId", "itemId");

