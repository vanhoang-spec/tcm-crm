-- AlterTable
ALTER TABLE "mkt_post" ADD COLUMN "designBrief" TEXT;

-- CreateTable
CREATE TABLE "mkt_plan_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "keyPoints" TEXT NOT NULL DEFAULT '',
    "channels" TEXT NOT NULL,
    "contentTypeId" TEXT,
    "projectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "postId" TEXT,
    "note" TEXT,
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "draftedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mkt_plan_item_contentTypeId_fkey" FOREIGN KEY ("contentTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_plan_item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_plan_item_postId_fkey" FOREIGN KEY ("postId") REFERENCES "mkt_post" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_plan_item_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "mkt_plan_item_postId_key" ON "mkt_plan_item"("postId");

-- CreateIndex
CREATE INDEX "mkt_plan_item_weekStart_status_idx" ON "mkt_plan_item"("weekStart", "status");

