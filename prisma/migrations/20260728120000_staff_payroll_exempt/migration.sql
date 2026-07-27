-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "title" TEXT,
    "departmentId" TEXT,
    "teamId" TEXT,
    "roleId" TEXT,
    "avatarKey" TEXT,
    "dateOfBirth" DATETIME,
    "firstWorkDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "payrollExempt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "passwordHash" TEXT,
    "passwordChangedAt" DATETIME,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "gender" TEXT,
    "workLocation" TEXT,
    "managerId" TEXT,
    CONSTRAINT "staff_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "staff_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "staff_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "staff_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_staff" ("avatarKey", "code", "createdAt", "dateOfBirth", "departmentId", "email", "failedLoginCount", "firstWorkDate", "fullName", "gender", "id", "isActive", "lastLoginAt", "lockedUntil", "managerId", "mustChangePassword", "passwordChangedAt", "passwordHash", "phone", "roleId", "teamId", "title", "updatedAt", "workLocation") SELECT "avatarKey", "code", "createdAt", "dateOfBirth", "departmentId", "email", "failedLoginCount", "firstWorkDate", "fullName", "gender", "id", "isActive", "lastLoginAt", "lockedUntil", "managerId", "mustChangePassword", "passwordChangedAt", "passwordHash", "phone", "roleId", "teamId", "title", "updatedAt", "workLocation" FROM "staff";
DROP TABLE "staff";
ALTER TABLE "new_staff" RENAME TO "staff";
CREATE UNIQUE INDEX "staff_code_key" ON "staff"("code");
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

