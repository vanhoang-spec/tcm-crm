-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cost_line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costSheetId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "lineType" TEXT NOT NULL DEFAULT 'QTY_PRICE',
    "itemName" TEXT NOT NULL,
    "specs" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unitPrice" BIGINT NOT NULL DEFAULT 0,
    "fixedAmount" BIGINT,
    "percentVal" REAL,
    "taxType" TEXT NOT NULL DEFAULT 'VAT',
    "amount" BIGINT NOT NULL DEFAULT 0,
    "vendorId" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "maxMarkupPct" REAL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    CONSTRAINT "cost_line_costSheetId_fkey" FOREIGN KEY ("costSheetId") REFERENCES "cost_sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cost_line_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "cost_sheet_section" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cost_line_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_cost_line" ("amount", "costSheetId", "fixedAmount", "id", "isLocked", "itemName", "lineType", "maxMarkupPct", "note", "percentVal", "quantity", "sectionId", "sort", "specs", "unit", "unitPrice", "vendorId") SELECT "amount", "costSheetId", "fixedAmount", "id", "isLocked", "itemName", "lineType", "maxMarkupPct", "note", "percentVal", "quantity", "sectionId", "sort", "specs", "unit", "unitPrice", "vendorId" FROM "cost_line";
DROP TABLE "cost_line";
ALTER TABLE "new_cost_line" RENAME TO "cost_line";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
