-- CreateTable
CREATE TABLE "kb_document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileKey" TEXT,
    "fileMime" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "linkUrl" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "kb_document_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "option_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "kb_document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "kb_document_categoryId_sort_idx" ON "kb_document"("categoryId", "sort");
