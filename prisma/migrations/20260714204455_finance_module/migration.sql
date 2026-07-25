-- CreateTable
CREATE TABLE "finance_cost_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "specs" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "vendorId" TEXT,
    "sourceRevNo" INTEGER NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "finance_cost_line_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "finance_cost_line_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "advance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "financeCostLineId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "installmentNo" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "advanceType" TEXT NOT NULL,
    "recipientVendorId" TEXT,
    "recipientStaffId" TEXT,
    "bankName" TEXT,
    "bankAccountNo" TEXT,
    "bankAccountHolder" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disbursedById" TEXT,
    "disbursedAt" DATETIME,
    "settledById" TEXT,
    "settledAt" DATETIME,
    "settleNote" TEXT,
    CONSTRAINT "advance_financeCostLineId_fkey" FOREIGN KEY ("financeCostLineId") REFERENCES "finance_cost_line" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "advance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "advance_recipientVendorId_fkey" FOREIGN KEY ("recipientVendorId") REFERENCES "vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "advance_recipientStaffId_fkey" FOREIGN KEY ("recipientStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "advance_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "advance_disbursedById_fkey" FOREIGN KEY ("disbursedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "advance_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vendor_payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendorId" TEXT NOT NULL,
    "projectId" TEXT,
    "amount" BIGINT NOT NULL,
    "dueDate" DATETIME,
    "paidDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "invoiceNo" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vendor_payment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "client_invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "amount" BIGINT NOT NULL,
    "dueDate" DATETIME,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "client_invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "client_payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "paidDate" DATETIME NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "client_invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "client_payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "finance_cost_line_projectId_idx" ON "finance_cost_line"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_cost_line_projectId_lineKey_key" ON "finance_cost_line"("projectId", "lineKey");

-- CreateIndex
CREATE INDEX "advance_recipientStaffId_status_idx" ON "advance"("recipientStaffId", "status");

-- CreateIndex
CREATE INDEX "advance_projectId_idx" ON "advance"("projectId");

-- CreateIndex
CREATE INDEX "vendor_payment_vendorId_status_idx" ON "vendor_payment"("vendorId", "status");

-- CreateIndex
CREATE INDEX "client_invoice_projectId_idx" ON "client_invoice"("projectId");

-- CreateIndex
CREATE INDEX "client_payment_invoiceId_idx" ON "client_payment"("invoiceId");
