-- AlterTable
ALTER TABLE "mkt_post_variant" ADD COLUMN "externalId" TEXT;
ALTER TABLE "mkt_post_variant" ADD COLUMN "publishError" TEXT;
ALTER TABLE "mkt_post_variant" ADD COLUMN "scheduledAt" DATETIME;

-- CreateTable
CREATE TABLE "mkt_channel_connection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT,
    "tokenCipher" TEXT NOT NULL,
    "tokenExpiresAt" DATETIME,
    "expiryWarnLevel" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckAt" DATETIME,
    "lastCheckOk" BOOLEAN,
    "lastError" TEXT,
    "connectedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mkt_channel_connection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mkt_post_metric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impressions" INTEGER,
    "reactions" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "clicks" INTEGER,
    CONSTRAINT "mkt_post_metric_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "mkt_post_variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "mkt_channel_connection_channel_key" ON "mkt_channel_connection"("channel");

-- CreateIndex
CREATE INDEX "mkt_post_metric_day_idx" ON "mkt_post_metric"("day");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_post_metric_variantId_day_key" ON "mkt_post_metric"("variantId", "day");

-- CreateIndex
CREATE INDEX "mkt_post_variant_scheduledAt_idx" ON "mkt_post_variant"("scheduledAt");

