-- Knowledge Base theo khách hàng (H2): kho kiến thức RIÊNG của từng khách/nhóm khách.
-- Neo vào NHÓM khi khách có nhóm (4 pháp nhân AEON dùng chung 1 kho), vào chính khách khi khách lẻ.
-- Toàn bộ là bảng MỚI — không đụng KbDocument (/kb, thư viện chung toàn công ty).
-- Bảng câu hỏi/lượt làm quiz để đợt H3 mới thêm, khi thật sự có màn hình dùng tới.

-- CreateTable
CREATE TABLE "client_kb_space" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "groupId" TEXT,
    "generalNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "client_kb_space_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "client_kb_space_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "client_group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "client_kb_topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "client_kb_topic_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "client_kb_space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "client_kb_lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blocksJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "client_kb_lesson_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "client_kb_topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "client_kb_lesson_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "client_kb_source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "note" TEXT,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_kb_source_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "client_kb_space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "client_kb_source_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "client_kb_space_clientId_key" ON "client_kb_space"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "client_kb_space_groupId_key" ON "client_kb_space"("groupId");

-- CreateIndex
CREATE INDEX "client_kb_topic_spaceId_sort_idx" ON "client_kb_topic"("spaceId", "sort");

-- CreateIndex
CREATE INDEX "client_kb_lesson_topicId_sort_idx" ON "client_kb_lesson"("topicId", "sort");

-- CreateIndex
CREATE INDEX "client_kb_source_spaceId_kind_idx" ON "client_kb_source"("spaceId", "kind");

