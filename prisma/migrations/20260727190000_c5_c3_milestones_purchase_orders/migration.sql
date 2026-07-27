-- CreateTable
CREATE TABLE "collection_milestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pct" REAL NOT NULL,
    "dueDate" DATETIME,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "collection_milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "orderedById" TEXT,
    "orderedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledById" TEXT,
    "canceledAt" DATETIME,
    "cancelNote" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "purchase_order_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "purchase_order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "purchase_order_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseOrderId" TEXT NOT NULL,
    "financeCostLineId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unitPrice" BIGINT NOT NULL DEFAULT 0,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "receivedQty" REAL NOT NULL DEFAULT 0,
    "receivedById" TEXT,
    "receivedAt" DATETIME,
    "note" TEXT,
    CONSTRAINT "purchase_order_line_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "purchase_order_line_financeCostLineId_fkey" FOREIGN KEY ("financeCostLineId") REFERENCES "finance_cost_line" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_client_invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "amount" BIGINT NOT NULL,
    "dueDate" DATETIME,
    "note" TEXT,
    "milestoneId" TEXT,
    "arReminderSentAt" DATETIME,
    "overCapNote" TEXT,
    "voidedById" TEXT,
    "voidedAt" DATETIME,
    "voidNote" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "client_invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_invoice_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "collection_milestone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_client_invoice" ("amount", "arReminderSentAt", "clientId", "createdAt", "createdById", "dueDate", "id", "invoiceDate", "invoiceNo", "note", "overCapNote", "projectId", "voidNote", "voidedAt", "voidedById") SELECT "amount", "arReminderSentAt", "clientId", "createdAt", "createdById", "dueDate", "id", "invoiceDate", "invoiceNo", "note", "overCapNote", "projectId", "voidNote", "voidedAt", "voidedById" FROM "client_invoice";
DROP TABLE "client_invoice";
ALTER TABLE "new_client_invoice" RENAME TO "client_invoice";
CREATE INDEX "client_invoice_projectId_idx" ON "client_invoice"("projectId");
CREATE TABLE "new_vendor_payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendorId" TEXT NOT NULL,
    "projectId" TEXT,
    "financeCostLineId" TEXT,
    "amount" BIGINT NOT NULL,
    "dueDate" DATETIME,
    "paidDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "invoiceNo" TEXT,
    "note" TEXT,
    "overCapNote" TEXT,
    "canceledById" TEXT,
    "canceledAt" DATETIME,
    "cancelNote" TEXT,
    "ctvBatchId" TEXT,
    "purchaseOrderId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vendor_payment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_financeCostLineId_fkey" FOREIGN KEY ("financeCostLineId") REFERENCES "finance_cost_line" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_ctvBatchId_fkey" FOREIGN KEY ("ctvBatchId") REFERENCES "ctv_batch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_vendor_payment" ("amount", "cancelNote", "canceledAt", "canceledById", "createdAt", "createdById", "ctvBatchId", "dueDate", "financeCostLineId", "id", "invoiceNo", "note", "overCapNote", "paidDate", "projectId", "status", "updatedAt", "vendorId") SELECT "amount", "cancelNote", "canceledAt", "canceledById", "createdAt", "createdById", "ctvBatchId", "dueDate", "financeCostLineId", "id", "invoiceNo", "note", "overCapNote", "paidDate", "projectId", "status", "updatedAt", "vendorId" FROM "vendor_payment";
DROP TABLE "vendor_payment";
ALTER TABLE "new_vendor_payment" RENAME TO "vendor_payment";
CREATE INDEX "vendor_payment_vendorId_status_idx" ON "vendor_payment"("vendorId", "status");
CREATE INDEX "vendor_payment_ctvBatchId_idx" ON "vendor_payment"("ctvBatchId");
CREATE INDEX "vendor_payment_purchaseOrderId_idx" ON "vendor_payment"("purchaseOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "collection_milestone_projectId_idx" ON "collection_milestone"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_code_key" ON "purchase_order"("code");

-- CreateIndex
CREATE INDEX "purchase_order_projectId_idx" ON "purchase_order"("projectId");

-- CreateIndex
CREATE INDEX "purchase_order_line_purchaseOrderId_idx" ON "purchase_order_line"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_order_line_financeCostLineId_idx" ON "purchase_order_line"("financeCostLineId");

