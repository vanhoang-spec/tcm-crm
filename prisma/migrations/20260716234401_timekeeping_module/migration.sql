-- CreateTable
CREATE TABLE "work_shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "hours" REAL NOT NULL DEFAULT 4,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "schedule_week" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confirmedById" TEXT,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "schedule_week_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "schedule_week_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shift_assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "shiftId" TEXT NOT NULL,
    "leaveTypeId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "shift_assignment_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "schedule_week" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shift_assignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shift_assignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "work_shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shift_assignment_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadStaffId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "department_leadStaffId_fkey" FOREIGN KEY ("leadStaffId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_department" ("code", "id", "isActive", "name") SELECT "code", "id", "isActive", "name" FROM "department";
DROP TABLE "department";
ALTER TABLE "new_department" RENAME TO "department";
CREATE UNIQUE INDEX "department_code_key" ON "department"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "work_shift_code_key" ON "work_shift"("code");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_week_departmentId_weekStart_key" ON "schedule_week"("departmentId", "weekStart");

-- CreateIndex
CREATE INDEX "shift_assignment_weekId_idx" ON "shift_assignment"("weekId");

-- CreateIndex
CREATE INDEX "shift_assignment_staffId_date_idx" ON "shift_assignment"("staffId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignment_staffId_date_shiftId_key" ON "shift_assignment"("staffId", "date", "shiftId");
