-- CreateTable
CREATE TABLE "creative_draft_project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "phase" TEXT NOT NULL DEFAULT 'BIDDING',
    "createdById" TEXT NOT NULL,
    "mappedToProjectId" TEXT,
    "mappedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "creative_draft_project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_creative_task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "orderedById" TEXT,
    "sourceItemLabel" TEXT,
    "draftId" TEXT,
    "squadId" TEXT,
    "taskTypeId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "assigneeId" TEXT,
    "assignedById" TEXT,
    "assignedAt" DATETIME,
    "cdApprovalNotRequired" BOOLEAN NOT NULL DEFAULT false,
    "deadline" DATETIME,
    "deliverableLinkUrl" TEXT,
    "hoursSpent" REAL,
    "submittedAt" DATETIME,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "deliveredAt" DATETIME,
    "deadlineReminderSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "creative_task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "creative_task_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "creative_draft_project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "creative_squad" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "project_order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "project_order_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creative_task_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_creative_task" ("assignedAt", "assignedById", "assigneeId", "cdApprovalNotRequired", "createdAt", "deadline", "deadlineReminderSentAt", "deliverableLinkUrl", "deliveredAt", "detail", "hoursSpent", "id", "orderId", "orderItemId", "orderedById", "projectId", "reviewedAt", "reviewedById", "revisionCount", "sourceItemLabel", "squadId", "status", "submittedAt", "taskTypeId", "title", "updatedAt") SELECT "assignedAt", "assignedById", "assigneeId", "cdApprovalNotRequired", "createdAt", "deadline", "deadlineReminderSentAt", "deliverableLinkUrl", "deliveredAt", "detail", "hoursSpent", "id", "orderId", "orderItemId", "orderedById", "projectId", "reviewedAt", "reviewedById", "revisionCount", "sourceItemLabel", "squadId", "status", "submittedAt", "taskTypeId", "title", "updatedAt" FROM "creative_task";
DROP TABLE "creative_task";
ALTER TABLE "new_creative_task" RENAME TO "creative_task";
CREATE INDEX "creative_task_projectId_status_idx" ON "creative_task"("projectId", "status");
CREATE INDEX "creative_task_assigneeId_status_idx" ON "creative_task"("assigneeId", "status");
CREATE INDEX "creative_task_orderItemId_idx" ON "creative_task"("orderItemId");
CREATE INDEX "creative_task_draftId_idx" ON "creative_task"("draftId");
CREATE UNIQUE INDEX "creative_task_orderId_sourceItemLabel_key" ON "creative_task"("orderId", "sourceItemLabel");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "creative_draft_project_mappedAt_idx" ON "creative_draft_project"("mappedAt");

