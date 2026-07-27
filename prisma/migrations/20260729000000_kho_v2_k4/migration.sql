-- AlterTable
ALTER TABLE "inventory_item" ADD COLUMN "expiryReminderLevel" TEXT;

-- AlterTable
ALTER TABLE "project" ADD COLUMN "stockCampaignOpenedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_stock_document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "projectId" TEXT,
    "fromProjectId" TEXT,
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
    CONSTRAINT "stock_document_fromProjectId_fkey" FOREIGN KEY ("fromProjectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_document_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_document_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_stock_document" ("canceledAt", "canceledById", "code", "confirmedAt", "confirmedById", "createdAt", "createdById", "expectedReturnAt", "fromWarehouseId", "id", "note", "projectId", "returnReminderSentAt", "status", "toWarehouseId", "type", "updatedAt") SELECT "canceledAt", "canceledById", "code", "confirmedAt", "confirmedById", "createdAt", "createdById", "expectedReturnAt", "fromWarehouseId", "id", "note", "projectId", "returnReminderSentAt", "status", "toWarehouseId", "type", "updatedAt" FROM "stock_document";
DROP TABLE "stock_document";
ALTER TABLE "new_stock_document" RENAME TO "stock_document";
CREATE UNIQUE INDEX "stock_document_code_key" ON "stock_document"("code");
CREATE INDEX "stock_document_type_status_idx" ON "stock_document"("type", "status");
CREATE INDEX "stock_document_projectId_idx" ON "stock_document"("projectId");
CREATE INDEX "stock_document_status_expectedReturnAt_idx" ON "stock_document"("status", "expectedReturnAt");
CREATE TABLE "new_stock_request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "warehouseId" TEXT NOT NULL,
    "toWarehouseId" TEXT,
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
    CONSTRAINT "stock_request_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_request_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "stock_document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_stock_request" ("approvedAt", "approvedById", "canceledAt", "canceledById", "code", "confirmedAt", "confirmedById", "createdAt", "createdById", "documentId", "expectedReturnAt", "id", "note", "projectId", "purchaseOrderId", "rejectReason", "rejectedAt", "rejectedById", "status", "type", "updatedAt", "warehouseId") SELECT "approvedAt", "approvedById", "canceledAt", "canceledById", "code", "confirmedAt", "confirmedById", "createdAt", "createdById", "documentId", "expectedReturnAt", "id", "note", "projectId", "purchaseOrderId", "rejectReason", "rejectedAt", "rejectedById", "status", "type", "updatedAt", "warehouseId" FROM "stock_request";
DROP TABLE "stock_request";
ALTER TABLE "new_stock_request" RENAME TO "stock_request";
CREATE UNIQUE INDEX "stock_request_code_key" ON "stock_request"("code");
CREATE INDEX "stock_request_type_status_idx" ON "stock_request"("type", "status");
CREATE INDEX "stock_request_projectId_idx" ON "stock_request"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

