-- CreateTable
CREATE TABLE "creative_salary_budget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionTitle" TEXT NOT NULL,
    "periodCode" TEXT NOT NULL,
    "monthlySalary" BIGINT NOT NULL,
    "headcountOverride" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "creative_allocation_ratio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionTitle" TEXT NOT NULL,
    "taskTypeId" TEXT NOT NULL,
    "periodCode" TEXT NOT NULL,
    "percent" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "creative_allocation_ratio_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "option_item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "creative_salary_budget_positionTitle_periodCode_key" ON "creative_salary_budget"("positionTitle", "periodCode");

-- CreateIndex
CREATE UNIQUE INDEX "creative_allocation_ratio_positionTitle_taskTypeId_periodCode_key" ON "creative_allocation_ratio"("positionTitle", "taskTypeId", "periodCode");
