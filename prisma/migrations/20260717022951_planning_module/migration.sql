-- CreateTable
CREATE TABLE "planning_job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "orderId" TEXT,
    "briefLinkUrl" TEXT,
    "briefNote" TEXT,
    "requestedById" TEXT,
    "finalConfirmedById" TEXT,
    "finalConfirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "planning_job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "planning_job_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "project_order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "planning_job_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "planning_job_finalConfirmedById_fkey" FOREIGN KEY ("finalConfirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "planning_stage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "assigneeId" TEXT,
    "assignedById" TEXT,
    "assignedAt" DATETIME,
    "dueAt" DATETIME,
    "resultLinkUrl" TEXT,
    "hoursSpent" REAL,
    "completedAt" DATETIME,
    "note" TEXT,
    CONSTRAINT "planning_stage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "planning_job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "planning_stage_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "planning_stage_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "planning_proposal_version" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "resultLinkUrl" TEXT NOT NULL,
    "hoursSpent" REAL,
    "submittedById" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'IN_REVIEW',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    CONSTRAINT "planning_proposal_version_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "planning_job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "planning_proposal_version_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "planning_proposal_version_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "planning_job_orderId_key" ON "planning_job"("orderId");

-- CreateIndex
CREATE INDEX "planning_job_projectId_idx" ON "planning_job"("projectId");

-- CreateIndex
CREATE INDEX "planning_stage_assigneeId_idx" ON "planning_stage"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "planning_stage_jobId_stage_key" ON "planning_stage"("jobId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "planning_proposal_version_jobId_versionNo_key" ON "planning_proposal_version"("jobId", "versionNo");
