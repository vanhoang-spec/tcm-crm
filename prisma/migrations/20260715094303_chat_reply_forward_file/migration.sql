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
    "attachmentKey" TEXT,
    "attachmentName" TEXT,
    "attachmentMime" TEXT,
    "attachmentSize" INTEGER,
    "attachmentDurationSec" INTEGER,
    "replyToId" TEXT,
    "isForwarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" DATETIME,
    CONSTRAINT "message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_message" ("attachmentDurationSec", "attachmentKey", "attachmentMime", "attachmentName", "attachmentSize", "body", "conversationId", "createdAt", "editedAt", "id", "linkText", "linkUrl", "senderId", "systemEvent", "type") SELECT "attachmentDurationSec", "attachmentKey", "attachmentMime", "attachmentName", "attachmentSize", "body", "conversationId", "createdAt", "editedAt", "id", "linkText", "linkUrl", "senderId", "systemEvent", "type" FROM "message";
DROP TABLE "message";
ALTER TABLE "new_message" RENAME TO "message";
CREATE INDEX "message_conversationId_createdAt_idx" ON "message"("conversationId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
