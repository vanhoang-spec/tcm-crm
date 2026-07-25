-- CreateTable
CREATE TABLE "ctv_batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT,
    "programFrom" TEXT,
    "programTo" TEXT,
    "teamLeader" TEXT,
    "workLocation" TEXT,
    "sourceFileKey" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ctv_batch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ctv_batch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ctv_contract" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ctv_contract_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ctv_batch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ctv_batch_projectId_idx" ON "ctv_batch"("projectId");

-- CreateIndex
CREATE INDEX "ctv_contract_batchId_sort_idx" ON "ctv_contract"("batchId", "sort");
