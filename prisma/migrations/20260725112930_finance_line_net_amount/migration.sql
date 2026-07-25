-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_finance_cost_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "itemCode" TEXT,
    "sectionCode" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "specs" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "netAmount" BIGINT NOT NULL DEFAULT 0,
    "vendorId" TEXT,
    "sourceRevNo" INTEGER NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "finance_cost_line_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "finance_cost_line_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_finance_cost_line" ("amount", "createdAt", "id", "isStale", "itemCode", "itemName", "lineKey", "projectId", "sectionCode", "sectionName", "sort", "sourceRevNo", "specs", "updatedAt", "vendorId") SELECT "amount", "createdAt", "id", "isStale", "itemCode", "itemName", "lineKey", "projectId", "sectionCode", "sectionName", "sort", "sourceRevNo", "specs", "updatedAt", "vendorId" FROM "finance_cost_line";
DROP TABLE "finance_cost_line";
ALTER TABLE "new_finance_cost_line" RENAME TO "finance_cost_line";
CREATE INDEX "finance_cost_line_projectId_idx" ON "finance_cost_line"("projectId");
CREATE UNIQUE INDEX "finance_cost_line_projectId_lineKey_key" ON "finance_cost_line"("projectId", "lineKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
