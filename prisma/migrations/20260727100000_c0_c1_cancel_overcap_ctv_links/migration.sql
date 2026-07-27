-- AlterTable
ALTER TABLE "client_invoice" ADD COLUMN "overCapNote" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ctv_batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT,
    "programFrom" TEXT,
    "programTo" TEXT,
    "teamLeader" TEXT,
    "workLocation" TEXT,
    "sourceFileKey" TEXT,
    "defaultFinanceCostLineId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ctv_batch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ctv_batch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ctv_batch_defaultFinanceCostLineId_fkey" FOREIGN KEY ("defaultFinanceCostLineId") REFERENCES "finance_cost_line" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ctv_batch" ("createdAt", "createdById", "id", "name", "programFrom", "programTo", "projectId", "sourceFileKey", "teamLeader", "updatedAt", "workLocation") SELECT "createdAt", "createdById", "id", "name", "programFrom", "programTo", "projectId", "sourceFileKey", "teamLeader", "updatedAt", "workLocation" FROM "ctv_batch";
DROP TABLE "ctv_batch";
ALTER TABLE "new_ctv_batch" RENAME TO "ctv_batch";
CREATE INDEX "ctv_batch_projectId_idx" ON "ctv_batch"("projectId");
CREATE TABLE "new_ctv_contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "dateOfBirth" TEXT,
    "nationality" TEXT,
    "idNumber" TEXT,
    "idIssueDate" TEXT,
    "idIssuePlace" TEXT,
    "permanentAddress" TEXT,
    "taxCode" TEXT,
    "bankAccountNo" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "phone" TEXT,
    "eventName" TEXT,
    "executionDate" TEXT,
    "acceptanceDate" TEXT,
    "executionLocation" TEXT,
    "workItem" TEXT,
    "unit" TEXT,
    "quantity" REAL,
    "unitPrice" BIGINT,
    "amount" BIGINT,
    "grossNet" TEXT,
    "pitTax" BIGINT,
    "netReceived" BIGINT,
    "note" TEXT,
    "generatedFileKey" TEXT,
    "generatedAt" DATETIME,
    "financeCostLineId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ctv_contract_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ctv_batch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ctv_contract_financeCostLineId_fkey" FOREIGN KEY ("financeCostLineId") REFERENCES "finance_cost_line" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ctv_contract" ("acceptanceDate", "amount", "bankAccountNo", "bankBranch", "bankName", "batchId", "createdAt", "dateOfBirth", "eventName", "executionDate", "executionLocation", "fullName", "gender", "generatedAt", "generatedFileKey", "grossNet", "id", "idIssueDate", "idIssuePlace", "idNumber", "nationality", "netReceived", "note", "permanentAddress", "phone", "pitTax", "quantity", "sort", "taxCode", "unit", "unitPrice", "updatedAt", "workItem") SELECT "acceptanceDate", "amount", "bankAccountNo", "bankBranch", "bankName", "batchId", "createdAt", "dateOfBirth", "eventName", "executionDate", "executionLocation", "fullName", "gender", "generatedAt", "generatedFileKey", "grossNet", "id", "idIssueDate", "idIssuePlace", "idNumber", "nationality", "netReceived", "note", "permanentAddress", "phone", "pitTax", "quantity", "sort", "taxCode", "unit", "unitPrice", "updatedAt", "workItem" FROM "ctv_contract";
DROP TABLE "ctv_contract";
ALTER TABLE "new_ctv_contract" RENAME TO "ctv_contract";
CREATE INDEX "ctv_contract_batchId_sort_idx" ON "ctv_contract"("batchId", "sort");
CREATE INDEX "ctv_contract_financeCostLineId_idx" ON "ctv_contract"("financeCostLineId");
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
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vendor_payment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_financeCostLineId_fkey" FOREIGN KEY ("financeCostLineId") REFERENCES "finance_cost_line" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_ctvBatchId_fkey" FOREIGN KEY ("ctvBatchId") REFERENCES "ctv_batch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_vendor_payment" ("amount", "createdAt", "createdById", "dueDate", "financeCostLineId", "id", "invoiceNo", "note", "overCapNote", "paidDate", "projectId", "status", "updatedAt", "vendorId") SELECT "amount", "createdAt", "createdById", "dueDate", "financeCostLineId", "id", "invoiceNo", "note", "overCapNote", "paidDate", "projectId", "status", "updatedAt", "vendorId" FROM "vendor_payment";
DROP TABLE "vendor_payment";
ALTER TABLE "new_vendor_payment" RENAME TO "vendor_payment";
CREATE INDEX "vendor_payment_vendorId_status_idx" ON "vendor_payment"("vendorId", "status");
CREATE INDEX "vendor_payment_ctvBatchId_idx" ON "vendor_payment"("ctvBatchId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

