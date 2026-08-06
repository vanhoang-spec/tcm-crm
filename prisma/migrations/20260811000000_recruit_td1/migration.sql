-- TUYỂN DỤNG (TD-1) — sub-module của Nhân sự.
--
-- 5 bảng MỚI HOÀN TOÀN, không đụng một cột nào của bảng cũ: `job_position`, `jd_template`,
-- `candidate`, `interview`, `interview_score`. Quan hệ ngược trên `staff` / `department` / `team`
-- là quan hệ ảo của Prisma nên KHÔNG sinh ALTER TABLE — đã kiểm bằng `prisma migrate diff` trước
-- khi chốt: toàn bộ script chỉ có CREATE TABLE + CREATE INDEX, không có DROP/RENAME/PRAGMA.
--
-- (Bẫy RedefineTables đã cắn 5 lần trong repo này — xem HANDOVER 10.18 / 10.26 / 10.30. Lần này
-- không dính vì không thêm cột vào bảng có sẵn, nhưng vẫn phải soi SQL trước khi áp.)

-- CreateTable
CREATE TABLE "job_position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "departmentId" TEXT,
    "teamId" TEXT,
    "hiringManagerStaffId" TEXT,
    "jdSummary" TEXT,
    "jdResponsibilities" TEXT,
    "jdRequirements" TEXT,
    "jdBenefits" TEXT,
    "jdUpdatedAt" DATETIME,
    "jdUpdatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "job_position_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "job_position_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "job_position_hiringManagerStaffId_fkey" FOREIGN KEY ("hiringManagerStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "job_position_jdUpdatedById_fkey" FOREIGN KEY ("jdUpdatedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "jd_template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "jdSummary" TEXT,
    "jdResponsibilities" TEXT,
    "jdRequirements" TEXT,
    "jdBenefits" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "candidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dob" DATETIME,
    "phone" TEXT,
    "email" TEXT,
    "summaryWork" TEXT,
    "summarySkills" TEXT,
    "summaryOther" TEXT,
    "expectedSalary" BIGINT,
    "cvFileKey" TEXT NOT NULL,
    "cvFileName" TEXT NOT NULL,
    "cvFileMime" TEXT NOT NULL,
    "cvFileSize" INTEGER NOT NULL,
    "aiParsedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "decidedAt" DATETIME,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "candidate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "job_position" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "candidate_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "candidate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "interview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "interviewerStaffId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedAt" DATETIME,
    "declineReason" TEXT,
    "recommendation" TEXT,
    "strengths" TEXT,
    "concerns" TEXT,
    "note" TEXT,
    "scoredAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "interview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "interview_interviewerStaffId_fkey" FOREIGN KEY ("interviewerStaffId") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "interview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "interview_score" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "interviewId" TEXT NOT NULL,
    "criterionCode" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "note" TEXT,
    CONSTRAINT "interview_score_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interview" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "job_position_status_idx" ON "job_position"("status");

-- CreateIndex
CREATE INDEX "job_position_departmentId_idx" ON "job_position"("departmentId");

-- CreateIndex
CREATE INDEX "candidate_positionId_status_idx" ON "candidate"("positionId", "status");

-- CreateIndex
CREATE INDEX "candidate_status_idx" ON "candidate"("status");

-- CreateIndex
CREATE INDEX "interview_interviewerStaffId_status_idx" ON "interview"("interviewerStaffId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "interview_candidateId_round_interviewerStaffId_key" ON "interview"("candidateId", "round", "interviewerStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_score_interviewId_criterionCode_key" ON "interview_score"("interviewId", "criterionCode");

