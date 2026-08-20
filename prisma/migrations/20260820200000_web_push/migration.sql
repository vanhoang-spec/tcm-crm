-- AlterTable
ALTER TABLE "notification" ADD COLUMN "pushedAt" DATETIME;

-- CreateTable
CREATE TABLE "push_subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOkAt" DATETIME,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "push_subscription_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscription_staffId_idx" ON "push_subscription"("staffId");

-- CreateIndex
CREATE INDEX "notification_pushedAt_idx" ON "notification"("pushedAt");

