-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalNameVi" TEXT,
    "legalNameEn" TEXT,
    "taxCode" TEXT,
    "brandId" TEXT NOT NULL,
    "industryId" TEXT,
    "statusId" TEXT NOT NULL,
    "classificationId" TEXT,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "introducerId" TEXT,
    "ownerTeamId" TEXT,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 90,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bankAccount" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "client_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "option_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_introducerId_fkey" FOREIGN KEY ("introducerId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_client" ("address", "bankAccount", "brandId", "classificationId", "code", "createdAt", "email", "id", "industryId", "introducerId", "isActive", "isNew", "name", "note", "ownerTeamId", "paymentTermDays", "phone", "statusId", "taxCode", "updatedAt") SELECT "address", "bankAccount", "brandId", "classificationId", "code", "createdAt", "email", "id", "industryId", "introducerId", "isActive", "isNew", "name", "note", "ownerTeamId", "paymentTermDays", "phone", "statusId", "taxCode", "updatedAt" FROM "client";
DROP TABLE "client";
ALTER TABLE "new_client" RENAME TO "client";
CREATE UNIQUE INDEX "client_code_key" ON "client"("code");
CREATE TABLE "new_contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "birthday" DATETIME,
    "address" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_contact" ("address", "birthday", "clientId", "createdAt", "email", "id", "isPrimary", "name", "phone", "title", "updatedAt") SELECT "address", "birthday", "clientId", "createdAt", "email", "id", "isPrimary", "name", "phone", "title", "updatedAt" FROM "contact";
DROP TABLE "contact";
ALTER TABLE "new_contact" RENAME TO "contact";
CREATE TABLE "new_project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ownerTeamId" TEXT,
    "ownerId" TEXT,
    "leaderId" TEXT,
    "statusId" TEXT NOT NULL,
    "briefLinkUrl" TEXT,
    "projectTypeId" TEXT,
    "complexityId" TEXT NOT NULL,
    "goNogoStatus" TEXT,
    "goNogoNote" TEXT,
    "goNogoById" TEXT,
    "goNogoAt" DATETIME,
    "budget" BIGINT,
    "channelId" TEXT,
    "scope" TEXT,
    "scale" TEXT,
    "venue" TEXT,
    "activity" TEXT,
    "failReasonId" TEXT,
    "failReasonNote" TEXT,
    "processingAt" DATETIME,
    "liquidationAt" DATETIME,
    "finishedAt" DATETIME,
    "fiscalYear" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "option_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_projectTypeId_fkey" FOREIGN KEY ("projectTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_complexityId_fkey" FOREIGN KEY ("complexityId") REFERENCES "option_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_failReasonId_fkey" FOREIGN KEY ("failReasonId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_goNogoById_fkey" FOREIGN KEY ("goNogoById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_project" ("activity", "briefLinkUrl", "budget", "channelId", "clientId", "code", "complexityId", "createdAt", "failReasonId", "failReasonNote", "finishedAt", "fiscalYear", "goNogoAt", "goNogoById", "goNogoNote", "goNogoStatus", "id", "leaderId", "liquidationAt", "name", "ownerId", "ownerTeamId", "processingAt", "projectTypeId", "scale", "scope", "statusId", "updatedAt", "venue") SELECT "activity", "briefLinkUrl", "budget", "channelId", "clientId", "code", "complexityId", "createdAt", "failReasonId", "failReasonNote", "finishedAt", "fiscalYear", "goNogoAt", "goNogoById", "goNogoNote", "goNogoStatus", "id", "leaderId", "liquidationAt", "name", "ownerId", "ownerTeamId", "processingAt", "projectTypeId", "scale", "scope", "statusId", "updatedAt", "venue" FROM "project";
DROP TABLE "project";
ALTER TABLE "new_project" RENAME TO "project";
CREATE UNIQUE INDEX "project_code_key" ON "project"("code");
CREATE INDEX "project_ownerTeamId_statusId_idx" ON "project"("ownerTeamId", "statusId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

