-- PUR-1 (16/08/2026): sub-module Thu mua — ho so NCC + nhom hang + kho tai lieu NCC + RFQ.
-- Sinh bang prisma migrate diff, DA KIEM khong co DROP TABLE / RedefineTables: 6 cot Vendor moi
-- deu nullable nen Prisma phat ALTER TABLE ADD COLUMN thang; 6 bang con lai la CREATE TABLE moi.
-- AlterTable
ALTER TABLE "vendor" ADD COLUMN "address" TEXT;
ALTER TABLE "vendor" ADD COLUMN "bankAccountHolder" TEXT;
ALTER TABLE "vendor" ADD COLUMN "bankAccountNo" TEXT;
ALTER TABLE "vendor" ADD COLUMN "bankName" TEXT;
ALTER TABLE "vendor" ADD COLUMN "note" TEXT;
ALTER TABLE "vendor" ADD COLUMN "paymentTermsNote" TEXT;

-- CreateTable
CREATE TABLE "vendor_group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendorId" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    CONSTRAINT "vendor_group_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vendor_document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendorId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "amount" BIGINT,
    "signedAt" DATETIME,
    "note" TEXT,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendor_document_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vendor_document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vendor_document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rfq" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "departmentTaskId" TEXT,
    "groupCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "aiJson" TEXT,
    "finalJson" TEXT,
    "submittedAt" DATETIME,
    "submittedById" TEXT,
    "confirmedAt" DATETIME,
    "confirmedById" TEXT,
    "appliedRevNo" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "rfq_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rfq_departmentTaskId_fkey" FOREIGN KEY ("departmentTaskId") REFERENCES "department_task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "rfq_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "rfq_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "rfq_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rfq_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfqId" TEXT NOT NULL,
    "costLineStableKey" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "specs" TEXT,
    "unit" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "refUnitPrice" BIGINT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "rfq_line_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfq" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rfq_vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "tokenHash" TEXT,
    "tokenExpiresAt" DATETIME,
    "revokedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "submittedAt" DATETIME,
    "submittedVia" TEXT,
    "fileKey" TEXT,
    "fileName" TEXT,
    "termsJson" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "rfq_vendor_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfq" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rfq_vendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rfq_quote_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfqVendorId" TEXT NOT NULL,
    "rfqLineId" TEXT NOT NULL,
    "unitPrice" BIGINT NOT NULL DEFAULT 0,
    "quantity" REAL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "extraJson" TEXT,
    "note" TEXT,
    CONSTRAINT "rfq_quote_line_rfqVendorId_fkey" FOREIGN KEY ("rfqVendorId") REFERENCES "rfq_vendor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rfq_quote_line_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "rfq_line" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "vendor_group_groupCode_idx" ON "vendor_group"("groupCode");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_group_vendorId_groupCode_key" ON "vendor_group"("vendorId", "groupCode");

-- CreateIndex
CREATE INDEX "vendor_document_vendorId_idx" ON "vendor_document"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_document_projectId_idx" ON "vendor_document"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_code_key" ON "rfq"("code");

-- CreateIndex
CREATE INDEX "rfq_projectId_idx" ON "rfq"("projectId");

-- CreateIndex
CREATE INDEX "rfq_status_idx" ON "rfq"("status");

-- CreateIndex
CREATE INDEX "rfq_line_rfqId_idx" ON "rfq_line"("rfqId");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_vendor_tokenHash_key" ON "rfq_vendor"("tokenHash");

-- CreateIndex
CREATE INDEX "rfq_vendor_vendorId_idx" ON "rfq_vendor"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_vendor_rfqId_vendorId_key" ON "rfq_vendor"("rfqId", "vendorId");

-- CreateIndex
CREATE INDEX "rfq_quote_line_rfqLineId_idx" ON "rfq_quote_line"("rfqLineId");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_quote_line_rfqVendorId_rfqLineId_key" ON "rfq_quote_line"("rfqVendorId", "rfqLineId");

