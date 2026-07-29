-- Nhóm khách hàng (H1): gom các pháp nhân cùng một 'family' — vd AEON gom AHD/AHL/ALB/AHP.
-- Chỉ là nhãn gom + chỗ neo Knowledge Base dùng chung ở đợt sau. Hợp đồng/hoá đơn/công nợ,
-- mã lô kho và mã dự án VẪN theo từng pháp nhân — client_group.code KHÔNG vào mã sinh nào.
-- Additive: bảng mới + 1 cột nullable. SQLite rebuild bảng client nhưng INSERT SELECT giữ đủ dữ liệu.

-- CreateTable
CREATE TABLE "client_group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalNameVi" TEXT,
    "legalNameEn" TEXT,
    "taxCode" TEXT,
    "brandId" TEXT NOT NULL,
    "industryId" TEXT,
    "statusId" TEXT NOT NULL,
    "classificationId" TEXT,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "introducerId" TEXT,
    "ownerTeamId" TEXT,
    "groupId" TEXT,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 90,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bankAccount" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "client_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "option_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "option_item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_introducerId_fkey" FOREIGN KEY ("introducerId") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "client_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "client_group" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_client" ("address", "bankAccount", "brandId", "classificationId", "code", "createdAt", "email", "id", "industryId", "introducerId", "isActive", "isNew", "legalNameEn", "legalNameVi", "name", "note", "ownerTeamId", "paymentTermDays", "phone", "statusId", "taxCode", "updatedAt") SELECT "address", "bankAccount", "brandId", "classificationId", "code", "createdAt", "email", "id", "industryId", "introducerId", "isActive", "isNew", "legalNameEn", "legalNameVi", "name", "note", "ownerTeamId", "paymentTermDays", "phone", "statusId", "taxCode", "updatedAt" FROM "client";
DROP TABLE "client";
ALTER TABLE "new_client" RENAME TO "client";
CREATE UNIQUE INDEX "client_code_key" ON "client"("code");
CREATE INDEX "client_groupId_idx" ON "client"("groupId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "client_group_code_key" ON "client_group"("code");

