-- CreateTable
CREATE TABLE "mkt_month_plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" DATETIME NOT NULL,
    "theme" TEXT NOT NULL,
    "goals" TEXT NOT NULL DEFAULT '',
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mkt_month_plan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_month_plan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mkt_design_order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "channels" TEXT NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "assigneeId" TEXT,
    "deliverableLinkUrl" TEXT,
    "designerNote" TEXT,
    "acceptedAt" DATETIME,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mkt_design_order_postId_fkey" FOREIGN KEY ("postId") REFERENCES "mkt_post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mkt_design_order_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_mkt_plan_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthPlanId" TEXT,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "weekStart" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "keyPoints" TEXT NOT NULL DEFAULT '',
    "channels" TEXT NOT NULL,
    "contentTypeId" TEXT,
    "projectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "postId" TEXT,
    "note" TEXT,
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "draftedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mkt_plan_item_contentTypeId_fkey" FOREIGN KEY ("contentTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_plan_item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_plan_item_postId_fkey" FOREIGN KEY ("postId") REFERENCES "mkt_post" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_plan_item_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_plan_item_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_plan_item_monthPlanId_fkey" FOREIGN KEY ("monthPlanId") REFERENCES "mkt_month_plan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_mkt_plan_item" ("aiSuggested", "channels", "contentTypeId", "createdAt", "createdById", "draftedAt", "id", "keyPoints", "note", "postId", "projectId", "status", "title", "updatedAt", "weekStart") SELECT "aiSuggested", "channels", "contentTypeId", "createdAt", "createdById", "draftedAt", "id", "keyPoints", "note", "postId", "projectId", "status", "title", "updatedAt", "weekStart" FROM "mkt_plan_item";
DROP TABLE "mkt_plan_item";
ALTER TABLE "new_mkt_plan_item" RENAME TO "mkt_plan_item";
CREATE UNIQUE INDEX "mkt_plan_item_postId_key" ON "mkt_plan_item"("postId");
CREATE INDEX "mkt_plan_item_weekStart_status_idx" ON "mkt_plan_item"("weekStart", "status");
CREATE INDEX "mkt_plan_item_monthPlanId_idx" ON "mkt_plan_item"("monthPlanId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "mkt_month_plan_month_key" ON "mkt_month_plan"("month");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_design_order_postId_key" ON "mkt_design_order"("postId");

-- CreateIndex
CREATE INDEX "mkt_design_order_status_idx" ON "mkt_design_order"("status");

-- CreateIndex
CREATE INDEX "mkt_design_order_assigneeId_status_idx" ON "mkt_design_order"("assigneeId", "status");

