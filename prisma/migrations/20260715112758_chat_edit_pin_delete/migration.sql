-- CreateTable
CREATE TABLE "message_deletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_deletion_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "message_deletion_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pinned_message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedById" TEXT,
    "pinnedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pinned_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pinned_message_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pinned_message_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "systemEvent" TEXT,
    "linkUrl" TEXT,
    "linkText" TEXT,
    "linkPreviewTitle" TEXT,
    "linkPreviewDescription" TEXT,
    "linkPreviewImageUrl" TEXT,
    "linkPreviewSiteName" TEXT,
    "attachmentKey" TEXT,
    "attachmentName" TEXT,
    "attachmentMime" TEXT,
    "attachmentSize" INTEGER,
    "attachmentDurationSec" INTEGER,
    "replyToId" TEXT,
    "isForwarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" DATETIME,
    "deletedForEveryoneAt" DATETIME,
    "deletedById" TEXT,
    CONSTRAINT "message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "message_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_message" ("attachmentDurationSec", "attachmentKey", "attachmentMime", "attachmentName", "attachmentSize", "body", "conversationId", "createdAt", "editedAt", "id", "isForwarded", "linkPreviewDescription", "linkPreviewImageUrl", "linkPreviewSiteName", "linkPreviewTitle", "linkText", "linkUrl", "replyToId", "senderId", "systemEvent", "type") SELECT "attachmentDurationSec", "attachmentKey", "attachmentMime", "attachmentName", "attachmentSize", "body", "conversationId", "createdAt", "editedAt", "id", "isForwarded", "linkPreviewDescription", "linkPreviewImageUrl", "linkPreviewSiteName", "linkPreviewTitle", "linkText", "linkUrl", "replyToId", "senderId", "systemEvent", "type" FROM "message";
DROP TABLE "message";
ALTER TABLE "new_message" RENAME TO "message";
CREATE INDEX "message_conversationId_createdAt_idx" ON "message"("conversationId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "message_deletion_messageId_staffId_key" ON "message_deletion"("messageId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "pinned_message_conversationId_messageId_key" ON "pinned_message"("conversationId", "messageId");
