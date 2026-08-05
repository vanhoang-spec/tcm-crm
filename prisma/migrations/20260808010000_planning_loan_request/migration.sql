-- CreateTable
CREATE TABLE "planning_loan_request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "fromTeamId" TEXT NOT NULL,
    "toTeamId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "lentStaffId" TEXT,
    "decisionNote" TEXT,
    CONSTRAINT "planning_loan_request_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "planning_loan_request_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "planning_loan_request_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "planning_loan_request_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "planning_loan_request_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "planning_loan_request_lentStaffId_fkey" FOREIGN KEY ("lentStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "planning_loan_request_projectId_status_idx" ON "planning_loan_request"("projectId", "status");

-- CreateIndex
CREATE INDEX "planning_loan_request_toTeamId_status_idx" ON "planning_loan_request"("toTeamId", "status");

