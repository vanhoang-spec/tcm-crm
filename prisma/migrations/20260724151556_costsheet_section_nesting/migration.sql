-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cost_sheet_section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costSheetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "icon" TEXT,
    "nameVi" TEXT NOT NULL,
    "nameEn" TEXT,
    "colorSlot" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isProxy" BOOLEAN NOT NULL DEFAULT false,
    "proxyFeeType" TEXT,
    "proxyFeeVal" REAL,
    "parentSectionId" TEXT,
    CONSTRAINT "cost_sheet_section_costSheetId_fkey" FOREIGN KEY ("costSheetId") REFERENCES "cost_sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_section_parentSectionId_fkey" FOREIGN KEY ("parentSectionId") REFERENCES "cost_sheet_section" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_cost_sheet_section" ("code", "colorSlot", "costSheetId", "icon", "id", "isProxy", "nameEn", "nameVi", "proxyFeeType", "proxyFeeVal", "sort") SELECT "code", "colorSlot", "costSheetId", "icon", "id", "isProxy", "nameEn", "nameVi", "proxyFeeType", "proxyFeeVal", "sort" FROM "cost_sheet_section";
DROP TABLE "cost_sheet_section";
ALTER TABLE "new_cost_sheet_section" RENAME TO "cost_sheet_section";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
