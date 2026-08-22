-- TD-2c + TD-2d (22/08/2026): phỏng vấn chấm thang 100 + thư mời nhận việc.
-- Thuần additive: 3 cột nullable trên interview (Prisma tự dùng ALTER TABLE, không RedefineTables)
-- + 2 bảng MỚI. Đã kiểm: 0 DROP TABLE, 0 defer_foreign_keys.


-- AlterTable
ALTER TABLE "interview" ADD COLUMN "maxScore" INTEGER;
ALTER TABLE "interview" ADD COLUMN "scope" TEXT;
ALTER TABLE "interview" ADD COLUMN "totalScore" INTEGER;

-- CreateTable
CREATE TABLE "recruit_offer_template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deptKey" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "recruit_offer_template_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recruit_offer_template_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "candidate_offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "salaryAmount" BIGINT,
    "allowanceText" TEXT,
    "probationMonths" INTEGER,
    "probationPct" INTEGER,
    "startDate" DATETIME,
    "extraTerms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" DATETIME,
    "respondedAt" DATETIME,
    "declineReason" TEXT,
    "firstWorkDate" DATETIME,
    "onboardingNotifiedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "candidate_offer_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "candidate_offer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "recruit_offer_template_deptKey_key" ON "recruit_offer_template"("deptKey");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_offer_candidateId_key" ON "candidate_offer"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_offer_status_idx" ON "candidate_offer"("status");

