-- CreateTable
CREATE TABLE "position_salary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionTitle" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "periodCode" TEXT NOT NULL,
    "monthlySalary" BIGINT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "kpi_criterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "nameVi" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "appliesTo" TEXT NOT NULL DEFAULT 'ALL',
    "weight" REAL NOT NULL DEFAULT 1,
    "scaleMax" INTEGER NOT NULL DEFAULT 5,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "autoKey" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activeFromPeriod" TEXT,
    "activeToPeriod" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "kpi_score" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "criterionId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "periodCode" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "note" TEXT,
    "scoredById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "kpi_score_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "kpi_criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "kpi_score_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "kpi_score_scoredById_fkey" FOREIGN KEY ("scoredById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "kpi_period" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodCode" TEXT NOT NULL,
    "poolKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "teamFactor" REAL,
    "poolAmount" BIGINT,
    "marginWeighted" REAL,
    "resultJson" TEXT,
    "closedAt" DATETIME,
    "closedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "kpi_period_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "position_salary_positionTitle_departmentCode_periodCode_key" ON "position_salary"("positionTitle", "departmentCode", "periodCode");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_criterion_code_key" ON "kpi_criterion"("code");

-- CreateIndex
CREATE INDEX "kpi_score_staffId_periodCode_idx" ON "kpi_score"("staffId", "periodCode");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_score_criterionId_staffId_periodCode_key" ON "kpi_score"("criterionId", "staffId", "periodCode");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_period_periodCode_poolKey_key" ON "kpi_period"("periodCode", "poolKey");

