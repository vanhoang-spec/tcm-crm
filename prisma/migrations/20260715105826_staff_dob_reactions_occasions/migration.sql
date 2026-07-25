-- AlterTable
ALTER TABLE "staff" ADD COLUMN "dateOfBirth" DATETIME;

-- CreateTable
CREATE TABLE "message_reaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "message_reaction_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "special_occasion_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "occasionType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "occasionDate" DATETIME NOT NULL,
    "messageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "message_reaction_messageId_staffId_key" ON "message_reaction"("messageId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "special_occasion_log_occasionType_refId_occasionDate_key" ON "special_occasion_log"("occasionType", "refId", "occasionDate");
