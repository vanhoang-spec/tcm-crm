-- Sổ đăng ký hồ sơ ISO (ISO-1) — thuần additive, KHÔNG có RedefineTables nên chạy được thẳng trên
-- production đang có dữ liệu (bảng `project` có 82 cạnh FK trỏ tới, đừng bao giờ dựng lại nó).
--
-- `project.isoFolderUrl` = cột "Link Hồ sơ" của sheet HS ISO. Khác `briefLinkUrl` (link brief khách
-- gửi): đây là thư mục chứa TOÀN BỘ hồ sơ dự án mà kiểm toán ISO mở ra xem.
--
-- `project_iso_doc` chỉ giữ phần CON NGƯỜI làm (đính file / dán link / đánh "không áp dụng").
-- 14/25 mục app tự chấm lúc đọc từ dữ liệu sẵn có và KHÔNG sinh dòng ở đây — xem src/lib/iso-report.ts.

-- AlterTable
ALTER TABLE "project" ADD COLUMN "isoFolderUrl" TEXT;

-- CreateTable
CREATE TABLE "project_iso_doc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "docCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "linkUrl" TEXT,
    "projectFileId" TEXT,
    "naReason" TEXT,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_iso_doc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_iso_doc_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "project_file" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_iso_doc_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "project_iso_doc_projectId_idx" ON "project_iso_doc"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_iso_doc_projectId_docCode_key" ON "project_iso_doc"("projectId", "docCode");
