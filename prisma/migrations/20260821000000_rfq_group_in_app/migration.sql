-- CreateTable
CREATE TABLE "rfq_group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "labelVi" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "descVi" TEXT NOT NULL DEFAULT '',
    "descEn" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT NOT NULL DEFAULT '',
    "unitPriceLabelVi" TEXT NOT NULL DEFAULT '',
    "unitPriceLabelEn" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "rfq_group_field" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LINE',
    "key" TEXT NOT NULL,
    "labelVi" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "optionsJson" TEXT,
    "hintVi" TEXT,
    "hintEn" TEXT,
    "defaultValue" TEXT,
    "isAmountFactor" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "rfq_group_field_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "rfq_group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "rfq_group_code_key" ON "rfq_group"("code");

-- CreateIndex
CREATE INDEX "rfq_group_field_groupId_idx" ON "rfq_group_field"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_group_field_groupId_kind_key_key" ON "rfq_group_field"("groupId", "kind", "key");

