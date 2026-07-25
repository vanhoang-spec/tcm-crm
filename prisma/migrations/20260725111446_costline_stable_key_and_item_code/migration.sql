-- AlterTable
ALTER TABLE "cost_line" ADD COLUMN "itemCode" TEXT;
ALTER TABLE "cost_line" ADD COLUMN "stableKey" TEXT;

-- AlterTable
ALTER TABLE "cost_sheet_section" ADD COLUMN "departmentCode" TEXT;

-- AlterTable
ALTER TABLE "department" ADD COLUMN "costPrefix" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vendor_payment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vendor_payment_financeCostLineId_fkey" FOREIGN KEY ("financeCostLineId") REFERENCES "finance_cost_line" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_vendor_payment" ("amount", "createdAt", "createdById", "dueDate", "id", "invoiceNo", "note", "paidDate", "projectId", "status", "updatedAt", "vendorId") SELECT "amount", "createdAt", "createdById", "dueDate", "id", "invoiceNo", "note", "paidDate", "projectId", "status", "updatedAt", "vendorId" FROM "vendor_payment";
DROP TABLE "vendor_payment";
ALTER TABLE "new_vendor_payment" RENAME TO "vendor_payment";
CREATE INDEX "vendor_payment_vendorId_status_idx" ON "vendor_payment"("vendorId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
