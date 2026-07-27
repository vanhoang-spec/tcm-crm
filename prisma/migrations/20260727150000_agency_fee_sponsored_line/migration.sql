-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cost_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costSheetId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "stableKey" TEXT,
    "itemCode" TEXT,
    "lineType" TEXT NOT NULL DEFAULT 'QTY_PRICE',
    "itemName" TEXT NOT NULL,
    "specs" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unitPrice" BIGINT NOT NULL DEFAULT 0,
    "fixedAmount" BIGINT,
    "percentVal" REAL,
    "taxType" TEXT NOT NULL DEFAULT 'VAT',
    "customTaxAmount" BIGINT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "vendorId" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "maxMarkupPct" REAL,
    "isSponsored" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    CONSTRAINT "cost_line_costSheetId_fkey" FOREIGN KEY ("costSheetId") REFERENCES "cost_sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cost_line_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "cost_sheet_section" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cost_line_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_cost_line" ("amount", "costSheetId", "customTaxAmount", "fixedAmount", "id", "isLocked", "itemCode", "itemName", "lineType", "maxMarkupPct", "note", "percentVal", "quantity", "sectionId", "sort", "specs", "stableKey", "taxType", "unit", "unitPrice", "vendorId") SELECT "amount", "costSheetId", "customTaxAmount", "fixedAmount", "id", "isLocked", "itemCode", "itemName", "lineType", "maxMarkupPct", "note", "percentVal", "quantity", "sectionId", "sort", "specs", "stableKey", "taxType", "unit", "unitPrice", "vendorId" FROM "cost_line";
DROP TABLE "cost_line";
ALTER TABLE "new_cost_line" RENAME TO "cost_line";
CREATE UNIQUE INDEX "cost_line_costSheetId_stableKey_key" ON "cost_line"("costSheetId", "stableKey");
CREATE TABLE "new_cost_sheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'CTRACT',
    "scenario" TEXT NOT NULL DEFAULT 'COST_UP',
    "templateId" TEXT,
    "ceTotal" BIGINT NOT NULL DEFAULT 0,
    "coTotal" BIGINT NOT NULL DEFAULT 0,
    "chiHo" BIGINT NOT NULL DEFAULT 0,
    "vatPct" REAL NOT NULL DEFAULT 0,
    "agencyFeePct" REAL NOT NULL DEFAULT 10,
    "mgmtFeePct" REAL NOT NULL DEFAULT 0,
    "contingencyPct" REAL NOT NULL DEFAULT 0,
    "discountPct" REAL NOT NULL DEFAULT 0,
    "minMarginPct" REAL NOT NULL DEFAULT 31,
    "marginOverrideById" TEXT,
    "marginOverrideNote" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "rejectedById" TEXT,
    "rejectedNote" TEXT,
    "rejectedAt" DATETIME,
    "sentToLiquidationRevisionId" TEXT,
    "sentToLiquidationAt" DATETIME,
    "sentToLiquidationById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cost_sheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "costsheet_template" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_marginOverrideById_fkey" FOREIGN KEY ("marginOverrideById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_sentToLiquidationRevisionId_fkey" FOREIGN KEY ("sentToLiquidationRevisionId") REFERENCES "cost_sheet_revision" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_sentToLiquidationById_fkey" FOREIGN KEY ("sentToLiquidationById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_cost_sheet" ("approvedAt", "approvedById", "ceTotal", "chiHo", "coTotal", "contingencyPct", "createdAt", "discountPct", "id", "marginOverrideById", "marginOverrideNote", "mgmtFeePct", "minMarginPct", "projectId", "rejectedAt", "rejectedById", "rejectedNote", "scenario", "sentToLiquidationAt", "sentToLiquidationById", "sentToLiquidationRevisionId", "templateId", "updatedAt", "vatPct", "version") SELECT "approvedAt", "approvedById", "ceTotal", "chiHo", "coTotal", "contingencyPct", "createdAt", "discountPct", "id", "marginOverrideById", "marginOverrideNote", "mgmtFeePct", "minMarginPct", "projectId", "rejectedAt", "rejectedById", "rejectedNote", "scenario", "sentToLiquidationAt", "sentToLiquidationById", "sentToLiquidationRevisionId", "templateId", "updatedAt", "vatPct", "version" FROM "cost_sheet";
DROP TABLE "cost_sheet";
ALTER TABLE "new_cost_sheet" RENAME TO "cost_sheet";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

