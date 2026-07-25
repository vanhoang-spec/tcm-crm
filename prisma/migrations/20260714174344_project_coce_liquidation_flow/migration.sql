-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "contractNo" TEXT,
    "contractDate" DATETIME,
    "poNo" TEXT,
    "poDate" DATETIME,
    "paymentTermDays" INTEGER,
    "templateSource" TEXT,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "confirmEmailAt" DATETIME,
    "fileUrl" TEXT,
    "note" TEXT,
    "accountantConfirmedAt" DATETIME,
    "accountantConfirmedById" TEXT,
    "acceptanceDocsConfirmedAt" DATETIME,
    "acceptanceDocsConfirmedById" TEXT,
    "clientAcceptanceConfirmedAt" DATETIME,
    "clientAcceptanceConfirmedById" TEXT,
    "expectedAcceptanceSignDate" DATETIME,
    "acceptanceReminderSentAt" DATETIME,
    "invoiceNo" TEXT,
    "invoiceDate" DATETIME,
    "invoiceById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contract_accountantConfirmedById_fkey" FOREIGN KEY ("accountantConfirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "contract_acceptanceDocsConfirmedById_fkey" FOREIGN KEY ("acceptanceDocsConfirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "contract_clientAcceptanceConfirmedById_fkey" FOREIGN KEY ("clientAcceptanceConfirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "contract_invoiceById_fkey" FOREIGN KEY ("invoiceById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_contract" ("acceptanceDocsConfirmedAt", "acceptanceDocsConfirmedById", "accountantConfirmedAt", "accountantConfirmedById", "confirmEmailAt", "contractDate", "contractNo", "createdAt", "fileUrl", "id", "note", "paymentTermDays", "poDate", "poNo", "projectId", "signed", "templateSource", "updatedAt") SELECT "acceptanceDocsConfirmedAt", "acceptanceDocsConfirmedById", "accountantConfirmedAt", "accountantConfirmedById", "confirmEmailAt", "contractDate", "contractNo", "createdAt", "fileUrl", "id", "note", "paymentTermDays", "poDate", "poNo", "projectId", "signed", "templateSource", "updatedAt" FROM "contract";
DROP TABLE "contract";
ALTER TABLE "new_contract" RENAME TO "contract";
CREATE UNIQUE INDEX "contract_projectId_key" ON "contract"("projectId");
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
INSERT INTO "new_cost_sheet" ("approvedAt", "approvedById", "ceTotal", "chiHo", "coTotal", "contingencyPct", "createdAt", "discountPct", "id", "marginOverrideById", "marginOverrideNote", "mgmtFeePct", "minMarginPct", "projectId", "rejectedAt", "rejectedById", "rejectedNote", "scenario", "templateId", "updatedAt", "vatPct", "version") SELECT "approvedAt", "approvedById", "ceTotal", "chiHo", "coTotal", "contingencyPct", "createdAt", "discountPct", "id", "marginOverrideById", "marginOverrideNote", "mgmtFeePct", "minMarginPct", "projectId", "rejectedAt", "rejectedById", "rejectedNote", "scenario", "templateId", "updatedAt", "vatPct", "version" FROM "cost_sheet";
DROP TABLE "cost_sheet";
ALTER TABLE "new_cost_sheet" RENAME TO "cost_sheet";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
