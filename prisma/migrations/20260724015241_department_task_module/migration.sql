-- CreateTable
CREATE TABLE "department_task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "orderedById" TEXT,
    "sourceKey" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "assigneeId" TEXT,
    "assignedById" TEXT,
    "assignedAt" DATETIME,
    "leadApprovalNotRequired" BOOLEAN NOT NULL DEFAULT false,
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
    CONSTRAINT "department_task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "department_task_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "project_order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "department_task_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "project_order_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "department_task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "department_task_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "department_task_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "department_task_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "department_task_projectId_department_status_idx" ON "department_task"("projectId", "department", "status");

-- CreateIndex
CREATE INDEX "department_task_assigneeId_status_idx" ON "department_task"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "department_task_orderItemId_idx" ON "department_task"("orderItemId");
