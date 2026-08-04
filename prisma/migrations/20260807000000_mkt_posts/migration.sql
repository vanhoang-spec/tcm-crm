-- CreateTable
CREATE TABLE "mkt_post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "keyPoints" TEXT NOT NULL,
    "contentTypeId" TEXT,
    "projectId" TEXT,
    "driveUrl" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mkt_post_contentTypeId_fkey" FOREIGN KEY ("contentTypeId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_post_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mkt_post_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mkt_post_image" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mkt_post_image_postId_fkey" FOREIGN KEY ("postId") REFERENCES "mkt_post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mkt_post_image_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mkt_post_variant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "aiDraft" TEXT,
    "aiDraftedAt" DATETIME,
    "finalContent" TEXT NOT NULL DEFAULT '',
    "postedAt" DATETIME,
    "postUrl" TEXT,
    "postedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mkt_post_variant_postId_fkey" FOREIGN KEY ("postId") REFERENCES "mkt_post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mkt_post_variant_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mkt_insight_report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "note" TEXT,
    "aiResult" TEXT,
    "aiRanAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mkt_insight_report_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mkt_insight_file" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'OTHER',
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mkt_insight_file_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "mkt_insight_report" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mkt_insight_file_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "mkt_post_projectId_idx" ON "mkt_post"("projectId");

-- CreateIndex
CREATE INDEX "mkt_post_createdAt_idx" ON "mkt_post"("createdAt");

-- CreateIndex
CREATE INDEX "mkt_post_image_postId_sort_idx" ON "mkt_post_image"("postId", "sort");

-- CreateIndex
CREATE INDEX "mkt_post_variant_channel_status_idx" ON "mkt_post_variant"("channel", "status");

-- CreateIndex
CREATE INDEX "mkt_post_variant_postedAt_idx" ON "mkt_post_variant"("postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_post_variant_postId_channel_key" ON "mkt_post_variant"("postId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_insight_report_year_quarter_key" ON "mkt_insight_report"("year", "quarter");

-- CreateIndex
CREATE INDEX "mkt_insight_file_reportId_idx" ON "mkt_insight_file"("reportId");

