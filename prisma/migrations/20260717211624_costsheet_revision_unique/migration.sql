-- DropIndex
DROP INDEX "cost_sheet_revision_costSheetId_revNo_idx";

-- CreateIndex
CREATE UNIQUE INDEX "cost_sheet_revision_costSheetId_revNo_key" ON "cost_sheet_revision"("costSheetId", "revNo");
