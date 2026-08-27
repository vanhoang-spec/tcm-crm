-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "typeId" TEXT,
    "creatorId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "projectId" TEXT,
    "dueDate" DATETIME,
    "startedAt" DATETIME,
    "submittedAt" DATETIME,
    "completedAt" DATETIME,
    "canceledAt" DATETIME,
    "returnNote" TEXT,
    "recurrenceId" TEXT,
    "deadlineReminderSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "task_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "task_recurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "task_follower" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    CONSTRAINT "task_follower_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_follower_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "task_checklist_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "task_checklist_item_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "task_comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "authorStaffId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_comment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_comment_authorStaffId_fkey" FOREIGN KEY ("authorStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "task_file" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_file_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_file_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "task_recurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "typeId" TEXT,
    "projectId" TEXT,
    "creatorId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "freq" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "dueOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "checklistJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSpawnKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "task_recurrence_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "task_recurrence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "task_recurrence_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "task_recurrence_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "task_assigneeId_status_idx" ON "task"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "task_creatorId_idx" ON "task"("creatorId");

-- CreateIndex
CREATE INDEX "task_projectId_idx" ON "task"("projectId");

-- CreateIndex
CREATE INDEX "task_parentId_idx" ON "task"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "task_follower_taskId_staffId_key" ON "task_follower"("taskId", "staffId");

-- CreateIndex
CREATE INDEX "task_checklist_item_taskId_sort_idx" ON "task_checklist_item"("taskId", "sort");

-- CreateIndex
CREATE INDEX "task_comment_taskId_createdAt_idx" ON "task_comment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "task_file_taskId_idx" ON "task_file"("taskId");

-- CreateIndex
CREATE INDEX "task_recurrence_isActive_idx" ON "task_recurrence"("isActive");

