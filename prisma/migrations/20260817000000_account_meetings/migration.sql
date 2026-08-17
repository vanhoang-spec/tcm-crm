-- CreateTable
CREATE TABLE "account_meeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "note" TEXT,
    "rawMinutes" TEXT,
    "aiParsedAt" DATETIME,
    "finalizedAt" DATETIME,
    "finalizedById" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "account_meeting_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "account_meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "account_meeting_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "account_meeting_row" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "rag" TEXT,
    "update" TEXT,
    "risks" TEXT,
    "nextSteps" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "account_meeting_row_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "account_meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "account_meeting_row_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "account_meeting_row_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "account_meeting_action" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "rowId" TEXT,
    "title" TEXT NOT NULL,
    "assigneeStaffId" TEXT,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "doneAt" DATETIME,
    "doneInMeetingId" TEXT,
    "notifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "account_meeting_action_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "account_meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "account_meeting_action_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "account_meeting_row" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "account_meeting_action_assigneeStaffId_fkey" FOREIGN KEY ("assigneeStaffId") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "account_meeting_teamId_weekStart_key" ON "account_meeting"("teamId", "weekStart");

-- CreateIndex
CREATE INDEX "account_meeting_row_meetingId_idx" ON "account_meeting_row"("meetingId");

-- CreateIndex
CREATE INDEX "account_meeting_row_projectId_idx" ON "account_meeting_row"("projectId");

-- CreateIndex
CREATE INDEX "account_meeting_action_meetingId_idx" ON "account_meeting_action"("meetingId");

-- CreateIndex
CREATE INDEX "account_meeting_action_assigneeStaffId_status_idx" ON "account_meeting_action"("assigneeStaffId", "status");

