-- CreateTable
CREATE TABLE "project_order_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "sourceTimelineItemId" TEXT,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "desiredReceiptAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "project_order_item_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "project_order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_order_item_sourceTimelineItemId_fkey" FOREIGN KEY ("sourceTimelineItemId") REFERENCES "timeline_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cost_sheet_revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costSheetId" TEXT NOT NULL,
    "revNo" INTEGER NOT NULL,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "ceTotal" BIGINT NOT NULL DEFAULT 0,
    "coTotal" BIGINT NOT NULL DEFAULT 0,
    "chiHo" BIGINT NOT NULL DEFAULT 0,
    "marginPct" REAL NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotJson" TEXT NOT NULL,
    CONSTRAINT "cost_sheet_revision_costSheetId_fkey" FOREIGN KEY ("costSheetId") REFERENCES "cost_sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cost_sheet_revision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "timeline_template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "projectTypeId" TEXT,
    "viewMode" TEXT NOT NULL DEFAULT 'GANTT',
    "columnsJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "timeline_template_projectTypeId_fkey" FOREIGN KEY ("projectTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "timeline_template_section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameVi" TEXT NOT NULL,
    "nameEn" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "timeline_template_section_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "timeline_template" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "timeline_template_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "parentLabel" TEXT,
    "title" TEXT NOT NULL,
    "defaultDepartmentCode" TEXT,
    "defaultDurationDays" INTEGER,
    "defaultUnit" TEXT,
    "defaultQty" REAL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "timeline_template_item_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "timeline_template_section" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_staffing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "zoneLabel" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "project_staffing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_project_order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "briefLinkUrl" TEXT,
    "extraBriefInfo" TEXT,
    "outputRequest" TEXT,
    "desiredTimeline" DATETIME,
    "meetingAt" DATETIME,
    "meetingLocation" TEXT,
    "meetingFormat" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT,
    "acceptedAt" DATETIME,
    "acceptedById" TEXT,
    "resultLinkUrl" TEXT,
    "resultSentAt" DATETIME,
    "resultSentById" TEXT,
    "deadlineReminderSentAt" DATETIME,
    CONSTRAINT "project_order_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_order_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_order_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_order_resultSentById_fkey" FOREIGN KEY ("resultSentById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_project_order" ("acceptedAt", "acceptedById", "briefLinkUrl", "deadlineReminderSentAt", "department", "desiredTimeline", "extraBriefInfo", "id", "meetingAt", "meetingFormat", "meetingLocation", "outputRequest", "projectId", "resultLinkUrl", "resultSentAt", "resultSentById", "sentAt", "sentById", "status") SELECT "acceptedAt", "acceptedById", "briefLinkUrl", "deadlineReminderSentAt", "department", "desiredTimeline", "extraBriefInfo", "id", "meetingAt", "meetingFormat", "meetingLocation", "outputRequest", "projectId", "resultLinkUrl", "resultSentAt", "resultSentById", "sentAt", "sentById", "status" FROM "project_order";
DROP TABLE "project_order";
ALTER TABLE "new_project_order" RENAME TO "project_order";
CREATE UNIQUE INDEX "project_order_projectId_department_key" ON "project_order"("projectId", "department");
CREATE TABLE "new_timeline_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "ownerStaffId" TEXT,
    "secondaryOwnerStaffId" TEXT,
    "departmentCode" TEXT,
    "accountableParty" TEXT,
    "quantity" REAL,
    "unit" TEXT,
    "templateItemId" TEXT,
    "statusId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "externalPublished" BOOLEAN NOT NULL DEFAULT false,
    "externalTitle" TEXT,
    "externalStartDate" DATETIME,
    "externalEndDate" DATETIME,
    "clientEditable" BOOLEAN NOT NULL DEFAULT false,
    "clientStatus" TEXT,
    "clientNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "timeline_item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "timeline_item_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "timeline_item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "timeline_item_ownerStaffId_fkey" FOREIGN KEY ("ownerStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "timeline_item_secondaryOwnerStaffId_fkey" FOREIGN KEY ("secondaryOwnerStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "timeline_item_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_timeline_item" ("clientEditable", "clientNote", "clientStatus", "createdAt", "departmentCode", "endDate", "externalEndDate", "externalPublished", "externalStartDate", "externalTitle", "id", "isShared", "ownerStaffId", "parentId", "projectId", "sort", "startDate", "statusId", "title", "updatedAt") SELECT "clientEditable", "clientNote", "clientStatus", "createdAt", "departmentCode", "endDate", "externalEndDate", "externalPublished", "externalStartDate", "externalTitle", "id", "isShared", "ownerStaffId", "parentId", "projectId", "sort", "startDate", "statusId", "title", "updatedAt" FROM "timeline_item";
DROP TABLE "timeline_item";
ALTER TABLE "new_timeline_item" RENAME TO "timeline_item";
CREATE INDEX "timeline_item_projectId_sort_idx" ON "timeline_item"("projectId", "sort");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "project_order_item_orderId_sort_idx" ON "project_order_item"("orderId", "sort");

-- CreateIndex
CREATE INDEX "cost_sheet_revision_costSheetId_revNo_idx" ON "cost_sheet_revision"("costSheetId", "revNo");

-- CreateIndex
CREATE INDEX "project_staffing_projectId_sort_idx" ON "project_staffing"("projectId", "sort");
